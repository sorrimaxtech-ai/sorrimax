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

// ------------------------------------------------------------ parser uazapi
// A uazapi manda um objeto CHATO, não a árvore aninhada do Baileys: o texto vem
// em `text`, o tipo em `messageType`, o id em `messageid` (minúsculo). Passar
// esse payload pelo parser do Baileys resultava em bolha vazia ou "unknown" —
// a mensagem entrava, mas chegava suja na tela do atendente.
//
// Formato conferido contra o CRM que consome esta mesma API em produção.
// O id passa pelo MESMO `normId` do parser Baileys: é o que mantém o dedupe
// simétrico com o envio. Um id cru aqui faria cada mensagem aparecer duas vezes.
function parseUazapi(raw: any): Parsed {
  const externalId = normId(raw?.messageid ?? raw?.messageId ?? raw?.id ?? raw?.key?.id);
  const fromMe = raw?.fromMe === true || raw?.key?.fromMe === true ||
    (typeof raw?.fromMe === "string" && raw.fromMe.toLowerCase() === "true");
  const senderName = raw?.senderName ?? raw?.pushName ?? raw?.name ?? null;

  const tsRaw = raw?.messageTimestamp ?? raw?.timestamp ?? raw?.date_time ?? Date.now();
  const timestamp = new Date(
    typeof tsRaw === "number" ? (tsRaw > 1e12 ? tsRaw : tsRaw * 1000) : tsRaw,
  ).toISOString();

  const bruto = String(raw?.messageType ?? raw?.type ?? "text").toLowerCase();
  const texto: string = raw?.text ?? raw?.content ?? raw?.caption ?? "";

  let type: WaType = "unknown";
  let content = "";
  let mediaUrl: string | null = raw?.file ?? raw?.mediaUrl ?? raw?.url ?? null;
  let mimeType: string | null = raw?.mimetype ?? raw?.mimeType ?? null;
  let fileName: string | null = raw?.fileName ?? raw?.filename ?? null;
  let replyTo: string | null = normId(raw?.quoted?.messageid ?? raw?.contextInfo?.stanzaId ?? null);
  const metadata: Record<string, unknown> = {};

  if (bruto.includes("conversation") || bruto === "text" || bruto.includes("extendedtext")) {
    type = "text";
    content = texto;
  } else if (bruto.includes("image")) {
    type = "image"; content = texto; mimeType = mimeType ?? "image/jpeg";
  } else if (bruto.includes("video")) {
    type = "video"; content = texto; mimeType = mimeType ?? "video/mp4";
  } else if (bruto.includes("audio") || bruto.includes("ptt")) {
    // ptt = mensagem de voz; audio = arquivo de música. A tela mostra diferente.
    type = bruto.includes("ptt") || raw?.ptt === true ? "ptt" : "audio";
    mimeType = mimeType ?? "audio/ogg";
  } else if (bruto.includes("document")) {
    type = "document";
    content = texto || fileName || "";
    mimeType = mimeType ?? "application/octet-stream";
    fileName = fileName ?? "documento";
  } else if (bruto.includes("sticker")) {
    type = "sticker"; mimeType = mimeType ?? "image/webp";
  } else if (bruto.includes("location")) {
    type = "location";
    const lat = raw?.latitude ?? raw?.content?.degreesLatitude;
    const lng = raw?.longitude ?? raw?.content?.degreesLongitude;
    content = raw?.name ?? texto ?? `${lat},${lng}`;
    metadata.lat = lat; metadata.lng = lng;
  } else if (bruto.includes("contact")) {
    type = "contact";
    const vcard = raw?.content?.vcard ?? (typeof texto === "string" ? texto : "");
    const nome = (vcard.match(/FN:(.+)/)?.[1] ?? raw?.content?.displayName ?? "").trim();
    content = `📇 ${nome || "Contato"}`;
    metadata.vcard = vcard || null; metadata.displayName = nome || null;
  } else if (bruto.includes("reaction")) {
    type = "reaction"; content = texto;
    replyTo = normId(raw?.quoted?.messageid ?? raw?.reactionMessage?.key?.id ?? null);
  } else if (bruto.includes("buttons") || bruto.includes("list") || bruto.includes("template")) {
    // resposta a botão/lista: sem isto o atendente vê bolha vazia
    type = "text";
    content = texto || raw?.selectedDisplayText || "(resposta)";
    metadata.resposta_interativa = true;
  } else if (bruto.includes("protocol") || bruto.includes("revoke")) {
    type = "system"; content = "";
    metadata.protocol = bruto;
  } else if (bruto.includes("call")) {
    type = "call"; content = "📞 Chamada";
  } else if (texto) {
    // dialeto novo que ainda não mapeamos, mas veio texto: melhor mostrar o
    // texto do que uma bolha vazia.
    type = "text"; content = texto;
    metadata.tipo_original = bruto;
  }

  return { externalId, fromMe, type, content, mediaUrl, mimeType, fileName, senderName, replyTo, timestamp, metadata };
}

/**
 * Escolhe o dialeto pelo formato do payload, não por configuração.
 *
 * A instância guarda o provedor, mas confiar nisso quebraria quando o provedor
 * muda de formato entre versões ou quando a linha foi cadastrada errada — e o
 * sintoma seria mensagem vazia, difícil de rastrear. A forma do objeto é a
 * evidência mais confiável: o Baileys aninha em `message.*`, a uazapi é chata.
 */
function parseMensagem(raw: any): Parsed {
  const aninhado = raw?.message && typeof raw.message === "object" &&
    (raw.message.conversation != null || raw.message.extendedTextMessage ||
     raw.message.imageMessage || raw.message.videoMessage || raw.message.audioMessage ||
     raw.message.documentMessage || raw.message.stickerMessage);
  if (aninhado) return parseEvolution(raw);
  if (raw?.messageType != null || raw?.messageid != null || raw?.chatid != null) {
    return parseUazapi(raw);
  }
  return parseEvolution(raw);
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
    .select("id, clinica_id, api_url, api_token, apikey").eq("instance_id", instanceName).maybeSingle();
  return data;
}

// upsert do chat (idempotente por instance_id + remote_jid)
async function upsertChat(
  instanceId: string, clinicaId: string, remoteJid: string,
  name?: string | null, fotoUrl?: string | null,
) {
  const phone = remoteJid.split("@")[0];
  // COALESCE via não-sobrescrever: só manda o campo quando temos valor novo, pra
  // não apagar um nome/foto já bons com null de uma mensagem posterior que não
  // trouxe esses dados.
  const patch: Record<string, unknown> = {
    instance_id: instanceId, clinica_id: clinicaId, remote_jid: remoteJid, contact_phone: phone,
  };
  if (name) patch.name = name;
  else patch.name = phone; // primeiro insert precisa de algo; upsert reescreve se vier nome depois
  if (fotoUrl) patch.profile_pic_url = fotoUrl;

  const { data } = await supabase.from("whatsapp_chats")
    .upsert(patch, { onConflict: "instance_id,remote_jid", ignoreDuplicates: false })
    .select("id, profile_pic_url").maybeSingle();
  return data as { id: string; profile_pic_url: string | null } | null;
}

// Busca a foto do contato no provedor. Best-effort e com timeout curto: é
// enriquecimento, não pode segurar a ingestão da mensagem. Endpoint conferido
// contra o CRM que opera esta mesma conta uazapi (POST /chat/details).
async function buscarFotoPerfil(
  apiUrl: string, token: string, remoteJid: string,
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${apiUrl}/chat/details`, {
      method: "POST",
      headers: { token, "Content-Type": "application/json" },
      body: JSON.stringify({ number: remoteJid, preview: true }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const d = await res.json().catch(() => ({}));
    const chat = d?.chat ?? d;
    return chat?.imagePreview ?? chat?.image ?? chat?.profilePicUrl ?? null;
  } catch { return null; }
}

/** Compara sem vazar o tamanho por tempo de resposta. */
function iguala(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  // --------------------------------------------------------------- autenticação
  // Dois modelos convivem, e antes eles não conversavam: o banco guarda um
  // segredo POR INSTÂNCIA (`whatsapp_instances.webhook_secret`, gerado na
  // criação) enquanto aqui só existia um env global. O provedor registrado com
  // o segredo da instância batia de frente com 403 — ninguém recebia nada.
  //
  // Um segredo por clínica também é melhor de segurança: com o global, quem
  // descobrisse o valor injetaria mensagem em QUALQUER clínica bastando acertar
  // o nome da instância.
  //
  // O provedor não manda header customizado, então o segredo vem no caminho da
  // URL (…/whatsapp-webhook/<segredo>). Continua fora da querystring, que é a
  // parte que mais aparece em log de proxy e de borda.
  const partes = new URL(req.url).pathname.split("/").filter(Boolean);
  const doCaminho = partes[partes.length - 1] ?? "";
  const candidato = req.headers.get("x-webhook-secret")
    ?? (doCaminho && doCaminho !== "whatsapp-webhook" ? doCaminho : "");

  // fail-CLOSED: sem candidato não se atende — a função roda com service_role.
  if (!candidato) return new Response("forbidden", { status: 403 });

  // 1) segredo global, quando configurado (compatibilidade com o que já existia)
  let instPorSegredo:
    | { id: string; clinica_id: string; api_url: string | null; api_token: string | null; apikey: string | null }
    | null = null;
  const globalOk = !!WEBHOOK_SECRET && iguala(candidato, WEBHOOK_SECRET);

  // 2) senão, o segredo tem de pertencer a uma instância viva
  if (!globalOk) {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("id, clinica_id, api_url, api_token, apikey")
      .eq("webhook_secret", candidato)
      .maybeSingle();
    if (!data) return new Response("forbidden", { status: 403 });
    instPorSegredo = data as unknown as typeof instPorSegredo;
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const event: string = body?.event ?? body?.type ?? "";
  const instanceName: string = body?.instance ?? body?.instanceName ?? "";
  // O segredo identifica a instância melhor que o nome vindo no corpo: o nome é
  // dado do remetente, o segredo é nosso. Só cai no nome quando veio pelo
  // segredo global (rota antiga).
  const inst = instPorSegredo ?? (instanceName ? await findInstance(instanceName) : null);

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
      // Cada provedor embrulha diferente:
      //   Evolution → { event, instance, data: { key, message: {...} } }
      //   uazapi    → { EventType, instance, message: { chatid, text, ... } }
      // Sem desembrulhar o envelope da uazapi, o laço recebia o objeto de fora,
      // não achava `chatid` um nível abaixo e descartava TODA mensagem dela em
      // silêncio — a função respondia 200 e salvava zero.
      const envelopeUazapi = body?.message && typeof body.message === "object" &&
        (body.message.chatid != null || body.message.messageid != null ||
         body.message.messageType != null);
      const items = Array.isArray(body?.data)
        ? body.data
        : envelopeUazapi
          ? [body.message]
          : [body?.data ?? body];
      let saved = 0;
      for (const raw of items) {
        // `chatid`/`chatId` são a forma da uazapi. Sem eles, toda mensagem dela
        // era descartada aqui — antes mesmo de chegar ao parser.
        const remoteJid = raw?.key?.remoteJid ?? raw?.remoteJid ?? raw?.chatid ?? raw?.chatId;
        // ignora grupo, status do WhatsApp, canal e endereçamento LID (não-discável)
        if (!remoteJid || /@(g\.us|broadcast|newsletter|lid)$/.test(remoteJid)) continue;
        const p = parseMensagem(raw);
        // Foto que já veio no payload (alguns eventos trazem), sem custo.
        const fotoNoPayload = raw?.senderPhoto ?? raw?.imagePreview ?? raw?.chat?.imagePreview ?? null;
        const chat = await upsertChat(inst.id, inst.clinica_id, remoteJid, p.senderName, fotoNoPayload);
        const chatId = chat?.id;
        if (!chatId) continue;

        // Sem foto ainda? Busca no provedor UMA vez (best-effort, não bloqueia).
        // Só para mensagem recebida: a nossa própria não tem foto de contato.
        const tokenInst = (inst as any).api_token ?? (inst as any).apikey;
        if (!p.fromMe && !chat?.profile_pic_url && (inst as any).api_url && tokenInst) {
          const foto = await buscarFotoPerfil((inst as any).api_url, tokenInst, remoteJid);
          if (foto) {
            await supabase.from("whatsapp_chats").update({ profile_pic_url: foto }).eq("id", chatId);
          }
        }

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
    // external_id ausente isso vira duplicata. Erro fica no log — mas SÓ o
    // tipo+mensagem, nunca o objeto inteiro nem o payload: erro de banco pode
    // carregar valores da linha (PII de saúde) e log de edge é retido (LGPD).
    const err = e as { name?: string; message?: string };
    console.error(`webhook error: ${err?.name ?? "Error"} - ${err?.message ?? "sem mensagem"}`);
    return Response.json({ ok: false }, { status: 200 });
  }
});
