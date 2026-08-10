import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Serviço da Plataforma — o lado de dentro do SaaS
// ----------------------------------------------------------------------------
// Todo acesso daqui passa por RPC (migration 0044). Não existe `.from("clinicas")`
// neste arquivo de propósito: a RLS de tenant continua valendo para o membro da
// plataforma como para qualquer um, então consulta direta devolveria só a
// clínica dele. Quem cruza tenant é a função SECURITY DEFINER no banco, que
// devolve agregado e metadado de conta — nunca dado de paciente.
//
// As funções da 0044 são mais novas que `integrations/supabase/types.ts`
// (arquivo gerado), por isso o client entra por `db`. Os contratos ficam
// declarados aqui, à mão — nada de `any` vazando para as telas.
// ============================================================================

type QueryLivre = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};
const db = supabase as unknown as QueryLivre;

async function chamar<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

// ------------------------------------------------------------------ contratos

export interface VisaoGeral {
  clinicas_total: number;
  clinicas_pagantes: number;
  clinicas_trial: number;
  clinicas_cortesia: number;
  clinicas_atrasadas: number;
  clinicas_canceladas: number;
  clinicas_bloqueadas: number;

  mrr: number;
  arr: number;
  ticket_medio: number;
  receita_potencial: number;

  usuarios_total: number;
  usuarios_ativos_7d: number;
  usuarios_ativos_30d: number;
  usuarios_nunca_entraram: number;
  clinicas_ativas_30d: number;
  clinicas_paradas_14d: number;

  novas_mes: number;
  novas_mes_anterior: number;
  canceladas_mes: number;
  conversao_trial_pct: number;

  trials_expirando_7d: number;
  trials_vencidos: number;

  leads_total: number;
  leads_novos_mes: number;
  leads_abertos: number;
  leads_convertidos: number;
  lead_conversao_pct: number;

  pacientes_total: number;
  consultas_30d: number;
  orcamentos_30d: number;
  cadeiras_total: number;
  whatsapp_conectados: number;

  atualizado_em: string;
}

export interface ClinicaPlataforma {
  id: string;
  nome: string;
  codigo: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  plano: string;
  status: string;
  valor: number | null;
  ciclo: string;
  mrr: number;
  cortesia: boolean;
  bloqueada: boolean;
  bloqueio_motivo: string | null;
  trial_termina_em: string | null;
  trial_infinito: boolean;
  dias_trial: number | null;
  usuarios: number;
  pacientes: number;
  consultas_30d: number;
  cadeiras: number;
  ultimo_acesso: string | null;
  dias_sem_acesso: number | null;
  criada_em: string;
  observacao: string | null;
  origem: string | null;
  responsavel: string | null;
}

export interface PontoSerie {
  mes: string;
  rotulo: string;
  novas: number;
  canceladas: number;
  ativas_acumulado: number;
  mrr: number;
  leads: number;
}

export interface Localidade {
  estado: string;
  cidade: string;
  clinicas: number;
  pagantes: number;
  mrr: number;
  usuarios: number;
}

export interface ItemSegmentacao {
  pergunta: string;
  resposta: string;
  clinicas: number;
  pct: number;
}

export interface LeadPlataforma {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  clinica_nome: string | null;
  cidade: string | null;
  estado: string | null;
  cadeiras: number | null;
  profissionais: number | null;
  plano_interesse: string | null;
  origem: string | null;
  campanha: string | null;
  mensagem: string | null;
  status: string;
  observacao: string | null;
  convertida_clinica_id: string | null;
  clinica_convertida: string | null;
  created_at: string;
}

export interface MembroPlataforma {
  user_id: string;
  email: string;
  nome: string | null;
  papel: string;
  ativo: boolean;
  ultimo_acesso: string | null;
  created_at: string;
}

export interface RegistroPlataforma {
  id: string;
  acao: string;
  quem: string | null;
  clinica: string | null;
  clinica_id: string | null;
  motivo: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  created_at: string;
}

export interface DetalheClinica {
  clinica: {
    id: string; nome: string; codigo: string;
    email: string | null; telefone: string | null; cnpj: string | null;
    cidade: string | null; estado: string | null; criada_em: string;
    segmentacao: Record<string, unknown>;
  };
  assinatura: {
    plano: string; status: string; valor: number | null; ciclo: string; mrr: number;
    trial_termina_em: string | null; trial_infinito: boolean;
    cortesia: boolean; bloqueada: boolean; bloqueio_motivo: string | null;
    proximo_vencimento: string | null;
    observacao: string | null; origem: string | null; responsavel: string | null;
  };
  equipe: Array<{ nome: string | null; email: string; papel: string; status: string; ultimo_acesso: string | null }>;
  uso: { pacientes: number; consultas: number; consultas_30d: number; orcamentos: number; cadeiras: number; profissionais: number };
  integracoes: { whatsapp: number; asaas: boolean };
  historico: Array<{ acao: string; quem: string | null; motivo: string | null; quando: string }>;
}

// ------------------------------------------------------------------ leitura

export const visaoGeral = () => chamar<VisaoGeral>("plataforma_visao_geral");

export interface FiltroClinicas {
  busca?: string;
  status?: string;
  plano?: string;
  uf?: string;
  ordem?: "recentes" | "mrr" | "uso" | "nome" | "risco";
  limite?: number;
}

export const listarClinicas = (f: FiltroClinicas = {}) =>
  chamar<ClinicaPlataforma[]>("plataforma_clinicas", {
    p_busca: f.busca ?? null,
    p_status: f.status ?? null,
    p_plano: f.plano ?? null,
    p_uf: f.uf ?? null,
    p_ordem: f.ordem ?? "recentes",
    p_limite: f.limite ?? 200,
  });

export const serieMensal = (meses = 12) =>
  chamar<PontoSerie[]>("plataforma_serie_mensal", { p_meses: meses });

export const localidades = () => chamar<Localidade[]>("plataforma_localidades");

export const segmentacao = () => chamar<ItemSegmentacao[]>("plataforma_segmentacao");

export const detalheClinica = (id: string) =>
  chamar<DetalheClinica>("plataforma_clinica_detalhe", { p_clinica: id });

export const listarLeads = (status?: string, busca?: string) =>
  chamar<LeadPlataforma[]>("plataforma_leads_listar", {
    p_status: status ?? null, p_busca: busca ?? null, p_limite: 300,
  });

export const listarMembros = () => chamar<MembroPlataforma[]>("plataforma_membros_listar");

export const listarAuditoria = (limite = 200) =>
  chamar<RegistroPlataforma[]>("plataforma_auditoria_listar", { p_limite: limite });

// ------------------------------------------------------------------ escrita

export interface NovaClinica {
  nome: string;
  email: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  plano?: string;
  valor?: number | null;
  ciclo?: string;
  trialDias?: number;
  trialInfinito?: boolean;
  cortesia?: boolean;
  status?: string;
  origem?: string;
  responsavel?: string;
  observacao?: string;
}

export const criarClinica = (c: NovaClinica) =>
  chamar<{ clinica_id: string; codigo: string; convite_token: string | null; vinculado_direto: boolean }>(
    "plataforma_criar_clinica", {
      p_nome: c.nome,
      p_email_dono: c.email,
      p_telefone: c.telefone ?? null,
      p_cidade: c.cidade ?? null,
      p_estado: c.estado ?? null,
      p_plano: c.plano ?? "trial",
      p_valor: c.valor ?? null,
      p_ciclo: c.ciclo ?? "mensal",
      p_trial_dias: c.trialDias ?? 7,
      p_trial_infinito: c.trialInfinito ?? false,
      p_cortesia: c.cortesia ?? false,
      p_status: c.status ?? "trial",
      p_origem: c.origem ?? null,
      p_responsavel: c.responsavel ?? null,
      p_observacao: c.observacao ?? null,
    });

export const definirPlano = (
  clinicaId: string, plano: string, valor: number | null, ciclo: string, status: string | null, motivo?: string,
) => chamar("plataforma_definir_plano", {
  p_clinica: clinicaId, p_plano: plano, p_valor: valor, p_ciclo: ciclo,
  p_status: status, p_motivo: motivo ?? null,
});

/** Três formas de dar mais teste: mais N dias, até uma data, ou sem prazo. */
export const estenderTrial = (
  clinicaId: string, opcoes: { dias?: number; ate?: string; infinito?: boolean }, motivo?: string,
) => chamar("plataforma_estender_trial", {
  p_clinica: clinicaId,
  p_dias: opcoes.dias ?? null,
  p_ate: opcoes.ate ?? null,
  p_infinito: opcoes.infinito ?? null,
  p_motivo: motivo ?? null,
});

export const definirCortesia = (clinicaId: string, cortesia: boolean, motivo?: string) =>
  chamar("plataforma_definir_cortesia", { p_clinica: clinicaId, p_cortesia: cortesia, p_motivo: motivo ?? null });

export const bloquear = (clinicaId: string, bloquear: boolean, motivo?: string) =>
  chamar("plataforma_bloquear", { p_clinica: clinicaId, p_bloquear: bloquear, p_motivo: motivo ?? null });

export const anotarConta = (clinicaId: string, observacao: string, origem?: string, responsavel?: string) =>
  chamar("plataforma_anotar_conta", {
    p_clinica: clinicaId, p_observacao: observacao,
    p_origem: origem ?? null, p_responsavel: responsavel ?? null,
  });

export interface DadosLead {
  id?: string;
  nome?: string; email?: string; telefone?: string;
  clinicaNome?: string; cidade?: string; estado?: string;
  cadeiras?: number | null; profissionais?: number | null;
  planoInteresse?: string; origem?: string; campanha?: string;
  mensagem?: string; status?: string; observacao?: string;
}

export const salvarLead = (l: DadosLead) =>
  chamar<LeadPlataforma>("plataforma_lead_salvar", {
    p_id: l.id ?? null,
    p_nome: l.nome ?? null,
    p_email: l.email ?? null,
    p_telefone: l.telefone ?? null,
    p_clinica_nome: l.clinicaNome ?? null,
    p_cidade: l.cidade ?? null,
    p_estado: l.estado ?? null,
    p_cadeiras: l.cadeiras ?? null,
    p_profissionais: l.profissionais ?? null,
    p_plano_interesse: l.planoInteresse ?? null,
    p_origem: l.origem ?? null,
    p_campanha: l.campanha ?? null,
    p_mensagem: l.mensagem ?? null,
    p_status: l.status ?? null,
    p_observacao: l.observacao ?? null,
  });

export const converterLead = (
  leadId: string,
  c: { plano?: string; valor?: number | null; ciclo?: string; trialDias?: number; trialInfinito?: boolean; cortesia?: boolean; status?: string } = {},
) => chamar<{ clinica_id: string; codigo: string; convite_token: string | null }>("plataforma_converter_lead", {
  p_lead: leadId,
  p_plano: c.plano ?? "trial",
  p_valor: c.valor ?? null,
  p_ciclo: c.ciclo ?? "mensal",
  p_trial_dias: c.trialDias ?? 7,
  p_trial_infinito: c.trialInfinito ?? false,
  p_cortesia: c.cortesia ?? false,
  p_status: c.status ?? "trial",
});

export const salvarMembro = (email: string, papel: string, ativo = true) =>
  chamar<MembroPlataforma>("plataforma_membro_salvar", { p_email: email, p_papel: papel, p_ativo: ativo });

// ------------------------------------------------------------------ rótulos
// Nada de termo de banco na tela: 'ativa' vira "Pagando", 'atrasada' vira
// "Em atraso". Quem lê é gente, não o esquema.

export const PLANOS_SAAS = [
  { id: "trial", nome: "Teste grátis" },
  { id: "essencial", nome: "Essencial" },
  { id: "profissional", nome: "Profissional" },
  { id: "premium", nome: "Premium" },
] as const;

export const CICLOS = [
  { id: "mensal", nome: "Mensal", meses: 1 },
  { id: "trimestral", nome: "Trimestral", meses: 3 },
  { id: "semestral", nome: "Semestral", meses: 6 },
  { id: "anual", nome: "Anual", meses: 12 },
] as const;

export const STATUS_ASSINATURA = [
  { id: "trial", nome: "Em teste" },
  { id: "ativa", nome: "Pagando" },
  { id: "atrasada", nome: "Em atraso" },
  { id: "cancelada", nome: "Cancelada" },
] as const;

export const STATUS_LEAD = [
  { id: "novo", nome: "Novo" },
  { id: "contatado", nome: "Contatado" },
  { id: "qualificado", nome: "Qualificado" },
  { id: "convertido", nome: "Virou cliente" },
  { id: "perdido", nome: "Perdido" },
] as const;

const acheNome = (lista: ReadonlyArray<{ id: string; nome: string }>, id: string | null | undefined) =>
  lista.find((x) => x.id === id)?.nome ?? id ?? "—";

export const rotuloPlano = (id: string | null) => acheNome(PLANOS_SAAS, id);
export const rotuloCiclo = (id: string | null) => acheNome(CICLOS, id);
export const rotuloStatus = (id: string | null) => acheNome(STATUS_ASSINATURA, id);
export const rotuloLead = (id: string | null) => acheNome(STATUS_LEAD, id);

export const CLASSE_STATUS: Record<string, string> = {
  ativa: "bg-emerald-50 text-emerald-700 border-emerald-200",
  trial: "bg-sky-50 text-sky-700 border-sky-200",
  atrasada: "bg-amber-50 text-amber-700 border-amber-200",
  cancelada: "bg-gray-100 text-gray-600 border-gray-200",
};

export const CLASSE_LEAD: Record<string, string> = {
  novo: "bg-sky-50 text-sky-700 border-sky-200",
  contatado: "bg-violet-50 text-violet-700 border-violet-200",
  qualificado: "bg-amber-50 text-amber-700 border-amber-200",
  convertido: "bg-emerald-50 text-emerald-700 border-emerald-200",
  perdido: "bg-gray-100 text-gray-600 border-gray-200",
};

// ------------------------------------------------------------------ formato

export const dinheiro = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 12.400 em vez de R$ 12.400,00 — cabe no cartão de indicador. */
export const dinheiroCurto = (v: number | null | undefined) => {
  const n = v ?? 0;
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return dinheiro(n);
};

export const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

export const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  }) : "—";

/** "há 3 dias" / "hoje" / "nunca entrou" — leitura rápida de atividade. */
export const desdeQuando = (iso: string | null) => {
  if (!iso) return "nunca entrou";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
};

/** Como o teste aparece na tela, já resolvendo infinito/vencido. */
export function textoTrial(c: Pick<ClinicaPlataforma, "trial_infinito" | "trial_termina_em" | "dias_trial" | "cortesia">) {
  if (c.cortesia) return { texto: "Cortesia", tom: "text-violet-700" };
  if (c.trial_infinito) return { texto: "Teste sem prazo", tom: "text-violet-700" };
  if (c.trial_termina_em == null || c.dias_trial == null) return { texto: "—", tom: "text-gray-500" };
  if (c.dias_trial < 0) return { texto: `Venceu há ${Math.abs(c.dias_trial)} d`, tom: "text-red-600" };
  if (c.dias_trial === 0) return { texto: "Vence hoje", tom: "text-red-600" };
  if (c.dias_trial <= 7) return { texto: `${c.dias_trial} dias`, tom: "text-amber-700" };
  return { texto: `${c.dias_trial} dias`, tom: "text-gray-600" };
}
