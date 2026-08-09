import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { MODALIDADE_LABEL, type ModalidadeAtendimento } from "@/services/agenda";

// ============================================================================
// Serviço de Disponibilidade — cadeiras, grade semanal e bloqueios
// ----------------------------------------------------------------------------
// As três tabelas daqui são a INFRAESTRUTURA da agenda: `cadeiras` diz onde o
// atendimento cabe, `disponibilidades` diz quando o profissional trabalha e
// `bloqueios_agenda` diz quando ele não trabalha apesar da grade. A RPC
// slots_disponiveis() é quem cruza as três — por isso a tela de horários tem um
// botão que a chama de verdade: é o único jeito honesto de provar que a
// configuração salva produz horário agendável.
//
// Nenhuma regra de conflito é reimplementada aqui. Quem impede dois pacientes
// na mesma cadeira no mesmo horário é a constraint de exclusão GiST
// `consultas_cadeira_sem_sobreposicao` no banco. O front só traduz o erro.
// ============================================================================

export type Cadeira = Database["public"]["Tables"]["cadeiras"]["Row"];
export type Disponibilidade = Database["public"]["Tables"]["disponibilidades"]["Row"];
export type Bloqueio = Database["public"]["Tables"]["bloqueios_agenda"]["Row"];

export type { ModalidadeAtendimento };
export { MODALIDADE_LABEL };

export const MODALIDADES: ModalidadeAtendimento[] = ["presencial", "online", "domiciliar"];

// ------------------------------------------------------------------ rótulos

export interface DiaSemana {
  valor: number;
  rotulo: string;
  curto: string;
}

/** Índice igual ao `extract(dow)` do Postgres e ao `Date.getDay()` do JS: 0 = domingo. */
export const DIAS_SEMANA: DiaSemana[] = [
  { valor: 0, rotulo: "Domingo", curto: "Dom" },
  { valor: 1, rotulo: "Segunda-feira", curto: "Seg" },
  { valor: 2, rotulo: "Terça-feira", curto: "Ter" },
  { valor: 3, rotulo: "Quarta-feira", curto: "Qua" },
  { valor: 4, rotulo: "Quinta-feira", curto: "Qui" },
  { valor: 5, rotulo: "Sexta-feira", curto: "Sex" },
  { valor: 6, rotulo: "Sábado", curto: "Sáb" },
];

/** Espelha `disponibilidades_intervalo_slot_min_check` (5..240). */
export const SLOT_MIN = 5;
export const SLOT_MAX = 240;

export const COR_PADRAO_CADEIRA = "#10b981";

/** Paleta de atalho do seletor de cor. Precisa casar com `cadeiras_cor_check` (#RRGGBB). */
export const PALETA_CADEIRAS = [
  "#10b981", "#0ea5e9", "#6366f1", "#a855f7",
  "#f59e0b", "#ef4444", "#14b8a6", "#64748b",
];

export const REGEX_COR_HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * O CHECK do banco é `cor is null or cor ~ '^#[0-9A-Fa-f]{6}$'` — string vazia
 * NÃO passa. Como o campo de texto do formulário devolve "" quando o usuário
 * apaga a cor, sem esta normalização o save morria com 23514 em vez de gravar
 * "sem cor". Espaço em volta também quebra o regex, então some aqui.
 */
export function normalizarCor(cor: string | null | undefined): string | null {
  const v = (cor ?? "").trim();
  return v === "" ? null : v;
}

// ------------------------------------------------------------------ erros

/**
 * Traduz os códigos SQLSTATE que este módulo consegue provocar. Sem isso o
 * usuário lê "duplicate key value violates unique constraint" na tela.
 */
export function traduzirErro(e: unknown, padrao: string): string {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return padrao;
  switch (err.code) {
    case "23505":
      return "Já existe uma cadeira com esse nome nesta clínica.";
    case "23514":
      return "Valor fora do permitido pelas regras do banco. Revise horários, intervalo e cor.";
    case "23P01":
      return "Conflito de horário: o período escolhido já está ocupado.";
    case "23503":
      return "Registro vinculado a outro cadastro. Remova os vínculos antes.";
    case "42501":
      return "Você não tem permissão para esta ação nesta clínica.";
    default:
      return err.message || padrao;
  }
}

// ------------------------------------------------------------------ tempo

/** "07:30:00" → "07:30". O input type="time" não aceita o segundo bem em todo browser. */
export function hhmm(hora: string | null | undefined): string {
  if (!hora) return "";
  return hora.slice(0, 5);
}

/** Data local de hoje em "YYYY-MM-DD" (toISOString devolveria o dia em UTC). */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** timestamptz do banco → valor de `<input type="datetime-local">` no fuso do usuário. */
export function paraInputLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de `<input type="datetime-local">` (sempre lido como hora local) → ISO UTC. */
export function deInputLocal(valor: string): string {
  return new Date(valor).toISOString();
}

export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "07:30" → 450. Usado só para comparar início/fim. */
function minutosDaHora(hora: string): number {
  const [h, m] = hhmm(hora).split(":");
  return Number(h) * 60 + Number(m || 0);
}

// ------------------------------------------------------------------ cadeiras

export interface DadosCadeira {
  nome: string;
  cor: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export async function listarCadeiras(clinicaId: string): Promise<Cadeira[]> {
  const { data, error } = await supabase
    .from("cadeiras")
    .select("*")
    .eq("clinica_id", clinicaId)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as Cadeira[];
}

export async function criarCadeira(clinicaId: string, d: DadosCadeira): Promise<Cadeira | null> {
  const { data, error } = await supabase
    .from("cadeiras")
    .insert({
      clinica_id: clinicaId,
      nome: d.nome.trim(),
      cor: normalizarCor(d.cor),
      observacoes: d.observacoes?.trim() || null,
      ativo: d.ativo,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as Cadeira) ?? null;
}

// As mutações abaixo recebem `clinicaId` e filtram por ele além do id. A RLS
// (`apply_tenant_rls`) já barra tenant cruzado, mas o filtro explícito garante
// que um id vindo de estado velho/adulterado no cliente nunca vire UPDATE ou
// DELETE fora da clínica em foco, mesmo que a policy seja afrouxada um dia.

export async function atualizarCadeira(clinicaId: string, id: string, d: DadosCadeira): Promise<void> {
  const { error } = await supabase
    .from("cadeiras")
    .update({
      nome: d.nome.trim(),
      cor: normalizarCor(d.cor),
      observacoes: d.observacoes?.trim() || null,
      ativo: d.ativo,
    })
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

export async function alternarAtivoCadeira(clinicaId: string, id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from("cadeiras")
    .update({ ativo })
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

export async function excluirCadeira(clinicaId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("cadeiras")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

/**
 * Quantas consultas apontam para a cadeira. A FK é ON DELETE SET NULL, então
 * excluir não apaga histórico — mas deixa essas consultas sem sala, e o usuário
 * precisa saber disso ANTES de confirmar.
 */
export async function contarConsultasDaCadeira(clinicaId: string, cadeiraId: string): Promise<number> {
  const { count, error } = await supabase
    .from("consultas")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", clinicaId)
    .eq("cadeira_id", cadeiraId);
  if (error) throw error;
  return count ?? 0;
}

export function validarCadeira(d: DadosCadeira): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.nome.trim()) e.nome = "Informe o nome da cadeira.";
  else if (d.nome.trim().length > 80) e.nome = "Máximo de 80 caracteres.";
  const cor = normalizarCor(d.cor);
  if (cor && !REGEX_COR_HEX.test(cor)) e.cor = "Use o formato #RRGGBB.";
  return e;
}

// ------------------------------------------------------------ disponibilidades

/** Uma faixa de atendimento de um dia. `id` nulo = ainda não existe no banco. */
export interface FaixaDisponibilidade {
  id: string | null;
  dia_semana: number;
  ativo: boolean;
  hora_inicio: string;
  hora_fim: string;
  intervalo_slot_min: number;
  modalidades: ModalidadeAtendimento[];
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
}

export function faixaPadrao(dia: number): FaixaDisponibilidade {
  return {
    id: null,
    dia_semana: dia,
    ativo: false,
    hora_inicio: "08:00",
    hora_fim: "18:00",
    intervalo_slot_min: 30,
    modalidades: ["presencial"],
    vigencia_inicio: null,
    vigencia_fim: null,
  };
}

export async function listarDisponibilidades(
  clinicaId: string,
  profissionalId: string,
): Promise<Disponibilidade[]> {
  const { data, error } = await supabase
    .from("disponibilidades")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("profissional_id", profissionalId)
    .order("dia_semana")
    .order("hora_inicio");
  if (error) throw error;
  return (data ?? []) as Disponibilidade[];
}

/** Linha do banco → forma editável pela grade. */
export function paraFaixa(d: Disponibilidade): FaixaDisponibilidade {
  return {
    id: d.id,
    dia_semana: d.dia_semana,
    ativo: d.ativo,
    hora_inicio: hhmm(d.hora_inicio),
    hora_fim: hhmm(d.hora_fim),
    intervalo_slot_min: d.intervalo_slot_min,
    modalidades: (d.modalidades ?? ["presencial"]) as ModalidadeAtendimento[],
    vigencia_inicio: d.vigencia_inicio,
    vigencia_fim: d.vigencia_fim,
  };
}

/** Espelha os CHECK de `disponibilidades` para o erro nascer no campo, não num 400. */
export function validarFaixa(f: FaixaDisponibilidade): string | null {
  if (!f.hora_inicio || !f.hora_fim) return "Preencha início e fim.";
  if (minutosDaHora(f.hora_fim) <= minutosDaHora(f.hora_inicio))
    return "O fim precisa ser depois do início.";
  if (!Number.isFinite(f.intervalo_slot_min) || f.intervalo_slot_min < SLOT_MIN || f.intervalo_slot_min > SLOT_MAX)
    return `O intervalo deve ficar entre ${SLOT_MIN} e ${SLOT_MAX} minutos.`;
  if (!f.modalidades.length) return "Escolha ao menos uma modalidade.";
  if (f.vigencia_inicio && f.vigencia_fim && f.vigencia_fim < f.vigencia_inicio)
    return "O fim da vigência não pode ser antes do início.";
  return null;
}

/**
 * Duas faixas ATIVAS do mesmo dia que se cruzam não são erro para o banco (não
 * existe constraint disso), mas a RPC lê as duas e gera o mesmo horário duas
 * vezes. Por isso isto é AVISO na tela, não bloqueio de salvamento: quem já tem
 * grade sobreposta gravada continua conseguindo salvar o resto.
 */
export function faixasSobrepostas(faixas: FaixaDisponibilidade[]): boolean {
  const ativas = faixas
    .filter((f) => f.ativo && f.hora_inicio && f.hora_fim)
    .map((f) => ({ ini: minutosDaHora(f.hora_inicio), fim: minutosDaHora(f.hora_fim) }))
    .sort((a, b) => a.ini - b.ini);
  for (let i = 1; i < ativas.length; i++) {
    if (ativas[i].ini < ativas[i - 1].fim) return true;
  }
  return false;
}

/**
 * Salva a grade inteira em diff: atualiza o que já tem id, insere o que é novo
 * e ativo, apaga o que o usuário removeu na tela. Faixa nova e desligada é
 * descartada — não vale criar linha morta no banco só porque o card existia.
 */
export async function salvarGrade(
  clinicaId: string,
  profissionalId: string,
  faixas: FaixaDisponibilidade[],
  removidos: string[],
): Promise<void> {
  if (removidos.length) {
    const { error } = await supabase
      .from("disponibilidades")
      .delete()
      .in("id", removidos)
      .eq("clinica_id", clinicaId)
      .eq("profissional_id", profissionalId);
    if (error) throw error;
  }

  const novas = faixas.filter((f) => !f.id && f.ativo);
  if (novas.length) {
    const { error } = await supabase.from("disponibilidades").insert(
      novas.map((f) => ({
        clinica_id: clinicaId,
        profissional_id: profissionalId,
        dia_semana: f.dia_semana,
        ativo: f.ativo,
        hora_inicio: f.hora_inicio,
        hora_fim: f.hora_fim,
        intervalo_slot_min: f.intervalo_slot_min,
        modalidades: f.modalidades,
        vigencia_inicio: f.vigencia_inicio,
        vigencia_fim: f.vigencia_fim,
      })),
    );
    if (error) throw error;
  }

  for (const f of faixas) {
    if (!f.id) continue;
    const { error } = await supabase
      .from("disponibilidades")
      .update({
        dia_semana: f.dia_semana,
        ativo: f.ativo,
        hora_inicio: f.hora_inicio,
        hora_fim: f.hora_fim,
        intervalo_slot_min: f.intervalo_slot_min,
        modalidades: f.modalidades,
        vigencia_inicio: f.vigencia_inicio,
        vigencia_fim: f.vigencia_fim,
      })
      .eq("id", f.id)
      .eq("clinica_id", clinicaId)
      .eq("profissional_id", profissionalId);
    if (error) throw error;
  }
}

// ------------------------------------------------------------------ bloqueios

export interface DadosBloqueio {
  profissional_id: string | null;
  inicio: string;
  fim: string;
  motivo: string | null;
}

/**
 * `desde` corta o passado no servidor. O default lista só bloqueio que ainda
 * tem efeito — férias do ano passado não ajudam ninguém a configurar agenda.
 */
export async function listarBloqueios(
  clinicaId: string,
  opcoes?: { desde?: Date | null; limite?: number },
): Promise<Bloqueio[]> {
  let q = supabase
    .from("bloqueios_agenda")
    .select("*")
    .eq("clinica_id", clinicaId)
    .order("inicio", { ascending: true })
    .limit(opcoes?.limite ?? 200);

  if (opcoes?.desde) q = q.gte("fim", opcoes.desde.toISOString());

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Bloqueio[];
}

export async function criarBloqueio(clinicaId: string, d: DadosBloqueio): Promise<void> {
  const { error } = await supabase.from("bloqueios_agenda").insert({
    clinica_id: clinicaId,
    profissional_id: d.profissional_id,
    inicio: d.inicio,
    fim: d.fim,
    motivo: d.motivo?.trim() || null,
  });
  if (error) throw error;
}

export async function atualizarBloqueio(clinicaId: string, id: string, d: DadosBloqueio): Promise<void> {
  const { error } = await supabase
    .from("bloqueios_agenda")
    .update({
      profissional_id: d.profissional_id,
      inicio: d.inicio,
      fim: d.fim,
      motivo: d.motivo?.trim() || null,
    })
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

export async function excluirBloqueio(clinicaId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("bloqueios_agenda")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId);
  if (error) throw error;
}

/** Espelha o CHECK `bloqueio_periodo_valido` (fim > inicio). */
export function validarBloqueio(inicioLocal: string, fimLocal: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!inicioLocal) e.inicio = "Informe o início.";
  if (!fimLocal) e.fim = "Informe o fim.";
  if (inicioLocal && fimLocal && new Date(fimLocal) <= new Date(inicioLocal))
    e.fim = "O fim precisa ser depois do início.";
  return e;
}

// ------------------------------------------------------------------ slots

export interface Slot {
  inicio: string;
  fim: string;
}

/**
 * Chama a RPC que a agenda usa de verdade. Ela cruza disponibilidades, consultas
 * (com buffer do procedimento) e bloqueios — e só devolve slot no FUTURO, então
 * consultar uma data passada devolve lista vazia por definição.
 */
export async function buscarSlotsDisponiveis(
  profissionalId: string,
  data: string,
  servicoId?: string | null,
): Promise<Slot[]> {
  const args: { p_profissional_id: string; p_data: string; p_servico_id?: string } = {
    p_profissional_id: profissionalId,
    p_data: data,
  };
  if (servicoId) args.p_servico_id = servicoId;

  const { data: linhas, error } = await supabase.rpc("slots_disponiveis", args);
  if (error) throw error;
  return (linhas ?? []) as Slot[];
}
