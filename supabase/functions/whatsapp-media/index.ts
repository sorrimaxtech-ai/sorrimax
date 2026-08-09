// ============================================================================
// Edge Function: whatsapp-media
// ----------------------------------------------------------------------------
// Resgata a mídia recebida e a serve.
//
// PROBLEMA QUE RESOLVE: o evento do provedor entrega `media_url` apontando para
// o CDN do WhatsApp — arquivo CRIPTOGRAFADO (.enc) e com validade curta. A tela
// renderiza <img src={media_url}> e nunca abre; e o que abrisse morreria em
// dias. Numa clínica isso é a radiografia que o paciente mandou sumindo do
// prontuário.
//
// SOLUÇÃO: baixar do provedor (POST /message/download, que devolve o arquivo já
// decifrado), guardar no R2, e apontar `media_url` para esta função. O endereço
// vira permanente e a leitura é feita com URL assinada de vida curta.
//
// Duas entradas:
//   POST { acao: "resgatar" }  — chamada pelo agendador; processa um lote
//   GET  /whatsapp-media/<id>  — serve a mídia daquela mensagem (redirect)
//
// O <id> é o UUID da mensagem: 122 bits de aleatoriedade, não enumerável. É o
// mesmo modelo de uma URL assinada, e evita depender de cabeçalho de sessão —
// que <img src> não manda.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const R2_ACCOUNT = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "";
const R2_KEY = Deno.env.get("R2_ACCESS_KEY") ?? "";
const R2_SECRET = Deno.env.get("R2_SECRET_KEY") ?? "";
const BASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const LOTE = Number(Deno.env.get("MEDIA_BATCH") ?? "15");

const r2 = new AwsClient({
  accessKeyId: R2_KEY, secretAccessKey: R2_SECRET, service: "s3", region: "auto",
});
const endpoint = () => `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}`;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/** URL de leitura assinada, curta: o link não deve sobreviver ao compartilhamento. */
async function assinarLeitura(chave: string, segundos = 900): Promise<string> {
  const u = new URL(`${endpoint()}/${chave}`);
  u.searchParams.set("X-Amz-Expires", String(segundos));
  const assinada = await r2.sign(u.toString(), { method: "GET", aws: { signQuery: true } });
  return assinada.url;
}

/** Domínios cuja URL é efêmera/criptografada — precisam de resgate. */
function precisaResgate(url: string | null): boolean {
  if (!url) return false;
  return /whatsapp\.net|\.enc(\?|$)|mmg\.whatsapp|pps\.whatsapp|uazapi/i.test(url);
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
  "application/pdf": "pdf",
};

async function resgatarUma(msg: any): Promise<"ok" | "sem-provedor" | "falhou"> {
  const { data: inst } = await supabase.from("whatsapp_instances")
    .select("api_url, api_token, apikey")
    .eq("id", (await supabase.from("whatsapp_chats").select("instance_id")
      .eq("id", msg.chat_id).maybeSingle()).data?.instance_id ?? "")
    .maybeSingle();
  const apiUrl = inst?.api_url;
  const token = inst?.api_token ?? inst?.apikey;
  if (!apiUrl || !token || !msg.external_id) return "sem-provedor";

  // O provedor devolve o arquivo já decifrado, em base64.
  const res = await fetch(`${apiUrl}/message/download`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ id: msg.external_id, return_base64: true, return_link: false }),
  });
  if (!res.ok) return "falhou";
  const d = await res.json().catch(() => ({}));
  // `base64Data` é o nome real na resposta (conferido contra o provedor); as
  // outras variantes ficam como rede de segurança para mudança de versão.
  const b64: string | null =
    d?.base64Data ?? d?.base64 ?? d?.fileBase64 ?? d?.data ?? null;
  if (!b64) return "falhou";

  const mime: string = d?.mimetype ?? msg.mime_type ?? "application/octet-stream";
  const limpo = b64.includes(",") ? b64.split(",").pop()! : b64;
  const bytes = Uint8Array.from(atob(limpo), (c) => c.charCodeAt(0));

  const ext = EXT[mime.split(";")[0]] ?? "bin";
  const chave = `whatsapp/${msg.clinica_id}/${msg.id}.${ext}`;

  const put = await r2.fetch(`${endpoint()}/${chave}`, {
    method: "PUT", body: bytes, headers: { "Content-Type": mime },
  });
  if (!put.ok) return "falhou";

  await supabase.from("whatsapp_messages").update({
    media_url: `${BASE_URL}/functions/v1/whatsapp-media/${msg.id}`,
    mime_type: mime,
    metadata: { ...(msg.metadata ?? {}), r2_key: chave },
  }).eq("id", msg.id);

  return "ok";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const partes = url.pathname.split("/").filter(Boolean);
  const idNaUrl = partes[partes.length - 1];

  // ---------------------------------------------------------------- servir
  if (req.method === "GET" && idNaUrl && idNaUrl !== "whatsapp-media") {
    const { data: msg } = await supabase.from("whatsapp_messages")
      .select("id, metadata, mime_type").eq("id", idNaUrl).maybeSingle();
    const chave = (msg?.metadata as any)?.r2_key;
    if (!chave) return new Response("nao encontrado", { status: 404 });
    const assinada = await assinarLeitura(String(chave));
    // 302 em vez de streamar: o arquivo vai direto do R2 ao navegador, sem
    // passar por aqui — economiza execução e aguenta vídeo grande.
    return new Response(null, {
      status: 302,
      headers: { Location: assinada, "Cache-Control": "private, max-age=600" },
    });
  }

  // --------------------------------------------------------------- resgatar
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!R2_ACCOUNT || !R2_BUCKET || !R2_KEY || !R2_SECRET) {
    return json({ erro: "armazenamento nao configurado no servidor" }, 503);
  }

  // media_url NULO também entra: o eco de mídia enviada do celular chega SEM
  // url nenhuma (o provedor só manda o id). Filtrar por "url efêmera" deixava
  // justamente esses de fora — áudio e foto ficavam mudos para sempre.
  const { data: pendentes } = await supabase.from("whatsapp_messages")
    .select("id, chat_id, clinica_id, external_id, media_url, mime_type, metadata, message_type")
    .in("message_type", ["image", "video", "audio", "ptt", "document", "sticker"])
    .not("external_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(LOTE * 4);

  const alvos = (pendentes ?? [])
    .filter((m: any) => !m.media_url || precisaResgate(m.media_url))
    .slice(0, LOTE);
  let ok = 0, falhou = 0, sem = 0;
  for (const m of alvos) {
    const r = await resgatarUma(m).catch(() => "falhou" as const);
    if (r === "ok") ok++; else if (r === "falhou") falhou++; else sem++;
  }
  return json({ ok: true, processadas: alvos.length, resgatadas: ok, falhas: falhou, sem_provedor: sem });
});
