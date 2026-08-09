import { supabase } from "@/integrations/supabase/client";
import type { Denticao, FaceDental } from "@/types/odonto";
import type { Database } from "@/integrations/supabase/types";

/** Enum do banco — evita string solta virar valor inválido. */
export type RegiaoFacial = Database["public"]["Enums"]["regiao_facial"];

// ============================================================================
// Serviço de Orçamentos — o centro do negócio odontológico
// ----------------------------------------------------------------------------
// Aprovar um orçamento dispara TRÊS efeitos, todos no servidor:
//   1. clínico    → item aprovado entra no odontograma como planejado (trigger)
//   2. comercial  → o card se move no funil (trigger)
//   3. financeiro → gerar_debitos_orcamento() cria lançamento + parcelas + comissão
// A aprovação é PARCIAL: item a item, como o paciente decide na cadeira.
// ============================================================================

export type StatusOrcamento =
  | "rascunho" | "aberto" | "aprovado_parcial" | "aprovado"
  | "reprovado" | "expirado" | "cancelado";

export type StatusItem = "pendente" | "aprovado" | "recusado";

export interface Orcamento {
  id: string;
  clinica_id: string;
  paciente_id: string;
  profissional_id: string | null;
  convenio_id: string | null;
  numero: number;
  titulo: string | null;
  observacoes: string | null;
  status: StatusOrcamento;
  validade: string | null;
  desconto: number;
  total_itens: number;
  total_aprovado: number;
  aprovado_em: string | null;
  created_at: string;
}

export interface OrcamentoItem {
  id: string;
  orcamento_id: string;
  procedimento_id: string;
  denticao: Denticao;
  dente: number | null;
  faces: FaceDental[];
  regiao: string | null;
  regiao_facial: RegiaoFacial | null;
  quantidade: number;
  valor_unitario: number;
  desconto: number;
  total: number;
  status: StatusItem;
  ordem: number;
  observacoes: string | null;
}

export const STATUS_LABEL: Record<StatusOrcamento, string> = {
  rascunho: "Rascunho",
  aberto: "Em aberto",
  aprovado_parcial: "Aprovado parcial",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  expirado: "Expirado",
  cancelado: "Cancelado",
};

export const STATUS_CLASSE: Record<StatusOrcamento, string> = {
  rascunho: "bg-gray-100 text-gray-700",
  aberto: "bg-amber-100 text-amber-800",
  aprovado_parcial: "bg-sky-100 text-sky-800",
  aprovado: "bg-emerald-100 text-emerald-800",
  reprovado: "bg-red-100 text-red-700",
  expirado: "bg-gray-100 text-gray-500",
  cancelado: "bg-gray-100 text-gray-500",
};

export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

// ---------------------------------------------------------------- consultas
export async function listarOrcamentos(clinicaId: string, pacienteId?: string) {
  let q = supabase
    .from("orcamentos")
    .select("*, pacientes(nome_completo), profissional:profiles!orcamentos_profissional_id_fkey(full_name)")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false });
  if (pacienteId) q = q.eq("paciente_id", pacienteId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function obterOrcamento(id: string) {
  const { data, error } = await supabase
    .from("orcamentos")
    .select("*, pacientes(id, nome_completo, celular), profissional:profiles!orcamentos_profissional_id_fkey(full_name), convenios(nome)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarItens(orcamentoId: string) {
  const { data, error } = await supabase
    .from("orcamento_itens")
    .select("*, procedimentos(nome, especialidade, aplicacao)")
    .eq("orcamento_id", orcamentoId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------- escrita
export async function criarOrcamento(input: {
  clinicaId: string;
  pacienteId: string;
  titulo?: string;
  profissionalId?: string | null;
  convenioId?: string | null;
  validade?: string | null;
}) {
  const { data, error } = await supabase
    .from("orcamentos")
    .insert({
      clinica_id: input.clinicaId,
      paciente_id: input.pacienteId,
      titulo: input.titulo ?? null,
      profissional_id: input.profissionalId ?? null,
      convenio_id: input.convenioId ?? null,
      validade: input.validade ?? null,
      status: "rascunho",
      numero: 0, // o trigger numera por clínica
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data?.id as string;
}

export async function adicionarItem(input: {
  clinicaId: string;
  orcamentoId: string;
  procedimentoId: string;
  valorUnitario: number;
  denticao?: Denticao;
  dente?: number | null;
  faces?: FaceDental[];
  regiao?: string | null;
  regiaoFacial?: RegiaoFacial | null;
  quantidade?: number;
  ordem?: number;
}) {
  const { error } = await supabase.from("orcamento_itens").insert({
    clinica_id: input.clinicaId,
    orcamento_id: input.orcamentoId,
    procedimento_id: input.procedimentoId,
    valor_unitario: input.valorUnitario,
    denticao: input.denticao ?? "permanente",
    dente: input.dente ?? null,
    faces: input.faces ?? [],
    regiao: input.regiao ?? null,
    regiao_facial: input.regiaoFacial ?? null,
    quantidade: input.quantidade ?? 1,
    ordem: input.ordem ?? 0,
  });
  if (error) throw error;
}

export async function removerItem(itemId: string) {
  const { error } = await supabase.from("orcamento_itens").delete().eq("id", itemId);
  if (error) throw error;
}

/** Aprovação PARCIAL: muda o status de um item só. Os triggers cuidam do resto. */
export async function definirStatusItem(itemId: string, status: StatusItem) {
  const { error } = await supabase.from("orcamento_itens").update({ status }).eq("id", itemId);
  if (error) throw error;
}

/** Publica o rascunho: vira "aberto" e entra no funil de vendas. */
export async function publicarOrcamento(id: string) {
  const { error } = await supabase.from("orcamentos").update({ status: "aberto" }).eq("id", id);
  if (error) throw error;
}

export async function definirDesconto(id: string, desconto: number) {
  const { error } = await supabase.from("orcamentos").update({ desconto }).eq("id", id);
  if (error) throw error;
}

/**
 * Fecha o orçamento aprovado: gera lançamento financeiro + parcelas + comissões.
 * Roda no servidor (SECURITY DEFINER) e é idempotente — recusa se já gerou.
 */
export async function gerarDebitos(input: {
  orcamentoId: string;
  forma: string;
  parcelas?: number;
  primeiroVencimento?: string;
  contaId?: string | null;
}) {
  const { data, error } = await supabase.rpc("gerar_debitos_orcamento", {
    p_orcamento_id: input.orcamentoId,
    p_forma: input.forma as never,
    p_qtd_parcelas: input.parcelas ?? 1,
    p_primeiro_venc: input.primeiroVencimento ?? new Date().toISOString().slice(0, 10),
    p_conta_id: input.contaId ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------- apoio
export async function listarProcedimentos(clinicaId: string) {
  const { data, error } = await supabase
    .from("procedimentos")
    .select("id, nome, valor, especialidade, aplicacao, duracao_min")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function listarConvenios(clinicaId: string) {
  const { data, error } = await supabase
    .from("convenios")
    .select("id, nome, tipo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function listarProfissionais(clinicaId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("clinica_id", clinicaId)
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function listarRegioesFaciais() {
  const { data, error } = await supabase
    .from("regioes_faciais")
    .select("codigo, rotulo, grupo, ordem")
    .order("ordem");
  if (error) throw error;
  return data ?? [];
}

/** Preço do procedimento no convênio escolhido (cai no valor padrão se não houver tabela). */
export async function precoDoProcedimento(procedimentoId: string, convenioId: string | null, padrao: number) {
  if (!convenioId) return padrao;
  const { data } = await supabase
    .from("procedimento_precos")
    .select("valor")
    .eq("procedimento_id", procedimentoId)
    .eq("convenio_id", convenioId)
    .eq("ativo", true)
    .maybeSingle();
  return data?.valor ?? padrao;
}
