import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/services/orcamentos";

// ============================================================================
// Serviço de Estoque e Controle de Prótese
// ----------------------------------------------------------------------------
// Decisões que não são óbvias lendo o código:
//
// 1. `produtos`, `estoque_movimentos` e `protese_servicos` entraram no banco
//    depois da última geração de `integrations/supabase/types.ts` (arquivo
//    gerado, fora do meu alcance). Por isso o acesso passa por `db`, um cast
//    do client, e os contratos ficam declarados à mão aqui embaixo — o `any`
//    morre nesta camada e nunca vaza pras telas.
//
// 2. SALDO NÃO É COLUNA. Não existe `produtos.saldo` — o saldo é a soma
//    assinada dos movimentos, calculada pela view `vw_estoque_atual`
//    (entrada/ajuste somam, saída/perda subtraem). Guardar saldo em coluna
//    convida a divergir do histórico na primeira concorrência; aqui o
//    histórico É a verdade e a view é derivada dele.
//
// 3. CUSTO MÉDIO PONDERADO é recalculado no front, na entrada com custo
//    informado: (saldo × custo_atual + qtd × custo_entrada) / (saldo + qtd).
//    Não há trigger no banco fazendo isso. Sem essa conta, o "valor total em
//    estoque" congela no primeiro preço cadastrado e mente pra clínica na
//    primeira alta de fornecedor. Entrada sem custo informado não mexe no
//    custo médio (não há informação nova pra ponderar).
//
// 4. SAÍDA MAIOR QUE O SALDO É BLOQUEADA. O banco só barra quantidade <= 0.
//    Saldo negativo em estoque físico não existe — é sempre entrada que não
//    foi lançada. Bloquear e mandar usar `ajuste` mantém o inventário
//    auditável em vez de esconder o furo num número negativo.
//
// 5. PRÓTESE: as datas `enviado_em` e `retornado_em` são carimbadas pela
//    própria mudança de etapa (envio → carimba envio; realizado → carimba
//    retorno), só quando ainda estão vazias. Pedir a data em dialog separado
//    garante que ninguém preenche, e sem ela o alerta de atraso é cego.
// ============================================================================

type QueryLivre = {
  from: (tabela: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
const db = supabase as unknown as QueryLivre;

export { brl };

const num = (v: unknown) => Number(v ?? 0) || 0;
const numOuNulo = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : Number(v) || 0;

/** Mensagem legível de um erro desconhecido (Supabase, rede ou throw solto). */
export function mensagemErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Erro inesperado.";
}

export const dataBr = (v?: string | null) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR") : "—";

export const dataHoraBr = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

/** Data de hoje em `YYYY-MM-DD` no fuso local (o `toISOString` erra o dia à noite). */
export function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// ============================================================================
// ESTOQUE — contratos
// ============================================================================

export type TipoMovimento = "entrada" | "saida" | "ajuste" | "perda";

export const TIPO_MOVIMENTO_LABEL: Record<TipoMovimento, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  perda: "Perda",
};

export const TIPO_MOVIMENTO_CLASSE: Record<TipoMovimento, string> = {
  entrada: "bg-brand-100 text-brand-800 border-0",
  saida: "bg-sky-100 text-sky-800 border-0",
  ajuste: "bg-amber-100 text-amber-800 border-0",
  perda: "bg-rose-100 text-rose-800 border-0",
};

/** Sinal que cada tipo aplica no saldo — espelha o CASE da `vw_estoque_atual`. */
export const SINAL_MOVIMENTO: Record<TipoMovimento, 1 | -1> = {
  entrada: 1,
  ajuste: 1,
  saida: -1,
  perda: -1,
};

export const UNIDADES = ["un", "cx", "ml", "l", "g", "kg", "pct", "par", "amp", "fr"] as const;

export interface Produto {
  id: string;
  nome: string;
  sku: string | null;
  categoria: string | null;
  unidade: string;
  estoqueMinimo: number;
  custoMedio: number | null;
  ativo: boolean;
}

export interface ItemEstoque extends Produto {
  saldo: number;
  ultimaMovimentacao: string | null;
  abaixoDoMinimo: boolean;
  /** Saldo × custo médio. `null` quando o produto não tem custo cadastrado. */
  valorEmEstoque: number | null;
}

export interface Movimento {
  id: string;
  produtoId: string;
  produto: string;
  unidade: string;
  tipo: TipoMovimento;
  quantidade: number;
  custoUnitario: number | null;
  motivo: string | null;
  criadoEm: string;
  /** Impacto assinado no saldo (positivo entra, negativo sai). */
  delta: number;
}

export interface ResumoEstoque {
  produtos: number;
  abaixoDoMinimo: number;
  valorTotal: number;
  semCusto: number;
}

export interface ProdutoInput {
  nome: string;
  sku?: string | null;
  categoria?: string | null;
  unidade: string;
  estoqueMinimo: number;
  custoMedio?: number | null;
  ativo?: boolean;
}

export interface MovimentoInput {
  produtoId: string;
  tipo: TipoMovimento;
  quantidade: number;
  custoUnitario?: number | null;
  motivo?: string | null;
}

interface LinhaEstoque {
  produto_id: string;
  nome: string;
  sku: string | null;
  categoria: string | null;
  unidade: string | null;
  estoque_minimo: number | string | null;
  custo_medio: number | string | null;
  ativo: boolean | null;
  saldo: number | string | null;
  ultima_movimentacao: string | null;
  alerta_estoque_baixo: boolean | null;
}

interface LinhaMovimento {
  id: string;
  produto_id: string;
  tipo: string;
  quantidade: number | string | null;
  custo_unitario: number | string | null;
  motivo: string | null;
  created_at: string;
  produto: { nome: string | null; unidade: string | null } | null;
}

function normalizarItem(l: LinhaEstoque): ItemEstoque {
  const saldo = num(l.saldo);
  const custoMedio = l.custo_medio === null || l.custo_medio === undefined ? null : num(l.custo_medio);
  return {
    id: l.produto_id,
    nome: l.nome,
    sku: l.sku,
    categoria: l.categoria,
    unidade: l.unidade ?? "un",
    estoqueMinimo: num(l.estoque_minimo),
    custoMedio,
    ativo: l.ativo ?? true,
    saldo,
    ultimaMovimentacao: l.ultima_movimentacao,
    abaixoDoMinimo: Boolean(l.alerta_estoque_baixo),
    valorEmEstoque: custoMedio === null ? null : saldo * custoMedio,
  };
}

// ============================================================================
// ESTOQUE — leitura
// ============================================================================

/** Produtos com saldo atual, direto da view (respeita RLS por `security_invoker`). */
export async function listarEstoque(clinicaId: string): Promise<ItemEstoque[]> {
  const { data, error } = await db
    .from("vw_estoque_atual")
    .select("*")
    .eq("clinica_id", clinicaId)
    .order("nome");
  if (error) throw error;
  return ((data ?? []) as LinhaEstoque[]).map(normalizarItem);
}

export async function listarMovimentos(
  clinicaId: string,
  filtros: { produtoId?: string; tipo?: TipoMovimento; limite?: number } = {},
): Promise<Movimento[]> {
  let q = db
    .from("estoque_movimentos")
    .select("id, produto_id, tipo, quantidade, custo_unitario, motivo, created_at, produto:produtos(nome, unidade)")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false })
    .limit(filtros.limite ?? 200);

  if (filtros.produtoId) q = q.eq("produto_id", filtros.produtoId);
  if (filtros.tipo) q = q.eq("tipo", filtros.tipo);

  const { data, error } = await q;
  if (error) throw error;

  return ((data ?? []) as LinhaMovimento[]).map((l) => {
    const tipo = (l.tipo ?? "entrada") as TipoMovimento;
    const quantidade = num(l.quantidade);
    return {
      id: l.id,
      produtoId: l.produto_id,
      produto: l.produto?.nome ?? "Produto removido",
      unidade: l.produto?.unidade ?? "un",
      tipo,
      quantidade,
      custoUnitario:
        l.custo_unitario === null || l.custo_unitario === undefined ? null : num(l.custo_unitario),
      motivo: l.motivo,
      criadoEm: l.created_at,
      // ajuste já vem assinado do usuário (pode ser negativo); os outros usam o mapa
      delta: tipo === "ajuste" ? quantidade : quantidade * SINAL_MOVIMENTO[tipo],
    };
  });
}

export function resumirEstoque(itens: ItemEstoque[]): ResumoEstoque {
  return itens.reduce<ResumoEstoque>(
    (acc, i) => {
      acc.produtos += 1;
      if (i.abaixoDoMinimo) acc.abaixoDoMinimo += 1;
      if (i.valorEmEstoque === null) acc.semCusto += 1;
      else acc.valorTotal += i.valorEmEstoque;
      return acc;
    },
    { produtos: 0, abaixoDoMinimo: 0, valorTotal: 0, semCusto: 0 },
  );
}

// ============================================================================
// ESTOQUE — escrita
// ============================================================================

export function validarProduto(input: ProdutoInput): string | null {
  if (!input.nome.trim()) return "Informe o nome do produto.";
  if (!input.unidade.trim()) return "Informe a unidade de medida.";
  if (!Number.isFinite(input.estoqueMinimo) || input.estoqueMinimo < 0)
    return "O estoque mínimo não pode ser negativo.";
  if (input.custoMedio !== null && input.custoMedio !== undefined && input.custoMedio < 0)
    return "O custo não pode ser negativo.";
  return null;
}

function payloadProduto(input: ProdutoInput) {
  return {
    nome: input.nome.trim(),
    sku: input.sku?.trim() || null,
    categoria: input.categoria?.trim() || null,
    unidade: input.unidade.trim(),
    estoque_minimo: input.estoqueMinimo,
    custo_medio: input.custoMedio ?? null,
    ativo: input.ativo ?? true,
  };
}

export async function criarProduto(clinicaId: string, input: ProdutoInput): Promise<string> {
  const { data, error } = await db
    .from("produtos")
    .insert({ clinica_id: clinicaId, ...payloadProduto(input) })
    .select("id")
    .maybeSingle();
  if (error) throw traduzirErroProduto(error);
  return (data as { id: string } | null)?.id ?? "";
}

export async function atualizarProduto(
  clinicaId: string,
  id: string,
  input: ProdutoInput,
): Promise<void> {
  const { error } = await db
    .from("produtos")
    .update(payloadProduto(input))
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw traduzirErroProduto(error);
}

/** Apaga o produto E todo o histórico dele (FK `on delete cascade`). */
export async function excluirProduto(clinicaId: string, id: string): Promise<void> {
  const { error } = await db.from("produtos").delete().eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
}

function traduzirErroProduto(e: unknown): Error {
  const msg = mensagemErro(e);
  // unique (clinica_id, nome) e uq_produtos_sku: a mensagem crua do Postgres
  // não ajuda ninguém — os dois índices únicos precisam de tradução.
  if (msg.includes("produtos_clinica_id_nome_key"))
    return new Error("Já existe um produto com esse nome nesta clínica.");
  if (msg.includes("uq_produtos_sku"))
    return new Error("Já existe um produto com esse SKU nesta clínica.");
  return new Error(msg);
}

/**
 * Registra o movimento e, quando for entrada com custo, atualiza o custo médio
 * ponderado do produto. Retorna o saldo depois do movimento.
 */
export async function registrarMovimento(
  clinicaId: string,
  input: MovimentoInput,
): Promise<number> {
  const quantidade = Number(input.quantidade);
  if (!Number.isFinite(quantidade)) throw new Error("Quantidade inválida.");
  if (input.tipo === "ajuste" && quantidade === 0)
    throw new Error("O ajuste precisa ser diferente de zero.");
  if (input.tipo !== "ajuste" && quantidade <= 0)
    throw new Error("A quantidade precisa ser maior que zero.");

  // Estado atual do produto: precisamos do saldo pra barrar saída impossível e
  // do custo médio vigente pra ponderar a entrada.
  const { data: atual, error: erroAtual } = await db
    .from("vw_estoque_atual")
    .select("saldo, custo_medio, nome, unidade")
    .eq("clinica_id", clinicaId)
    .eq("produto_id", input.produtoId)
    .maybeSingle();
  if (erroAtual) throw erroAtual;
  if (!atual) throw new Error("Produto não encontrado nesta clínica.");

  const linha = atual as { saldo: number | string | null; custo_medio: number | string | null };
  const saldoAntes = num(linha.saldo);
  const delta = input.tipo === "ajuste" ? quantidade : quantidade * SINAL_MOVIMENTO[input.tipo];
  const saldoDepois = saldoAntes + delta;

  if (saldoDepois < 0) {
    throw new Error(
      `Saldo insuficiente: há ${saldoAntes} em estoque. Se a contagem física for maior, ` +
        `lance um ajuste antes de dar a saída.`,
    );
  }

  const custoUnitario = numOuNulo(input.custoUnitario);
  const { error } = await db.from("estoque_movimentos").insert({
    clinica_id: clinicaId,
    produto_id: input.produtoId,
    tipo: input.tipo,
    // o CHECK do banco exige quantidade > 0 fora de ajuste; ajuste guarda o sinal
    quantidade,
    custo_unitario: custoUnitario,
    motivo: input.motivo?.trim() || null,
  });
  if (error) throw error;

  if (input.tipo === "entrada" && custoUnitario !== null && quantidade > 0) {
    const custoAntes = linha.custo_medio === null ? null : num(linha.custo_medio);
    const baseAntes = Math.max(saldoAntes, 0);
    const novoCusto =
      custoAntes === null || baseAntes <= 0
        ? custoUnitario // primeira compra (ou estoque zerado): o custo da entrada É o custo médio
        : (baseAntes * custoAntes + quantidade * custoUnitario) / (baseAntes + quantidade);

    const { error: erroCusto } = await db
      .from("produtos")
      // `produtos.custo_medio` é numeric(12,2): mandar 4 casas faz o Postgres
      // arredondar em silêncio e o valor gravado passa a divergir do calculado.
      .update({ custo_medio: Number(novoCusto.toFixed(2)) })
      .eq("id", input.produtoId)
      .eq("clinica_id", clinicaId);
    // custo médio é derivado: se falhar, o movimento continua válido e o usuário
    // é avisado sem perder o lançamento que já entrou.
    if (erroCusto) throw new Error(`Movimento registrado, mas o custo médio não atualizou: ${erroCusto.message}`);
  }

  return saldoDepois;
}

// ============================================================================
// PRÓTESE — contratos
// ============================================================================

export type EtapaProtese =
  | "pre_laboratorio"
  | "envio"
  | "laboratorio"
  | "prova"
  | "agenda"
  | "realizado";

/** Ordem do fluxo — é ela que define avançar/voltar e a ordem das colunas. */
export const ETAPAS_PROTESE: EtapaProtese[] = [
  "pre_laboratorio",
  "envio",
  "laboratorio",
  "prova",
  "agenda",
  "realizado",
];

export const ETAPA_LABEL: Record<EtapaProtese, string> = {
  pre_laboratorio: "Pré-laboratório",
  envio: "Envio",
  laboratorio: "No laboratório",
  prova: "Prova",
  agenda: "Agendado",
  realizado: "Realizado",
};

export const ETAPA_AJUDA: Record<EtapaProtese, string> = {
  pre_laboratorio: "Moldagem e preparo antes de mandar pro laboratório.",
  laboratorio: "Peça em produção no laboratório.",
  envio: "Peça pronta pra sair — carimba a data de envio.",
  prova: "Peça voltou e está em prova no paciente.",
  agenda: "Prova aprovada, aguardando a consulta de instalação.",
  realizado: "Peça instalada. Caso encerrado.",
};

/** Cor de cabeçalho por etapa. Mapa literal — Tailwind não gera classe montada em runtime. */
export const ETAPA_CLASSE: Record<EtapaProtese, string> = {
  pre_laboratorio: "bg-slate-100 text-slate-700",
  envio: "bg-amber-100 text-amber-800",
  laboratorio: "bg-sky-100 text-sky-800",
  prova: "bg-violet-100 text-violet-800",
  agenda: "bg-blue-100 text-blue-800",
  realizado: "bg-brand-100 text-brand-800",
};

export const ETAPA_PONTO: Record<EtapaProtese, string> = {
  pre_laboratorio: "bg-slate-400",
  envio: "bg-amber-500",
  laboratorio: "bg-sky-500",
  prova: "bg-violet-500",
  agenda: "bg-blue-500",
  realizado: "bg-brand-500",
};

export interface ProteseServico {
  id: string;
  pacienteId: string;
  paciente: string;
  laboratorio: string | null;
  tipoPeca: string;
  dentes: number[];
  cor: string | null;
  etapa: EtapaProtese;
  enviadoEm: string | null;
  previsaoRetorno: string | null;
  retornadoEm: string | null;
  valorCusto: number | null;
  observacoes: string | null;
  /** Previsão vencida e peça ainda não entregue. */
  atrasado: boolean;
  /** Dias até a previsão (negativo = dias de atraso). `null` sem previsão. */
  diasParaRetorno: number | null;
  criadoEm: string;
}

export interface ProteseInput {
  pacienteId: string;
  laboratorio?: string | null;
  tipoPeca: string;
  dentes: number[];
  cor?: string | null;
  previsaoRetorno?: string | null;
  valorCusto?: number | null;
  observacoes?: string | null;
  etapa?: EtapaProtese;
}

interface LinhaProtese {
  id: string;
  paciente_id: string;
  laboratorio: string | null;
  tipo_peca: string;
  dentes: (number | string)[] | null;
  cor: string | null;
  etapa: string;
  enviado_em: string | null;
  previsao_retorno: string | null;
  retornado_em: string | null;
  valor_custo: number | string | null;
  observacoes: string | null;
  created_at: string;
  paciente: { nome_completo: string | null } | null;
}

const MS_DIA = 86_400_000;

function diasEntre(deISO: string, ateISO: string): number {
  const de = new Date(`${deISO}T12:00:00`).getTime();
  const ate = new Date(`${ateISO}T12:00:00`).getTime();
  return Math.round((ate - de) / MS_DIA);
}

function normalizarProtese(l: LinhaProtese): ProteseServico {
  const etapa = (l.etapa ?? "pre_laboratorio") as EtapaProtese;
  const entregue = etapa === "realizado" || Boolean(l.retornado_em);
  const dias = l.previsao_retorno ? diasEntre(hojeISO(), l.previsao_retorno) : null;
  return {
    id: l.id,
    pacienteId: l.paciente_id,
    paciente: l.paciente?.nome_completo ?? "Paciente removido",
    laboratorio: l.laboratorio,
    tipoPeca: l.tipo_peca,
    dentes: (l.dentes ?? []).map((d) => Number(d)).filter((d) => Number.isFinite(d)),
    cor: l.cor,
    etapa,
    enviadoEm: l.enviado_em,
    previsaoRetorno: l.previsao_retorno,
    retornadoEm: l.retornado_em,
    valorCusto:
      l.valor_custo === null || l.valor_custo === undefined ? null : num(l.valor_custo),
    observacoes: l.observacoes,
    atrasado: !entregue && dias !== null && dias < 0,
    diasParaRetorno: dias,
    criadoEm: l.created_at,
  };
}

// ============================================================================
// PRÓTESE — leitura e escrita
// ============================================================================

export async function listarProteses(clinicaId: string): Promise<ProteseServico[]> {
  const { data, error } = await db
    .from("protese_servicos")
    .select(
      "id, paciente_id, laboratorio, tipo_peca, dentes, cor, etapa, enviado_em, previsao_retorno, retornado_em, valor_custo, observacoes, created_at, paciente:pacientes(nome_completo)",
    )
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as LinhaProtese[]).map(normalizarProtese);
}

/** Pacientes ativos, só o mínimo pro select do dialog. */
export async function listarPacientesResumo(
  clinicaId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await db
    .from("pacientes")
    .select("id, nome_completo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome_completo");
  if (error) throw error;
  return ((data ?? []) as { id: string; nome_completo: string | null }[]).map((p) => ({
    id: p.id,
    nome: p.nome_completo ?? "Sem nome",
  }));
}

/** Laboratórios já usados — vira sugestão no dialog, sem tabela de cadastro. */
export function laboratoriosConhecidos(lista: ProteseServico[]): string[] {
  const set = new Set<string>();
  for (const s of lista) if (s.laboratorio?.trim()) set.add(s.laboratorio.trim());
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function validarProtese(input: ProteseInput): string | null {
  if (!input.pacienteId) return "Selecione o paciente.";
  if (!input.tipoPeca.trim()) return "Informe o tipo de peça.";
  if (input.valorCusto !== null && input.valorCusto !== undefined && input.valorCusto < 0)
    return "O valor de custo não pode ser negativo.";
  return null;
}

function payloadProtese(input: ProteseInput) {
  return {
    paciente_id: input.pacienteId,
    laboratorio: input.laboratorio?.trim() || null,
    tipo_peca: input.tipoPeca.trim(),
    dentes: input.dentes ?? [],
    cor: input.cor?.trim() || null,
    previsao_retorno: input.previsaoRetorno || null,
    valor_custo: input.valorCusto ?? null,
    observacoes: input.observacoes?.trim() || null,
  };
}

export async function criarProtese(clinicaId: string, input: ProteseInput): Promise<string> {
  const etapa = input.etapa ?? "pre_laboratorio";
  const { data, error } = await db
    .from("protese_servicos")
    .insert({
      clinica_id: clinicaId,
      ...payloadProtese(input),
      etapa,
      enviado_em: etapa === "pre_laboratorio" ? null : hojeISO(),
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? "";
}

export async function atualizarProtese(
  clinicaId: string,
  id: string,
  input: ProteseInput,
): Promise<void> {
  const { error } = await db
    .from("protese_servicos")
    .update(payloadProtese(input))
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

/**
 * Move a peça de etapa carimbando as datas que a etapa implica.
 * Voltar de `realizado` limpa o retorno — senão o card fica "entregue" numa
 * coluna que diz o contrário e o alerta de atraso some sem motivo.
 */
export async function moverEtapa(
  clinicaId: string,
  servico: ProteseServico,
  destino: EtapaProtese,
): Promise<void> {
  const patch: Record<string, unknown> = { etapa: destino };
  const indiceDestino = ETAPAS_PROTESE.indexOf(destino);

  if (indiceDestino >= ETAPAS_PROTESE.indexOf("envio") && !servico.enviadoEm) {
    patch.enviado_em = hojeISO();
  }
  if (destino === "realizado" && !servico.retornadoEm) {
    patch.retornado_em = hojeISO();
  }
  if (destino !== "realizado" && servico.retornadoEm) {
    patch.retornado_em = null;
  }
  if (destino === "pre_laboratorio") {
    patch.enviado_em = null;
  }

  const { error } = await db
    .from("protese_servicos")
    .update(patch)
    .eq("id", servico.id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

export async function excluirProtese(clinicaId: string, id: string): Promise<void> {
  const { error } = await db
    .from("protese_servicos")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

export interface ResumoProtese {
  total: number;
  emAndamento: number;
  atrasados: number;
  custoEmAberto: number;
}

export function resumirProteses(lista: ProteseServico[]): ResumoProtese {
  return lista.reduce<ResumoProtese>(
    (acc, s) => {
      acc.total += 1;
      if (s.etapa !== "realizado") {
        acc.emAndamento += 1;
        acc.custoEmAberto += s.valorCusto ?? 0;
      }
      if (s.atrasado) acc.atrasados += 1;
      return acc;
    },
    { total: 0, emAndamento: 0, atrasados: 0, custoEmAberto: 0 },
  );
}
