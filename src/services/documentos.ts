import { supabase } from "@/integrations/supabase/client";
import {
  extrairMergeFields, hashSha256, sanitizarHtmlDocumento, type ContextoMerge,
} from "@/lib/mergeFields";

// ============================================================================
// Serviço de Documentos — modelos e emissões
// ----------------------------------------------------------------------------
// Decisões que não são óbvias no código:
//
// 1. `documento_modelos` / `documentos_emitidos` entraram no banco depois da
//    última geração de `integrations/supabase/types.ts` (arquivo gerado, fora
//    do meu alcance). Por isso o acesso passa por `db`, um cast do client — os
//    contratos ficam declarados à mão abaixo, nada de `any` vazando pras telas.
//
// 2. Emissão é IMUTÁVEL na prática: guardamos o HTML já resolvido em
//    `conteudo_final_html` + `hash` SHA-256. Se o modelo mudar amanhã, o
//    atestado impresso hoje continua exatamente como foi assinado. Documento
//    que se reescreve sozinho não vale como prova.
//
// 3. `montarContexto` busca paciente/clínica/profissional/consulta em paralelo
//    e devolve o objeto puro que o motor de merge fields consome. Toda a
//    resolução em si mora em `@/lib/mergeFields` — aqui é só I/O.
//
// 4. TODA função recebe `clinicaId` e filtra por ele, inclusive as que buscam
//    por PK. O id vem da URL (`/documentos/modelos/:id`) e trocar o UUID à mão
//    não pode abrir o documento de outra clínica se um dia uma policy for
//    afrouxada. RLS é a trava; o filtro explícito é o cinto de segurança.
// ============================================================================

type QueryLivre = {
  from: (tabela: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
const db = supabase as unknown as QueryLivre;

// ------------------------------------------------------------------ contratos

export type TipoDocumento =
  | "atestado" | "declaracao" | "recibo" | "encaminhamento"
  | "termo" | "receita" | "orientacao" | "outro";

export interface DocumentoModelo {
  id: string;
  clinica_id: string;
  nome: string;
  tipo: TipoDocumento;
  corpo_html: string;
  variaveis: string[];
  exibir_assinatura: boolean;
  exibir_data_rodape: boolean;
  sistema: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModeloComContagem extends DocumentoModelo {
  qtd_emitidos: number;
}

export interface DocumentoEmitido {
  id: string;
  clinica_id: string;
  paciente_id: string;
  consulta_id: string | null;
  modelo_id: string | null;
  conteudo_final_html: string;
  pdf_url: string | null;
  hash: string | null;
  emitido_por: string | null;
  emitido_em: string;
}

export interface EmitidoComRelacoes extends DocumentoEmitido {
  paciente_nome: string | null;
  modelo_nome: string | null;
  modelo_tipo: TipoDocumento | null;
}

export interface PacienteOpcao {
  id: string;
  nome_completo: string;
  cpf: string | null;
  data_nascimento: string | null;
}

export interface ProfissionalOpcao {
  id: string;
  full_name: string | null;
  registro_profissional: string | null;
  role: string | null;
}

export interface ConsultaOpcao {
  id: string;
  inicio: string;
  status: string | null;
  total: number | null;
  valor: number | null;
  procedimento: string | null;
  profissional_id: string | null;
}

export const TIPOS_DOCUMENTO: { valor: TipoDocumento; rotulo: string }[] = [
  { valor: "atestado", rotulo: "Atestado" },
  { valor: "declaracao", rotulo: "Declaração" },
  { valor: "recibo", rotulo: "Recibo" },
  { valor: "encaminhamento", rotulo: "Encaminhamento" },
  { valor: "termo", rotulo: "Termo de consentimento" },
  { valor: "receita", rotulo: "Receita / prescrição" },
  { valor: "orientacao", rotulo: "Orientação pós-operatória" },
  { valor: "outro", rotulo: "Outro" },
];

export const ROTULO_TIPO: Record<string, string> = TIPOS_DOCUMENTO.reduce(
  (acc, t) => ({ ...acc, [t.valor]: t.rotulo }),
  {} as Record<string, string>,
);

/** Cor fixa por tipo — Tailwind não gera classe montada em runtime. */
export const CLASSE_TIPO: Record<string, string> = {
  atestado: "bg-brand-100 text-brand-800 border-0",
  declaracao: "bg-blue-100 text-blue-800 border-0",
  recibo: "bg-amber-100 text-amber-800 border-0",
  encaminhamento: "bg-purple-100 text-purple-800 border-0",
  termo: "bg-rose-100 text-rose-800 border-0",
  receita: "bg-cyan-100 text-cyan-800 border-0",
  orientacao: "bg-brand-100 text-brand-800 border-0",
  outro: "bg-gray-100 text-gray-700 border-0",
};

export const dataHoraBr = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const dataBr = (v?: string | null) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR") : "—";

// -------------------------------------------------------------------- modelos

function normalizarModelo(row: any): DocumentoModelo {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    nome: row.nome,
    tipo: (row.tipo ?? "outro") as TipoDocumento,
    corpo_html: row.corpo_html ?? "",
    variaveis: Array.isArray(row.variaveis) ? (row.variaveis as string[]) : [],
    exibir_assinatura: !!row.exibir_assinatura,
    exibir_data_rodape: !!row.exibir_data_rodape,
    sistema: !!row.sistema,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listarModelos(clinicaId: string): Promise<ModeloComContagem[]> {
  const [modelos, emitidos] = await Promise.all([
    db.from("documento_modelos").select("*").eq("clinica_id", clinicaId)
      .order("nome", { ascending: true }),
    db.from("documentos_emitidos").select("modelo_id").eq("clinica_id", clinicaId),
  ]);
  if (modelos.error) throw modelos.error;
  if (emitidos.error) throw emitidos.error;

  const linhas: any[] = emitidos.data ?? [];
  return (modelos.data ?? []).map((m: any) => ({
    ...normalizarModelo(m),
    qtd_emitidos: linhas.filter((e) => e.modelo_id === m.id).length,
  }));
}

export async function obterModelo(
  clinicaId: string,
  id: string,
): Promise<DocumentoModelo | null> {
  const { data, error } = await db
    .from("documento_modelos")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizarModelo(data) : null;
}

export async function criarModelo(
  clinicaId: string,
  nome: string,
  tipo: TipoDocumento,
): Promise<DocumentoModelo> {
  const { data, error } = await db
    .from("documento_modelos")
    .insert({
      clinica_id: clinicaId,
      nome,
      tipo,
      corpo_html: "<p></p>",
      variaveis: [],
      exibir_assinatura: true,
      exibir_data_rodape: true,
      sistema: false,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Modelo não retornado pelo banco.");
  return normalizarModelo(data);
}

export async function atualizarModelo(
  clinicaId: string,
  id: string,
  patch: Partial<Pick<DocumentoModelo,
    "nome" | "tipo" | "corpo_html" | "exibir_assinatura" | "exibir_data_rodape">>,
): Promise<void> {
  const dados: Record<string, unknown> = { ...patch };
  if (patch.corpo_html !== undefined) {
    // O corpo vem de um contentEditable (colar traz HTML de qualquer origem).
    // Guarda já higienizado: o banco nunca vira depósito de `<script>`/`onerror`.
    const limpo = sanitizarHtmlDocumento(patch.corpo_html);
    dados.corpo_html = limpo;
    // `variaveis` é derivada do corpo — nunca digitada. Recalcula a cada save
    // pra a lista do card nunca mentir sobre o que o modelo usa de verdade.
    dados.variaveis = extrairMergeFields(limpo);
  }

  const { error } = await db
    .from("documento_modelos")
    .update(dados)
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirModelo(clinicaId: string, id: string): Promise<void> {
  const { error } = await db
    .from("documento_modelos")
    .delete()
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

export async function duplicarModelo(
  clinicaId: string,
  modelo: DocumentoModelo,
): Promise<DocumentoModelo> {
  const { data, error } = await db
    .from("documento_modelos")
    .insert({
      clinica_id: clinicaId,
      nome: `${modelo.nome} (cópia)`,
      tipo: modelo.tipo,
      corpo_html: modelo.corpo_html,
      variaveis: modelo.variaveis,
      exibir_assinatura: modelo.exibir_assinatura,
      exibir_data_rodape: modelo.exibir_data_rodape,
      sistema: false,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cópia não retornada pelo banco.");
  return normalizarModelo(data);
}

/** RPC idempotente: roda de novo sem duplicar os modelos padrão. */
export async function semearModelosPadrao(clinicaId: string): Promise<void> {
  const { error } = await db.rpc("seed_documentos_clinica", { p_clinica: clinicaId });
  if (error) throw error;
}

// ------------------------------------------------------------------- emissões

export async function listarEmitidos(
  clinicaId: string,
  opcoes: { modeloId?: string; limite?: number } = {},
): Promise<EmitidoComRelacoes[]> {
  let query = db
    .from("documentos_emitidos")
    .select("*, pacientes(nome_completo), documento_modelos(nome, tipo)")
    .eq("clinica_id", clinicaId)
    .order("emitido_em", { ascending: false })
    .limit(opcoes.limite ?? 200);
  if (opcoes.modeloId) query = query.eq("modelo_id", opcoes.modeloId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((d: any) => ({
    id: d.id,
    clinica_id: d.clinica_id,
    paciente_id: d.paciente_id,
    consulta_id: d.consulta_id,
    modelo_id: d.modelo_id,
    conteudo_final_html: d.conteudo_final_html,
    pdf_url: d.pdf_url,
    hash: d.hash,
    emitido_por: d.emitido_por,
    emitido_em: d.emitido_em,
    paciente_nome: d.pacientes?.nome_completo ?? null,
    modelo_nome: d.documento_modelos?.nome ?? null,
    modelo_tipo: (d.documento_modelos?.tipo ?? null) as TipoDocumento | null,
  }));
}

export async function excluirEmitido(clinicaId: string, id: string): Promise<void> {
  const { error } = await db
    .from("documentos_emitidos")
    .delete()
    .eq("clinica_id", clinicaId)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Contagem real no banco — as KPIs não podem sair da lista carregada, que é
 * limitada (`listarEmitidos` traz 200). Número de tela com base em página
 * carregada é número errado.
 */
export async function contarEmitidos(clinicaId: string, desde?: string): Promise<number> {
  let query = db
    .from("documentos_emitidos")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", clinicaId);
  if (desde) query = query.gte("emitido_em", desde);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export interface EntradaEmissao {
  clinicaId: string;
  modeloId: string;
  pacienteId: string;
  consultaId?: string | null;
  /** HTML já resolvido (mesmo do preview) — o que vai pro papel e pro banco. */
  html: string;
}

export async function emitirDocumento(entrada: EntradaEmissao): Promise<DocumentoEmitido> {
  const hash = await hashSha256(entrada.html);
  // Quem emitiu é rastro de auditoria; se a sessão falhar aqui o insert cai na
  // RLS logo abaixo de qualquer jeito — mas o erro não some sem registro.
  const { data: auth, error: erroAuth } = await supabase.auth.getUser();
  if (erroAuth) console.warn("[documentos] emitido_por sem usuário:", erroAuth.message);

  const { data, error } = await db
    .from("documentos_emitidos")
    .insert({
      clinica_id: entrada.clinicaId,
      modelo_id: entrada.modeloId,
      paciente_id: entrada.pacienteId,
      consulta_id: entrada.consultaId || null,
      conteudo_final_html: entrada.html,
      hash,
      emitido_por: auth?.user?.id ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Emissão não retornada pelo banco.");
  return data as DocumentoEmitido;
}

// -------------------------------------------------------------------- apoio

export async function listarPacientes(clinicaId: string): Promise<PacienteOpcao[]> {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, nome_completo, cpf, data_nascimento")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("nome_completo", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as PacienteOpcao[];
}

export async function listarProfissionais(clinicaId: string): Promise<ProfissionalOpcao[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, registro_profissional, role")
    .eq("clinica_id", clinicaId)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProfissionalOpcao[];
}

export async function listarConsultasDoPaciente(
  clinicaId: string,
  pacienteId: string,
): Promise<ConsultaOpcao[]> {
  const { data, error } = await supabase
    .from("consultas")
    .select("id, inicio, status, total, valor, profissional_id, procedimentos(nome)")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .order("inicio", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id,
    inicio: c.inicio,
    status: c.status ?? null,
    total: c.total === null || c.total === undefined ? null : Number(c.total),
    valor: c.valor === null || c.valor === undefined ? null : Number(c.valor),
    procedimento: c.procedimentos?.nome ?? null,
    profissional_id: c.profissional_id ?? null,
  }));
}

function enderecoDaClinica(c: any): string | null {
  const linha = [c?.endereco, c?.numero, c?.complemento].filter(Boolean).join(", ");
  const cidade = [c?.cidade, c?.estado].filter(Boolean).join("/");
  const completo = [linha, cidade].filter(Boolean).join(" — ");
  return completo || null;
}

export interface EntradaContexto {
  pacienteId?: string | null;
  consultaId?: string | null;
  profissionalId?: string | null;
}

/**
 * Junta em um só objeto tudo que os merge fields podem pedir.
 * Consulta ganha do resto quando há conflito de valor (`valor.total` vem dela),
 * porque documento com consulta escolhida é documento daquele atendimento.
 */
export async function montarContexto(
  clinicaId: string,
  entrada: EntradaContexto,
): Promise<ContextoMerge> {
  const [clinicaRes, pacienteRes, consultaRes, profRes] = await Promise.all([
    supabase.from("clinicas")
      .select("nome_clinica, cnpj, endereco, numero, complemento, cidade, estado")
      .eq("id", clinicaId).maybeSingle(),
    entrada.pacienteId
      ? supabase.from("pacientes").select("nome_completo, cpf, data_nascimento")
          .eq("clinica_id", clinicaId).eq("id", entrada.pacienteId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    entrada.consultaId
      ? supabase.from("consultas")
          .select("inicio, total, valor, profissional_id, procedimentos(nome)")
          .eq("clinica_id", clinicaId).eq("id", entrada.consultaId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    entrada.profissionalId
      ? supabase.from("profiles").select("full_name, registro_profissional")
          .eq("clinica_id", clinicaId).eq("id", entrada.profissionalId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
  ]);

  if (clinicaRes.error) throw clinicaRes.error;
  if (pacienteRes.error) throw pacienteRes.error;
  if (consultaRes.error) throw consultaRes.error;
  if (profRes.error) throw profRes.error;

  const clinica: any = clinicaRes.data;
  const paciente: any = pacienteRes.data;
  const consulta: any = consultaRes.data;
  const profissional: any = profRes.data;

  const totalConsulta =
    consulta?.total ?? consulta?.valor ?? null;

  return {
    paciente: paciente
      ? {
          nome: paciente.nome_completo ?? null,
          cpf: paciente.cpf ?? null,
          data_nascimento: paciente.data_nascimento ?? null,
        }
      : null,
    clinica: clinica
      ? {
          nome: clinica.nome_clinica ?? null,
          cnpj: clinica.cnpj ?? null,
          endereco: enderecoDaClinica(clinica),
        }
      : null,
    profissional: profissional
      ? {
          nome: profissional.full_name ?? null,
          registro: profissional.registro_profissional ?? null,
        }
      : null,
    consulta: consulta
      ? {
          inicio: consulta.inicio ?? null,
          procedimento: consulta.procedimentos?.nome ?? null,
        }
      : null,
    valor: { total: totalConsulta === null ? null : Number(totalConsulta) },
    agora: new Date(),
  };
}

// ------------------------------------------------------------------ impressão

const ID_AREA_IMPRESSAO = "vh-area-impressao";
const ID_ESTILO_IMPRESSAO = "vh-estilo-impressao";

const CSS_IMPRESSAO = `
#${ID_AREA_IMPRESSAO} { display: none; }
@media print {
  body * { visibility: hidden !important; }
  #${ID_AREA_IMPRESSAO} { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
  #${ID_AREA_IMPRESSAO}, #${ID_AREA_IMPRESSAO} * { visibility: visible !important; }
  #${ID_AREA_IMPRESSAO} {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 12pt; line-height: 1.6; color: #111;
  }
  #${ID_AREA_IMPRESSAO} h1, #${ID_AREA_IMPRESSAO} h2, #${ID_AREA_IMPRESSAO} h3 { margin: 0 0 12px; }
  #${ID_AREA_IMPRESSAO} p { margin: 0 0 10px; text-align: justify; }
  @page { size: A4; margin: 25mm 20mm; }
}
`;

/**
 * Imprime só o documento, não a tela.
 * O container vive fora do React: ele precisa existir no DOM no instante do
 * `window.print()` (que é síncrono) e um `setState` não garante isso a tempo.
 * A regra de `visibility` esconde o app inteiro em vez de abrir popup — popup
 * é bloqueado por padrão em quase todo navegador e o usuário fica sem saber.
 */
export function imprimirHtml(html: string, titulo?: string): void {
  if (typeof document === "undefined") return;

  if (!document.getElementById(ID_ESTILO_IMPRESSAO)) {
    const estilo = document.createElement("style");
    estilo.id = ID_ESTILO_IMPRESSAO;
    estilo.textContent = CSS_IMPRESSAO;
    document.head.appendChild(estilo);
  }

  let area = document.getElementById(ID_AREA_IMPRESSAO);
  if (!area) {
    area = document.createElement("div");
    area.id = ID_AREA_IMPRESSAO;
    document.body.appendChild(area);
  }
  // HTML emitido vem do banco; higieniza de novo antes de plantar no DOM —
  // `innerHTML` não roda `<script>`, mas roda `<img onerror>`.
  area.innerHTML = sanitizarHtmlDocumento(html);

  const tituloAnterior = document.title;
  if (titulo) document.title = titulo; // vira o nome do arquivo em "salvar como PDF"

  window.print();
  document.title = tituloAnterior;
}
