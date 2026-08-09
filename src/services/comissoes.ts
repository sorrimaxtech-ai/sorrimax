import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/services/orcamentos";

// ============================================================================
// Serviço de Comissões — repasse ao profissional
// ----------------------------------------------------------------------------
// A regra que sustenta a tela inteira mora no BANCO, não aqui:
//   trigger `trg_parcela_comissao` em lancamento_parcelas →
//     quando a parcela vira `pago`, as comissões daquela parcela passam
//     de `prevista` para `liberada` e carimbam `liberada_em`.
// Ou seja: o front NUNCA libera comissão. Liberar é consequência de dinheiro
// que entrou no caixa. O único passo manual é `liberada → paga` (o repasse
// que o financeiro efetivamente fez ao profissional).
// ============================================================================

export { brl };

export type StatusComissao = "prevista" | "liberada" | "paga" | "cancelada";

export const STATUS_COMISSAO_LABEL: Record<StatusComissao, string> = {
  prevista: "Prevista",
  liberada: "Liberada",
  paga: "Paga",
  cancelada: "Cancelada",
};

export const STATUS_COMISSAO_CLASSE: Record<StatusComissao, string> = {
  prevista: "bg-amber-100 text-amber-800 border-0",
  liberada: "bg-sky-100 text-sky-800 border-0",
  paga: "bg-emerald-100 text-emerald-800 border-0",
  cancelada: "bg-gray-100 text-gray-500 border-0",
};

export const STATUS_COMISSAO_AJUDA: Record<StatusComissao, string> = {
  prevista: "O paciente ainda não pagou a parcela. Nada a repassar.",
  liberada: "A parcela foi paga pelo paciente. Pronta para repasse.",
  paga: "Repasse já feito ao profissional.",
  cancelada: "Comissão cancelada — não entra em nenhum repasse.",
};

export type StatusParcela =
  | "pendente" | "pago" | "atrasado" | "cancelado" | "estornado";

export const STATUS_PARCELA_LABEL: Record<string, string> = {
  pendente: "Pendente",
  pago: "Paga",
  atrasado: "Atrasada",
  cancelado: "Cancelada",
  estornado: "Estornada",
};

export interface ParcelaVinculada {
  numero: number;
  valor: number;
  vencimento: string;
  status: string;
  pagoEm: string | null;
}

export interface Comissao {
  id: string;
  profissionalId: string;
  profissional: string;
  procedimento: string | null;
  paciente: string | null;
  orcamentoNumero: number | null;
  dente: number | null;
  baseCalculo: number;
  percentual: number | null;
  valor: number;
  status: StatusComissao;
  criadaEm: string;
  liberadaEm: string | null;
  pagaEm: string | null;
  parcela: ParcelaVinculada | null;
}

export interface GrupoProfissional {
  profissionalId: string;
  profissional: string;
  qtd: number;
  prevista: number;
  liberada: number;
  paga: number;
  total: number;
  itens: Comissao[];
  /** ids que podem virar `paga` agora — alimenta o botão de lote. */
  idsLiberados: string[];
}

export interface Resumo {
  qtd: number;
  prevista: number;
  liberada: number;
  paga: number;
  total: number;
}

export interface FiltrosComissao {
  profissionalId?: string;
  status?: StatusComissao;
  /** yyyy-mm-dd — comparados contra `created_at` (mesma base da view). */
  de?: string;
  ate?: string;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * `liberada_em` / `paga_em` da comissão são `timestamptz`: um INSTANTE. Converter
 * pra data local é o certo — foi naquele dia, pro usuário que está olhando.
 */
export const dataBR = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

/**
 * `vencimento` e `pago_em` da PARCELA são colunas `date` (`YYYY-MM-DD`, sem fuso).
 * `new Date("2026-08-05")` assume UTC e o Brasil (-03) volta um dia: a parcela que
 * vence 05/08 apareceria como 04/08 — erro grave numa tela de dinheiro. Formatar
 * pelos pedaços não passa por fuso nenhum. Mesma solução de services/financeiro.ts.
 */
export const dataDiaBR = (v: string | null) => {
  if (!v) return "—";
  const [ano, mes, dia] = v.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "—";
};

/** Mensagem legível de um erro desconhecido (Supabase, rede ou throw solto). */
export function mensagemErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "Erro inesperado.";
}

/**
 * Formato cru do embed do PostgREST. Declarado à mão porque a inferência do
 * select aninhado em 4 níveis não sobrevive ao generic do supabase-js.
 */
interface LinhaBruta {
  id: string;
  profissional_id: string;
  base_calculo: number | string | null;
  percentual: number | string | null;
  valor: number | string | null;
  status: string | null;
  created_at: string;
  liberada_em: string | null;
  paga_em: string | null;
  profissional: { full_name: string | null } | null;
  procedimento: { nome: string | null } | null;
  item: {
    dente: number | null;
    orcamento: {
      numero: number | null;
      paciente: { nome_completo: string | null } | null;
    } | null;
  } | null;
  parcela: {
    numero: number | null;
    valor: number | string | null;
    vencimento: string;
    status: string | null;
    pago_em: string | null;
  } | null;
}

/** Fim do dia informado, em ISO — o `ate` do usuário é inclusivo. */
function fimDoDiaISO(data: string) {
  const d = new Date(`${data}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** Primeiro instante do dia informado, em ISO local. */
function inicioDoDiaISO(data: string) {
  return new Date(`${data}T00:00:00`).toISOString();
}

// ------------------------------------------------------------------ leitura

/**
 * Comissões da clínica com o contexto que o financeiro precisa pra decidir:
 * quem, de qual procedimento, de qual paciente e presa a qual parcela.
 */
export async function listarComissoes(
  clinicaId: string,
  filtros: FiltrosComissao = {},
): Promise<Comissao[]> {
  let q = supabase
    .from("comissoes")
    .select(`
      id, profissional_id, base_calculo, percentual, valor, status,
      created_at, liberada_em, paga_em,
      profissional:profiles!comissoes_profissional_id_fkey ( full_name ),
      procedimento:procedimentos ( nome ),
      item:orcamento_itens ( dente, orcamento:orcamentos ( numero, paciente:pacientes ( nome_completo ) ) ),
      parcela:lancamento_parcelas ( numero, valor, vencimento, status, pago_em )
    `)
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false });

  if (filtros.profissionalId) q = q.eq("profissional_id", filtros.profissionalId);
  if (filtros.status) q = q.eq("status", filtros.status);
  if (filtros.de) q = q.gte("created_at", inicioDoDiaISO(filtros.de));
  if (filtros.ate) q = q.lt("created_at", fimDoDiaISO(filtros.ate));

  const { data, error } = await q;
  if (error) throw error;

  const linhas = (data ?? []) as unknown as LinhaBruta[];

  return linhas.map<Comissao>((l) => ({
    id: l.id,
    profissionalId: l.profissional_id,
    profissional: l.profissional?.full_name ?? "Profissional sem nome",
    procedimento: l.procedimento?.nome ?? null,
    paciente: l.item?.orcamento?.paciente?.nome_completo ?? null,
    orcamentoNumero: l.item?.orcamento?.numero ?? null,
    dente: l.item?.dente ?? null,
    baseCalculo: num(l.base_calculo),
    percentual: l.percentual != null ? num(l.percentual) : null,
    valor: num(l.valor),
    status: (l.status ?? "prevista") as StatusComissao,
    criadaEm: l.created_at,
    liberadaEm: l.liberada_em ?? null,
    pagaEm: l.paga_em ?? null,
    parcela: l.parcela
      ? {
          numero: num(l.parcela.numero),
          valor: num(l.parcela.valor),
          vencimento: l.parcela.vencimento,
          status: l.parcela.status ?? "pendente",
          pagoEm: l.parcela.pago_em ?? null,
        }
      : null,
  }));
}

/**
 * Total consolidado do mês corrente pela view `vw_comissoes_profissional`
 * (agrupada por `date_trunc('month', created_at)`). É deliberadamente
 * independente dos filtros da tela: é o "quanto o mês inteiro gerou".
 */
export async function totalDoMes(clinicaId: string, referencia = new Date()): Promise<Resumo> {
  // A view bucketiza com `date_trunc('month', created_at)` na timezone da SESSÃO
  // do Postgres — que no Supabase é UTC. Recortar a janela com
  // `new Date(ano, mes, 1)` a monta em horário LOCAL: em BRT (-03) o início vira
  // `01/08 03:00Z`, MAIOR que o bucket `01/08 00:00Z`. Resultado: o `gte` jogava o
  // mês corrente inteiro fora (KPI eternamente R$ 0,00) enquanto o `lt`
  // (`01/09 03:00Z`) ainda deixava entrar o bucket do mês SEGUINTE.
  // Mesma doutrina de `chaveMes()` em services/relatorios.ts: bucket de mês é UTC.
  const inicio = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1));
  const proximo = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1));

  const { data, error } = await supabase
    .from("vw_comissoes_profissional")
    .select("qtd, total, prevista, liberada, paga")
    .eq("clinica_id", clinicaId)
    .gte("mes", inicio.toISOString())
    .lt("mes", proximo.toISOString());

  if (error) throw error;

  return (data ?? []).reduce<Resumo>(
    (acc, l) => ({
      qtd: acc.qtd + num(l.qtd),
      prevista: acc.prevista + num(l.prevista),
      liberada: acc.liberada + num(l.liberada),
      paga: acc.paga + num(l.paga),
      total: acc.total + num(l.total),
    }),
    { qtd: 0, prevista: 0, liberada: 0, paga: 0, total: 0 },
  );
}

/** Profissionais que já têm alguma comissão — só eles fazem sentido no filtro. */
export async function listarProfissionaisComComissao(
  clinicaId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from("vw_comissoes_profissional")
    .select("profissional_id, profissional")
    .eq("clinica_id", clinicaId);

  if (error) throw error;

  const mapa = new Map<string, string>();
  for (const l of data ?? []) {
    if (l.profissional_id) mapa.set(l.profissional_id, l.profissional ?? "Profissional sem nome");
  }
  return [...mapa].map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// ------------------------------------------------------------------ cálculo

export function agruparPorProfissional(lista: Comissao[]): GrupoProfissional[] {
  const mapa = new Map<string, GrupoProfissional>();

  for (const c of lista) {
    let g = mapa.get(c.profissionalId);
    if (!g) {
      g = {
        profissionalId: c.profissionalId,
        profissional: c.profissional,
        qtd: 0, prevista: 0, liberada: 0, paga: 0, total: 0,
        itens: [], idsLiberados: [],
      };
      mapa.set(c.profissionalId, g);
    }
    g.qtd += 1;
    g.itens.push(c);
    // Cancelada não soma no total: não é dinheiro de ninguém.
    if (c.status !== "cancelada") g.total += c.valor;
    if (c.status === "prevista") g.prevista += c.valor;
    if (c.status === "liberada") { g.liberada += c.valor; g.idsLiberados.push(c.id); }
    if (c.status === "paga") g.paga += c.valor;
  }

  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

export function resumir(lista: Comissao[]): Resumo {
  return lista.reduce<Resumo>(
    (acc, c) => ({
      qtd: acc.qtd + 1,
      prevista: acc.prevista + (c.status === "prevista" ? c.valor : 0),
      liberada: acc.liberada + (c.status === "liberada" ? c.valor : 0),
      paga: acc.paga + (c.status === "paga" ? c.valor : 0),
      total: acc.total + (c.status === "cancelada" ? 0 : c.valor),
    }),
    { qtd: 0, prevista: 0, liberada: 0, paga: 0, total: 0 },
  );
}

// ------------------------------------------------------------------ escrita

/**
 * Registra o repasse: `liberada → paga`, carimbando `paga_em`.
 * O `.eq("status","liberada")` não é redundância defensiva — é a trava que
 * impede pagar comissão de parcela que o paciente ainda não quitou, mesmo
 * que a tela esteja com dado velho na mão.
 * Retorna quantas linhas realmente mudaram.
 */
export async function marcarComoPaga(clinicaId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const { data, error } = await supabase
    .from("comissoes")
    .update({ status: "paga", paga_em: new Date().toISOString() })
    .eq("clinica_id", clinicaId)
    .eq("status", "liberada")
    .in("id", ids)
    .select("id");

  if (error) throw error;
  return (data ?? []).length;
}
