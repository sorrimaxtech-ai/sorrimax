// ============================================================================
// Edge Function: whatsapp-outbox — worker de envio
// ----------------------------------------------------------------------------
// Correções de auditoria (06/08/2026):
//  · exige segredo próprio (era invocável por qualquer um na internet, e roda
//    com service_role → DoS na conta uazapi COMPARTILHADA com o Diamond)
//  · claim atômico via RPC (FOR UPDATE SKIP LOCKED) em vez de CAS otimista
//  · deadline de wall-clock: sem isso o item morria preso em 'sending'
//  · TIMEOUT NÃO É RETRY: o uazapi envia com async:false (bloqueia até entregar);
//    se estourou o teto, pode TER SIDO ENTREGUE — reenviar duplica pro paciente
//  · progresso por parte no split: falha na parte 3 não reenvia 1 e 2
//  · envio canônico: o número do chat já vem na forma do WhatsApp; normalizar
//    de novo injeta um 9 indevido e fala com outro número
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  clearFailure, registerFailure, sendMedia, sendText, splitIntoParts,
  type Provider,
} from "../_shared/whatsapp-providers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OUTBOX_SECRET = Deno.env.get("OUTBOX_SECRET") ?? "";
const BATCH   = Number(Deno.env.get("OUTBOX_BATCH") ?? "20");
const PACE_MS = Number(Deno.env.get("OUTBOX_PACE_MS") ?? "1200");
const DEADLINE_MS = Number(Deno.env.get("OUTBOX_DEADLINE_MS") ?? "100000"); // < timeout do cron

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempts: number) => Math.min(2 ** attempts * 30, 3600);

/** Comparação em tempo constante (não vaza o segredo por timing). */
function secretOk(got: string): boolean {
  const a = new TextEncoder().encode(got);
  const b = new TextEncoder().encode(OUTBOX_SECRET);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  // fail-CLOSED: sem segredo configurado, a função não atende
  if (!OUTBOX_SECRET) return new Response("misconfigured", { status: 503 });
  if (!secretOk(req.headers.get("x-outbox-secret") ?? "")) {
    return new Response("forbidden", { status: 403 });
  }

  const deadline = Date.now() + DEADLINE_MS;

  // claim atômico: nenhuma outra invocação pega os mesmos itens
  const { data: items, error } = await supabase.rpc("wa_outbox_claim", { p_limit: BATCH });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!items?.length) return Response.json({ ok: true, processed: 0 });

  let sent = 0, failed = 0, dead = 0, skipped = 0;

  for (const row of items as any[]) {
    // devolve à fila o que não deu tempo de processar (em vez de deixar preso)
    if (Date.now() > deadline) {
      await supabase.from("whatsapp_outbox")
        .update({ status: "queued", next_attempt_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "sending");
      skipped++;
      continue;
    }

    const { data: inst } = await supabase.from("whatsapp_instances")
      .select("id, provider, api_url, api_token, instance_id, degraded")
      .eq("id", row.instance_id).maybeSingle();
    if (!inst) {
      await supabase.from("whatsapp_outbox")
        .update({ status: "dead", last_error: "instância não encontrada" }).eq("id", row.id);
      dead++; continue;
    }

    const token = inst.api_token as string;
    const cfg = {
      provider: (inst.provider ?? "uazapi") as Provider,
      apiUrl: inst.api_url ?? "",
      apiToken: token ?? "",
      instanceName: inst.instance_id ?? "",
    };

    try {
      let externalId: string | null = null;

      if (row.kind === "text") {
        const parts = splitIntoParts(String(row.payload?.text ?? ""));
        if (!parts.length) throw new Error("texto vazio — nada a enviar");

        // retoma de onde parou: nunca reenvia parte já entregue
        const startAt = Number(row.payload?.parts_sent ?? 0);
        for (let i = startAt; i < parts.length; i++) {
          // canonical: o número veio do WhatsApp, já está na forma correta
          const r = await sendText(cfg, row.to_number, parts[i], { canonical: true });
          if (i === 0) externalId = r.externalId;
          await supabase.from("whatsapp_outbox")
            .update({ payload: { ...row.payload, parts_sent: i + 1 } }).eq("id", row.id);
          if (i < parts.length - 1) await sleep(400);
        }
      } else {
        const p = row.payload ?? {};
        const r = await sendMedia(cfg, row.to_number, p.url, row.kind, p.caption, p.filename, { canonical: true });
        externalId = r.externalId;
      }

      clearFailure(token);
      if (inst.degraded) {
        await supabase.from("whatsapp_instances").update({ degraded: false }).eq("id", inst.id);
      }

      await supabase.from("whatsapp_outbox")
        .update({ status: "sent", external_id: externalId, last_error: null }).eq("id", row.id);

      if (row.message_id) {
        const { error: upErr } = await supabase.from("whatsapp_messages")
          .update({ status: "sent", external_id: externalId }).eq("id", row.message_id);
        // 23505 = o eco do webhook já casou esse external_id — esperado, não é erro
        if (upErr && upErr.code !== "23505") console.error("update msg", upErr.message);
      }
      sent++;
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      const isTimeout = (e as any).timeout === true;

      if (isTimeout && registerFailure(token)) {
        await supabase.from("whatsapp_instances").update({ degraded: true }).eq("id", inst.id);
      }

      if (isTimeout) {
        // O uazapi envia com async:false. Timeout NÃO significa que não entregou —
        // significa que não sabemos. Reenviar às cegas duplica pro paciente, que é
        // pior do que falhar. Vai pra DLQ para conferência humana.
        await supabase.from("whatsapp_outbox")
          .update({ status: "dead", last_error: `timeout (pode ter sido entregue): ${msg}` })
          .eq("id", row.id);
        if (row.message_id) {
          await supabase.from("whatsapp_messages")
            .update({ status: "sent", failed_reason: "timeout: confirmar entrega" })
            .eq("id", row.message_id);
        }
        dead++;
      } else if (row.attempts >= row.max_attempts) {
        await supabase.from("whatsapp_outbox")
          .update({ status: "dead", last_error: msg }).eq("id", row.id);
        if (row.message_id) {
          await supabase.from("whatsapp_messages")
            .update({ status: "failed", failed_reason: msg }).eq("id", row.message_id);
        }
        dead++;
      } else {
        await supabase.from("whatsapp_outbox")
          .update({
            status: "failed", last_error: msg,
            next_attempt_at: new Date(Date.now() + backoff(row.attempts) * 1000).toISOString(),
          }).eq("id", row.id);
        failed++;
      }
    }

    await sleep(PACE_MS);
  }

  return Response.json({ ok: true, processed: items.length, sent, failed, dead, skipped });
});
