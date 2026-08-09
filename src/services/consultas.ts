import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { brl } from "@/services/orcamentos";

// ============================================================================
// Serviço de Consultas — agenda operacional da clínica
// ----------------------------------------------------------------------------
// Três coisas do banco definem o desenho deste arquivo:
//
// 1. `consultas.total` é GENERATED ALWAYS AS (valor - desconto). Nunca pode ser
//    enviado no insert/update — o Postgres recusa. A UI mostra, o banco calcula.
// 2. Existem DOIS EXCLUDE constraints (gist) impedindo sobreposição de horário
//    por profissional e por cadeira, e eles só valem para os status que ocupam
//    agenda (pendente, agendado, confirmado, em_atendimento, concluido). Um
//    cancelamento libera o horário sozinho — não precisamos "liberar" nada.
// 3. Um trigger BEFORE UPDATE carimba confirmado_em / checkin_em / concluido_em /
//    cancelado_em conforme o novo status. Então mudar status = mandar só `status`.
// ============================================================================

export type StatusConsulta = Database["public"]["Enums"]["status_consulta"];
export type Modalidade = Database["public"]["Enums"]["modalidade_atendimento"];
export type TipoRecorrencia = Database["public"]["Enums"]["tipo_recorrencia"];

export { brl };

export const STATUS_ORDEM: StatusConsulta[] = [
  "pendente",
  "agendado",
  "confirmado",
  "em_atendimento",
  "concluido",
  "reagendado",
  "desmarcado",
  "recusado",
  "nao_compareceu",
  "cancelado",
  "cancelado_pelo_cliente",
];

export const STATUS_LABEL: Record<StatusConsulta, string> = {
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
  cancelado_pelo_cliente: "Cancelado pelo cliente",
};

/** Classes literais — Tailwind não gera classe montada em runtime. */
export const STATUS_CLASSE: Record<StatusConsulta, string> = {
  pendente: "bg-amber-100 text-amber-800 border-0",
  agendado: "bg-blue-100 text-blue-800 border-0",
  confirmado: "bg-emerald-100 text-emerald-800 border-0",
  em_atendimento: "bg-purple-100 text-purple-800 border-0",
  concluido: "bg-gray-100 text-gray-700 border-0",
  reagendado: "bg-sky-100 text-sky-800 border-0",
  desmarcado: "bg-orange-100 text-orange-800 border-0",
  recusado: "bg-red-100 text-red-800 border-0",
  nao_compareceu: "bg-pink-100 text-pink-800 border-0",
  cancelado: "bg-red-100 text-red-800 border-0",
  cancelado_pelo_cliente: "bg-red-100 text-red-800 border-0",
};

/** Macro-filtro do mercado: "Em aberto" = tudo que ainda vai acontecer. */
export const STATUS_EM_ABERTO: StatusConsulta[] = ["pendente", "agendado", "confirmado"];

/** Status que o banco considera como ocupando a agenda (EXCLUDE constraint). */
export const STATUS_OCUPAM_AGENDA: StatusConsulta[] = [
  "pendente", "agendado", "confirmado", "em_atendimento", "concluido",
];

/** Status terminais: não faz sentido oferecer check-in/concluir neles. */
export const STATUS_ENCERRADOS: StatusConsulta[] = [
  "concluido", "desmarcado", "recusado", "nao_compareceu",
  "cancelado", "cancelado_pelo_cliente",
];

export const STATUS_CANCELAMENTO: StatusConsulta[] = [
  "cancelado", "cancelado_pelo_cliente", "desmarcado", "recusado", "nao_compareceu",
];

export const MODALIDADE_LABEL: Record<Modalidade, string> = {
  presencial: "Presencial",
  online: "Online",
  domiciliar: "Domiciliar",
};

export const TIPO_RECORRENCIA_LABEL: Record<TipoRecorrencia, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

/** 0 = domingo, igual a `disponibilidades.dia_semana`. Rótulos em ordem SEG→DOM. */
export const DIAS_SEMANA: { valor: number; curto: string; longo: string }[] = [
  { valor: 1, curto: "SEG", longo: "Segunda" },
  { valor: 2, curto: "TER", longo: "Terça" },
  { valor: 3, curto: "QUA", longo: "Quarta" },
  { valor: 4, curto: "QUI", longo: "Quinta" },
  { valor: 5, curto: "SEX", longo: "Sexta" },
  { valor: 6, curto: "SÁB", longo: "Sábado" },
  { valor: 0, curto: "DOM", longo: "Domingo" },
];

// ---------------------------------------------------------------- tipos
export interface ConsultaLinha {
  id: string;
  inicio: string;
  fim: string;
  status: StatusConsulta;
  modalidade: Modalidade;
  valor: number;
  desconto: number;
  total: number | null;
  titulo: string | null;
  observacoes: string | null;
  motivo_cancelamento: string | null;
  recorrencia_id: string | null;
  paciente_id: string;
  profissional_id: string;
  servico_id: string | null;
  cadeira_id: string | null;
  pacientes: { id: string; nome_completo: string; celular: string | null } | null;
  profissional: { id: string; full_name: string | null } | null;
  procedimentos: { id: string; nome: string; duracao_min: number } | null;
  cadeiras: { id: string; nome: string } | null;
}

export interface FiltrosConsulta {
  status: StatusConsulta[];
  modalidade: Modalidade | null;
  profissionalId: string | null;
  servicoId: string | null;
  cadeiraId: string | null;
  paciente: string;
  dataInicial: string; // yyyy-MM-dd
  dataFinal: string;   // yyyy-MM-dd
}

export interface RegraRecorrencia {
  tipo: TipoRecorrencia;
  intervalo: number;
  qtdRepeticoes: number; // total de consultas da série, contando a primeira
  diasSemana: number[];
}

export interface EntradaConsulta {
  clinicaId: string;
  pacienteId: string;
  profissionalId: string;
  servicoId: string | null;
  cadeiraId: string | null;
  inicio: string; // ISO
  fim: string;    // ISO
  modalidade: Modalidade;
  status: StatusConsulta;
  valor: number;
  desconto: number;
  observacoes: string | null;
  criadoPor?: string | null;
}

// ---------------------------------------------------------------- erros
/**
 * Traduz o erro cru do Postgres para algo acionável na tela.
 * 23P01 = exclusion_violation: os dois EXCLUDE de sobreposição caem aqui, e só o
 * nome da constraint diz se o choque foi na agenda do profissional ou na cadeira.
 */
export function mensagemErroConsulta(e: any): string {
  const codigo: string = e?.code ?? "";
  const texto: string = `${e?.message ?? ""} ${e?.details ?? ""}`.toLowerCase();

  if (codigo === "23P01" || texto.includes("exclusion")) {
    if (texto.includes("cadeira")) {
      return "Já existe consulta nesse horário para esta cadeira.";
    }
    return "Já existe consulta nesse horário para este profissional.";
  }
  if (codigo === "23514") {
    if (texto.includes("desconto")) return "O desconto não pode ser maior que o valor.";
    if (texto.includes("periodo")) return "O horário final precisa ser depois do horário inicial.";
    return "Algum campo está fora das regras do cadastro.";
  }
  if (codigo === "23503") return "Paciente, profissional ou procedimento não existe mais.";
  if (codigo === "42501" || texto.includes("row-level security")) {
    return "Você não tem permissão para alterar esta consulta.";
  }
  return e?.message || "Erro inesperado ao falar com o servidor.";
}

/** Erro já traduzido — a UI joga `e.message` direto no toast. */
export class ErroConsulta extends Error {
  codigo?: string;
  constructor(bruto: any) {
    super(mensagemErroConsulta(bruto));
    this.codigo = bruto?.code;
  }
}

// ---------------------------------------------------------------- leitura
const SELECT_LINHA = `
  id, inicio, fim, status, modalidade, valor, desconto, total, titulo, observacoes,
  motivo_cancelamento, recorrencia_id, paciente_id, profissional_id, servico_id, cadeira_id,
  pacientes!inner(id, nome_completo, celular),
  profissional:profiles!consultas_profissional_id_fkey(id, full_name),
  procedimentos:servico_id(id, nome, duracao_min),
  cadeiras:cadeira_id(id, nome)
`;

/**
 * `inicio` é timestamptz. Mandar "2026-08-06T00:00:00" (sem offset) faz o Postgres
 * ler no fuso do servidor — UTC no Supabase — e o dia do usuário sai deslocado 3h
 * no Brasil: some consulta das 21h em diante e entra a véspera. Aqui o limite é
 * montado no fuso LOCAL e enviado com offset explícito.
 */
function limiteDoDia(dia: string, fimDoDia = false): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  if (!ano || !mes || !d) return dia;
  return fimDoDia
    ? new Date(ano, mes - 1, d, 23, 59, 59, 999).toISOString()
    : new Date(ano, mes - 1, d, 0, 0, 0, 0).toISOString();
}

export async function listarConsultas(
  clinicaId: string,
  f: FiltrosConsulta,
): Promise<ConsultaLinha[]> {
  let q = supabase
    .from("consultas")
    .select(SELECT_LINHA)
    .eq("clinica_id", clinicaId)
    .order("inicio", { ascending: true })
    .limit(500);

  if (f.dataInicial) q = q.gte("inicio", limiteDoDia(f.dataInicial));
  // fim do dia inclusivo: o usuário escolhe um dia, não um instante
  if (f.dataFinal) q = q.lte("inicio", limiteDoDia(f.dataFinal, true));
  if (f.status.length > 0) q = q.in("status", f.status);
  if (f.modalidade) q = q.eq("modalidade", f.modalidade);
  if (f.profissionalId) q = q.eq("profissional_id", f.profissionalId);
  if (f.servicoId) q = q.eq("servico_id", f.servicoId);
  if (f.cadeiraId) q = q.eq("cadeira_id", f.cadeiraId);
  // filtro no recurso embutido: só funciona porque `pacientes` veio com !inner
  if (f.paciente.trim()) q = q.ilike("pacientes.nome_completo", `%${f.paciente.trim()}%`);

  const { data, error } = await q;
  if (error) throw new ErroConsulta(error);
  return (data ?? []) as unknown as ConsultaLinha[];
}

export async function buscarPacientes(clinicaId: string, termo: string) {
  let q = supabase
    .from("pacientes")
    .select("id, nome_completo, celular")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome_completo")
    .limit(30);
  if (termo.trim()) q = q.ilike("nome_completo", `%${termo.trim()}%`);
  const { data, error } = await q;
  if (error) throw new ErroConsulta(error);
  return data ?? [];
}

/** Leitura por PK: mesmo com RLS, amarrar na clínica evita ler ficha de outro tenant. */
export async function obterPaciente(id: string, clinicaId?: string | null) {
  let q = supabase
    .from("pacientes")
    .select("id, nome_completo, celular")
    .eq("id", id);
  if (clinicaId) q = q.eq("clinica_id", clinicaId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ErroConsulta(error);
  return data;
}

export async function listarProfissionais(clinicaId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, especialidade, role")
    .eq("clinica_id", clinicaId)
    .order("full_name");
  if (error) throw new ErroConsulta(error);
  return data ?? [];
}

export async function listarProcedimentos(clinicaId: string) {
  const { data, error } = await supabase
    .from("procedimentos")
    .select("id, nome, valor, duracao_min, modalidades, especialidade")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw new ErroConsulta(error);
  return data ?? [];
}

export async function listarCadeiras(clinicaId: string) {
  const { data, error } = await supabase
    .from("cadeiras")
    .select("id, nome")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw new ErroConsulta(error);
  return data ?? [];
}

// ---------------------------------------------------------------- escrita
function paraInsert(e: EntradaConsulta, inicio: string, fim: string) {
  return {
    clinica_id: e.clinicaId,
    paciente_id: e.pacienteId,
    profissional_id: e.profissionalId,
    servico_id: e.servicoId,
    cadeira_id: e.cadeiraId,
    inicio,
    fim,
    modalidade: e.modalidade,
    status: e.status,
    valor: e.valor,
    desconto: e.desconto,
    observacoes: e.observacoes,
    criado_por: e.criadoPor ?? null,
    // `total` é coluna gerada no banco — enviar aqui quebraria o insert
  };
}

export async function criarConsulta(e: EntradaConsulta): Promise<string> {
  const { data, error } = await supabase
    .from("consultas")
    .insert(paraInsert(e, e.inicio, e.fim))
    .select("id")
    .maybeSingle();
  if (error) throw new ErroConsulta(error);
  return data?.id as string;
}

export async function atualizarConsulta(id: string, e: EntradaConsulta) {
  const { error } = await supabase
    .from("consultas")
    .update({
      paciente_id: e.pacienteId,
      profissional_id: e.profissionalId,
      servico_id: e.servicoId,
      cadeira_id: e.cadeiraId,
      inicio: e.inicio,
      fim: e.fim,
      modalidade: e.modalidade,
      status: e.status,
      valor: e.valor,
      desconto: e.desconto,
      observacoes: e.observacoes,
    })
    .eq("id", id);
  if (error) throw new ErroConsulta(error);
}

/** Só o status: os carimbos de data são responsabilidade do trigger. */
export async function definirStatus(
  id: string,
  status: StatusConsulta,
  motivo?: string | null,
) {
  const patch: Record<string, unknown> = { status };
  if (motivo !== undefined) patch.motivo_cancelamento = motivo || null;
  const { error } = await supabase.from("consultas").update(patch).eq("id", id);
  if (error) throw new ErroConsulta(error);
}

export async function excluirConsulta(id: string) {
  const { error } = await supabase.from("consultas").delete().eq("id", id);
  if (error) throw new ErroConsulta(error);
}

// ---------------------------------------------------------------- recorrência
/** Soma meses sem "vazar" para o mês seguinte (31/01 + 1 mês = 28/02, não 03/03). */
function somarMeses(base: Date, meses: number): Date {
  const d = new Date(base);
  const diaOriginal = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaOriginal, ultimoDia));
  return d;
}

/**
 * Datas de início da série, começando pela consulta base.
 * No modo semanal com dias marcados, o padrão é o do mercado: percorre semana a
 * semana (pulando `intervalo` semanas) e emite uma consulta por dia marcado.
 */
export function gerarDatasRecorrencia(base: Date, r: RegraRecorrencia): Date[] {
  const total = Math.max(1, Math.min(r.qtdRepeticoes, 120)); // teto de segurança
  const intervalo = Math.max(1, r.intervalo);
  const datas: Date[] = [new Date(base)];

  if (r.tipo === "semanal" && r.diasSemana.length > 0) {
    const dias = [...new Set(r.diasSemana)].sort((a, b) => a - b);
    const domingoDaSemana = new Date(base);
    domingoDaSemana.setDate(base.getDate() - base.getDay());
    let semana = 0;
    let guarda = 0;
    while (datas.length < total && guarda++ < 500) {
      for (const dia of dias) {
        const d = new Date(domingoDaSemana);
        d.setDate(domingoDaSemana.getDate() + semana * intervalo * 7 + dia);
        d.setHours(base.getHours(), base.getMinutes(), 0, 0);
        if (d.getTime() <= base.getTime()) continue;
        datas.push(d);
        if (datas.length >= total) break;
      }
      semana++;
    }
    return datas.slice(0, total);
  }

  for (let i = 1; i < total; i++) {
    let d: Date;
    switch (r.tipo) {
      case "diaria":     d = new Date(base); d.setDate(base.getDate() + i * intervalo); break;
      case "semanal":    d = new Date(base); d.setDate(base.getDate() + i * intervalo * 7); break;
      case "quinzenal":  d = new Date(base); d.setDate(base.getDate() + i * intervalo * 14); break;
      case "mensal":     d = somarMeses(base, i * intervalo); break;
      case "trimestral": d = somarMeses(base, i * 3 * intervalo); break;
      case "semestral":  d = somarMeses(base, i * 6 * intervalo); break;
      case "anual":      d = somarMeses(base, i * 12 * intervalo); break;
      default:           d = new Date(base); d.setDate(base.getDate() + i * intervalo); break;
    }
    datas.push(d);
  }
  return datas;
}

export interface ResultadoSerie {
  criadas: number;
  conflitos: string[];
}

/**
 * Cria a recorrência e as consultas da série.
 *
 * Insere uma a uma de propósito: em lote, um único choque de horário derrubaria
 * a série inteira. Aqui a primeira consulta é obrigatória (erro sobe pra tela) e
 * as repetições que colidem viram aviso — o recepcionista remarca só aquelas.
 */
export async function criarSerieRecorrente(
  e: EntradaConsulta,
  r: RegraRecorrencia,
): Promise<ResultadoSerie> {
  const inicioBase = new Date(e.inicio);
  const duracaoMs = new Date(e.fim).getTime() - inicioBase.getTime();
  const datas = gerarDatasRecorrencia(inicioBase, r);

  const { data: rec, error: erroRec } = await supabase
    .from("recorrencias")
    .insert({
      clinica_id: e.clinicaId,
      tipo: r.tipo,
      intervalo: Math.max(1, r.intervalo),
      qtd_repeticoes: datas.length,
      dias_semana: r.tipo === "semanal" ? [...new Set(r.diasSemana)].sort((a, b) => a - b) : [],
    })
    .select("id")
    .maybeSingle();
  if (erroRec) throw new ErroConsulta(erroRec);
  // sem id não há série: seguir aqui criaria consultas soltas, sem vínculo nenhum
  if (!rec?.id) {
    throw new ErroConsulta({ message: "Não foi possível criar a recorrência." });
  }

  const recorrenciaId = rec.id as string;
  const conflitos: string[] = [];
  let criadas = 0;

  for (const [indice, data] of datas.entries()) {
    const inicio = data.toISOString();
    const fim = new Date(data.getTime() + duracaoMs).toISOString();
    const { error } = await supabase
      .from("consultas")
      .insert({ ...paraInsert(e, inicio, fim), recorrencia_id: recorrenciaId });

    if (!error) { criadas++; continue; }
    if (indice === 0) {
      // sem a primeira consulta a série não existe — limpa a recorrência órfã
      const { error: erroLimpeza } = await supabase
        .from("recorrencias").delete().eq("id", recorrenciaId);
      if (erroLimpeza) {
        console.error("[consultas] recorrência órfã não apagada:", erroLimpeza.message);
      }
      throw new ErroConsulta(error);
    }
    conflitos.push(data.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }));
  }

  return { criadas, conflitos };
}

// ---------------------------------------------------------------- formatação
export const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export const horaBR = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** `datetime-local` só aceita horário local sem timezone; toISOString() daria UTC. */
export function isoParaInputLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function inputLocalParaIso(local: string): string {
  return new Date(local).toISOString();
}

export function hojeISO(deslocamentoDias = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function filtrosPadrao(): FiltrosConsulta {
  return {
    status: [],
    modalidade: null,
    profissionalId: null,
    servicoId: null,
    cadeiraId: null,
    paciente: "",
    dataInicial: hojeISO(0),
    dataFinal: hojeISO(7),
  };
}
