// ============================================================================
// CORS compartilhado das edge functions
// ----------------------------------------------------------------------------
// Antes cada função respondia `Access-Control-Allow-Origin: *`. Como todas
// exigem JWT, o `*` não é um buraco por si só (o navegador ainda precisa do
// token), mas é bom higiene travar a origem em produção.
//
// Aqui a trava é OPT-IN, pra não quebrar deploy nenhum: enquanto o secret
// `ALLOWED_ORIGINS` não existir, o comportamento é o de antes (`*`). Assim que
// a clínica setar (ex.: "https://app.sorrimax.com.br,https://sorrimax.com.br"),
// só essas origens passam — a resposta ecoa a origem da requisição quando ela
// está na lista e marca `Vary: Origin` pro cache não misturar respostas.
// ============================================================================

const LISTA = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const BASE = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Cabeçalhos CORS para esta requisição, resolvendo a origem contra a allow-list. */
export function cors(req: Request): Record<string, string> {
  // Sem lista configurada → comportamento antigo (aberto). Deploy não quebra.
  if (LISTA.length === 0) {
    return { ...BASE, "Access-Control-Allow-Origin": "*" };
  }
  const origem = req.headers.get("origin") ?? "";
  const permitida = LISTA.includes(origem) ? origem : LISTA[0];
  return { ...BASE, "Access-Control-Allow-Origin": permitida, Vary: "Origin" };
}
