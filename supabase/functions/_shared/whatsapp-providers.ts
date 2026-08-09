// ============================================================================
// Adapter de provedores WhatsApp — uazapi + evolution
// ----------------------------------------------------------------------------
// Porta de utils/uazapi.ts (Diamond) + suporte à Evolution já usada no Sorrimax.
// Mantém os algoritmos fiéis: normalizeBrazilianPhone, extractExternalId (com
// normalização do id prefixado — chave do dedup), splitIntoParts, circuit breaker.
// ============================================================================

export type Provider = "uazapi" | "evolution" | "meta";

export interface SendResult {
  externalId: string | null;
  raw: unknown;
  timeout?: boolean;
}

// ---------------------------------------------------------------- telefone BR
// Porta normalizeBrazilianPhone: 55 + DDD + (9) + 8 dígitos.
export function normalizeBrazilianPhone(to: string): string {
  if (!to) return "";
  if (String(to).includes("@g.us")) {
    const g = String(to).replace("@g.us", "").replace(/[^0-9-]/g, "");
    return g ? `${g}@g.us` : "";
  }
  let n = String(to).split("@")[0].replace(/\D/g, "");
  if (n.startsWith("55") && n.length === 12) {
    const ddd = parseInt(n.substring(2, 4), 10);
    const localFirst = n[4];
    if (ddd >= 11 && localFirst && localFirst !== "0" && localFirst >= "6") {
      n = n.substring(0, 4) + "9" + n.substring(4);
    }
  }
  return n;
}

// ---------------------------------------------------------------- external id
// Porta extractExternalId: cobre key.id, messageid (lowercase uazapiGO), etc.
// e NORMALIZA o id prefixado ("5573...:3EB0" → "3EB0") pra casar com o eco do
// webhook — sem isso o dedup falha e a mensagem duplica (bug real 2026-07-14).
export function extractExternalId(res: any): string | null {
  if (!res) return null;
  const raw = res?.key?.id || res?.message?.key?.id || res?.messages?.[0]?.key?.id ||
    res?.messageid || res?.messageId || res?.id || null;
  if (!raw) return null;
  const s = String(raw);
  return s.includes(":") ? (s.split(":").pop() || s) : s;
}

// ---------------------------------------------------------------- split
// Porta splitIntoParts: parágrafos → frases, maxLen 300, maxParts 6.
export function splitIntoParts(text: string, opts?: { maxLen?: number; maxParts?: number }): string[] {
  const maxLen = opts?.maxLen ?? 300;
  const maxParts = opts?.maxParts ?? 6;
  const clean = String(text || "").trim();
  if (!clean) return [];
  const blocks = clean.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const block of blocks) {
    if (block.length <= maxLen) { out.push(block); continue; }
    const sentences = block.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
    let cur = "";
    for (const s of sentences) {
      if (!cur) cur = s;
      else if ((cur + " " + s).length <= maxLen) cur += " " + s;
      else { out.push(cur); cur = s; }
    }
    if (cur) out.push(cur);
  }
  if (out.length > maxParts) {
    return [...out.slice(0, maxParts - 1), out.slice(maxParts - 1).join("\n\n")];
  }
  return out.length ? out : [clean];
}

// ---------------------------------------------------------------- circuit breaker
// Porta uazapi-circuit: 3 falhas de rede consecutivas → 90s de cooldown de fundo.
// Aqui, como a Edge Function é stateless entre invocações, o estado de "degraded"
// vive na coluna whatsapp_instances.degraded (marcada pelo worker/webhook).
const SLOW_FAIL_THRESHOLD = 3;
const failCount = new Map<string, number>();
export function registerFailure(token: string): boolean {
  const n = (failCount.get(token) || 0) + 1;
  failCount.set(token, n);
  return n >= SLOW_FAIL_THRESHOLD;
}
export function clearFailure(token: string): void { failCount.delete(token); }

// ---------------------------------------------------------------- envio
interface InstanceCfg {
  provider: Provider;
  apiUrl: string;
  apiToken: string;
  instanceName: string;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 30000): Promise<{ ok: boolean; status: number; data: any; timeout?: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: String(e) }, timeout: (e as Error).name === "AbortError" };
  } finally {
    clearTimeout(t);
  }
}

// Envia texto pelo provedor certo. Assinatura única pros dois.
export async function sendText(
  cfg: InstanceCfg, to: string, text: string, opts?: { canonical?: boolean },
): Promise<SendResult> {
  // canonical: o número veio do WhatsApp (remote_jid/contact_phone) e já está
  // na forma que o WhatsApp registra. Normalizar de novo injeta um 9 indevido
  // em alguns DDDs e passa a falar com OUTRO número (bug conhecido do Diamond).
  const number = opts?.canonical
    ? String(to).split("@")[0].replace(/\D/g, "")
    : normalizeBrazilianPhone(to);
  if (cfg.provider === "uazapi") {
    // POST {url}/send/text  header token  body {number,text,delay,async}
    const r = await fetchJson(`${cfg.apiUrl}/send/text`, {
      method: "POST",
      headers: { token: cfg.apiToken, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text, delay: 500, async: false }),
    });
    if (!r.ok) throw Object.assign(new Error(r.data?.error || `uazapi ${r.status}`), { timeout: r.timeout });
    return { externalId: extractExternalId(r.data), raw: r.data };
  }
  // evolution: POST {url}/message/sendText/{instance}  header apikey  body {number,text}
  const r = await fetchJson(`${cfg.apiUrl}/message/sendText/${cfg.instanceName}`, {
    method: "POST",
    headers: { apikey: cfg.apiToken, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text, delay: 500 }),
  });
  if (!r.ok) throw Object.assign(new Error(r.data?.message || `evolution ${r.status}`), { timeout: r.timeout });
  return { externalId: extractExternalId(r.data), raw: r.data };
}

export async function sendMedia(
  cfg: InstanceCfg, to: string, mediaUrl: string,
  kind: "image" | "video" | "audio" | "document" | "ptt" | "sticker",
  caption?: string, fileName?: string, opts?: { canonical?: boolean },
): Promise<SendResult> {
  const number = opts?.canonical
    ? String(to).split("@")[0].replace(/\D/g, "")
    : normalizeBrazilianPhone(to);
  if (cfg.provider === "uazapi") {
    const r = await fetchJson(`${cfg.apiUrl}/send/media`, {
      method: "POST",
      headers: { token: cfg.apiToken, "Content-Type": "application/json" },
      body: JSON.stringify({ number, type: kind, file: mediaUrl, text: caption ?? "", docName: fileName, delay: 500, async: false }),
    });
    if (!r.ok) throw Object.assign(new Error(r.data?.error || `uazapi ${r.status}`), { timeout: r.timeout });
    return { externalId: extractExternalId(r.data), raw: r.data };
  }
  const evoType = kind === "ptt" ? "audio" : kind;
  const r = await fetchJson(`${cfg.apiUrl}/message/sendMedia/${cfg.instanceName}`, {
    method: "POST",
    headers: { apikey: cfg.apiToken, "Content-Type": "application/json" },
    body: JSON.stringify({ number, mediatype: evoType, media: mediaUrl, caption: caption ?? "", fileName }),
  });
  if (!r.ok) throw Object.assign(new Error(r.data?.message || `evolution ${r.status}`), { timeout: r.timeout });
  return { externalId: extractExternalId(r.data), raw: r.data };
}
