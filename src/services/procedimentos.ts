import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// ============================================================================
// Serviço de Procedimentos — o catálogo que alimenta agenda, orçamento e caixa
// ----------------------------------------------------------------------------
// `procedimentos` é a tabela mais referenciada do sistema: a agenda tira dela
// duração/buffer/cor do bloco, o orçamento tira o valor, o financeiro tira a
// base de comissão. Por isso as validações de duração/cor/modalidade moram no
// banco como CHECK — o formulário só antecipa a mensagem em português.
//
// Preço tem duas camadas de precedência (a mais específica ganha):
//   procedimento.valor  →  procedimento_precos[convênio]  →  override do profissional
// ============================================================================

export type Aplicacao = Database["public"]["Enums"]["aplicacao_procedimento"];
export type Modalidade = Database["public"]["Enums"]["modalidade_atendimento"];

export type Procedimento = Database["public"]["Tables"]["procedimentos"]["Row"];
export type ProcedimentoPreco = Database["public"]["Tables"]["procedimento_precos"]["Row"];
export type ProcedimentoProfissionalRow =
  Database["public"]["Tables"]["procedimento_profissional"]["Row"];

export interface PrecoComConvenio extends ProcedimentoPreco {
  convenios: { id: string; nome: string; tipo: string } | null;
}

export interface HabilitadoComProfissional extends ProcedimentoProfissionalRow {
  profiles: { id: string; full_name: string | null; especialidade: string | null } | null;
}

export interface ConvenioResumo {
  id: string;
  nome: string;
  tipo: string;
}

export interface ProfissionalResumo {
  id: string;
  full_name: string | null;
  especialidade: string | null;
}

// ------------------------------------------------------------------ rótulos

/** Especialidades odontológicas. Coluna é texto livre no banco; aqui vira lista fechada. */
export const ESPECIALIDADES = [
  "Dentística",
  "Endodontia",
  "Periodontia",
  "Ortodontia",
  "Implantodontia",
  "Prótese",
  "Cirurgia",
  "Odontopediatria",
  "HOF",
  "Estética",
  "Clínica Geral",
] as const;

export const APLICACOES: { valor: Aplicacao; rotulo: string; ajuda: string }[] = [
  { valor: "dente", rotulo: "Dente", ajuda: "Lançado em um dente inteiro (ex.: extração)" },
  { valor: "face", rotulo: "Face", ajuda: "Lançado em faces do dente (ex.: restauração)" },
  { valor: "quadrante", rotulo: "Quadrante", ajuda: "Um quadrante por vez (ex.: raspagem)" },
  { valor: "arcada", rotulo: "Arcada", ajuda: "Arcada superior ou inferior" },
  { valor: "boca", rotulo: "Boca toda", ajuda: "Procedimento único para a boca" },
  { valor: "regiao", rotulo: "Região facial", ajuda: "Regiões da face (HOF/estética)" },
  { valor: "sem_dente", rotulo: "Sem dente", ajuda: "Não se aplica ao odontograma" },
];

export const APLICACAO_LABEL: Record<Aplicacao, string> = {
  dente: "Dente",
  face: "Face",
  quadrante: "Quadrante",
  arcada: "Arcada",
  boca: "Boca toda",
  regiao: "Região facial",
  sem_dente: "Sem dente",
};

export const MODALIDADES: { valor: Modalidade; rotulo: string }[] = [
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "online", rotulo: "Online" },
  { valor: "domiciliar", rotulo: "Domiciliar" },
];

export const MODALIDADE_LABEL: Record<Modalidade, string> = {
  presencial: "Presencial",
  online: "Online",
  domiciliar: "Domiciliar",
};

/** Cor padrão por especialidade — o bloco da agenda fica legível sem o usuário escolher nada. */
export const COR_POR_ESPECIALIDADE: Record<string, string> = {
  "Dentística": "#10B981",
  "Endodontia": "#EF4444",
  "Periodontia": "#F59E0B",
  "Ortodontia": "#6366F1",
  "Implantodontia": "#0EA5E9",
  "Prótese": "#8B5CF6",
  "Cirurgia": "#DC2626",
  "Odontopediatria": "#EC4899",
  "HOF": "#A855F7",
  "Estética": "#14B8A6",
  "Clínica Geral": "#64748B",
};

export const COR_PADRAO = "#10B981";

export const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

/** 90 → "1h30", 60 → "1h", 45 → "45min". */
export const formatarDuracao = (min: number | null | undefined) => {
  const m = min ?? 0;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, "0")}`;
};

// ------------------------------------------------------------------ leitura

export async function listarProcedimentos(clinicaId: string, incluirInativos = false) {
  let q = supabase
    .from("procedimentos")
    .select("*")
    .eq("clinica_id", clinicaId)
    .order("nome", { ascending: true });
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Procedimento[];
}

export async function listarConvenios(clinicaId: string) {
  const { data, error } = await supabase
    .from("convenios")
    .select("id, nome, tipo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as ConvenioResumo[];
}

/**
 * Só quem executa procedimento entra na lista de habilitados — recepção e demais
 * papéis não. Mesmo recorte de `listarProfissionaisAgenda` em services/agenda.ts,
 * senão a tela de habilitação oferece gente que a agenda nunca vai aceitar.
 */
export async function listarProfissionais(clinicaId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, especialidade")
    .eq("clinica_id", clinicaId)
    .in("role", ["admin", "professional"])
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as ProfissionalResumo[];
}

export async function listarPrecos(clinicaId: string, procedimentoId: string) {
  const { data, error } = await supabase
    .from("procedimento_precos")
    .select("*, convenios(id, nome, tipo)")
    .eq("clinica_id", clinicaId)
    .eq("procedimento_id", procedimentoId);
  if (error) throw error;
  const lista = (data ?? []) as unknown as PrecoComConvenio[];
  return lista.sort((a, b) =>
    (a.convenios?.nome ?? "").localeCompare(b.convenios?.nome ?? "", "pt-BR"),
  );
}

export async function listarHabilitados(clinicaId: string, procedimentoId: string) {
  const { data, error } = await supabase
    .from("procedimento_profissional")
    .select("*, profiles(id, full_name, especialidade)")
    .eq("clinica_id", clinicaId)
    .eq("procedimento_id", procedimentoId);
  if (error) throw error;
  const lista = (data ?? []) as unknown as HabilitadoComProfissional[];
  return lista.sort((a, b) =>
    (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? "", "pt-BR"),
  );
}

// ------------------------------------------------------------------ escrita

export interface DadosProcedimento {
  nome: string;
  codigo: string | null;
  codigo_tuss: string | null;
  especialidade: string | null;
  descricao: string | null;
  aplicacao: Aplicacao;
  duracao_min: number;
  valor: number;
  cor: string;
  buffer_antes_min: number;
  buffer_depois_min: number;
  modalidades: Modalidade[];
  exige_anamnese: boolean;
  sessoes_previstas: number;
  ativo: boolean;
}

export async function criarProcedimento(clinicaId: string, dados: DadosProcedimento) {
  const { data, error } = await supabase
    .from("procedimentos")
    .insert({ ...dados, clinica_id: clinicaId })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as Procedimento | null;
}

// Todo update/delete leva `clinica_id` junto do `id`. O RLS já barra o cruzamento de
// clínica, mas o filtro no cliente evita que um id vazado de outro tenant produza um
// UPDATE silenciosamente vazio (0 linhas) sendo tratado como sucesso na tela.

export async function atualizarProcedimento(
  clinicaId: string,
  id: string,
  dados: Partial<DadosProcedimento>,
) {
  const { data, error } = await supabase
    .from("procedimentos")
    .update(dados)
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as Procedimento | null;
}

export async function alternarAtivoProcedimento(clinicaId: string, id: string, ativo: boolean) {
  const { data, error } = await supabase
    .from("procedimentos")
    .update({ ativo })
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .select("id");
  if (error) throw error;
  // 0 linhas = registro de outra clínica ou barrado por RLS. Sem isso a tela dava
  // "sucesso" e o switch voltava sozinho no próximo carregamento.
  if (!data || data.length === 0) throw new Error("Procedimento não encontrado nesta clínica.");
}

export async function excluirProcedimento(clinicaId: string, id: string) {
  const { data, error } = await supabase
    .from("procedimentos")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Procedimento não encontrado nesta clínica.");
}

export interface DadosPreco {
  convenio_id: string;
  valor: number;
  comissao_percentual: number | null;
  comissao_valor: number | null;
}

/**
 * Grava o preço do convênio. `upsert` na chave (procedimento_id, convenio_id) porque
 * o banco tem UNIQUE ali: dois preços para o mesmo convênio nunca fariam sentido.
 * O CHECK `comissao_exclusiva` proíbe percentual e valor preenchidos juntos.
 */
export async function salvarPreco(
  clinicaId: string,
  procedimentoId: string,
  dados: DadosPreco,
) {
  const { error } = await supabase
    .from("procedimento_precos")
    .upsert(
      {
        clinica_id: clinicaId,
        procedimento_id: procedimentoId,
        convenio_id: dados.convenio_id,
        valor: dados.valor,
        comissao_percentual: dados.comissao_percentual,
        comissao_valor: dados.comissao_valor,
        // `precoDoProcedimento` (services/orcamentos.ts) só enxerga preço com ativo=true.
        // Sem reafirmar aqui, uma linha desativada volta a aparecer nesta tela mas o
        // orçamento continua cobrando o valor particular — divergência invisível.
        ativo: true,
      },
      { onConflict: "procedimento_id,convenio_id" },
    );
  if (error) throw error;
}

export async function excluirPreco(clinicaId: string, id: string) {
  const { data, error } = await supabase
    .from("procedimento_precos")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Preço não encontrado nesta clínica.");
}

export async function salvarHabilitado(
  clinicaId: string,
  procedimentoId: string,
  profissionalId: string,
  valorOverride: number | null,
  duracaoOverrideMin: number | null,
) {
  const { error } = await supabase
    .from("procedimento_profissional")
    .upsert(
      {
        clinica_id: clinicaId,
        procedimento_id: procedimentoId,
        profissional_id: profissionalId,
        valor_override: valorOverride,
        duracao_override_min: duracaoOverrideMin,
        ativo: true,
      },
      { onConflict: "procedimento_id,profissional_id" },
    );
  if (error) throw error;
}

export async function excluirHabilitado(clinicaId: string, id: string) {
  const { data, error } = await supabase
    .from("procedimento_profissional")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Habilitação não encontrada nesta clínica.");
}

// ------------------------------------------------------------------ catálogo base

/**
 * Catálogo inicial de clínica odontológica brasileira. Não é dado de negócio da
 * clínica — é ponto de partida editável, importado só quando o usuário clica.
 * Valores e durações são referências de mercado; a clínica ajusta na tabela.
 */
export const PROCEDIMENTOS_COMUNS: Omit<DadosProcedimento, "cor" | "ativo">[] = [
  { nome: "Consulta de avaliação", codigo: "AVAL", codigo_tuss: null, especialidade: "Clínica Geral", descricao: "Primeira consulta com exame clínico e plano de tratamento.", aplicacao: "sem_dente", duracao_min: 30, valor: 120, buffer_antes_min: 0, buffer_depois_min: 5, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 1 },
  { nome: "Radiografia periapical", codigo: "RX-PERI", codigo_tuss: null, especialidade: "Clínica Geral", descricao: "Radiografia de um dente e região apical.", aplicacao: "dente", duracao_min: 15, valor: 45, buffer_antes_min: 0, buffer_depois_min: 0, modalidades: ["presencial"], exige_anamnese: false, sessoes_previstas: 1 },
  { nome: "Profilaxia (limpeza)", codigo: "PROF", codigo_tuss: null, especialidade: "Periodontia", descricao: "Remoção de placa e polimento coronário.", aplicacao: "boca", duracao_min: 40, valor: 180, buffer_antes_min: 0, buffer_depois_min: 5, modalidades: ["presencial"], exige_anamnese: false, sessoes_previstas: 1 },
  { nome: "Raspagem por quadrante", codigo: "RASP-Q", codigo_tuss: null, especialidade: "Periodontia", descricao: "Raspagem e alisamento radicular de um quadrante.", aplicacao: "quadrante", duracao_min: 45, valor: 260, buffer_antes_min: 0, buffer_depois_min: 10, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 1 },
  { nome: "Restauração em resina 1 face", codigo: "REST-1F", codigo_tuss: null, especialidade: "Dentística", descricao: "Restauração direta em resina composta, uma face.", aplicacao: "face", duracao_min: 40, valor: 190, buffer_antes_min: 0, buffer_depois_min: 5, modalidades: ["presencial"], exige_anamnese: false, sessoes_previstas: 1 },
  { nome: "Restauração em resina 2 faces", codigo: "REST-2F", codigo_tuss: null, especialidade: "Dentística", descricao: "Restauração direta em resina composta, duas faces.", aplicacao: "face", duracao_min: 60, valor: 260, buffer_antes_min: 0, buffer_depois_min: 5, modalidades: ["presencial"], exige_anamnese: false, sessoes_previstas: 1 },
  { nome: "Extração simples", codigo: "EXO-S", codigo_tuss: null, especialidade: "Cirurgia", descricao: "Exodontia de dente irrompido, sem retalho.", aplicacao: "dente", duracao_min: 30, valor: 250, buffer_antes_min: 5, buffer_depois_min: 10, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 1 },
  { nome: "Extração de terceiro molar", codigo: "EXO-3M", codigo_tuss: null, especialidade: "Cirurgia", descricao: "Exodontia de siso, incluso ou semi-incluso.", aplicacao: "dente", duracao_min: 60, valor: 750, buffer_antes_min: 10, buffer_depois_min: 15, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 1 },
  { nome: "Canal unirradicular", codigo: "ENDO-1", codigo_tuss: null, especialidade: "Endodontia", descricao: "Tratamento endodôntico de dente com um canal.", aplicacao: "dente", duracao_min: 60, valor: 750, buffer_antes_min: 0, buffer_depois_min: 10, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 2 },
  { nome: "Canal birradicular", codigo: "ENDO-2", codigo_tuss: null, especialidade: "Endodontia", descricao: "Tratamento endodôntico de dente com dois canais.", aplicacao: "dente", duracao_min: 80, valor: 950, buffer_antes_min: 0, buffer_depois_min: 10, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 2 },
  { nome: "Canal multirradicular", codigo: "ENDO-3", codigo_tuss: null, especialidade: "Endodontia", descricao: "Tratamento endodôntico de dente com três ou mais canais.", aplicacao: "dente", duracao_min: 100, valor: 1250, buffer_antes_min: 0, buffer_depois_min: 15, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 3 },
  { nome: "Clareamento de consultório", codigo: "CLAR", codigo_tuss: null, especialidade: "Estética", descricao: "Clareamento com peróxido de hidrogênio em consultório.", aplicacao: "boca", duracao_min: 60, valor: 900, buffer_antes_min: 0, buffer_depois_min: 10, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 3 },
  { nome: "Coroa provisória", codigo: "COR-PROV", codigo_tuss: null, especialidade: "Prótese", descricao: "Coroa provisória em acrílico ou bisacrílico.", aplicacao: "dente", duracao_min: 45, valor: 300, buffer_antes_min: 0, buffer_depois_min: 5, modalidades: ["presencial"], exige_anamnese: false, sessoes_previstas: 1 },
  { nome: "Coroa cerâmica", codigo: "COR-CER", codigo_tuss: null, especialidade: "Prótese", descricao: "Coroa total em cerâmica pura, com moldagem e prova.", aplicacao: "dente", duracao_min: 60, valor: 1800, buffer_antes_min: 0, buffer_depois_min: 10, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 3 },
  { nome: "Placa de bruxismo", codigo: "PLACA", codigo_tuss: null, especialidade: "Prótese", descricao: "Placa miorrelaxante rígida, com moldagem e ajuste.", aplicacao: "arcada", duracao_min: 45, valor: 750, buffer_antes_min: 0, buffer_depois_min: 5, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 2 },
  { nome: "Implante dentário", codigo: "IMP", codigo_tuss: null, especialidade: "Implantodontia", descricao: "Instalação de implante osseointegrável unitário.", aplicacao: "dente", duracao_min: 90, valor: 2800, buffer_antes_min: 15, buffer_depois_min: 15, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 1 },
  { nome: "Enxerto ósseo", codigo: "ENX", codigo_tuss: null, especialidade: "Implantodontia", descricao: "Enxerto para reconstrução de rebordo antes do implante.", aplicacao: "regiao", duracao_min: 90, valor: 2000, buffer_antes_min: 15, buffer_depois_min: 15, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 1 },
  { nome: "Instalação de aparelho fixo", codigo: "ORT-INST", codigo_tuss: null, especialidade: "Ortodontia", descricao: "Colagem de braquetes e instalação do aparelho fixo.", aplicacao: "arcada", duracao_min: 90, valor: 1800, buffer_antes_min: 0, buffer_depois_min: 10, modalidades: ["presencial"], exige_anamnese: true, sessoes_previstas: 1 },
  { nome: "Manutenção ortodôntica", codigo: "ORT-MAN", codigo_tuss: null, especialidade: "Ortodontia", descricao: "Ajuste mensal do aparelho fixo.", aplicacao: "boca", duracao_min: 30, valor: 220, buffer_antes_min: 0, buffer_depois_min: 5, modalidades: ["presencial"], exige_anamnese: false, sessoes_previstas: 1 },
  { nome: "Contenção ortodôntica", codigo: "ORT-CONT", codigo_tuss: null, especialidade: "Ortodontia", descricao: "Contenção fixa ou removível após a remoção do aparelho.", aplicacao: "arcada", duracao_min: 40, valor: 450, buffer_antes_min: 0, buffer_depois_min: 5, modalidades: ["presencial"], exige_anamnese: false, sessoes_previstas: 1 },
];

export interface ResultadoImportacao {
  inseridos: number;
  ignorados: number;
}

/**
 * Importa o catálogo base. Só insere o que ainda não existe pelo nome — a tabela
 * tem UNIQUE (clinica_id, nome), então importar duas vezes não duplica nem falha.
 */
export async function importarProcedimentosComuns(
  clinicaId: string,
): Promise<ResultadoImportacao> {
  const { data: existentes, error: erroLeitura } = await supabase
    .from("procedimentos")
    .select("nome")
    .eq("clinica_id", clinicaId);
  if (erroLeitura) throw erroLeitura;

  const jaTem = new Set((existentes ?? []).map((p) => p.nome.trim().toLowerCase()));
  const novos = PROCEDIMENTOS_COMUNS.filter((p) => !jaTem.has(p.nome.trim().toLowerCase()));

  if (novos.length === 0) {
    return { inseridos: 0, ignorados: PROCEDIMENTOS_COMUNS.length };
  }

  const linhas = novos.map((p) => ({
    ...p,
    clinica_id: clinicaId,
    ativo: true,
    cor: COR_POR_ESPECIALIDADE[p.especialidade ?? ""] ?? COR_PADRAO,
  }));

  const { error } = await supabase.from("procedimentos").insert(linhas);
  if (error) throw error;

  return { inseridos: novos.length, ignorados: PROCEDIMENTOS_COMUNS.length - novos.length };
}
