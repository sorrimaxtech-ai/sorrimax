import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/services/orcamentos";
import { linkWhatsApp } from "@/services/pacientes";

// ============================================================================
// Serviço de Relatórios — leitura pura sobre as views do banco
// ----------------------------------------------------------------------------
// Nenhum número desta camada é calculado "de novo" no front quando a view já
// responde. O que o front FAZ é agregar linhas da view (que vêm quebradas por
// mês / origem / profissional / cadeira) em totais de período.
//
// ⚠️ Regra que vale pra tudo aqui: percentual NUNCA é média de percentual.
// A view devolve `taxa_aprovacao_pct` por linha (mês+origem); somar essas
// linhas e tirar média daria peso igual a um mês de R$ 500 e a um de R$ 80 mil.
// Toda taxa consolidada é recalculada a partir das SOMAS de valor.
// ============================================================================

export { brl, linkWhatsApp };

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * PostgREST corta a resposta no `max-rows` do projeto (1000 por padrão no
 * Supabase) SEM avisar — não vem erro, vem menos linha. Num relatório isso é
 * pior que falhar: o faturamento aparece menor do que é e ninguém desconfia.
 * Por isso toda leitura deste serviço passa por aqui e busca em páginas até o
 * lote vir incompleto.
 */
const PAGINA = 1000;
const TETO_LINHAS = 100_000;

async function buscarTudo<T>(
  monta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; de < TETO_LINHAS; de += PAGINA) {
    const { data, error } = await monta(de, de + PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    tudo.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return tudo;
}

/** Mensagem legível de um erro desconhecido (Supabase, rede ou throw solto). */
export function mensagemErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "Erro inesperado.";
}

// ------------------------------------------------------------------- período

export type PeriodoChave = "3m" | "6m" | "12m" | "ano";

export const PERIODO_LABEL: Record<PeriodoChave, string> = {
  "3m": "Últimos 3 meses",
  "6m": "Últimos 6 meses",
  "12m": "Últimos 12 meses",
  ano: "Este ano",
};

export interface Intervalo {
  /** ISO do primeiro instante do primeiro mês (inclusivo). */
  inicio: string;
  /** ISO do primeiro instante do mês seguinte ao último (exclusivo). */
  fim: string;
}

/**
 * As views agrupam por `date_trunc('month', ...)` na sessão do Postgres, que no
 * Supabase é UTC — então o rótulo do mês de agosto é literalmente
 * `2026-08-01T00:00:00Z`.
 *
 * ⚠️ Por isso o recorte é montado em UTC, e não em horário local. Montado com
 * `new Date(ano, mes, 1)` em BRT (UTC-3), o primeiro instante de agosto vira
 * `2026-08-01T03:00:00Z` — e um `.gte("mes", ...)` com esse valor DESCARTA o
 * bucket de agosto inteiro, porque `00:00Z < 03:00Z`. O efeito era silencioso:
 * "últimos 3 meses" devolvia 2 meses, "últimos 12" devolvia 11, sempre comendo
 * o mês mais antigo do período.
 */
export function intervaloDoPeriodo(p: PeriodoChave, hoje = new Date()): Intervalo {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const proximoMes = new Date(Date.UTC(ano, mes + 1, 1));
  if (p === "ano") {
    return {
      inicio: new Date(Date.UTC(ano, 0, 1)).toISOString(),
      fim: proximoMes.toISOString(),
    };
  }
  const meses = p === "3m" ? 3 : p === "6m" ? 6 : 12;
  return {
    inicio: new Date(Date.UTC(ano, mes - (meses - 1), 1)).toISOString(),
    fim: proximoMes.toISOString(),
  };
}

/**
 * Recorte seguro para as views agregadas por mês: empurra o `inicio` para o
 * primeiro instante (UTC) do mês em que ele cai.
 *
 * Sem isso, um período personalizado de 01/03 a 31/03 escolhido em BRT vira
 * `2026-03-01T03:00:00Z` e não casa com o bucket `2026-03-01T00:00:00Z` — o
 * usuário selecionaria um mês inteiro e veria a agenda zerada. O preço é que um
 * recorte de meio mês traz o mês inteiro nos blocos agregados; a tela avisa
 * quando isso acontece (ver `recorteParcialDeMes`).
 */
export function janelaDeMeses({ inicio, fim }: Intervalo): Intervalo {
  const d = new Date(inicio);
  if (Number.isNaN(d.getTime())) return { inicio, fim };
  return {
    inicio: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(),
    fim,
  };
}

/** True quando o recorte não começa em virada de mês (UTC) — usado só para avisar o usuário. */
export function recorteParcialDeMes({ inicio }: Intervalo): boolean {
  const d = new Date(inicio);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() !== Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Chave canônica de mês (`2026-08`), sempre em UTC.
 *
 * As views usam `date_trunc('month', ...)` na timezone da sessão do Postgres
 * (UTC). Se o front bucketizasse consultas pelo mês LOCAL, uma consulta de
 * 31/07 21h em BRT cairia em julho aqui e em agosto na view — e as duas séries
 * nunca casariam ao serem unidas. Por isso todo bucket de mês passa por aqui.
 */
export function chaveMes(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 7);
  return d.toISOString().slice(0, 7);
}

/** `2026-08` (ou ISO completo) → `ago/26`. Eixo de gráfico não comporta "agosto de 2026". */
export function rotuloMes(chave: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(chave ?? "");
  if (!m) return "—";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const mes = d
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return `${mes}/${m[1].slice(2)}`;
}

export const dataBR = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

export const pct = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Divisão que devolve null (não 0) quando não há base — 0% e "sem base" são coisas diferentes. */
function taxa(parte: number, total: number): number | null {
  if (!total) return null;
  return Math.round((100 * parte) / total * 100) / 100;
}

// ----------------------------------------------------------- KPIs de dinheiro

export interface KpisDinheiro {
  debitosEmAtraso: number;
  orcamentosNaoFechados: number;
  aniversariantes30d: number;
  aReceberMes: number;
  recebidoMes: number;
}

/**
 * `vw_dashboard_kpis` tem uma linha por clínica. `maybeSingle` porque clínica
 * recém-criada, sem nenhum movimento, simplesmente não aparece na view.
 */
export async function carregarKpis(clinicaId: string): Promise<KpisDinheiro | null> {
  const { data, error } = await supabase
    .from("vw_dashboard_kpis")
    .select("debitos_em_atraso, orcamentos_nao_fechados, aniversariantes_30d, a_receber_mes, recebido_mes")
    .eq("clinica_id", clinicaId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    debitosEmAtraso: num(data.debitos_em_atraso),
    orcamentosNaoFechados: num(data.orcamentos_nao_fechados),
    aniversariantes30d: num(data.aniversariantes_30d),
    aReceberMes: num(data.a_receber_mes),
    recebidoMes: num(data.recebido_mes),
  };
}

// ------------------------------------------------- faturamento por procedimento

export interface FaturamentoProcedimento {
  procedimentoId: string | null;
  procedimento: string;
  especialidade: string | null;
  qtd: number;
  valorAprovado: number;
  /** Recalculado da soma (valor/qtd), não a média dos `ticket_medio` mensais. */
  ticketMedio: number;
}

export async function faturamentoPorProcedimento(
  clinicaId: string,
  intervalo: Intervalo,
): Promise<FaturamentoProcedimento[]> {
  const janela = janelaDeMeses(intervalo);
  const data = await buscarTudo((de, ate) =>
    supabase
      .from("vw_faturamento_procedimento")
      .select("procedimento_id, procedimento, especialidade, qtd, valor_aprovado, mes")
      .eq("clinica_id", clinicaId)
      .gte("mes", janela.inicio)
      .lt("mes", janela.fim)
      .range(de, ate),
  );

  const mapa = new Map<string, FaturamentoProcedimento>();
  for (const l of data) {
    const chave = l.procedimento_id ?? l.procedimento ?? "—";
    let item = mapa.get(chave);
    if (!item) {
      item = {
        procedimentoId: l.procedimento_id,
        procedimento: l.procedimento ?? "Sem procedimento",
        especialidade: l.especialidade,
        qtd: 0,
        valorAprovado: 0,
        ticketMedio: 0,
      };
      mapa.set(chave, item);
    }
    item.qtd += num(l.qtd);
    item.valorAprovado += num(l.valor_aprovado);
  }

  return [...mapa.values()]
    .map((i) => ({ ...i, ticketMedio: i.qtd ? i.valorAprovado / i.qtd : 0 }))
    .sort((a, b) => b.valorAprovado - a.valorAprovado);
}

// ------------------------------------------------------------------ ocupação

export interface OcupacaoMes {
  mes: string;
  rotulo: string;
  totalConsultas: number;
  concluidas: number;
  noShow: number;
  canceladas: number;
  horasAgendadas: number;
  /** Recalculada da soma: no_show / total do mês inteiro. */
  taxaNoShowPct: number | null;
}

export interface FiltroOcupacao {
  profissionalId?: string;
}

/**
 * A view quebra por profissional E por cadeira — uma consulta em cadeira nula
 * vira linha própria. Consolidar por mês é obrigatório antes de plotar.
 */
export async function ocupacaoPorMes(
  clinicaId: string,
  intervalo: Intervalo,
  filtro: FiltroOcupacao = {},
): Promise<OcupacaoMes[]> {
  const janela = janelaDeMeses(intervalo);
  const data = await buscarTudo((de, ate) => {
    const q = supabase
      .from("vw_ocupacao_agenda")
      .select("mes, total_consultas, concluidas, no_show, canceladas, horas_agendadas")
      .eq("clinica_id", clinicaId)
      .gte("mes", janela.inicio)
      .lt("mes", janela.fim);
    return (filtro.profissionalId ? q.eq("profissional_id", filtro.profissionalId) : q).range(de, ate);
  });

  const mapa = new Map<string, OcupacaoMes>();
  for (const l of data) {
    const mes = chaveMes(l.mes);
    if (!mes) continue;
    let item = mapa.get(mes);
    if (!item) {
      item = {
        mes,
        rotulo: rotuloMes(mes),
        totalConsultas: 0, concluidas: 0, noShow: 0, canceladas: 0,
        horasAgendadas: 0, taxaNoShowPct: null,
      };
      mapa.set(mes, item);
    }
    item.totalConsultas += num(l.total_consultas);
    item.concluidas += num(l.concluidas);
    item.noShow += num(l.no_show);
    item.canceladas += num(l.canceladas);
    item.horasAgendadas += num(l.horas_agendadas);
  }

  return [...mapa.values()]
    .map((m) => ({ ...m, taxaNoShowPct: taxa(m.noShow, m.totalConsultas) }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

export interface TotaisOcupacao {
  totalConsultas: number;
  concluidas: number;
  noShow: number;
  canceladas: number;
  horasAgendadas: number;
  taxaNoShowPct: number | null;
}

export function totalizarOcupacao(meses: OcupacaoMes[]): TotaisOcupacao {
  const t = meses.reduce(
    (acc, m) => ({
      totalConsultas: acc.totalConsultas + m.totalConsultas,
      concluidas: acc.concluidas + m.concluidas,
      noShow: acc.noShow + m.noShow,
      canceladas: acc.canceladas + m.canceladas,
      horasAgendadas: acc.horasAgendadas + m.horasAgendadas,
    }),
    { totalConsultas: 0, concluidas: 0, noShow: 0, canceladas: 0, horasAgendadas: 0 },
  );
  return { ...t, taxaNoShowPct: taxa(t.noShow, t.totalConsultas) };
}

// ---------------------------------------------------------- pacientes inativos

export interface PacienteInativo {
  pacienteId: string | null;
  nome: string;
  celular: string | null;
  ultimaConsulta: string | null;
  diasSemVir: number | null;
  valorEmAberto: number;
  temTratamentoPendente: boolean;
}

/**
 * A view já aplica o corte de 6 meses e inclui quem NUNCA veio
 * (`ultima_consulta` nula) — esse caso vem com `dias_sem_vir` nulo.
 */
export async function listarPacientesInativos(clinicaId: string): Promise<PacienteInativo[]> {
  const data = await buscarTudo((de, ate) =>
    supabase
      .from("vw_pacientes_inativos")
      .select("paciente_id, nome_completo, celular, ultima_consulta, dias_sem_vir, valor_em_aberto, tem_tratamento_pendente")
      .eq("clinica_id", clinicaId)
      .range(de, ate),
  );

  return data
    .map<PacienteInativo>((l) => ({
      pacienteId: l.paciente_id,
      nome: l.nome_completo ?? "Paciente sem nome",
      celular: l.celular,
      ultimaConsulta: l.ultima_consulta,
      diasSemVir: l.dias_sem_vir,
      valorEmAberto: num(l.valor_em_aberto),
      temTratamentoPendente: Boolean(l.tem_tratamento_pendente),
    }))
    // Prioridade de retomada: primeiro quem tem dinheiro em aberto, depois quem
    // sumiu há mais tempo. Sem isso a lista sai em ordem de banco, inútil.
    .sort((a, b) =>
      b.valorEmAberto - a.valorEmAberto || (b.diasSemVir ?? 0) - (a.diasSemVir ?? 0),
    );
}

// --------------------------------------------------------------------- funil

export interface FunilLinha {
  mes: string;
  origem: string;
  pacientes: number;
  vindosDoCrm: number;
  comOrcamento: number;
  comOrcamentoAprovado: number;
  comTratamentoConcluido: number;
  valorOrcado: number;
  valorAprovado: number;
  valorRecebido: number;
  taxaAprovacaoPct: number | null;
  taxaRecebimentoPct: number | null;
}

export interface FunilResumo {
  pacientes: number;
  vindosDoCrm: number;
  comOrcamento: number;
  comOrcamentoAprovado: number;
  comTratamentoConcluido: number;
  valorOrcado: number;
  valorAprovado: number;
  valorRecebido: number;
  taxaAprovacaoPct: number | null;
  taxaRecebimentoPct: number | null;
  /** % dos pacientes do período que chegaram por um lead do CRM. */
  taxaOrigemCrmPct: number | null;
  /** Quanto de cada R$ 100 orçados virou dinheiro no caixa (aprovação × recebimento). */
  taxaOrcadoParaCaixaPct: number | null;
}

export interface Funil {
  linhas: FunilLinha[];
  resumo: FunilResumo;
  /** Mesmo funil, quebrado por origem — mostra qual canal traz dinheiro, não só volume. */
  porOrigem: (FunilResumo & { origem: string })[];
}

export async function carregarFunil(clinicaId: string, intervalo: Intervalo): Promise<Funil> {
  const janela = janelaDeMeses(intervalo);
  const data = await buscarTudo((de, ate) =>
    supabase
      .from("vw_funil_completo")
      .select(`mes, origem, pacientes, vindos_do_crm, com_orcamento, com_orcamento_aprovado,
             com_tratamento_concluido, valor_orcado, valor_aprovado, valor_recebido,
             taxa_aprovacao_pct, taxa_recebimento_pct`)
      .eq("clinica_id", clinicaId)
      .gte("mes", janela.inicio)
      .lt("mes", janela.fim)
      .range(de, ate),
  );

  const linhas = data.map<FunilLinha>((l) => ({
    mes: chaveMes(l.mes),
    origem: l.origem ?? "Não informada",
    pacientes: num(l.pacientes),
    vindosDoCrm: num(l.vindos_do_crm),
    comOrcamento: num(l.com_orcamento),
    comOrcamentoAprovado: num(l.com_orcamento_aprovado),
    comTratamentoConcluido: num(l.com_tratamento_concluido),
    valorOrcado: num(l.valor_orcado),
    valorAprovado: num(l.valor_aprovado),
    valorRecebido: num(l.valor_recebido),
    taxaAprovacaoPct: l.taxa_aprovacao_pct == null ? null : num(l.taxa_aprovacao_pct),
    taxaRecebimentoPct: l.taxa_recebimento_pct == null ? null : num(l.taxa_recebimento_pct),
  }));

  const agrupar = (grupo: FunilLinha[]): FunilResumo => {
    const s = grupo.reduce(
      (acc, l) => ({
        pacientes: acc.pacientes + l.pacientes,
        vindosDoCrm: acc.vindosDoCrm + l.vindosDoCrm,
        comOrcamento: acc.comOrcamento + l.comOrcamento,
        comOrcamentoAprovado: acc.comOrcamentoAprovado + l.comOrcamentoAprovado,
        comTratamentoConcluido: acc.comTratamentoConcluido + l.comTratamentoConcluido,
        valorOrcado: acc.valorOrcado + l.valorOrcado,
        valorAprovado: acc.valorAprovado + l.valorAprovado,
        valorRecebido: acc.valorRecebido + l.valorRecebido,
      }),
      {
        pacientes: 0, vindosDoCrm: 0, comOrcamento: 0, comOrcamentoAprovado: 0,
        comTratamentoConcluido: 0, valorOrcado: 0, valorAprovado: 0, valorRecebido: 0,
      },
    );
    return {
      ...s,
      taxaAprovacaoPct: taxa(s.valorAprovado, s.valorOrcado),
      taxaRecebimentoPct: taxa(s.valorRecebido, s.valorAprovado),
      taxaOrigemCrmPct: taxa(s.vindosDoCrm, s.pacientes),
      taxaOrcadoParaCaixaPct: taxa(s.valorRecebido, s.valorOrcado),
    };
  };

  const porOrigemMapa = new Map<string, FunilLinha[]>();
  for (const l of linhas) {
    const atual = porOrigemMapa.get(l.origem);
    if (atual) atual.push(l);
    else porOrigemMapa.set(l.origem, [l]);
  }

  return {
    linhas: linhas.sort((a, b) => a.mes.localeCompare(b.mes)),
    resumo: agrupar(linhas),
    porOrigem: [...porOrigemMapa.entries()]
      .map(([origem, grupo]) => ({ origem, ...agrupar(grupo) }))
      .sort((a, b) => b.valorRecebido - a.valorRecebido || b.pacientes - a.pacientes),
  };
}

// -------------------------------------------------------------- profissionais

export interface ProfissionalOpcao {
  id: string;
  nome: string;
  especialidade: string | null;
}

export async function listarProfissionais(clinicaId: string): Promise<ProfissionalOpcao[]> {
  const data = await buscarTudo((de, ate) =>
    supabase
      .from("profiles")
      .select("id, full_name, especialidade, role")
      .eq("clinica_id", clinicaId)
      .order("full_name")
      .range(de, ate),
  );

  return data
    // Recepção não atende — deixar na lista só geraria relatório sempre zerado.
    .filter((p) => p.role !== "receptionist")
    .map((p) => ({
      id: p.id,
      nome: p.full_name ?? "Profissional sem nome",
      especialidade: p.especialidade ?? null,
    }));
}

export interface ComissaoPeriodo {
  qtd: number;
  total: number;
  prevista: number;
  liberada: number;
  paga: number;
}

export interface FaturamentoMes {
  mes: string;
  valor: number;
}

export interface DesempenhoProfissional {
  meses: OcupacaoMes[];
  totais: TotaisOcupacao;
  comissao: ComissaoPeriodo;
  /** Soma de `consultas.total` das consultas CONCLUÍDAS — trabalho entregue, não agendado. */
  faturamento: number;
  faturamentoPorMes: FaturamentoMes[];
}

const COMISSAO_ZERO: ComissaoPeriodo = { qtd: 0, total: 0, prevista: 0, liberada: 0, paga: 0 };

async function comissaoDoProfissional(
  clinicaId: string,
  profissionalId: string,
  intervalo: Intervalo,
): Promise<ComissaoPeriodo> {
  const janela = janelaDeMeses(intervalo);
  const data = await buscarTudo((de, ate) =>
    supabase
      .from("vw_comissoes_profissional")
      .select("qtd, total, prevista, liberada, paga")
      .eq("clinica_id", clinicaId)
      .eq("profissional_id", profissionalId)
      .gte("mes", janela.inicio)
      .lt("mes", janela.fim)
      .range(de, ate),
  );

  return data.reduce<ComissaoPeriodo>(
    (acc, l) => ({
      qtd: acc.qtd + num(l.qtd),
      total: acc.total + num(l.total),
      prevista: acc.prevista + num(l.prevista),
      liberada: acc.liberada + num(l.liberada),
      paga: acc.paga + num(l.paga),
    }),
    { ...COMISSAO_ZERO },
  );
}

/**
 * Faturamento do profissional. Não existe view pra isso, então vem da fonte:
 * consultas concluídas no período. `total` é o valor já com desconto; quando
 * está nulo (consulta antiga, antes do campo existir) cai em `valor - desconto`.
 */
async function faturamentoDoProfissional(
  clinicaId: string,
  profissionalId: string,
  intervalo: Intervalo,
): Promise<{ total: number; porMes: FaturamentoMes[] }> {
  // Mesma janela usada na view de ocupação. Se o faturamento usasse o recorte
  // exato em dias e a ocupação viesse do bucket mensal inteiro, a linha de março
  // mostraria a agenda cheia contra uma receita de 10 dias — números que não se
  // explicam lado a lado.
  const janela = janelaDeMeses(intervalo);
  const data = await buscarTudo((de, ate) =>
    supabase
      .from("consultas")
      .select("inicio, valor, desconto, total")
      .eq("clinica_id", clinicaId)
      .eq("profissional_id", profissionalId)
      .eq("status", "concluido")
      .gte("inicio", janela.inicio)
      .lt("inicio", janela.fim)
      .range(de, ate),
  );

  const porMes = new Map<string, number>();
  let total = 0;

  for (const c of data) {
    const valor = c.total != null ? num(c.total) : Math.max(0, num(c.valor) - num(c.desconto));
    total += valor;
    const chave = chaveMes(c.inicio);
    if (!chave) continue;
    porMes.set(chave, (porMes.get(chave) ?? 0) + valor);
  }

  return {
    total,
    porMes: [...porMes.entries()]
      .map(([mes, valor]) => ({ mes, valor }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

export async function carregarDesempenhoProfissional(
  clinicaId: string,
  profissionalId: string,
  intervalo: Intervalo,
): Promise<DesempenhoProfissional> {
  const [meses, comissao, faturamento] = await Promise.all([
    ocupacaoPorMes(clinicaId, intervalo, { profissionalId }),
    comissaoDoProfissional(clinicaId, profissionalId, intervalo),
    faturamentoDoProfissional(clinicaId, profissionalId, intervalo),
  ]);

  return {
    meses,
    totais: totalizarOcupacao(meses),
    comissao,
    faturamento: faturamento.total,
    faturamentoPorMes: faturamento.porMes,
  };
}

/**
 * Une agenda e dinheiro numa linha por mês. Os dois lados podem ter meses que o
 * outro não tem (mês só com no-show fatura zero; mês só com consulta antiga sem
 * ocupação), então a união é feita pela chave de mês, não por índice.
 */
export interface LinhaMesProfissional {
  mes: string;
  rotulo: string;
  totalConsultas: number;
  concluidas: number;
  noShow: number;
  taxaNoShowPct: number | null;
  horasAgendadas: number;
  faturamento: number;
}

export function unirMesesProfissional(d: DesempenhoProfissional): LinhaMesProfissional[] {
  const fat = new Map(d.faturamentoPorMes.map((f) => [f.mes, f.valor]));
  const chaves = new Set<string>([...d.meses.map((m) => m.mes), ...fat.keys()]);

  return [...chaves]
    .sort()
    .map((mes) => {
      const o = d.meses.find((m) => m.mes === mes);
      return {
        mes,
        rotulo: rotuloMes(mes),
        totalConsultas: o?.totalConsultas ?? 0,
        concluidas: o?.concluidas ?? 0,
        noShow: o?.noShow ?? 0,
        taxaNoShowPct: o?.taxaNoShowPct ?? null,
        horasAgendadas: o?.horasAgendadas ?? 0,
        faturamento: fat.get(mes) ?? 0,
      };
    });
}
