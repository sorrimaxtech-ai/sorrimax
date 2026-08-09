// ============================================================================
// traduzErro — erro cru do Postgres/Supabase -> português para a recepção
// ----------------------------------------------------------------------------
// A superauditoria achou ~98 toasts mostrando "duplicate key value violates
// unique constraint..." e afins, em inglês, para quem atende no balcão. Este
// helper mapeia os códigos/mensagens comuns; o que não reconhece, devolve como
// veio (melhor a mensagem original do que um texto genérico que esconde a causa).
// ============================================================================

interface ErroLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  error_description?: string;
}

// por código SQLSTATE do Postgres (o mais confiável)
const POR_CODIGO: Record<string, string> = {
  "23505": "Já existe um registro com esses dados (duplicado).",
  "23503": "Não é possível: há outros registros ligados a este.",
  "23502": "Falta preencher um campo obrigatório.",
  "23514": "Um dos valores informados não é válido.",
  "23P01": "Esse horário conflita com outro agendamento.",
  "22P02": "Um dos valores está em formato inválido.",
  "P0001": "", // raise exception com mensagem própria: usa a message
  "42501": "Você não tem permissão para esta ação.",
  "PGRST301": "Sua sessão expirou. Entre novamente.",
};

// trechos conhecidos de mensagens (quando não vem código util)
const POR_TRECHO: Array<[RegExp, string]> = [
  [/duplicate key value/i, "Já existe um registro com esses dados (duplicado)."],
  [/violates foreign key/i, "Não é possível: há outros registros ligados a este."],
  [/violates not-null/i, "Falta preencher um campo obrigatório."],
  [/violates check constraint/i, "Um dos valores informados não é válido."],
  [/violates exclusion constraint|conflicting key|overlap/i, "Esse horário conflita com outro agendamento."],
  [/row-level security|permission denied|not authorized/i, "Você não tem permissão para esta ação."],
  [/jwt expired|invalid token|session/i, "Sua sessão expirou. Entre novamente."],
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/failed to fetch|network|networkerror/i, "Sem conexão com o servidor. Verifique a internet."],
  [/rate limit|too many requests/i, "Muitas tentativas em pouco tempo. Aguarde um instante."],
];

export function traduzErro(e: unknown): string {
  if (!e) return "Ocorreu um erro. Tente novamente.";
  if (typeof e === "string") return traduzTexto(e);
  const err = e as ErroLike;

  // mensagem de raise exception do nosso banco (P0001) já vem em pt-BR: use-a
  if (err.code === "P0001" && err.message) return err.message;

  if (err.code && POR_CODIGO[err.code]) return POR_CODIGO[err.code];

  const bruto = err.message || err.error_description || err.details || "";
  return traduzTexto(bruto);
}

function traduzTexto(msg: string): string {
  for (const [re, pt] of POR_TRECHO) if (re.test(msg)) return pt;
  // mensagens curtas que já parecem pt-BR (do nosso próprio código) passam direto
  return msg || "Ocorreu um erro. Tente novamente.";
}
