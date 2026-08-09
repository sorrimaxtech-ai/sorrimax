import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { RegistroOdontograma } from "@/types/odonto";

// ============================================================================
// Serviço de Pacientes — cadastro + tudo que pendura na ficha
// ----------------------------------------------------------------------------
// O paciente é a chave estrangeira de quase todo o sistema: consulta, orçamento,
// odontograma, evolução, documento e parcela apontam para ele. Por isso o
// cadastro exige CELULAR: é ele que amarra o paciente ao canal de WhatsApp
// (whatsapp_chats.contact_phone), sem o qual metade do CRM não funciona.
// ============================================================================

export type PacienteRow = Database["public"]["Tables"]["pacientes"]["Row"];
export type PacienteInsert = Database["public"]["Tables"]["pacientes"]["Insert"];
export type StatusParcela = Database["public"]["Enums"]["status_parcela"];
export type StatusConsulta = Database["public"]["Enums"]["status_consulta"];

/**
 * anamnese_modelos/perguntas/respostas e documentos_emitidos existem no banco mas
 * não no `types.ts` gerado — e esse arquivo é congelado (o orquestrador regenera).
 * Este escape isola o `any` num ponto só, em vez de espalhar cast por toda query.
 */
const sbLivre = supabase as any;

// ---------------------------------------------------------------- formatação
export const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");

export function formatarCpf(v?: string | null) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarCelular(v?: string | null) {
  // Aceita celular já salvo com DDI 55 (vindo do WhatsApp) e mostra só DDD+número.
  let d = soDigitos(v);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatarCep(v?: string | null) {
  const d = soDigitos(v).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Link wa.me exige E.164 sem sinais. Retorna null quando o número é curto demais. */
export function linkWhatsApp(celular?: string | null, texto?: string) {
  let d = soDigitos(celular);
  if (d.length < 10) return null;
  if (!d.startsWith("55")) d = `55${d}`;
  const q = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return `https://wa.me/${d}${q}`;
}

/** Idade em anos completos. Null quando a data é inválida/ausente. */
export function idadeEmAnos(dataNascimento?: string | null): number | null {
  if (!dataNascimento) return null;
  // `YYYY-MM-DD` puro vira UTC no construtor do Date e "volta um dia" em fuso
  // negativo; por isso a data é montada campo a campo, em horário local.
  const [a, m, d] = dataNascimento.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  const nasc = new Date(a, m - 1, d);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const fezAniversario =
    hoje.getMonth() > nasc.getMonth() ||
    (hoje.getMonth() === nasc.getMonth() && hoje.getDate() >= nasc.getDate());
  if (!fezAniversario) anos -= 1;
  return anos < 0 || anos > 130 ? null : anos;
}

export const dataBr = (v?: string | null) =>
  v ? new Date(v.length <= 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR") : "—";

export const dataHoraBr = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

/** Dígitos verificadores do CPF. CPF é opcional no cadastro, mas se vier tem que valer. */
export function cpfValido(v?: string | null) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, pesoInicial: number) => {
    const soma = base
      .split("")
      .reduce((s, n, i) => s + Number(n) * (pesoInicial - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

export const emailValido = (v?: string | null) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Valores gravados em `pacientes.genero`/`estado_civil` (texto livre no schema). */
export const GENEROS = [
  { valor: "feminino", rotulo: "Feminino" },
  { valor: "masculino", rotulo: "Masculino" },
  { valor: "outro", rotulo: "Outro" },
  { valor: "nao_informado", rotulo: "Prefiro não informar" },
];

export const ESTADOS_CIVIS = [
  { valor: "solteiro", rotulo: "Solteiro(a)" },
  { valor: "casado", rotulo: "Casado(a)" },
  { valor: "uniao_estavel", rotulo: "União estável" },
  { valor: "divorciado", rotulo: "Divorciado(a)" },
  { valor: "separado", rotulo: "Separado(a)" },
  { valor: "viuvo", rotulo: "Viúvo(a)" },
];

/** Cadastro antigo pode ter valor fora da lista — nesse caso mostra o que está lá. */
export const rotuloDe = (lista: { valor: string; rotulo: string }[], v?: string | null) =>
  v ? (lista.find((o) => o.valor === v)?.rotulo ?? v) : null;

export const iniciais = (nome?: string | null) =>
  (nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// ---------------------------------------------------------------- ViaCEP
export interface EnderecoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento: string;
}

/**
 * Consulta o ViaCEP (API pública, sem chave). Retorna null quando o CEP não
 * existe — o cadastro segue à mão, sem travar o atendimento.
 */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
  if (!resp.ok) throw new Error("ViaCEP indisponível");
  const j = await resp.json();
  if (j?.erro) return null;
  return {
    cep: d,
    logradouro: j.logradouro ?? "",
    bairro: j.bairro ?? "",
    cidade: j.localidade ?? "",
    uf: j.uf ?? "",
    complemento: j.complemento ?? "",
  };
}

// ---------------------------------------------------------------- pacientes
export interface PacienteLista extends PacienteRow {
  /** Ver `listarPacientes` — número de prontuário derivado da ordem de cadastro. */
  prontuario: number;
  convenios: { id: string; nome: string; tipo: string } | null;
}

/**
 * Traz TODOS os pacientes da clínica (ativos e inativos) numa consulta só.
 *
 * Por que tudo de uma vez: os KPIs (ativos/inativos/total) e o número de
 * prontuário precisam do conjunto completo. Se a lista fosse paginada no banco,
 * o prontuário mudaria conforme o filtro — e prontuário que muda não é prontuário.
 *
 * O prontuário é derivado da ordem de cadastro (created_at, id como desempate)
 * porque a tabela `pacientes` não tem coluna sequencial. É estável: um cadastro
 * novo sempre entra no fim da fila e nunca renumera quem já existe.
 */
export async function listarPacientes(clinicaId: string): Promise<PacienteLista[]> {
  // Paginado em blocos: o PostgREST corta a resposta em `db-max-rows` (1000 por
  // padrão em muitas instalações). Um `.limit(5000)` não contorna esse teto — ele
  // some com pacientes sem avisar e o prontuário fica errado a partir do corte.
  const TAMANHO = 1000;
  const todos: any[] = [];
  for (let pagina = 0; ; pagina += 1) {
    const de = pagina * TAMANHO;
    const { data, error } = await supabase
      .from("pacientes")
      .select("*, convenios(id, nome, tipo)")
      .eq("clinica_id", clinicaId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + TAMANHO - 1);
    if (error) throw error;
    const bloco = data ?? [];
    todos.push(...bloco);
    if (bloco.length < TAMANHO) break;
  }
  return todos.map((p: any, i: number) => ({ ...p, prontuario: i + 1 }));
}

/**
 * O filtro por `clinica_id` é obrigatório mesmo com RLS ligada: o id do paciente
 * vem da URL (`/pacientes/:id`) e trocar o UUID à mão não pode abrir a ficha de
 * outra clínica se um dia uma policy for afrouxada.
 */
export async function obterPaciente(clinicaId: string, id: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("*, convenios(id, nome, tipo)")
    .eq("clinica_id", clinicaId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as (PacienteRow & { convenios: { id: string; nome: string; tipo: string } | null }) | null;
}

/** Mesma regra de `listarPacientes`, resolvida sem baixar a lista inteira. */
export async function obterProntuario(clinicaId: string, criadoEm: string) {
  const { count, error } = await supabase
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", clinicaId)
    .lt("created_at", criadoEm);
  if (error) throw error;
  return (count ?? 0) + 1;
}

export interface PacienteForm {
  nome_completo: string;
  apelido: string;
  celular: string;
  email: string;
  data_nascimento: string;
  cpf: string;
  rg: string;
  genero: string;
  estado_civil: string;
  profissao: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  emergencia_nome: string;
  emergencia_celular: string;
  emergencia_celular2: string;
  emergencia_parentesco: string;
  convenio_id: string;
  numero_carteirinha: string;
  alergias: string[];
  tags: string[];
  observacoes: string;
}

export const formVazio = (): PacienteForm => ({
  nome_completo: "", apelido: "", celular: "", email: "", data_nascimento: "",
  cpf: "", rg: "", genero: "", estado_civil: "", profissao: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  emergencia_nome: "", emergencia_celular: "", emergencia_celular2: "", emergencia_parentesco: "",
  convenio_id: "", numero_carteirinha: "", alergias: [], tags: [], observacoes: "",
});

export const formDoPaciente = (p: PacienteRow): PacienteForm => ({
  nome_completo: p.nome_completo ?? "",
  apelido: p.apelido ?? "",
  celular: formatarCelular(p.celular),
  email: p.email ?? "",
  data_nascimento: (p.data_nascimento ?? "").slice(0, 10),
  cpf: formatarCpf(p.cpf),
  rg: p.rg ?? "",
  genero: p.genero ?? "",
  estado_civil: p.estado_civil ?? "",
  profissao: p.profissao ?? "",
  cep: formatarCep(p.cep),
  logradouro: p.logradouro ?? "",
  numero: p.numero ?? "",
  complemento: p.complemento ?? "",
  bairro: p.bairro ?? "",
  cidade: p.cidade ?? "",
  uf: p.uf ?? "",
  emergencia_nome: p.emergencia_nome ?? "",
  emergencia_celular: formatarCelular(p.emergencia_celular),
  emergencia_celular2: formatarCelular(p.emergencia_celular2),
  emergencia_parentesco: p.emergencia_parentesco ?? "",
  convenio_id: p.convenio_id ?? "",
  numero_carteirinha: p.numero_carteirinha ?? "",
  alergias: p.alergias ?? [],
  tags: p.tags ?? [],
  observacoes: p.observacoes ?? "",
});

/** Campo de texto vazio vira NULL — string vazia estraga índice único e relatório. */
const nulo = (v: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

function payload(form: PacienteForm) {
  return {
    nome_completo: form.nome_completo.trim(),
    apelido: nulo(form.apelido),
    celular: soDigitos(form.celular),
    email: nulo(form.email),
    data_nascimento: form.data_nascimento,
    cpf: form.cpf ? soDigitos(form.cpf) : null,
    rg: nulo(form.rg),
    genero: nulo(form.genero),
    estado_civil: nulo(form.estado_civil),
    profissao: nulo(form.profissao),
    cep: form.cep ? soDigitos(form.cep) : null,
    logradouro: nulo(form.logradouro),
    numero: nulo(form.numero),
    complemento: nulo(form.complemento),
    bairro: nulo(form.bairro),
    cidade: nulo(form.cidade),
    uf: form.uf ? form.uf.toUpperCase().slice(0, 2) : null,
    emergencia_nome: nulo(form.emergencia_nome),
    emergencia_celular: form.emergencia_celular ? soDigitos(form.emergencia_celular) : null,
    emergencia_celular2: form.emergencia_celular2 ? soDigitos(form.emergencia_celular2) : null,
    emergencia_parentesco: nulo(form.emergencia_parentesco),
    convenio_id: form.convenio_id || null,
    numero_carteirinha: nulo(form.numero_carteirinha),
    alergias: form.alergias,
    tags: form.tags,
    observacoes: nulo(form.observacoes),
  };
}

export async function criarPaciente(clinicaId: string, form: PacienteForm) {
  const { data, error } = await supabase
    .from("pacientes")
    .insert({ ...payload(form), clinica_id: clinicaId, origem: "manual" } as PacienteInsert)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  // Sem id não dá para abrir a ficha: melhor erro explícito do que navegar para
  // /pacientes/undefined e mostrar "paciente não encontrado" depois de gravar.
  if (!data?.id) throw new Error("Paciente gravado, mas o sistema não recebeu o código do cadastro. Recarregue a lista.");
  return data.id as string;
}

export async function atualizarPaciente(clinicaId: string, id: string, form: PacienteForm) {
  const { error } = await supabase
    .from("pacientes")
    .update(payload(form))
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

/** Inativar preserva histórico clínico e financeiro — é o caminho normal. */
export async function definirAtivo(clinicaId: string, id: string, ativo: boolean) {
  const { error } = await supabase
    .from("pacientes")
    .update({ ativo })
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirPaciente(clinicaId: string, id: string) {
  const { error } = await supabase
    .from("pacientes")
    .delete()
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- ficha
export async function proximasConsultas(clinicaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("consultas")
    // `consultas` tem DOIS FKs para profiles (profissional_id e criado_por):
    // sem nomear a constraint o PostgREST recusa o embed por ambiguidade.
    .select("*, procedimentos(nome), profissional:profiles!consultas_profissional_id_fkey(full_name)")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .gte("inicio", new Date().toISOString())
    .not("status", "in", "(cancelado,cancelado_pelo_cliente,desmarcado)")
    .order("inicio", { ascending: true })
    .limit(5);
  if (error) throw error;
  return data ?? [];
}

export async function historicoConsultas(clinicaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("consultas")
    .select("id, inicio, status, total, procedimentos(nome)")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .lt("inicio", new Date().toISOString())
    .order("inicio", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

export interface RegistroComProcedimento extends RegistroOdontograma {
  estadoLabel?: string;
  created_at: string;
  profissional_nome: string | null;
}

export async function listarOdontograma(
  clinicaId: string,
  pacienteId: string,
): Promise<RegistroComProcedimento[]> {
  const { data, error } = await supabase
    .from("odontograma_registros")
    .select("*, procedimentos(nome), profiles(full_name)")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    paciente_id: r.paciente_id,
    denticao: r.denticao,
    dente: r.dente,
    faces: r.faces ?? [],
    regiao: r.regiao,
    procedimento_id: r.procedimento_id,
    procedimento_nome: r.procedimentos?.nome,
    estado: r.estado,
    condicao: r.condicao,
    anotacao: r.anotacao,
    executado_em: r.executado_em,
    created_at: r.created_at,
    profissional_nome: r.profiles?.full_name ?? null,
  }));
}

export async function listarEvolucoes(clinicaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("evolucoes")
    .select("*, profiles(full_name)")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Evolução é prontuário legal: a tabela só aceita SELECT e INSERT.
 * Correção de conteúdo se faz com um novo registro apontando para o anterior
 * (`retifica_id`), nunca editando ou apagando o original.
 */
export async function adicionarEvolucao(input: {
  clinicaId: string;
  pacienteId: string;
  profissionalId: string;
  conteudo: string;
  dentes?: number[];
  consultaId?: string | null;
}) {
  const { error } = await supabase.from("evolucoes").insert({
    clinica_id: input.clinicaId,
    paciente_id: input.pacienteId,
    profissional_id: input.profissionalId,
    conteudo: input.conteudo.trim(),
    dentes: input.dentes ?? [],
    consulta_id: input.consultaId ?? null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- anamnese
export interface PerguntaAnamnese {
  id: string;
  enunciado: string;
  categoria: string | null;
  tipo:
    | "texto" | "texto_longo" | "numero" | "data" | "sim_nao"
    | "selecao_unica" | "multipla_escolha" | "escala" | "upload" | "assinatura" | "secao";
  obrigatoria: boolean;
  opcoes: any;
  escala: any;
  ordem: number;
}

export async function listarAnamneses(clinicaId: string, pacienteId: string) {
  const { data, error } = await sbLivre
    .from("anamnese_respostas")
    .select("*, anamnese_modelos(nome, especialidade)")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function listarModelosAnamnese(clinicaId: string) {
  const { data, error } = await sbLivre
    .from("anamnese_modelos")
    .select("id, nome, especialidade")
    .eq("clinica_id", clinicaId)
    .eq("publicado", true)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as { id: string; nome: string; especialidade: string | null }[];
}

/** `anamnese_perguntas` tem `clinica_id` próprio — filtrar aqui também. */
export async function listarPerguntas(
  clinicaId: string,
  modeloId: string,
): Promise<PerguntaAnamnese[]> {
  const { data, error } = await sbLivre
    .from("anamnese_perguntas")
    .select("id, enunciado, categoria, tipo, obrigatoria, opcoes, escala, ordem")
    .eq("clinica_id", clinicaId)
    .eq("modelo_id", modeloId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PerguntaAnamnese[];
}

/** `respostas` é jsonb no formato { [pergunta_id]: valor }. */
export async function salvarAnamnese(input: {
  clinicaId: string;
  pacienteId: string;
  modeloId: string;
  respostas: Record<string, unknown>;
}) {
  const { error } = await sbLivre.from("anamnese_respostas").insert({
    clinica_id: input.clinicaId,
    paciente_id: input.pacienteId,
    modelo_id: input.modeloId,
    respostas: input.respostas,
    preenchido_por: "profissional",
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- documentos
export async function listarDocumentos(clinicaId: string, pacienteId: string) {
  const { data, error } = await sbLivre
    .from("documentos_emitidos")
    .select("id, emitido_em, pdf_url, hash, conteudo_final_html, documento_modelos(nome, tipo)")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .order("emitido_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any[];
}

// ---------------------------------------------------------------- débitos
export const STATUS_PARCELA_LABEL: Record<StatusParcela, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

export const STATUS_PARCELA_CLASSE: Record<StatusParcela, string> = {
  pendente: "bg-amber-100 text-amber-800",
  pago: "bg-emerald-100 text-emerald-800",
  atrasado: "bg-red-100 text-red-700",
  cancelado: "bg-gray-100 text-gray-500",
  estornado: "bg-gray-100 text-gray-500",
};

/**
 * Parcelas do paciente. O vínculo com o paciente vive em `lancamentos`, então o
 * `!inner` é obrigatório: sem ele o PostgREST devolveria as parcelas da clínica
 * inteira, com o lançamento nulo.
 */
export async function listarDebitos(clinicaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select("*, lancamentos!inner(id, descricao, tipo, paciente_id, orcamento_id, forma_pagamento)")
    .eq("clinica_id", clinicaId)
    .eq("lancamentos.paciente_id", pacienteId)
    .order("vencimento", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------- whatsapp
export interface MensagemResumo {
  id: string;
  conteudo: string | null;
  tipo: string;
  from_me: boolean;
  quando: string | null;
}

/**
 * Últimas mensagens trocadas com o paciente. O chat pode estar ligado ao
 * paciente (`paciente_id`) ou só pelo telefone, quando a conversa começou antes
 * do cadastro — daí a busca também pelos 8 últimos dígitos do celular, que
 * ignoram DDI e o nono dígito que alguns provedores omitem.
 */
export async function ultimasMensagens(
  clinicaId: string,
  pacienteId: string,
  celular?: string | null,
): Promise<MensagemResumo[]> {
  const d = soDigitos(celular);
  const cauda = d.slice(-8);
  const filtros = [`paciente_id.eq.${pacienteId}`];
  if (cauda.length === 8) filtros.push(`contact_phone.like.*${cauda}*`);

  const { data: chats, error: erroChats } = await supabase
    .from("whatsapp_chats")
    .select("id")
    .eq("clinica_id", clinicaId)
    .or(filtros.join(","));
  if (erroChats) throw erroChats;

  const ids = (chats ?? []).map((c: any) => c.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, content, message_type, from_me, sent_at, created_at")
    .eq("clinica_id", clinicaId)
    .in("chat_id", ids)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) throw error;

  return (data ?? [])
    .map((m: any) => ({
      id: m.id,
      conteudo: m.content,
      tipo: m.message_type,
      from_me: !!m.from_me,
      quando: m.sent_at ?? m.created_at,
    }))
    .reverse();
}
