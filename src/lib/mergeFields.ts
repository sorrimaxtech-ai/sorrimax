// ============================================================================
// Merge fields — o motor que preenche documento com dado real
// ----------------------------------------------------------------------------
// Decisões que não são óbvias lendo o código:
//
// 1. Este arquivo NÃO fala com o Supabase. Ele recebe um `ContextoMerge` já
//    montado (quem monta é `@/services/documentos`). Assim a resolução é pura,
//    testável e roda igual no preview ao vivo e na emissão final — o que o
//    profissional vê na tela é literalmente o que vai pro papel.
//
// 2. Todo valor entra ESCAPADO no HTML. O corpo do modelo é HTML de verdade
//    (negrito, listas), mas o nome do paciente é texto: se alguém cadastrar
//    "Ana <b>" o documento não pode quebrar de layout.
//
// 3. Campo sem dado tem dois destinos, conforme o modo:
//    - `preview`: marcação âmbar gritando qual dado falta, pra corrigir antes.
//    - `final`:   linha de preenchimento manual. É o único lugar onde o "____"
//      do concorrente sobrevive aqui — e só quando o banco realmente não tem o
//      dado. Emitir um atestado com "{{paciente.cpf}}" impresso seria pior.
// ============================================================================

export type ChaveMergeField =
  | "paciente.nome"
  | "paciente.cpf"
  | "paciente.data_nascimento"
  | "clinica.nome"
  | "clinica.cnpj"
  | "clinica.endereco"
  | "profissional.nome"
  | "profissional.registro"
  | "data.hoje"
  | "data.hora"
  | "consulta.data"
  | "consulta.hora"
  | "consulta.procedimento"
  | "valor.total";

export interface ContextoMerge {
  paciente?: {
    nome?: string | null;
    cpf?: string | null;
    data_nascimento?: string | null;
  } | null;
  clinica?: {
    nome?: string | null;
    cnpj?: string | null;
    endereco?: string | null;
  } | null;
  profissional?: {
    nome?: string | null;
    registro?: string | null;
  } | null;
  consulta?: {
    /** timestamp ISO do início — `consulta.data` e `consulta.hora` saem daqui. */
    inicio?: string | null;
    procedimento?: string | null;
  } | null;
  valor?: {
    total?: number | null;
  } | null;
  /** Momento da emissão. Injetável pra preview e emissão baterem no segundo. */
  agora?: Date;
}

export interface CampoMergeField {
  chave: ChaveMergeField;
  rotulo: string;
  descricao: string;
}

export interface GrupoMergeFields {
  grupo: string;
  rotulo: string;
  campos: CampoMergeField[];
}

export const GRUPOS_MERGE_FIELDS: GrupoMergeFields[] = [
  {
    grupo: "paciente",
    rotulo: "Paciente",
    campos: [
      { chave: "paciente.nome", rotulo: "Nome completo", descricao: "Nome do paciente escolhido na emissão." },
      { chave: "paciente.cpf", rotulo: "CPF", descricao: "CPF do cadastro, já formatado." },
      { chave: "paciente.data_nascimento", rotulo: "Data de nascimento", descricao: "Data de nascimento em dd/mm/aaaa." },
    ],
  },
  {
    grupo: "clinica",
    rotulo: "Clínica",
    campos: [
      { chave: "clinica.nome", rotulo: "Nome da clínica", descricao: "Razão/nome fantasia cadastrado." },
      { chave: "clinica.cnpj", rotulo: "CNPJ", descricao: "CNPJ da clínica, já formatado." },
      { chave: "clinica.endereco", rotulo: "Endereço", descricao: "Logradouro, número, cidade e UF." },
    ],
  },
  {
    grupo: "profissional",
    rotulo: "Profissional",
    campos: [
      { chave: "profissional.nome", rotulo: "Nome do profissional", descricao: "Quem assina o documento." },
      { chave: "profissional.registro", rotulo: "Registro (CRO)", descricao: "Registro profissional do cadastro." },
    ],
  },
  {
    grupo: "consulta",
    rotulo: "Consulta",
    campos: [
      { chave: "consulta.data", rotulo: "Data da consulta", descricao: "Exige escolher a consulta na emissão." },
      { chave: "consulta.hora", rotulo: "Hora da consulta", descricao: "Horário de início do atendimento." },
      { chave: "consulta.procedimento", rotulo: "Procedimento", descricao: "Procedimento agendado na consulta." },
    ],
  },
  {
    grupo: "data",
    rotulo: "Data de emissão",
    campos: [
      { chave: "data.hoje", rotulo: "Data de hoje", descricao: "Data por extenso no momento da emissão." },
      { chave: "data.hora", rotulo: "Hora agora", descricao: "Horário da emissão (hh:mm)." },
    ],
  },
  {
    grupo: "valor",
    rotulo: "Valores",
    campos: [
      { chave: "valor.total", rotulo: "Valor total", descricao: "Total da consulta escolhida, em reais." },
    ],
  },
];

export const MERGE_FIELDS: CampoMergeField[] = GRUPOS_MERGE_FIELDS.flatMap((g) => g.campos);

export const ROTULO_MERGE_FIELD: Record<string, string> = MERGE_FIELDS.reduce(
  (acc, c) => ({ ...acc, [c.chave]: c.rotulo }),
  {} as Record<string, string>,
);

/** `{{ chave }}` com espaço tolerado dos dois lados — gente digita com espaço. */
const PADRAO_MERGE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

// ------------------------------------------------------------- formatadores

const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");

export function formatarCpf(v?: string | null): string | null {
  const d = soDigitos(v);
  if (d.length !== 11) return v?.trim() ? v.trim() : null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarCnpj(v?: string | null): string | null {
  const d = soDigitos(v);
  if (d.length !== 14) return v?.trim() ? v.trim() : null;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function dataBr(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
}

function horaBr(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export const dataPorExtenso = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export const brl = (v?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ------------------------------------------------------------- sanitização

// O corpo do modelo é HTML de verdade, escrito num `contentEditable` — e colar
// do Word/de um site traz junto qualquer coisa (`<script>`, `<img onerror>`,
// `<iframe>`). Esse HTML depois é renderizado com `dangerouslySetInnerHTML` no
// preview e plantado no DOM na impressão: sem filtro, um paciente-colaborador
// mal-intencionado deixaria XSS armazenado rodando na sessão de quem abrir o
// documento. Allowlist do que um documento clínico precisa; o resto cai.
const TAGS_PERMITIDAS = new Set([
  "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "strike",
  "sub", "sup", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "blockquote", "hr", "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "small", "pre", "code", "font",
]);

/** Tags cujo CONTEÚDO também some (texto de `<script>` não é texto do doc). */
const TAGS_REMOVIDAS = new Set([
  "script", "style", "iframe", "object", "embed", "link", "meta", "noscript",
  "template", "svg", "math", "form", "input", "button", "textarea", "select",
  "audio", "video", "img", "source", "base", "frame", "frameset",
]);

const ATRIBUTOS_PERMITIDOS = new Set([
  "style", "align", "colspan", "rowspan", "title", "color", "face", "size",
]);

const VALOR_PERIGOSO = /(javascript|vbscript|data)\s*:/i;

function limparNo(elemento: Element): void {
  for (const filho of Array.from(elemento.children)) {
    const tag = filho.tagName.toLowerCase();

    if (TAGS_REMOVIDAS.has(tag)) {
      filho.remove();
      continue;
    }

    for (const attr of Array.from(filho.attributes)) {
      const nome = attr.name.toLowerCase();
      if (
        nome.startsWith("on") ||
        !ATRIBUTOS_PERMITIDOS.has(nome) ||
        VALOR_PERIGOSO.test(attr.value.replace(/[\s -]/g, ""))
      ) {
        filho.removeAttribute(attr.name);
      }
    }

    limparNo(filho);

    // Tag desconhecida (inclusive `<a href>`): perde a casca, mantém o texto.
    if (!TAGS_PERMITIDAS.has(tag)) filho.replaceWith(...Array.from(filho.childNodes));
  }
}

/** Fora do browser (teste/SSR) não há DOM — corta o que executa, no grosso. */
function sanitizarSemDom(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|noscript)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|img|svg|form|input)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(javascript|vbscript)\s*:/gi, "");
}

/**
 * HTML de documento higienizado: mantém formatação (negrito, listas, tabela,
 * `style` de alinhamento dos modelos padrão) e derruba script, evento inline,
 * mídia externa e URL executável.
 */
export function sanitizarHtmlDocumento(html: string): string {
  const bruto = html ?? "";
  if (!bruto) return "";
  if (typeof DOMParser === "undefined") return sanitizarSemDom(bruto);
  try {
    // Documento COMPLETO de propósito: com `<html><body>` explícito todo
    // parser (browser ou implementação de teste) coloca o conteúdo dentro do
    // body. Documento parseado assim é inerte — nada carrega, nada executa.
    const doc = new DOMParser().parseFromString(
      `<html><body>${bruto}</body></html>`,
      "text/html",
    );
    const corpo = doc.body;
    if (!corpo) return sanitizarSemDom(bruto);
    limparNo(corpo);
    return corpo.innerHTML;
  } catch {
    return sanitizarSemDom(bruto);
  }
}

// --------------------------------------------------------------- resolução

type Resolvedor = (ctx: ContextoMerge) => string | null;

const RESOLVEDORES: Record<ChaveMergeField, Resolvedor> = {
  "paciente.nome": (c) => c.paciente?.nome?.trim() || null,
  "paciente.cpf": (c) => formatarCpf(c.paciente?.cpf),
  "paciente.data_nascimento": (c) => dataBr(c.paciente?.data_nascimento),
  "clinica.nome": (c) => c.clinica?.nome?.trim() || null,
  "clinica.cnpj": (c) => formatarCnpj(c.clinica?.cnpj),
  "clinica.endereco": (c) => c.clinica?.endereco?.trim() || null,
  "profissional.nome": (c) => c.profissional?.nome?.trim() || null,
  "profissional.registro": (c) => c.profissional?.registro?.trim() || null,
  "data.hoje": (c) => dataPorExtenso(c.agora ?? new Date()),
  "data.hora": (c) =>
    (c.agora ?? new Date()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  "consulta.data": (c) => dataBr(c.consulta?.inicio),
  "consulta.hora": (c) => horaBr(c.consulta?.inicio),
  "consulta.procedimento": (c) => c.consulta?.procedimento?.trim() || null,
  // `null` só quando não há valor NENHUM: R$ 0,00 impresso sem base é pior que
  // uma linha em branco num recibo.
  "valor.total": (c) =>
    c.valor?.total === null || c.valor?.total === undefined ? null : brl(c.valor.total),
};

export const CHAVES_MERGE_FIELDS = Object.keys(RESOLVEDORES) as ChaveMergeField[];

export const ehChaveConhecida = (chave: string): chave is ChaveMergeField =>
  Object.prototype.hasOwnProperty.call(RESOLVEDORES, chave);

export interface OpcoesResolucao {
  /** `preview` destaca o que falta; `final` deixa linha pra preencher à mão. */
  modo?: "preview" | "final";
}

const MARCA_PENDENTE_PREVIEW = (rotulo: string) =>
  `<span style="background:#fef3c7;color:#92400e;border-bottom:1px dashed #d97706;padding:0 2px;">` +
  `${escaparHtml(rotulo)} (sem dado)</span>`;

const MARCA_PENDENTE_FINAL =
  `<span style="display:inline-block;min-width:160px;border-bottom:1px solid #111;">&nbsp;</span>`;

/**
 * Troca todo `{{campo}}` do HTML pelo valor real do contexto.
 * Chave desconhecida fica intacta — é erro de digitação do modelo e some do
 * documento significa some do radar de quem escreveu.
 */
export function resolverMergeFields(
  html: string,
  contexto: ContextoMerge,
  opcoes: OpcoesResolucao = {},
): string {
  const modo = opcoes.modo ?? "preview";
  return (html ?? "").replace(PADRAO_MERGE, (original, chave: string) => {
    if (!ehChaveConhecida(chave)) return original;
    const valor = RESOLVEDORES[chave](contexto);
    if (valor === null || valor === "") {
      return modo === "final"
        ? MARCA_PENDENTE_FINAL
        : MARCA_PENDENTE_PREVIEW(ROTULO_MERGE_FIELD[chave] ?? chave);
    }
    return escaparHtml(valor);
  });
}

export interface AnaliseMergeFields {
  /** Chaves válidas encontradas no corpo (sem repetição, na ordem de uso). */
  usados: ChaveMergeField[];
  /** Chaves válidas cujo contexto atual não tem valor. */
  pendentes: ChaveMergeField[];
  /** `{{coisa}}` que não existe no catálogo — provável erro de digitação. */
  desconhecidos: string[];
}

export function analisarMergeFields(html: string, contexto: ContextoMerge): AnaliseMergeFields {
  const usados: ChaveMergeField[] = [];
  const pendentes: ChaveMergeField[] = [];
  const desconhecidos: string[] = [];

  for (const m of (html ?? "").matchAll(PADRAO_MERGE)) {
    const chave = m[1];
    if (!ehChaveConhecida(chave)) {
      if (!desconhecidos.includes(chave)) desconhecidos.push(chave);
      continue;
    }
    if (!usados.includes(chave)) usados.push(chave);
    const valor = RESOLVEDORES[chave](contexto);
    if ((valor === null || valor === "") && !pendentes.includes(chave)) pendentes.push(chave);
  }
  return { usados, pendentes, desconhecidos };
}

/** Só as chaves válidas usadas — é o que vai pra coluna `variaveis` do modelo. */
export const extrairMergeFields = (html: string): ChaveMergeField[] =>
  analisarMergeFields(html, {}).usados;

// --------------------------------------------------------- documento pronto

export interface OpcoesDocumento {
  exibirAssinatura?: boolean;
  exibirDataRodape?: boolean;
  modo?: "preview" | "final";
}

/**
 * Corpo resolvido + blocos de assinatura/rodapé.
 * Ficam FORA do corpo editável de propósito: o profissional edita texto, não
 * a estrutura legal do documento — assim nenhum modelo sai sem linha de
 * assinatura por descuido de edição.
 */
export function montarDocumentoFinal(
  corpoHtml: string,
  contexto: ContextoMerge,
  opcoes: OpcoesDocumento = {},
): string {
  const modo = opcoes.modo ?? "preview";
  // Higieniza ANTES de resolver: o que o merge injeta já entra escapado, então
  // o único HTML "cru" do documento é o corpo escrito/colado no editor.
  const partes: string[] = [
    resolverMergeFields(sanitizarHtmlDocumento(corpoHtml), contexto, { modo }),
  ];

  if (opcoes.exibirAssinatura) {
    const nome = contexto.profissional?.nome?.trim();
    const registro = contexto.profissional?.registro?.trim();
    partes.push(
      `<div style="margin-top:56px;text-align:center;">` +
        `<div style="border-top:1px solid #111;width:280px;margin:0 auto 6px;"></div>` +
        `<div style="font-weight:600;">${nome ? escaparHtml(nome) : "&nbsp;"}</div>` +
        (registro ? `<div style="font-size:13px;">${escaparHtml(registro)}</div>` : "") +
        `<div style="font-size:12px;color:#555;">Assinatura do profissional</div>` +
      `</div>`,
    );
  }

  if (opcoes.exibirDataRodape) {
    const agora = contexto.agora ?? new Date();
    partes.push(
      `<p style="margin-top:32px;text-align:center;font-size:12px;color:#555;">` +
        `Emitido em ${escaparHtml(dataPorExtenso(agora))} às ` +
        `${escaparHtml(agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}` +
      `</p>`,
    );
  }

  return partes.join("\n");
}

// ------------------------------------------------------------------- hash

/**
 * SHA-256 hex do conteúdo emitido. Serve de prova de integridade: se alguém
 * reimprimir um documento alterado, o hash não bate com o guardado.
 * `crypto.subtle` só existe em contexto seguro (https/localhost) — fora dele
 * devolve null em vez de estourar, porque documento emitido vale mais que hash.
 */
export async function hashSha256(texto: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const buffer = await subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
