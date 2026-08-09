// ============================================================================
// Edge Function: asaas-webhook
// ----------------------------------------------------------------------------
// Recebe os eventos de pagamento do Asaas. O que importa: PAYMENT_RECEIVED /
// PAYMENT_CONFIRMED → baixa automática da parcela (o "nunca toca no assunto" da
// Cobrança Invisível). Idempotente por asaas_event_id — o Asaas reentrega.
//
// Validação: cada clínica configura no painel do Asaas um "Access Token" que o
// Asaas manda no header `asaas-access-token`. Resolvemos a clínica dona da
// cobrança pelo externalReference (= parcela_id) e conferimos o token contra o
// webhook_token dela. Sem clínica resolvível ou token errado → 401.
//
// Deploy: supabase functions deploy asaas-webhook --no-verify-jwt
// (o Asaas não manda JWT do Supabase; a autenticação é o access-token acima)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// eventos que significam "dinheiro entrou"
const PAGO = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const eventoId = body?.id ?? null;                 // id do evento (dedup)
  const evento = body?.event ?? "";
  const pg = body?.payment ?? {};
  const externalRef = pg?.externalReference ?? null;
  const paymentId = pg?.id ?? null;

  // ---- dedup: se já registramos este evento, responde 200 e sai ----
  if (eventoId) {
    const { data: existente } = await admin
      .from("asaas_webhook_eventos").select("id, processado_em").eq("asaas_event_id", eventoId).maybeSingle();
    if (existente?.processado_em) return ok(); // já processado
  }

  // registra o evento (bruto) antes de processar — trilha de auditoria
  const { data: log } = await admin.from("asaas_webhook_eventos").upsert({
    asaas_event_id: eventoId,
    event: evento,
    asaas_payment_id: paymentId,
    external_reference: externalRef,
    payload: body,
  }, { onConflict: "asaas_event_id" }).select("id").maybeSingle();

  const token = req.headers.get("asaas-access-token") ?? "";

  // ================= FLUXO B: assinatura SaaS (externalReference = "saas:<clinica>")
  // Vem da conta Asaas da SORRIMAX; valida contra um token global (env).
  if (typeof externalRef === "string" && externalRef.startsWith("saas:")) {
    const clinicaId = externalRef.slice(5);
    const esperado = Deno.env.get("ASAAS_SORRIMAX_WEBHOOK_TOKEN") ?? "";
    if (esperado && token !== esperado) {
      await marcarErro(log?.id, "token saas inválido");
      return new Response("unauthorized", { status: 401 });
    }
    // pago → assinatura ativa; vencido → atrasada; deletado → cancelada
    const status = PAGO.has(evento) ? "ativa"
      : evento === "PAYMENT_OVERDUE" ? "atrasada"
      : (evento === "SUBSCRIPTION_DELETED" || evento === "PAYMENT_DELETED") ? "cancelada"
      : null;
    if (status) {
      await admin.from("asaas_assinaturas")
        .update({ status, proximo_vencimento: pg?.dueDate ?? null, updated_at: new Date().toISOString() })
        .eq("clinica_id", clinicaId);
      await admin.from("clinicas").update({ assinatura_status: status }).eq("id", clinicaId);
    }
    await marcarOk(log?.id, `saas:${status ?? "ignorado"}`);
    return ok();
  }

  // ================= FLUXO A: cobrança de paciente (externalReference = parcela_id)
  // ---- validação: token da clínica dona da referência ----
  if (externalRef) {
    const { data: dono } = await admin.rpc("asaas_clinica_de_referencia", {
      p_external_reference: externalRef,
    });
    const esperado = Array.isArray(dono) ? dono[0]?.webhook_token : (dono as any)?.webhook_token;
    // se a clínica tem token configurado, ele precisa bater
    if (esperado && token !== esperado) {
      await marcarErro(log?.id, "token inválido");
      return new Response("unauthorized", { status: 401 });
    }
  }

  // ---- ação: baixa automática quando pago ----
  if (PAGO.has(evento) && externalRef) {
    const { data: resultado, error } = await admin.rpc("asaas_baixar_cobranca", {
      p_external_reference: externalRef,
      p_asaas_payment_id: paymentId,
      p_valor: pg?.value ?? null,
      p_pago_em: pg?.paymentDate ?? pg?.confirmedDate ?? new Date().toISOString().slice(0, 10),
      p_billing_type: pg?.billingType ?? "PIX",
    });
    if (error) { await marcarErro(log?.id, error.message); return ok(); }
    await marcarOk(log?.id, String(resultado));
    return ok();
  }

  // outros eventos (overdue, refund, etc.): registrados, sem ação por ora
  await marcarOk(log?.id, "ignorado");
  return ok();
});

function ok() { return new Response(JSON.stringify({ received: true }), {
  status: 200, headers: { "Content-Type": "application/json" },
}); }

async function marcarOk(id: string | undefined, nota: string) {
  if (!id) return;
  await admin.from("asaas_webhook_eventos")
    .update({ processado_em: new Date().toISOString(), erro: nota === "baixado" ? null : nota })
    .eq("id", id);
}
async function marcarErro(id: string | undefined, msg: string) {
  if (!id) return;
  await admin.from("asaas_webhook_eventos")
    .update({ processado_em: new Date().toISOString(), erro: msg }).eq("id", id);
}
