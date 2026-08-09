// ============================================================================
// Edge Function: whatsapp-webhook
// ----------------------------------------------------------------------------
// Ingestão UNIFICADA dos eventos da Evolution API. Porta o processo do Diamond
// (uazapi-webhook + SSE) para UM parser só — a auditoria 03 aponta os parsers
// divergentes como a maior fonte de bug; aqui existe apenas parseEvolution().
//
// Fluxo concorrente que este handler cobre:
//   messages.upsert   → normaliza → dedupe(external_id) → grava → (trigger bumpa
//                        o chat e o Supabase Realtime empurra pro navegador)
//   messages.update   → atualiza status/ack (o trigger garante que não rebaixa)
//   connection.update → marca instância (connected/close) + limpa "degraded"
//   chats.upsert      → nome/foto do contato
//
// Deploy:  supabase functions deploy whatsapp-webhook --no-verify-jwt
// Config na Evolution: webhook_by_events=true apontando pra URL desta função,
//   com header/secret conferido abaixo.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // server-side: ignora RLS de propósito
);
const WEBHOOK_SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") ?? "";

// ---------------------------------------------------------------- tipos
type WaType =
  | "text" | "image" | "video" | "audio" | "ptt" | "document"
  | "location" | "contact" | "reaction" | "sticker" | "call" | "system" | "unknown";

interface Parsed {
  externalId: string | null;
  fromMe: boolean;
  type: WaType;
  content: string;
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  senderName: string | null;
  replyTo: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// Normaliza o id: cobre a variante `messageid` (minúscula) do uazapiGO e tira
// o prefixo do número ("5573...:3EB0" -> "3EB0"). O ENVIO já normalizava; a
// ingestão não — a assimetria duplicava a mensagem na tela.
function normId(x: unknown): string | null {
  if (x == null) return null;
  const s = String(x);
  if (!s) return null;
  return s.includes(":") ? (s.split(":").pop() || s) : s;
}

// Desembrulha wrappers do Baileys. Sem isso, mensagem efêmera / visualização
// única / PDF-com-legenda / editada caem em "unknown" e viram bolha VAZIA.
function unwrap(m: any): any {
  let cur = m;
  for (let i = 0; i < 5 && cur; i++) {
    const next = cur.ephemeralMessage?.message
      ?? cur.viewOnceMessage?.message
      ?? cur.viewOnceMessageV2?.message
      ?? cur.viewOnceMessageV2Extension?.message
      ?? cur.documentWithCaptionMessage?.message
      ?? cur.editedMessage?.message;
    if (!next) break;
    cur = next;
  }
  return cur;
}

// ---------------------------------------------------------------- parser ÚNICO
// Mapeia o messageType do Baileys/Evolution para o nosso enum. Um só lugar.
function parseEvolution(raw: any): Parsed {
  const m = unwrap(raw?.message ?? raw ?? {});
  const key = raw?.key ?? {};
  const externalId = normId(
    key?.id ?? raw?.id ?? raw?.messageid ?? raw?.messageId ?? raw?.message?.key?.id,
  );
  const fromMe = Boolean(key?.fromMe ?? raw?.fromMe ?? false);
  const tsRaw = raw?.messageTimestamp ?? raw?.date_time ?? Date.now();
  const timestamp = new Date(
    typeof tsRaw === "number" ? (tsRaw > 1e12 ? tsRaw : tsRaw * 1000) : tsRaw,
  ).toISOString();
  const senderName = raw?.pushName ?? raw?.sender_name ?? null;

  let type: WaType = "unknown";
  let content = "";
  let mediaUrl: string | null = null;
  let mimeType: string | null = null;
  let fileName: string | null = null;
  let replyTo: string | null = null;
  const metadata: Record<string, unknown> = {};

  // citação (reply)
  const ctx = m?.extendedTextMessage?.contextInfo ?? m?.contextInfo;
  if (ctx?.stanzaId) replyTo = ctx.stanzaId;

  if (m?.conversation != null) {
    type = "text"; content = m.conversation;
  } else if (m?.extendedTextMessage?.text != null) {
    type = "text"; content = m.extendedTextMessage.text;
  } else if (m?.imageMessage) {
    type = "image"; content = m.imageMessage.caption ?? "";
    mediaUrl = m.imageMessage.url ?? raw?.mediaUrl ?? null;
    mimeType = m.imageMessage.mimetype ?? "image/jpeg";
  } else if (m?.videoMessage) {
    type = "video"; content = m.videoMessage.caption ?? "";
    mediaUrl = m.videoMessage.url ?? raw?.mediaUrl ?? null;
    mimeType = m.videoMessage.mimetype ?? "video/mp4";
  } else if (m?.audioMessage) {
    // ptt = voice note; audio = arquivo de música (auditoria A3-05)
    type = m.audioMessage.ptt ? "ptt" : "audio";
    mediaUrl = m.audioMessage.url ?? raw?.mediaUrl ?? null;
    mimeType = m.audioMessage.mimetype ?? "audio/ogg";
  } else if (m?.documentMessage) {
    type = "document"; content = m.documentMessage.title ?? m.documentMessage.fileName ?? "";
    mediaUrl = m.documentMessage.url ?? raw?.mediaUrl ?? null;
    mimeType = m.documentMessage.mimetype ?? "application/octet-stream";
    fileName = m.documentMessage.fileName ?? m.documentMessage.title ?? "documento";
  } else if (m?.stickerMessage) {
    type = "sticker"; mediaUrl = m.stickerMessage.url ?? null; mimeType = "image/webp";
  } else if (m?.locationMessage) {
    // UM formato só (a auditoria A3-01 apontava webhook x SSE divergindo aqui)
    type = "location";
    const lat = m.locationMessage.degreesLatitude, lng = m.locationMessage.degreesLongitude;
    content = m.locationMessage.name ?? `${lat},${lng}`;
    metadata.lat = lat; metadata.lng = lng;
  } else if (m?.contactMessage || m?.contactsArrayMessage) {
    type = "contact";
    const c = m.contactMessage ?? m.contactsArrayMessage?.contacts?.[0] ?? {};
    content = `📇 ${c.displayName ?? "Contato"}`;
    metadata.vcard = c.vcard ?? null; metadata.displayName = c.displayName ?? null;
  } else if (m?.listResponseMessage || m?.buttonsResponseMessage || m?.templateButtonReplyMessage) {
    // paciente respondeu a botão/lista — sem isto o atendente vê bolha vazia
    type = "text";
    content = m.listResponseMessage?.title
      ?? m.listResponseMessage?.singleSelectReply?.selectedRowId
      ?? m.buttonsResponseMessage?.selectedDisplayText
      ?? m.buttonsResponseMessage?.selectedButtonId
      ?? m.templateButtonReplyMessage?.selectedDisplayText
      ?? "(resposta)";
    metadata.resposta_interativa = true;
  } else if (m?.protocolMessage) {
    // apagar-para-todos / edição: NÃO cria bolha nova
    type = "system";
    content = "";
    metadata.protocol = m.protocolMessage?.type ?? null;
    metadata.target = normId(m.protocolMessage?.key?.id);
  } else if (m?.reactionMessage) {
    type = "reaction"; content = m.reactionMessage.text ?? "";
    replyTo = m.reactionMessage.key?.id ?? null;
  } else if (raw?.event === "call" || m?.call) {
    type = "call"; content = "📞 Chamada";
    metadata.call = m?.call ?? raw?.call ?? null;
  } else if (m?.conversation === "" ) {
    type = "text"; content = "";
  }

  return { externalId, fromMe, type, content, mediaUrl, mimeType, fileName, senderName, replyTo, timestamp, metadata };
}

// status ack da Evolution → nosso enum (trigger garante que não rebaixa)
function mapAck(raw: any): string | null {
  const s = String(raw?.status ?? raw?.update?.status ?? "").toUpperCase();
  const map: Record<string, string> = {
    ERROR: "failed", PENDING: "pending", SERVER_ACK: "sent",
    DELIVERY_ACK: "delivered", READ: "read", PLAYED: "played",
  };
  if (map[s]) return map[s];
  const n = Number(raw?.status);            // 0-5 numérico (uazapi/baileys)
  return ({ 0: "failed", 1: "pending", 2: "sent", 3: "delivered", 4: "read", 5: "played" } as Record<number, string>)[n] ?? null;
}

async function findInstance(instanceName: string) {
  const { data } = await supabase.from("whatsapp_instances")
    .select("id, clinica_id").eq("instance_id", instanceName).maybeSingle();
  return data;
}

// upsert do chat (idempotente por instance_id + remote_jid)
async function upsertChat(instanceId: string, clinicaId: string, remoteJid: string, name?: string | null) {
  const phone = remoteJid.split("@")[0];
  const { data } = await supabase.from("whatsapp_chats")
    .upsert({ instance_id: instanceId, clinica_id: clinicaId, remote_jid: remoteJid,
              contact_phone: phone, name: name ?? phone },
            { onConflict: "instance_id,remote_jid" })
    .select("id").maybeSingle();
  return data?.id as string | undefined;
}

Deno.serve(async (req) => {
  // fail-CLOSED: sem segredo configurado a função NÃO atende (antes, remover o
  // secret desligava a autenticação inteira numa função com service_role).
  if (!WEBHOOK_SECRET) return new Response("misconfigured", { status: 503 });
  {
    // sem fallback por querystring: segredo em URL vaza em log de edge e proxy
    const got = req.headers.get("x-webhook-secret") ?? "";
    const a = new TextEncoder().encode(got);
    const b = new TextEncoder().encode(WEBHOOK_SECRET);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    if (diff !== 0) return new Response("forbidden", { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const event: string = body?.event ?? body?.type ?? "";
  const instanceName: string = body?.instance ?? body?.instanceName ?? "";
  const inst = instanceName ? await findInstance(instanceName) : null;

  try {
    // ---- conexão: marca estado e limpa "degraded" (dispara sync/flush no worker)
    if (event.startsWith("connection")) {
      if (inst) {
        const st = String(body?.data?.state ?? body?.state ?? "").toLowerCase();
        const status = st.includes("open") ? "connected" : st.includes("close") ? "disconnected" : "connecting";
        await supabase.from("whatsapp_instances").update({
          status, degraded: false, last_seen_at: new Date().toISOString(),
          connected_at: status === "connected" ? new Date().toISOString() : null,
        }).eq("id", inst.id);
      }
      return Response.json({ ok: true });
    }

    // ---- status/ack de mensagens já enviadas
    if (event.startsWith("messages.update") || event === "messages_update") {
      // guard de instância ANTES de tocar em qualquer mensagem: sem isso o ack
      // atualizava por external_id GLOBAL, atingindo outras clínicas.
      if (!inst) return Response.json({ ok: false, reason: "instance not found" }, { status: 202 });
      const updates = Array.isArray(body?.data) ? body.data : [body?.data ?? body];
      let n = 0;
      for (const u of updates) {
        // uazapi ReadReceipt v2: { Type: Read|Delivered|Played, MessageIDs: [...] }
        const rrType = u?.Type ?? u?.type;
        const rrIds: string[] | undefined = u?.MessageIDs ?? u?.messageIds;
        if (rrType && Array.isArray(rrIds) && rrIds.length) {
          const status = ({ Read: "read", Delivered: "delivered", Played: "played" } as Record<string, string>)[rrType];
          if (status) {
            // normaliza id prefixado ("num:id" → "id") pra casar com o external_id salvo
            const ids = rrIds.map((x) => (String(x).includes(":") ? String(x).split(":").pop()! : String(x)));
            await supabase.from("whatsapp_messages").update({ status })
              .eq("clinica_id", inst.clinica_id).in("external_id", ids);
            n += ids.length;
          }
          continue;
        }
        // ack padrão (Evolution / uazapi numérico 0-5)
        const extId = u?.key?.id ?? u?.id;
        const status = mapAck(u);
        if (extId && status) {
          const eid = String(extId).includes(":") ? String(extId).split(":").pop()! : String(extId);
          await supabase.from("whatsapp_messages").update({ status })
            .eq("clinica_id", inst.clinica_id).eq("external_id", eid);
          n++;
        }
      }
      return Response.json({ ok: true, updated: n });
    }

    // ---- mensagens novas (inbound e echo de outbound)
    if (event.startsWith("messages.upsert") || event === "messages" || body?.message) {
      if (!inst) return Response.json({ ok: false, reason: "instance not found" }, { status: 202 });
      const items = Array.isArray(body?.data) ? body.data : [body?.data ?? body];
      let saved = 0;
      for (const raw of items) {
        const remoteJid = raw?.key?.remoteJid ?? raw?.remoteJid;
        // ignora grupo, status do WhatsApp, canal e endereçamento LID (não-discável)
        if (!remoteJid || /@(g\.us|broadcast|newsletter|lid)$/.test(remoteJid)) continue;
        const p = parseEvolution(raw);
        const chatId = await upsertChat(inst.id, inst.clinica_id, remoteJid, p.senderName);
        if (!chatId) continue;

        // eco do que NÓS enviamos: casa com a mensagem otimista em vez de criar
        // uma segunda linha (que ficaria com relógio eterno na tela).
        if (p.fromMe && p.externalId) {
          const { data: reconciled } = await supabase.rpc("wa_ingerir_eco", {
            p_chat_id: chatId, p_external_id: p.externalId,
          });
          if (reconciled) { saved++; continue; }
        }

        // dedupe: se já existe pelo external_id, atualiza mídia/status; senão insere
        const { error } = await supabase.from("whatsapp_messages").insert({
          chat_id: chatId, clinica_id: inst.clinica_id, external_id: p.externalId,
          content: p.content, from_me: p.fromMe, status: p.fromMe ? "sent" : "delivered",
          message_type: p.type, media_url: p.mediaUrl, mime_type: p.mimeType,
          file_name: p.fileName, sender_name: p.senderName, reply_to: p.replyTo,
          metadata: p.metadata, media_type: p.mimeType, created_at: p.timestamp,
          seqid: typeof raw?.messageTimestamp === "number" ? raw.messageTimestamp : null,
        });
        // 23505 = dedupe (já existe) → ok, ignora
        if (!error) saved++;
        else if (error.code !== "23505") console.error("insert msg", error.message);
      }
      return Response.json({ ok: true, saved });
    }

    return Response.json({ ok: true, ignored: event });
  } catch (e) {
    // 200 de propósito: 5xx faz o provedor REENTREGAR o mesmo evento, e com
    // external_id ausente isso vira duplicata. Erro fica no log.
    console.error("webhook error", e);
    return Response.json({ ok: false, error: String(e) }, { status: 200 });
  }
});
