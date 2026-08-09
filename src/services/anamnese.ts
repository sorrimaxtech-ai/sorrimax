import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Serviço de Anamnese — modelos, perguntas e respostas
// ----------------------------------------------------------------------------
// Decisões que não são óbvias no código:
//
// 1. BANCO DE PERGUNTAS em vez de drag-and-drop. Montar formulário arrastando
//    campo é bonito na demo e caro no dia a dia: a clínica leva uma tarde pra
//    ter a primeira anamnese. Com catálogo + checkbox, o time-to-value cai pra
//    minutos — marca o que usa, salva, acabou. Personalização fica no bloco de
//    pergunta customizada, pra quem realmente precisa.
//
// 2. As tabelas de anamnese entraram no banco depois da última geração de
//    `integrations/supabase/types.ts` (arquivo gerado, fora do meu alcance).
//    Por isso o acesso passa por `db`, um cast do client. Os contratos ficam
//    declarados manualmente abaixo — nada de `any` vazando pras telas.
//
// 3. Score. `peso_score` é MULTIPLICADOR, não constante: em escala ele
//    multiplica o valor escolhido (é o que faz PHQ-9/GAD-7 funcionarem — o
//    score é a soma dos itens), e em sim/não ou opção ele vale como peso fixo
//    por marcação de risco. Ver `calcularScore`.
// ============================================================================

type QueryLivre = {
  from: (tabela: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
const db = supabase as unknown as QueryLivre;

// ------------------------------------------------------------------ contratos

export type TipoPergunta =
  | "texto" | "texto_longo" | "numero" | "data" | "sim_nao"
  | "selecao_unica" | "multipla_escolha" | "escala"
  | "upload" | "assinatura" | "secao";

export type OperadorCondicional =
  | "igual" | "diferente" | "contem" | "maior_que" | "menor_que";

export type PreenchidoPor = "profissional" | "paciente";

export interface EscalaConfig {
  min: number;
  max: number;
  rotulo_min?: string;
  rotulo_max?: string;
  passo?: number;
}

export interface Condicional {
  pergunta_id: string;
  operador: OperadorCondicional;
  valor: ValorResposta;
}

export type ValorResposta =
  | string | number | boolean | string[] | null
  | { assinatura: string; assinado_em: string };

export interface AnamneseModelo {
  id: string;
  clinica_id: string;
  nome: string;
  especialidade: string | null;
  publicado: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnamnesePergunta {
  id: string;
  modelo_id: string;
  clinica_id: string;
  categoria: string | null;
  enunciado: string;
  tipo: TipoPergunta;
  obrigatoria: boolean;
  opcoes: string[] | null;
  escala: EscalaConfig | null;
  condicional: Condicional | null;
  peso_score: number | null;
  ordem: number;
}

export interface AnamneseRespostaRegistro {
  id: string;
  clinica_id: string;
  paciente_id: string;
  consulta_id: string | null;
  modelo_id: string;
  respostas: Record<string, ValorResposta>;
  score_total: number | null;
  preenchido_por: PreenchidoPor;
  created_at: string;
}

export interface ModeloComContagem extends AnamneseModelo {
  qtd_perguntas: number;
  qtd_respostas: number;
}

export const TIPOS_PERGUNTA: { valor: TipoPergunta; rotulo: string; ajuda: string }[] = [
  { valor: "texto", rotulo: "Texto curto", ajuda: "Uma linha. Ex: nome do medicamento." },
  { valor: "texto_longo", rotulo: "Texto longo", ajuda: "Parágrafo. Ex: descrição da queixa." },
  { valor: "numero", rotulo: "Número", ajuda: "Valor numérico. Ex: escovações por dia." },
  { valor: "data", rotulo: "Data", ajuda: "Ex: data da última consulta." },
  { valor: "sim_nao", rotulo: "Sim / Não", ajuda: "Resposta binária, ideal pra gatilho condicional." },
  { valor: "selecao_unica", rotulo: "Seleção única", ajuda: "Uma opção entre várias." },
  { valor: "multipla_escolha", rotulo: "Múltipla escolha", ajuda: "Várias opções ao mesmo tempo." },
  { valor: "escala", rotulo: "Escala (slider)", ajuda: "0 a 10 com rótulos. Dor, ansiedade, PHQ-9, GAD-7." },
  { valor: "upload", rotulo: "Anexo", ajuda: "Arquivo enviado pelo paciente." },
  { valor: "assinatura", rotulo: "Assinatura", ajuda: "Assinatura desenhada na tela." },
  { valor: "secao", rotulo: "Título de seção", ajuda: "Só organiza visualmente, não é respondida." },
];

export const ROTULO_TIPO: Record<TipoPergunta, string> = TIPOS_PERGUNTA.reduce(
  (acc, t) => ({ ...acc, [t.valor]: t.rotulo }),
  {} as Record<TipoPergunta, string>,
);

export const OPERADORES: { valor: OperadorCondicional; rotulo: string }[] = [
  { valor: "igual", rotulo: "for igual a" },
  { valor: "diferente", rotulo: "for diferente de" },
  { valor: "contem", rotulo: "contiver" },
  { valor: "maior_que", rotulo: "for maior que" },
  { valor: "menor_que", rotulo: "for menor que" },
];

/** Tipos que não guardam resposta do paciente (só estruturam a tela). */
export const TIPOS_SEM_RESPOSTA: TipoPergunta[] = ["secao"];

// ------------------------------------------------------------------ modelos

function normalizarPergunta(row: any): AnamnesePergunta {
  return {
    id: row.id,
    modelo_id: row.modelo_id,
    clinica_id: row.clinica_id,
    categoria: row.categoria ?? null,
    enunciado: row.enunciado,
    tipo: row.tipo as TipoPergunta,
    obrigatoria: !!row.obrigatoria,
    opcoes: Array.isArray(row.opcoes) ? (row.opcoes as string[]) : null,
    escala: row.escala ?? null,
    condicional: row.condicional ?? null,
    peso_score: row.peso_score === null || row.peso_score === undefined ? null : Number(row.peso_score),
    ordem: Number(row.ordem ?? 0),
  };
}

export async function listarModelos(clinicaId: string): Promise<ModeloComContagem[]> {
  const [modelos, perguntas, respostas] = await Promise.all([
    db.from("anamnese_modelos").select("*").eq("clinica_id", clinicaId).order("created_at", { ascending: false }),
    db.from("anamnese_perguntas").select("modelo_id").eq("clinica_id", clinicaId),
    db.from("anamnese_respostas").select("modelo_id").eq("clinica_id", clinicaId),
  ]);
  if (modelos.error) throw modelos.error;
  if (perguntas.error) throw perguntas.error;
  if (respostas.error) throw respostas.error;

  const contar = (linhas: any[] | null, id: string) =>
    (linhas ?? []).filter((l) => l.modelo_id === id).length;

  return ((modelos.data ?? []) as AnamneseModelo[]).map((m) => ({
    ...m,
    qtd_perguntas: contar(perguntas.data, m.id),
    qtd_respostas: contar(respostas.data, m.id),
  }));
}

export async function listarModelosPublicados(clinicaId: string): Promise<AnamneseModelo[]> {
  const { data, error } = await db
    .from("anamnese_modelos")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("publicado", true)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as AnamneseModelo[];
}

export async function obterModelo(clinicaId: string, id: string): Promise<AnamneseModelo | null> {
  const { data, error } = await db
    .from("anamnese_modelos")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as AnamneseModelo) ?? null;
}

export async function criarModelo(
  clinicaId: string,
  nome: string,
  especialidade: string | null,
): Promise<AnamneseModelo> {
  const { data, error } = await db
    .from("anamnese_modelos")
    .insert({ clinica_id: clinicaId, nome, especialidade, publicado: false })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Modelo não retornado pelo banco.");
  return data as AnamneseModelo;
}

export async function atualizarModelo(
  clinicaId: string,
  id: string,
  patch: Partial<Pick<AnamneseModelo, "nome" | "especialidade" | "publicado">>,
): Promise<void> {
  const { error } = await db
    .from("anamnese_modelos")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirModelo(clinicaId: string, id: string): Promise<void> {
  const { error } = await db
    .from("anamnese_modelos")
    .delete()
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

/** Traz a anamnese odontológica padrão pronta. A função é idempotente no banco. */
export async function semearModeloOdonto(clinicaId: string): Promise<string> {
  const { data, error } = await db.rpc("seed_anamnese_odonto", { p_clinica: clinicaId });
  if (error) throw error;
  return data as string;
}

// ------------------------------------------------------------------ perguntas

export async function listarPerguntas(clinicaId: string, modeloId: string): Promise<AnamnesePergunta[]> {
  const { data, error } = await db
    .from("anamnese_perguntas")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("modelo_id", modeloId)
    // `ordem` não é única (banco de perguntas e seed usam faixas que se cruzam):
    // sem o desempate por created_at a mesma tela sairia em ordem diferente a cada carga
    .order("ordem")
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as any[]).map(normalizarPergunta);
}

export interface NovaPergunta {
  categoria: string | null;
  enunciado: string;
  tipo: TipoPergunta;
  obrigatoria: boolean;
  opcoes?: string[] | null;
  escala?: EscalaConfig | null;
  condicional?: Condicional | null;
  peso_score?: number | null;
  ordem: number;
}

export async function criarPerguntas(
  clinicaId: string,
  modeloId: string,
  novas: NovaPergunta[],
): Promise<AnamnesePergunta[]> {
  if (!novas.length) return [];
  const payload = novas.map((p) => ({
    clinica_id: clinicaId,
    modelo_id: modeloId,
    categoria: p.categoria,
    enunciado: p.enunciado,
    tipo: p.tipo,
    obrigatoria: p.obrigatoria,
    opcoes: p.opcoes ?? null,
    escala: p.escala ?? null,
    condicional: p.condicional ?? null,
    peso_score: p.peso_score ?? null,
    ordem: p.ordem,
  }));
  const { data, error } = await db.from("anamnese_perguntas").insert(payload).select("*");
  if (error) throw error;
  return ((data ?? []) as any[]).map(normalizarPergunta);
}

export async function atualizarPergunta(
  clinicaId: string,
  id: string,
  patch: Partial<Omit<AnamnesePergunta, "id" | "modelo_id" | "clinica_id">>,
): Promise<void> {
  const { error } = await db
    .from("anamnese_perguntas")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirPerguntas(clinicaId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await db
    .from("anamnese_perguntas")
    .delete()
    .eq("clinica_id", clinicaId)
    .in("id", ids);
  if (error) throw error;
}

/** Troca a posição de duas perguntas. Duas escritas porque `ordem` não é única. */
export async function trocarOrdem(a: AnamnesePergunta, b: AnamnesePergunta): Promise<void> {
  const r1 = await db.from("anamnese_perguntas").update({ ordem: b.ordem })
    .eq("clinica_id", a.clinica_id).eq("id", a.id);
  if (r1.error) throw r1.error;
  const r2 = await db.from("anamnese_perguntas").update({ ordem: a.ordem })
    .eq("clinica_id", b.clinica_id).eq("id", b.id);
  if (r2.error) throw r2.error;
}

// ------------------------------------------------------------------ respostas

export interface NovaResposta {
  clinicaId: string;
  pacienteId: string;
  modeloId: string;
  consultaId?: string | null;
  respostas: Record<string, ValorResposta>;
  scoreTotal: number;
  preenchidoPor: PreenchidoPor;
}

export async function salvarResposta(input: NovaResposta): Promise<string> {
  const { data, error } = await db
    .from("anamnese_respostas")
    .insert({
      clinica_id: input.clinicaId,
      paciente_id: input.pacienteId,
      modelo_id: input.modeloId,
      consulta_id: input.consultaId ?? null,
      respostas: input.respostas,
      score_total: input.scoreTotal,
      preenchido_por: input.preenchidoPor,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string) ?? "";
}

export async function listarRespostasDoPaciente(
  clinicaId: string,
  pacienteId: string,
): Promise<AnamneseRespostaRegistro[]> {
  const { data, error } = await db
    .from("anamnese_respostas")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AnamneseRespostaRegistro[];
}

export async function obterPaciente(clinicaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, nome_completo, data_nascimento, celular")
    .eq("clinica_id", clinicaId)
    .eq("id", pacienteId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarPacientes(clinicaId: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, nome_completo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome_completo");
  if (error) throw error;
  return data ?? [];
}

// ------------------------------------------------------- skip logic e score

function comoNumero(v: ValorResposta): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function iguais(a: ValorResposta, b: ValorResposta): boolean {
  if (Array.isArray(a)) return Array.isArray(b) ? a.length === b.length && a.every((x) => b.includes(x)) : a.includes(String(b));
  if (typeof a === "boolean" || typeof b === "boolean") {
    const norm = (v: ValorResposta) => (v === true || v === "true" || v === "sim" ? true : v === false || v === "false" || v === "nao" ? false : v);
    return norm(a) === norm(b);
  }
  if (a === null || a === undefined) return b === null || b === undefined;
  return String(a) === String(b);
}

export function condicaoAtendida(cond: Condicional, respostas: Record<string, ValorResposta>): boolean {
  const atual = respostas[cond.pergunta_id];
  switch (cond.operador) {
    case "igual":
      return iguais(atual, cond.valor);
    case "diferente":
      return !iguais(atual, cond.valor);
    case "contem": {
      if (Array.isArray(atual)) return atual.includes(String(cond.valor));
      return String(atual ?? "").toLowerCase().includes(String(cond.valor ?? "").toLowerCase());
    }
    case "maior_que": {
      const a = comoNumero(atual), b = comoNumero(cond.valor);
      return a !== null && b !== null && a > b;
    }
    case "menor_que": {
      const a = comoNumero(atual), b = comoNumero(cond.valor);
      return a !== null && b !== null && a < b;
    }
    default:
      return true;
  }
}

/**
 * Perguntas que devem aparecer agora. Trata cadeia: se o gatilho está escondido,
 * quem depende dele também some — senão o paciente responde ramo morto.
 */
export function perguntasVisiveis(
  perguntas: AnamnesePergunta[],
  respostas: Record<string, ValorResposta>,
): AnamnesePergunta[] {
  const porId = new Map(perguntas.map((p) => [p.id, p]));
  const cache = new Map<string, boolean>();

  const visivel = (p: AnamnesePergunta, visitados: Set<string>): boolean => {
    if (cache.has(p.id)) return cache.get(p.id)!;
    if (visitados.has(p.id)) return true; // ciclo em condicional: mostra em vez de sumir com tudo
    visitados.add(p.id);

    let ok = true;
    if (p.condicional?.pergunta_id) {
      const gatilho = porId.get(p.condicional.pergunta_id);
      // gatilho de outro modelo / apagado: a condição perde sentido, mostra a pergunta
      ok = gatilho ? visivel(gatilho, visitados) && condicaoAtendida(p.condicional, respostas) : true;
    }
    cache.set(p.id, ok);
    return ok;
  };

  return perguntas.filter((p) => visivel(p, new Set()));
}

/** Opções que representam ausência de risco — não somam score. */
const OPCOES_NEUTRAS = ["nenhuma", "nenhum", "não", "nao", "não se aplica", "nao se aplica", "nunca fumou"];

/**
 * Score de risco. `peso_score` nulo/zero significa "pergunta não pontua".
 * - escala/número: valor × peso (soma direta dos itens em PHQ-9 e GAD-7)
 * - sim/não: peso quando a resposta é sim
 * - seleção: peso por opção marcada, ignorando as neutras
 */
export function calcularScore(
  perguntas: AnamnesePergunta[],
  respostas: Record<string, ValorResposta>,
): number {
  let total = 0;
  for (const p of perguntasVisiveis(perguntas, respostas)) {
    const peso = Number(p.peso_score ?? 0);
    if (!peso) continue;
    const r = respostas[p.id];
    if (r === undefined || r === null || r === "") continue;

    if (p.tipo === "escala" || p.tipo === "numero") {
      const n = comoNumero(r);
      if (n !== null) total += n * peso;
    } else if (p.tipo === "sim_nao") {
      if (r === true) total += peso;
    } else if (p.tipo === "multipla_escolha" || p.tipo === "selecao_unica") {
      const marcadas = Array.isArray(r) ? r : [String(r)];
      total += marcadas.filter((o) => !OPCOES_NEUTRAS.includes(o.trim().toLowerCase())).length * peso;
    }
  }
  return Math.round(total * 100) / 100;
}

export function faixaDoScore(score: number): { rotulo: string; classe: string } {
  if (score >= 15) return { rotulo: "Atenção alta", classe: "bg-red-100 text-red-800 border-0" };
  if (score >= 7) return { rotulo: "Atenção moderada", classe: "bg-amber-100 text-amber-800 border-0" };
  return { rotulo: "Sem alertas relevantes", classe: "bg-emerald-100 text-emerald-800 border-0" };
}

// ------------------------------------------------------- banco de perguntas

export interface ItemBanco {
  chave: string;
  enunciado: string;
  tipo: TipoPergunta;
  obrigatoria?: boolean;
  opcoes?: string[];
  escala?: EscalaConfig;
  peso_score?: number;
  /** Só aparece quando outra pergunta do banco responder o esperado. */
  depende_de?: { chave: string; operador: OperadorCondicional; valor: ValorResposta };
}

export interface CategoriaBanco {
  categoria: string;
  descricao: string;
  itens: ItemBanco[];
}

const ESCALA_FREQ: EscalaConfig = {
  min: 0, max: 3, passo: 1,
  rotulo_min: "Nenhuma vez",
  rotulo_max: "Quase todos os dias",
};

/**
 * Catálogo pronto — conteúdo de produto, não dado de clínica. Nada aqui vai pro
 * banco sem o usuário marcar o checkbox. PHQ-9 e GAD-7 seguem os instrumentos
 * públicos, com escala 0-3 por item e peso 1 (score = soma dos itens).
 */
export const BANCO_PERGUNTAS: CategoriaBanco[] = [
  {
    categoria: "Queixa Principal",
    descricao: "O motivo da consulta e a dor de hoje.",
    itens: [
      { chave: "qp_motivo", enunciado: "Qual o motivo principal da sua consulta?", tipo: "texto_longo", obrigatoria: true },
      { chave: "qp_tempo", enunciado: "Há quanto tempo apresenta esse problema?", tipo: "texto" },
      { chave: "qp_dor", enunciado: "Está sentindo dor neste momento?", tipo: "sim_nao", obrigatoria: true },
      {
        chave: "qp_dor_intensidade",
        enunciado: "Qual a intensidade da dor?",
        tipo: "escala",
        escala: { min: 0, max: 10, passo: 1, rotulo_min: "Sem dor", rotulo_max: "Pior dor imaginável" },
        peso_score: 1,
        depende_de: { chave: "qp_dor", operador: "igual", valor: true },
      },
      {
        chave: "qp_dor_tipo",
        enunciado: "Como é a dor?",
        tipo: "selecao_unica",
        opcoes: ["Latejante", "Contínua", "Ao mastigar", "Ao tomar gelado", "Ao tomar quente", "Espontânea à noite"],
        depende_de: { chave: "qp_dor", operador: "igual", valor: true },
      },
      { chave: "qp_encaminhado", enunciado: "Foi encaminhado por outro profissional?", tipo: "sim_nao" },
    ],
  },
  {
    categoria: "História Médica",
    descricao: "Condições sistêmicas que mudam a conduta clínica.",
    itens: [
      { chave: "hm_tratamento", enunciado: "Está em tratamento médico atualmente?", tipo: "sim_nao", obrigatoria: true },
      {
        chave: "hm_tratamento_qual", enunciado: "Qual tratamento e com qual médico?", tipo: "texto",
        depende_de: { chave: "hm_tratamento", operador: "igual", valor: true },
      },
      {
        chave: "hm_condicoes", enunciado: "Possui alguma destas condições?", tipo: "multipla_escolha", peso_score: 2,
        opcoes: ["Diabetes", "Hipertensão", "Cardiopatia", "Problemas renais", "Problemas hepáticos", "Epilepsia", "Osteoporose", "Asma", "Hipotireoidismo", "Nenhuma"],
      },
      { chave: "hm_cirurgia", enunciado: "Já foi hospitalizado(a) ou passou por cirurgia?", tipo: "sim_nao" },
      { chave: "hm_sangramento", enunciado: "Possui problema de cicatrização ou sangramento excessivo?", tipo: "sim_nao", peso_score: 2 },
      { chave: "hm_marcapasso", enunciado: "Usa marcapasso ou possui prótese cardíaca?", tipo: "sim_nao", peso_score: 3 },
      { chave: "hm_anticoagulante", enunciado: "Faz uso de anticoagulante?", tipo: "sim_nao", peso_score: 3 },
      { chave: "hm_bifosfonato", enunciado: "Usa ou usou bifosfonato (ex: alendronato)?", tipo: "sim_nao", peso_score: 3 },
      { chave: "hm_radio", enunciado: "Fez radioterapia ou quimioterapia de cabeça e pescoço?", tipo: "sim_nao", peso_score: 3 },
      {
        chave: "hm_gravidez", enunciado: "Está grávida ou amamentando?", tipo: "selecao_unica",
        opcoes: ["Grávida", "Amamentando", "Não se aplica"],
      },
      { chave: "hm_pressao", enunciado: "Pressão arterial aferida hoje (ex: 120/80)", tipo: "texto" },
    ],
  },
  {
    categoria: "Medicamentos e Alergias",
    descricao: "O bloco que evita a emergência na cadeira.",
    itens: [
      { chave: "ma_continuo", enunciado: "Faz uso contínuo de algum medicamento?", tipo: "sim_nao", obrigatoria: true },
      {
        chave: "ma_continuo_quais", enunciado: "Quais medicamentos e em qual dosagem?", tipo: "texto_longo",
        depende_de: { chave: "ma_continuo", operador: "igual", valor: true },
      },
      { chave: "ma_alergia", enunciado: "Possui alergia a algum medicamento?", tipo: "sim_nao", obrigatoria: true, peso_score: 3 },
      {
        chave: "ma_alergia_quais", enunciado: "Quais alergias?", tipo: "texto",
        depende_de: { chave: "ma_alergia", operador: "igual", valor: true },
      },
      { chave: "ma_anestesia", enunciado: "Já teve reação à anestesia odontológica?", tipo: "sim_nao", peso_score: 3 },
      { chave: "ma_latex", enunciado: "Possui alergia a látex?", tipo: "sim_nao", peso_score: 2 },
      {
        chave: "ma_outras_alergias", enunciado: "Alergias não medicamentosas", tipo: "multipla_escolha",
        opcoes: ["Alimentos", "Poeira", "Pólen", "Metais", "Nenhuma"],
      },
    ],
  },
  {
    categoria: "Hábitos",
    descricao: "Prognóstico de tratamento depende mais de hábito do que de técnica.",
    itens: [
      {
        chave: "hb_fuma", enunciado: "Fuma?", tipo: "selecao_unica", peso_score: 1,
        opcoes: ["Nunca fumou", "Ex-fumante", "Fuma atualmente"],
      },
      {
        chave: "hb_alcool", enunciado: "Consome bebida alcoólica?", tipo: "selecao_unica",
        opcoes: ["Não", "Socialmente", "Frequentemente"],
      },
      { chave: "hb_bruxismo", enunciado: "Range ou aperta os dentes (bruxismo)?", tipo: "sim_nao", peso_score: 1 },
      { chave: "hb_escovacao", enunciado: "Quantas vezes escova os dentes por dia?", tipo: "numero" },
      { chave: "hb_fio", enunciado: "Usa fio dental diariamente?", tipo: "sim_nao" },
      { chave: "hb_enxaguante", enunciado: "Usa enxaguante bucal?", tipo: "sim_nao" },
      { chave: "hb_unha", enunciado: "Roe unhas, morde objetos ou usa palito?", tipo: "sim_nao" },
      { chave: "hb_respiracao", enunciado: "Respira predominantemente pela boca?", tipo: "sim_nao" },
      {
        chave: "hb_acucar", enunciado: "Com que frequência consome doces ou refrigerantes?", tipo: "selecao_unica",
        opcoes: ["Raramente", "1x por semana", "Alguns dias na semana", "Todos os dias"],
      },
    ],
  },
  {
    categoria: "História Odontológica",
    descricao: "O que já foi feito e como o paciente reagiu.",
    itens: [
      { chave: "ho_ultima", enunciado: "Quando foi sua última consulta ao dentista?", tipo: "data" },
      { chave: "ho_complicacao", enunciado: "Já teve complicação em tratamento odontológico?", tipo: "sim_nao" },
      {
        chave: "ho_complicacao_qual", enunciado: "Descreva a complicação", tipo: "texto_longo",
        depende_de: { chave: "ho_complicacao", operador: "igual", valor: true },
      },
      { chave: "ho_gengiva", enunciado: "Suas gengivas sangram com facilidade?", tipo: "sim_nao", peso_score: 1 },
      { chave: "ho_sensibilidade", enunciado: "Sente sensibilidade a quente, frio ou doce?", tipo: "sim_nao" },
      { chave: "ho_atm", enunciado: "Sente estalos, travamento ou dor na articulação da mandíbula?", tipo: "sim_nao", peso_score: 1 },
      { chave: "ho_ortodontia", enunciado: "Já usou aparelho ortodôntico?", tipo: "sim_nao" },
      { chave: "ho_protese", enunciado: "Usa prótese, implante ou aparelho removível?", tipo: "sim_nao" },
      {
        chave: "ho_ansiedade", enunciado: "Qual seu nível de ansiedade em relação ao tratamento dentário?",
        tipo: "escala", peso_score: 1,
        escala: { min: 0, max: 10, passo: 1, rotulo_min: "Tranquilo(a)", rotulo_max: "Pânico total" },
      },
      {
        chave: "ho_estetica", enunciado: "O que mais te incomoda no seu sorriso?", tipo: "multipla_escolha",
        opcoes: ["Cor dos dentes", "Formato", "Espaços entre os dentes", "Dentes tortos", "Gengiva aparente", "Dentes ausentes", "Nada me incomoda"],
      },
    ],
  },
  {
    categoria: "PHQ-9 — Rastreio de depressão",
    descricao: "Nas últimas 2 semanas, com que frequência foi incomodado por... (0 a 3 por item, score = soma).",
    itens: [
      { chave: "phq1", enunciado: "PHQ-9 1. Pouco interesse ou prazer em fazer as coisas", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "phq2", enunciado: "PHQ-9 2. Sentir-se para baixo, deprimido(a) ou sem perspectiva", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "phq3", enunciado: "PHQ-9 3. Dificuldade para pegar no sono, dormir demais ou continuar dormindo", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "phq4", enunciado: "PHQ-9 4. Sentir-se cansado(a) ou com pouca energia", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "phq5", enunciado: "PHQ-9 5. Falta de apetite ou comer demais", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "phq6", enunciado: "PHQ-9 6. Sentir-se mal consigo mesmo(a) ou sentir que é um fracasso", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "phq7", enunciado: "PHQ-9 7. Dificuldade de concentração em atividades comuns", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "phq8", enunciado: "PHQ-9 8. Lentidão para se movimentar/falar ou agitação incomum", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "phq9", enunciado: "PHQ-9 9. Pensamentos de que estaria melhor morto(a) ou de se machucar", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
    ],
  },
  {
    categoria: "GAD-7 — Rastreio de ansiedade",
    descricao: "Nas últimas 2 semanas, com que frequência foi incomodado por... (0 a 3 por item, score = soma).",
    itens: [
      { chave: "gad1", enunciado: "GAD-7 1. Sentir-se nervoso(a), ansioso(a) ou no limite", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "gad2", enunciado: "GAD-7 2. Não conseguir parar ou controlar as preocupações", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "gad3", enunciado: "GAD-7 3. Preocupar-se demais com coisas diferentes", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "gad4", enunciado: "GAD-7 4. Dificuldade para relaxar", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "gad5", enunciado: "GAD-7 5. Ficar tão agitado(a) que se torna difícil ficar parado(a)", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "gad6", enunciado: "GAD-7 6. Ficar facilmente aborrecido(a) ou irritado(a)", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
      { chave: "gad7", enunciado: "GAD-7 7. Sentir medo como se algo terrível fosse acontecer", tipo: "escala", escala: ESCALA_FREQ, peso_score: 1 },
    ],
  },
  {
    categoria: "Consentimento",
    descricao: "Fecha a ficha com declaração e assinatura.",
    itens: [
      { chave: "cs_veracidade", enunciado: "Declaro que as informações prestadas são verdadeiras e completas", tipo: "sim_nao", obrigatoria: true },
      { chave: "cs_imagem", enunciado: "Autorizo o uso de imagens do meu tratamento para fins clínicos e didáticos", tipo: "sim_nao" },
      { chave: "cs_lgpd", enunciado: "Autorizo o contato por WhatsApp, e-mail e telefone", tipo: "sim_nao" },
      { chave: "cs_assinatura", enunciado: "Assinatura do paciente", tipo: "assinatura", obrigatoria: true },
    ],
  },
];

export const TOTAL_BANCO = BANCO_PERGUNTAS.reduce((s, c) => s + c.itens.length, 0);

/** Índice enunciado → item do banco. É o enunciado que amarra pergunta salva ao catálogo. */
export const ITENS_POR_ENUNCIADO: Map<string, ItemBanco & { categoria: string }> = new Map(
  BANCO_PERGUNTAS.flatMap((c) => c.itens.map((i) => [i.enunciado, { ...i, categoria: c.categoria }] as const)),
);

export const ITENS_POR_CHAVE: Map<string, ItemBanco & { categoria: string }> = new Map(
  BANCO_PERGUNTAS.flatMap((c) => c.itens.map((i) => [i.chave, { ...i, categoria: c.categoria }] as const)),
);

/** Posição do item no catálogo — mantém a ordem do formulário previsível. */
export const ORDEM_BANCO: Map<string, number> = new Map(
  BANCO_PERGUNTAS.flatMap((c) => c.itens).map((i, idx) => [i.chave, idx + 1]),
);

/**
 * Aplica a seleção do banco ao modelo: insere o que foi marcado, apaga o que foi
 * desmarcado e só então grava as condicionais (o gatilho precisa existir antes,
 * porque a condicional guarda o id dele).
 */
export async function aplicarSelecaoDoBanco(
  clinicaId: string,
  modeloId: string,
  chavesSelecionadas: Set<string>,
  perguntasAtuais: AnamnesePergunta[],
): Promise<{ inseridas: number; removidas: number }> {
  const atuaisPorEnunciado = new Map(perguntasAtuais.map((p) => [p.enunciado, p]));

  const aInserir: ItemBanco[] = [];
  for (const chave of chavesSelecionadas) {
    const item = ITENS_POR_CHAVE.get(chave);
    if (item && !atuaisPorEnunciado.has(item.enunciado)) aInserir.push(item);
  }

  const aRemover = perguntasAtuais.filter((p) => {
    const item = ITENS_POR_ENUNCIADO.get(p.enunciado);
    return item && !chavesSelecionadas.has(item.chave);
  });

  if (aRemover.length) await excluirPerguntas(clinicaId, aRemover.map((p) => p.id));

  let inseridas: AnamnesePergunta[] = [];
  if (aInserir.length) {
    inseridas = await criarPerguntas(
      clinicaId,
      modeloId,
      aInserir.map((i) => ({
        categoria: ITENS_POR_CHAVE.get(i.chave)?.categoria ?? null,
        enunciado: i.enunciado,
        tipo: i.tipo,
        obrigatoria: !!i.obrigatoria,
        opcoes: i.opcoes ?? null,
        escala: i.escala ?? null,
        condicional: null,
        peso_score: i.peso_score ?? null,
        ordem: ORDEM_BANCO.get(i.chave) ?? 999,
      })),
    );
  }

  // segunda passada: agora todo gatilho já tem id
  const mapaFinal = new Map(
    [...perguntasAtuais.filter((p) => !aRemover.includes(p)), ...inseridas].map((p) => [p.enunciado, p]),
  );
  for (const item of aInserir) {
    if (!item.depende_de) continue;
    const gatilhoItem = ITENS_POR_CHAVE.get(item.depende_de.chave);
    const gatilho = gatilhoItem ? mapaFinal.get(gatilhoItem.enunciado) : undefined;
    const alvo = mapaFinal.get(item.enunciado);
    if (!gatilho || !alvo) continue;
    await atualizarPergunta(clinicaId, alvo.id, {
      condicional: { pergunta_id: gatilho.id, operador: item.depende_de.operador, valor: item.depende_de.valor },
    });
  }

  return { inseridas: inseridas.length, removidas: aRemover.length };
}

export const formatarData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export const formatarDataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
