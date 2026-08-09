import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// ============================================================================
// Serviço da Agenda — leitura e escrita da tabela `consultas`
// ----------------------------------------------------------------------------
// Toda função recebe `clinicaId` explicitamente em vez de resolver o tenant aqui:
// o serviço não é um hook e não pode assinar o contexto. Quem chama já tem o
// clinicaId do useTenant() e é obrigado a passá-lo — assim não existe caminho
// silencioso que consulte o banco sem filtro de clínica.
//
// `profiles` NÃO é embutido nas queries de consulta: a tabela tem duas FKs para
// profiles (profissional_id e criado_por) e o PostgREST recusa o embed ambíguo.
// Os profissionais vêm em lista separada e o join é feito em memória.
// ============================================================================

export type StatusConsulta = Database["public"]["Enums"]["status_consulta"];
export type ModalidadeAtendimento = Database["public"]["Enums"]["modalidade_atendimento"];

export type TipoAgendamento = Database["public"]["Enums"]["tipo_agendamento"];

export interface RotuloAgenda {
  id: string;
  nome: string;
  cor: string;
}

export interface ConsultaAgenda {
  id: string;
  /** `compromisso` é bloco interno: não tem paciente nem procedimento. */
  tipo: TipoAgendamento;
  inicio: string;
  fim: string;
  status: StatusConsulta;
  modalidade: ModalidadeAtendimento;
  titulo: string | null;
  observacoes: string | null;
  valor: number;
  desconto: number;
  total: number | null;
  paciente_id: string | null;
  profissional_id: string;
  servico_id: string | null;
  cadeira_id: string | null;
  /** Orçamento gerado a partir deste atendimento (venda nascida na agenda). */
  orcamento_id: string | null;
  pacientes: { nome_completo: string } | null;
  rotulos: RotuloAgenda[];
}

export interface BloqueioAgenda {
  id: string;
  inicio: string;
  fim: string;
  motivo: string | null;
  profissional_id: string | null;
}

export interface ProfissionalAgenda {
  id: string;
  full_name: string | null;
  especialidade: string | null;
}

export interface CadeiraAgenda {
  id: string;
  nome: string;
  cor: string | null;
}

export interface ProcedimentoAgenda {
  id: string;
  nome: string;
  cor: string;
  duracao_min: number;
  valor: number;
}

export interface PacienteOpcao {
  id: string;
  nome_completo: string;
}

export interface DisponibilidadeAgenda {
  profissional_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  intervalo_slot_min: number;
}

// ------------------------------------------------------------------ rótulos

export const STATUS_CONSULTA_LABEL: Record<StatusConsulta, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  reagendado: "Reagendado",
  desmarcado: "Desmarcado",
  recusado: "Recusado",
  nao_compareceu: "Não compareceu",
  cancelado: "Cancelado",
  cancelado_pelo_cliente: "Cancelado pelo paciente",
};

/** Classes Tailwind do badge. Literais — classe montada em runtime não é gerada. */
export const STATUS_CONSULTA_CLASSE: Record<StatusConsulta, string> = {
  pendente: "bg-amber-100 text-amber-800 border-0",
  agendado: "bg-sky-100 text-sky-800 border-0",
  confirmado: "bg-emerald-100 text-emerald-800 border-0",
  em_atendimento: "bg-violet-100 text-violet-800 border-0",
  concluido: "bg-teal-100 text-teal-800 border-0",
  reagendado: "bg-indigo-100 text-indigo-800 border-0",
  desmarcado: "bg-orange-100 text-orange-800 border-0",
  recusado: "bg-red-100 text-red-800 border-0",
  nao_compareceu: "bg-rose-100 text-rose-800 border-0",
  cancelado: "bg-gray-100 text-gray-600 border-0",
  cancelado_pelo_cliente: "bg-gray-100 text-gray-600 border-0",
};

/** Cor sólida (hex) do status — usada na bolinha da legenda e na borda do bloco. */
export const STATUS_CONSULTA_COR: Record<StatusConsulta, string> = {
  pendente: "#f59e0b",
  agendado: "#0ea5e9",
  confirmado: "#059669",
  em_atendimento: "#7c3aed",
  concluido: "#0d9488",
  reagendado: "#4f46e5",
  desmarcado: "#ea580c",
  recusado: "#dc2626",
  nao_compareceu: "#e11d48",
  cancelado: "#9ca3af",
  cancelado_pelo_cliente: "#9ca3af",
};

export const STATUS_CONSULTA_ORDEM: StatusConsulta[] = [
  "pendente", "agendado", "confirmado", "em_atendimento", "concluido",
  "reagendado", "desmarcado", "recusado", "nao_compareceu",
  "cancelado", "cancelado_pelo_cliente",
];

/** Status em que a cadeira volta a ficar livre — não conta como ocupação. */
export const STATUS_INATIVOS: StatusConsulta[] = [
  "desmarcado", "recusado", "nao_compareceu", "cancelado", "cancelado_pelo_cliente",
];

export const MODALIDADE_LABEL: Record<ModalidadeAtendimento, string> = {
  presencial: "Presencial",
  online: "Online",
  domiciliar: "Domiciliar",
};

export const COR_PADRAO_PROCEDIMENTO = "#4ade80";

// ------------------------------------------------------------------ tempo

/** "07:30:00" → 450. Aceita "07:30". */
export function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

/** 450 → "07:30". */
export function minutosParaHora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutos decorridos desde a meia-noite local da própria data. */
export function minutosDoDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export interface FaixaHoraria {
  inicioMin: number;
  fimMin: number;
  slotMin: number;
}

export const FAIXA_PADRAO: FaixaHoraria = { inicioMin: 7 * 60, fimMin: 21 * 60, slotMin: 30 };

/**
 * Envelope horário que a grade precisa cobrir: do primeiro minuto em que alguém
 * atende até o último. Sem disponibilidade cadastrada cai no padrão 07:00–21:00,
 * senão a clínica recém-criada abriria uma grade de altura zero.
 */
export function faixaDeDisponibilidades(disps: DisponibilidadeAgenda[]): FaixaHoraria {
  if (!disps.length) return FAIXA_PADRAO;
  let inicioMin = 24 * 60;
  let fimMin = 0;
  let slotMin = 60;
  for (const d of disps) {
    inicioMin = Math.min(inicioMin, horaParaMinutos(d.hora_inicio));
    fimMin = Math.max(fimMin, horaParaMinutos(d.hora_fim));
    slotMin = Math.min(slotMin, d.intervalo_slot_min || 30);
  }
  if (fimMin <= inicioMin) return FAIXA_PADRAO;
  // arredonda pra hora cheia pros rótulos da régua não ficarem quebrados
  return {
    inicioMin: Math.floor(inicioMin / 60) * 60,
    fimMin: Math.ceil(fimMin / 60) * 60,
    slotMin: slotMin > 0 && slotMin <= 60 ? slotMin : 30,
  };
}

// ------------------------------------------------------------------ leitura

const CAMPOS_CONSULTA =
  "id, tipo, inicio, fim, status, modalidade, titulo, observacoes, valor, desconto, total, " +
  "paciente_id, profissional_id, servico_id, cadeira_id, orcamento_id, pacientes(nome_completo), " +
  "consulta_rotulos(agenda_rotulos(id, nome, cor))";

/**
 * Consultas que ENCOSTAM no intervalo, não só as que começam nele: uma consulta
 * das 17h50 às 18h20 tem que aparecer na grade que termina 18h.
 */
export async function listarConsultas(
  clinicaId: string,
  inicio: Date,
  fim: Date,
  filtros?: { profissionalId?: string | null; cadeiraId?: string | null },
): Promise<ConsultaAgenda[]> {
  let q = supabase
    .from("consultas")
    .select(CAMPOS_CONSULTA)
    .eq("clinica_id", clinicaId)
    .lt("inicio", fim.toISOString())
    .gt("fim", inicio.toISOString())
    .order("inicio", { ascending: true });

  if (filtros?.profissionalId) q = q.eq("profissional_id", filtros.profissionalId);
  if (filtros?.cadeiraId) q = q.eq("cadeira_id", filtros.cadeiraId);

  const { data, error } = await q;
  if (error) throw error;

  // PostgREST devolve a junção aninhada; a grade quer uma lista plana de rótulos.
  return (data ?? []).map((c: any) => ({
    ...c,
    rotulos: (c.consulta_rotulos ?? [])
      .map((r: any) => r.agenda_rotulos)
      .filter(Boolean) as RotuloAgenda[],
  })) as unknown as ConsultaAgenda[];
}

/** `.or()` monta filtro PostgREST por string: só entra id que é UUID de verdade. */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listarBloqueios(
  clinicaId: string,
  inicio: Date,
  fim: Date,
  profissionalId?: string | null,
): Promise<BloqueioAgenda[]> {
  let q = supabase
    .from("bloqueios_agenda")
    .select("id, inicio, fim, motivo, profissional_id")
    .eq("clinica_id", clinicaId)
    .lt("inicio", fim.toISOString())
    .gt("fim", inicio.toISOString())
    .order("inicio", { ascending: true });

  // bloqueio sem profissional vale pra clínica inteira — vale pro filtrado também
  if (profissionalId && RE_UUID.test(profissionalId)) {
    q = q.or(`profissional_id.is.null,profissional_id.eq.${profissionalId}`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BloqueioAgenda[];
}

export async function listarProfissionaisAgenda(clinicaId: string): Promise<ProfissionalAgenda[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, especialidade")
    .eq("clinica_id", clinicaId)
    .in("role", ["admin", "professional"])
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as ProfissionalAgenda[];
}

export async function listarCadeiras(clinicaId: string): Promise<CadeiraAgenda[]> {
  const { data, error } = await supabase
    .from("cadeiras")
    .select("id, nome, cor")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as CadeiraAgenda[];
}

export async function listarProcedimentosAgenda(clinicaId: string): Promise<ProcedimentoAgenda[]> {
  const { data, error } = await supabase
    .from("procedimentos")
    .select("id, nome, cor, duracao_min, valor")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as ProcedimentoAgenda[];
}

export async function listarPacientesOpcoes(clinicaId: string): Promise<PacienteOpcao[]> {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, nome_completo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome_completo")
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as PacienteOpcao[];
}

export async function listarDisponibilidades(clinicaId: string): Promise<DisponibilidadeAgenda[]> {
  const { data, error } = await supabase
    .from("disponibilidades")
    .select("profissional_id, dia_semana, hora_inicio, hora_fim, intervalo_slot_min")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true);
  if (error) throw error;
  return (data ?? []) as DisponibilidadeAgenda[];
}

// ------------------------------------------------------------------ escrita

export interface EntradaConsulta {
  clinicaId: string;
  tipo: TipoAgendamento;
  /** Obrigatório em `consulta`; tem que ser null em `compromisso`. */
  pacienteId: string | null;
  profissionalId: string;
  servicoId: string | null;
  cadeiraId: string | null;
  inicio: Date;
  fim: Date;
  modalidade: ModalidadeAtendimento;
  status: StatusConsulta;
  valor: number;
  titulo: string | null;
  observacoes: string | null;
  rotuloIds: string[];
}

/**
 * O banco tem CHECK garantindo a coerência (consulta↔paciente,
 * compromisso↔sem paciente). Aqui a mesma regra vira mensagem legível, em vez
 * de deixar o Postgres devolver "violates check constraint" na cara do usuário.
 */
function normalizar(e: EntradaConsulta) {
  const compromisso = e.tipo === "compromisso";
  if (compromisso && !e.titulo?.trim()) {
    throw new Error("Dê um nome ao compromisso (ex.: Reunião de equipe).");
  }
  if (!compromisso && !e.pacienteId) {
    throw new Error("Selecione o paciente do atendimento.");
  }
  return {
    tipo: e.tipo,
    paciente_id: compromisso ? null : e.pacienteId,
    servico_id: compromisso ? null : e.servicoId,
    profissional_id: e.profissionalId,
    cadeira_id: e.cadeiraId,
    inicio: e.inicio.toISOString(),
    fim: e.fim.toISOString(),
    modalidade: e.modalidade,
    status: e.status,
    valor: compromisso ? 0 : e.valor,
    titulo: e.titulo?.trim() || null,
    observacoes: e.observacoes,
  };
}

export async function criarConsulta(e: EntradaConsulta): Promise<string> {
  const { data, error } = await supabase
    .from("consultas")
    .insert({ clinica_id: e.clinicaId, origem: "interno", ...normalizar(e) })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  // insert que não devolve linha = RLS barrou o SELECT de volta. Sem isso a tela
  // dizia "Consulta agendada" com id undefined e o usuário confiava numa gravação
  // que pode não ter acontecido.
  if (!data?.id) throw new Error("A consulta não pôde ser confirmada pelo servidor.");

  await sincronizarRotulos(e.clinicaId, data.id, e.rotuloIds);
  return data.id;
}

/**
 * `clinica_id` viaja junto do `id` em todo update/delete. O RLS já barra o
 * cruzamento de tenant, mas um id vazado não pode virar escrita em outra clínica
 * caso alguma policy afrouxe — mesma convenção de `services/procedimentos.ts`.
 */
export async function atualizarConsulta(
  clinicaId: string,
  id: string,
  e: EntradaConsulta,
): Promise<void> {
  const { error } = await supabase
    .from("consultas")
    .update(normalizar(e))
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;

  await sincronizarRotulos(clinicaId, id, e.rotuloIds);
}

// ------------------------------------------------------------------ rótulos

export async function listarRotulosAgenda(clinicaId: string): Promise<RotuloAgenda[]> {
  const { data, error } = await supabase
    .from("agenda_rotulos")
    .select("id, nome, cor")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as RotuloAgenda[];
}

/**
 * Reconcilia os rótulos do agendamento: remove só o que saiu e insere só o que
 * entrou. Apagar tudo e reinserir perderia o histórico de `created_at` e geraria
 * escrita desnecessária a cada salvamento.
 */
export async function sincronizarRotulos(
  clinicaId: string,
  consultaId: string,
  desejados: string[],
): Promise<void> {
  const alvo = [...new Set(desejados)];

  const { data: atuais, error: erroLer } = await supabase
    .from("consulta_rotulos")
    .select("rotulo_id")
    .eq("consulta_id", consultaId)
    .eq("clinica_id", clinicaId);
  if (erroLer) throw erroLer;

  const tinha = (atuais ?? []).map((r) => r.rotulo_id);
  const remover = tinha.filter((id) => !alvo.includes(id));
  const inserir = alvo.filter((id) => !tinha.includes(id));

  if (remover.length) {
    const { error } = await supabase
      .from("consulta_rotulos")
      .delete()
      .eq("consulta_id", consultaId)
      .eq("clinica_id", clinicaId)
      .in("rotulo_id", remover);
    if (error) throw error;
  }

  if (inserir.length) {
    // clinica_id é sobrescrito pelo trigger de coerência no banco; mandamos o
    // valor mesmo assim porque a policy de INSERT é avaliada antes do trigger.
    const { error } = await supabase.from("consulta_rotulos").insert(
      inserir.map((rotulo_id) => ({ clinica_id: clinicaId, consulta_id: consultaId, rotulo_id })),
    );
    if (error) throw error;
  }
}

// ------------------------------------------------------------------ venda

export interface ItemVenda {
  procedimento_id: string;
  dente?: number | null;
  quantidade?: number;
  valor_unitario?: number | null;
  desconto?: number;
}

/**
 * Lança os procedimentos executados no atendimento como orçamento aprovado do
 * paciente — é o caminho "vender pela agenda". Retorna o id do orçamento para a
 * tela poder levar o usuário direto ao fechamento financeiro.
 */
export async function lancarVendaNaConsulta(
  consultaId: string,
  itens: ItemVenda[],
): Promise<string> {
  const { data, error } = await supabase.rpc("consulta_lancar_venda", {
    p_consulta_id: consultaId,
    p_itens: itens as unknown as never,
  });
  if (error) throw error;
  if (!data) throw new Error("A venda não pôde ser confirmada pelo servidor.");
  return data as string;
}

export async function excluirConsulta(clinicaId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("consultas")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

/**
 * Um profissional não se desdobra: recusa o agendamento se já existe outra
 * consulta VIVA dele no mesmo intervalo. Checagem no servidor (e não só na
 * grade carregada) porque a tela pode estar exibindo outro dia/filtro.
 */
export async function conflitoDeProfissional(
  clinicaId: string,
  profissionalId: string,
  inicio: Date,
  fim: Date,
  ignorarConsultaId?: string,
): Promise<ConsultaAgenda | null> {
  let q = supabase
    .from("consultas")
    .select(CAMPOS_CONSULTA)
    .eq("clinica_id", clinicaId)
    .eq("profissional_id", profissionalId)
    .lt("inicio", fim.toISOString())
    .gt("fim", inicio.toISOString())
    .not("status", "in", `(${STATUS_INATIVOS.join(",")})`)
    .limit(1);

  if (ignorarConsultaId) q = q.neq("id", ignorarConsultaId);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? [])[0] as unknown as ConsultaAgenda) ?? null;
}

/**
 * A grade desenha o bloqueio com `cursor-not-allowed`, mas o dialog gravava por
 * cima dele sem reclamar — a tela dizia "fechado" e o banco dizia "ok". Aqui a
 * regra é a mesma que `slots_disponiveis()` aplica no servidor: bloqueio da
 * clínica inteira (profissional nulo) ou do próprio profissional derruba o horário.
 */
export async function bloqueioNoIntervalo(
  clinicaId: string,
  profissionalId: string,
  inicio: Date,
  fim: Date,
): Promise<BloqueioAgenda | null> {
  let q = supabase
    .from("bloqueios_agenda")
    .select("id, inicio, fim, motivo, profissional_id")
    .eq("clinica_id", clinicaId)
    .lt("inicio", fim.toISOString())
    .gt("fim", inicio.toISOString())
    .limit(1);

  if (RE_UUID.test(profissionalId)) {
    q = q.or(`profissional_id.is.null,profissional_id.eq.${profissionalId}`);
  } else {
    q = q.is("profissional_id", null);
  }

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? [])[0] as BloqueioAgenda) ?? null;
}
