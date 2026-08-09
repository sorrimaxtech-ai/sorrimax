import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// ============================================================================
// Serviço Financeiro — compartilhado por Contas a Receber e Contas a Pagar
// ----------------------------------------------------------------------------
// O modelo do banco separa INTENÇÃO de CAIXA:
//   lancamentos          → o compromisso (uma venda, um aluguel, um fornecedor)
//   lancamento_parcelas  → cada evento de caixa daquele compromisso
// Quem move dinheiro é SEMPRE a parcela. Nenhuma tela deve tratar o lançamento
// como "pago"; o lançamento só está quitado quando todas as parcelas estão.
//
// Duas regras do servidor que a UI precisa respeitar (e não duplicar):
//   1. `valor_liquido` é COLUNA GERADA (valor_pago - taxa_valor). Escrever nela
//      dá erro 428C9 no Postgres. Só leitura.
//   2. Marcar parcela como paga dispara trigger que LIBERA a comissão vinculada
//      (comissoes.status: prevista → liberada). Por isso "desfazer pagamento" é
//      uma operação sensível, não um simples undo de UI.
// ============================================================================

export type TipoLancamento = Database["public"]["Enums"]["tipo_lancamento"];
export type StatusParcela = Database["public"]["Enums"]["status_parcela"];
export type FormaPagamento = Database["public"]["Enums"]["forma_pagamento"];
export type TipoContaFinanceira = Database["public"]["Enums"]["tipo_conta_financeira"];

export interface ContaFinanceira {
  id: string;
  nome: string;
  tipo: TipoContaFinanceira;
  banco: string | null;
  saldo_inicial: number;
  principal: boolean;
  ativo: boolean;
}

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: TipoLancamento;
  cor: string | null;
  ativo: boolean;
}

export interface TaxaCartao {
  id: string;
  adquirente: string;
  bandeira: string | null;
  parcelas_de: number;
  parcelas_ate: number;
  percentual: number;
  valor_fixo: number;
  prazo_dias: number;
  ativo: boolean;
}

/** Parcela + o pedaço do lançamento pai que a tela precisa mostrar. */
export interface ParcelaComLancamento {
  id: string;
  clinica_id: string;
  lancamento_id: string;
  numero: number;
  valor: number;
  vencimento: string;
  status: StatusParcela;
  pago_em: string | null;
  valor_pago: number | null;
  taxa_valor: number;
  valor_liquido: number | null;
  previsao_credito: string | null;
  forma_pagamento: FormaPagamento | null;
  conta_id: string | null;
  contas_financeiras: { id: string; nome: string } | null;
  lancamentos: {
    id: string;
    tipo: TipoLancamento;
    descricao: string;
    qtd_parcelas: number;
    valor_total: number;
    forma_pagamento: FormaPagamento | null;
    paciente_id: string | null;
    orcamento_id: string | null;
    observacoes: string | null;
    pacientes: { id: string; nome_completo: string } | null;
    categorias_financeiras: { id: string; nome: string; cor: string | null } | null;
  } | null;
}

// ------------------------------------------------------------------ rótulos

export const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

/** Data vinda do Postgres é `YYYY-MM-DD` (sem fuso). `new Date()` nela assume
 *  UTC e o Brasil (-03) volta um dia. Formatar pelos pedaços evita o off-by-one. */
export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
};

export const STATUS_PARCELA_LABEL: Record<StatusParcela, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Em atraso",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

export const STATUS_PARCELA_CLASSE: Record<StatusParcela, string> = {
  pendente: "bg-amber-100 text-amber-800 border-0",
  pago: "bg-emerald-100 text-emerald-800 border-0",
  atrasado: "bg-red-100 text-red-800 border-0",
  cancelado: "bg-gray-100 text-gray-500 border-0",
  estornado: "bg-gray-100 text-gray-500 border-0",
};

export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  cheque: "Cheque",
  convenio: "Convênio",
  financiamento: "Financiamento",
  cortesia: "Cortesia",
};

export const FORMAS_PAGAMENTO = Object.keys(FORMA_PAGAMENTO_LABEL) as FormaPagamento[];

export const TIPO_CONTA_LABEL: Record<TipoContaFinanceira, string> = {
  caixa: "Caixa",
  banco: "Banco",
  carteira_digital: "Carteira digital",
};

/** Só cartão tem taxa de adquirente — usado pra decidir se pergunta a taxa. */
export const ehCartao = (f: FormaPagamento | null | undefined) =>
  f === "credito" || f === "debito";

/** `pendente` vencida ainda aparece como `pendente` no banco até o job diário
 *  rodar. A tela não pode esperar por isso: deriva o atraso na hora. */
export function statusEfetivo(p: {
  status: StatusParcela;
  vencimento: string;
}): StatusParcela {
  if (p.status !== "pendente") return p.status;
  return p.vencimento.slice(0, 10) < hojeISO() ? "atrasado" : "pendente";
}

// ------------------------------------------------------------------- datas

export const hojeISO = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** Primeiro e último dia do mês corrente, em `YYYY-MM-DD`. */
export function mesCorrente(): { de: string; ate: string } {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = d.getMonth();
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { de: fmt(new Date(ano, mes, 1)), ate: fmt(new Date(ano, mes + 1, 0)) };
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const base = new Date(a, m - 1, d);
  base.setDate(base.getDate() + dias);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const base = new Date(a, m - 1 + meses, 1);
  // dia 31 em mês de 30 → gruda no último dia, em vez de vazar pro mês seguinte
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(d, ultimo));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

// --------------------------------------------------------------- cadastros

export async function listarContasFinanceiras(clinicaId: string): Promise<ContaFinanceira[]> {
  const { data, error } = await supabase
    .from("contas_financeiras")
    .select("id, nome, tipo, banco, saldo_inicial, principal, ativo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("principal", { ascending: false })
    .order("nome");
  if (error) throw error;
  return (data ?? []) as ContaFinanceira[];
}

export async function listarCategorias(
  clinicaId: string,
  tipo?: TipoLancamento,
): Promise<CategoriaFinanceira[]> {
  let q = supabase
    .from("categorias_financeiras")
    .select("id, nome, tipo, cor, ativo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome");
  if (tipo) q = q.eq("tipo", tipo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CategoriaFinanceira[];
}

export async function listarTaxasCartao(clinicaId: string): Promise<TaxaCartao[]> {
  const { data, error } = await supabase
    .from("taxas_cartao")
    .select("id, adquirente, bandeira, parcelas_de, parcelas_ate, percentual, valor_fixo, prazo_dias, ativo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("adquirente")
    .order("parcelas_de");
  if (error) throw error;
  return (data ?? []) as TaxaCartao[];
}

/** Faixa de taxa que cobre `parcelas` para o adquirente escolhido. */
export function acharTaxa(
  taxas: TaxaCartao[],
  adquirente: string,
  parcelas: number,
): TaxaCartao | null {
  return (
    taxas.find(
      (t) =>
        t.adquirente === adquirente &&
        parcelas >= t.parcelas_de &&
        parcelas <= t.parcelas_ate,
    ) ?? null
  );
}

/** Quanto a adquirente retém: percentual sobre o bruto + tarifa fixa. */
export function calcularTaxa(taxa: TaxaCartao | null, valorBruto: number): number {
  if (!taxa) return 0;
  const bruto = Number(valorBruto) || 0;
  return Math.round((bruto * Number(taxa.percentual) / 100 + Number(taxa.valor_fixo)) * 100) / 100;
}

// ---------------------------------------------------------------- consultas

export interface FiltroParcelas {
  tipo: TipoLancamento;
  de?: string | null;
  ate?: string | null;
  status?: StatusParcela | null;
  contaId?: string | null;
  forma?: FormaPagamento | null;
  pacienteId?: string | null;
}

const SELECT_PARCELA = `
  id, clinica_id, lancamento_id, numero, valor, vencimento, status, pago_em,
  valor_pago, taxa_valor, valor_liquido, previsao_credito, forma_pagamento, conta_id,
  contas_financeiras ( id, nome ),
  lancamentos!inner (
    id, tipo, descricao, qtd_parcelas, valor_total, forma_pagamento,
    paciente_id, orcamento_id, observacoes,
    pacientes ( id, nome_completo ),
    categorias_financeiras ( id, nome, cor )
  )
`;

/**
 * Teto explícito de linhas. O PostgREST já corta em ~1000 por padrão; sem pedir
 * o limite na mão a lista voltaria truncada em silêncio e os KPIs — que são
 * somados no cliente — mostrariam um total MENOR que o real numa tela de
 * dinheiro. Pedindo o limite aqui, a tela consegue detectar o corte
 * (`lista.length >= LIMITE_PARCELAS`) e avisar em vez de mentir.
 */
export const LIMITE_PARCELAS = 1000;

/** Parcelas do período, sempre presas ao tipo (receber/pagar) do lançamento pai. */
export async function listarParcelas(
  clinicaId: string,
  filtro: FiltroParcelas,
): Promise<ParcelaComLancamento[]> {
  let q = supabase
    .from("lancamento_parcelas")
    .select(SELECT_PARCELA)
    .eq("clinica_id", clinicaId)
    .eq("lancamentos.tipo", filtro.tipo)
    .order("vencimento", { ascending: true })
    .order("numero", { ascending: true })
    .limit(LIMITE_PARCELAS);

  if (filtro.de) q = q.gte("vencimento", filtro.de);
  if (filtro.ate) q = q.lte("vencimento", filtro.ate);
  if (filtro.contaId) q = q.eq("conta_id", filtro.contaId);
  if (filtro.forma) q = q.eq("forma_pagamento", filtro.forma);
  if (filtro.pacienteId) q = q.eq("lancamentos.paciente_id", filtro.pacienteId);

  // O filtro de status precisa casar com o status EFETIVO (o que a tela mostra),
  // não com a coluna crua. `marcar_parcelas_atrasadas()` só roda no cron diário,
  // então "atrasado" vive em duas formas no banco: a linha já virada pelo job e a
  // linha ainda `pendente` com vencimento passado. Filtrar pela coluna crua
  // esconderia metade das vencidas em "Em atraso" e mostraria vencidas dentro de
  // "Pendente" — em ambos os casos, divergindo do rótulo exibido na própria linha.
  if (filtro.status === "atrasado") {
    q = q.in("status", ["pendente", "atrasado"]).lt("vencimento", hojeISO());
  } else if (filtro.status === "pendente") {
    q = q.in("status", ["pendente", "atrasado"]).gte("vencimento", hojeISO());
  } else if (filtro.status) {
    q = q.eq("status", filtro.status);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ParcelaComLancamento[];
}

/**
 * Inadimplência acumulada — deliberadamente FORA do filtro de período.
 * Se o atraso só aparecesse dentro do mês filtrado, a dívida antiga sumiria
 * da tela justamente quando ela mais importa.
 */
export async function totalEmAtraso(
  clinicaId: string,
  tipo: TipoLancamento,
): Promise<{ total: number; qtd: number }> {
  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select("valor, lancamentos!inner ( tipo )")
    .eq("clinica_id", clinicaId)
    .eq("lancamentos.tipo", tipo)
    .in("status", ["pendente", "atrasado"])
    .lt("vencimento", hojeISO());
  if (error) throw error;
  const linhas = (data ?? []) as unknown as { valor: number }[];
  return {
    total: linhas.reduce((s, p) => s + Number(p.valor ?? 0), 0),
    qtd: linhas.length,
  };
}

export interface KpisFinanceiros {
  liquidado: number;
  liquidadoLiquido: number;
  previsto: number;
  emAberto: number;
  totalPeriodo: number;
  qtdLiquidada: number;
  qtdEmAberto: number;
}

/** KPIs derivados da lista já carregada — sem round-trip extra. */
export function calcularKpis(parcelas: ParcelaComLancamento[]): KpisFinanceiros {
  const pagas = parcelas.filter((p) => p.status === "pago");
  const abertas = parcelas.filter((p) => p.status === "pendente" || p.status === "atrasado");
  const soma = (arr: ParcelaComLancamento[], f: (p: ParcelaComLancamento) => number) =>
    arr.reduce((s, p) => s + (Number(f(p)) || 0), 0);

  return {
    liquidado: soma(pagas, (p) => p.valor_pago ?? p.valor),
    // líquido = o que sobra depois da taxa da adquirente; é o que entra na conta
    liquidadoLiquido: soma(pagas, (p) => p.valor_liquido ?? p.valor_pago ?? p.valor),
    previsto: soma(abertas, (p) => p.valor),
    emAberto: soma(abertas, (p) => p.valor),
    totalPeriodo: soma(parcelas, (p) => (p.status === "pago" ? p.valor_pago ?? p.valor : p.valor)),
    qtdLiquidada: pagas.length,
    qtdEmAberto: abertas.length,
  };
}

// ------------------------------------------------------------------ escrita

export interface BaixaParcela {
  parcelaId: string;
  clinicaId: string;
  pagoEm: string;
  valorPago: number;
  forma: FormaPagamento;
  contaId: string | null;
  taxaValor: number;
  previsaoCredito: string | null;
}

/**
 * Baixa a parcela. NÃO grava `valor_liquido` (coluna gerada) e NÃO mexe em
 * `comissoes` — o trigger do banco libera a comissão vinculada sozinho.
 */
export async function baixarParcela(input: BaixaParcela): Promise<void> {
  const { error } = await supabase
    .from("lancamento_parcelas")
    .update({
      status: "pago",
      pago_em: input.pagoEm,
      valor_pago: input.valorPago,
      taxa_valor: input.taxaValor,
      forma_pagamento: input.forma,
      conta_id: input.contaId,
      previsao_credito: input.previsaoCredito,
    })
    .eq("id", input.parcelaId)
    .eq("clinica_id", input.clinicaId);
  if (error) throw error;
}

/**
 * Desfaz a baixa (erro de digitação, estorno de cartão). Zera o que a baixa gravou.
 *
 * A comissão volta sozinha: o trigger `parcela_reverter_comissoes` (migration
 * 0026) devolve `liberada → prevista` quando a parcela sai de `pago`. Comissão
 * já `paga` ao dentista não é tocada — reverter aí seria calote nele.
 */
export async function estornarParcela(parcelaId: string, clinicaId: string): Promise<void> {
  const { error } = await supabase
    .from("lancamento_parcelas")
    .update({
      status: "pendente",
      pago_em: null,
      valor_pago: null,
      taxa_valor: 0,
      previsao_credito: null,
    })
    .eq("id", parcelaId)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

export async function cancelarParcela(parcelaId: string, clinicaId: string): Promise<void> {
  const { error } = await supabase
    .from("lancamento_parcelas")
    .update({ status: "cancelado" })
    .eq("id", parcelaId)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

export interface NovoLancamento {
  clinicaId: string;
  tipo: TipoLancamento;
  descricao: string;
  valorTotal: number;
  primeiroVencimento: string;
  qtdParcelas?: number;
  categoriaId?: string | null;
  contaId?: string | null;
  forma?: FormaPagamento | null;
  pacienteId?: string | null;
  profissionalId?: string | null;
  observacoes?: string | null;
}

/**
 * Lançamento avulso: receita/despesa que não veio de orçamento (aluguel, venda
 * de produto, fornecedor). O caminho normal passa por `gerar_debitos_orcamento`;
 * este é a porta de entrada manual.
 *
 * Sem transação no cliente: se a inserção das parcelas falhar, o lançamento órfão
 * é removido na mão para não deixar compromisso sem nenhum evento de caixa.
 */
export async function criarLancamentoAvulso(input: NovoLancamento): Promise<string> {
  const qtd = Math.max(1, Math.floor(input.qtdParcelas ?? 1));

  const { data, error } = await supabase
    .from("lancamentos")
    .insert({
      clinica_id: input.clinicaId,
      tipo: input.tipo,
      descricao: input.descricao.trim(),
      valor_total: input.valorTotal,
      qtd_parcelas: qtd,
      categoria_id: input.categoriaId || null,
      conta_id: input.contaId || null,
      forma_pagamento: input.forma || null,
      paciente_id: input.pacienteId || null,
      profissional_id: input.profissionalId || null,
      observacoes: input.observacoes?.trim() || null,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  const lancamentoId = data?.id as string | undefined;
  if (!lancamentoId) throw new Error("O lançamento não retornou id — verifique as permissões (RLS).");

  const parcelas = dividirParcelas(input.valorTotal, qtd).map((valor, i) => ({
    clinica_id: input.clinicaId,
    lancamento_id: lancamentoId,
    numero: i + 1,
    valor,
    vencimento: somarMeses(input.primeiroVencimento, i),
    status: "pendente" as StatusParcela,
    forma_pagamento: input.forma || null,
    conta_id: input.contaId || null,
  }));

  const { error: erroParcelas } = await supabase.from("lancamento_parcelas").insert(parcelas);
  if (erroParcelas) {
    // Rollback manual. Preso ao clinica_id como todo o resto (nenhuma escrita sai
    // sem o filtro de tenant) e com o erro CONFERIDO: se o rollback também falhar,
    // sobra um lançamento sem nenhuma parcela no financeiro da clínica e o usuário
    // precisa saber disso — engolir esse erro esconderia um registro fantasma.
    const { error: erroRollback } = await supabase
      .from("lancamentos")
      .delete()
      .eq("id", lancamentoId)
      .eq("clinica_id", input.clinicaId);
    if (erroRollback) {
      throw new Error(
        `Falha ao criar as parcelas (${erroParcelas.message}) e o lançamento "${input.descricao.trim()}" ` +
        `não pôde ser desfeito (${erroRollback.message}). Ele ficou sem parcelas — exclua-o manualmente.`,
      );
    }
    throw erroParcelas;
  }
  return lancamentoId;
}

/** Divide em centavos e joga a sobra na última parcela — a soma sempre fecha. */
export function dividirParcelas(valorTotal: number, qtd: number): number[] {
  const centavos = Math.round((Number(valorTotal) || 0) * 100);
  const base = Math.floor(centavos / qtd);
  const resto = centavos - base * qtd;
  return Array.from({ length: qtd }, (_, i) => (i === qtd - 1 ? base + resto : base) / 100);
}

/** Remove o lançamento e, em cascata, suas parcelas. Bloqueia se já houve
 *  caixa: apagar parcela paga reescreveria histórico financeiro. */
export async function excluirLancamento(lancamentoId: string, clinicaId: string): Promise<void> {
  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select("id")
    .eq("lancamento_id", lancamentoId)
    .eq("clinica_id", clinicaId)
    .eq("status", "pago")
    .limit(1);
  if (error) throw error;
  if ((data ?? []).length > 0) {
    throw new Error("Este lançamento já tem parcela paga. Estorne a baixa antes de excluir.");
  }

  const { error: erroDelete } = await supabase
    .from("lancamentos")
    .delete()
    .eq("id", lancamentoId)
    .eq("clinica_id", clinicaId);
  if (erroDelete) throw erroDelete;
}

/** Pacientes ativos para o filtro/seleção. Lista enxuta de propósito. */
export async function listarPacientesResumo(clinicaId: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, nome_completo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome_completo")
    .limit(500);
  if (error) throw error;
  return data ?? [];
}
