import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Serviço de Configurações — permissões, equipe, página pública e integrações
// ----------------------------------------------------------------------------
// Decisões que não são óbvias lendo só o código:
//
// 1. `perfis_permissao`, `perfil_publico` e `booking_tokens` entraram no banco
//    depois da última geração de `integrations/supabase/types.ts` (arquivo
//    gerado, fora do meu alcance). O acesso a elas passa por `db`, um cast do
//    client. Os contratos ficam declarados aqui à mão — nada de `any` vazando
//    para as telas.
//
// 2. `whatsapp_instances` é o oposto: está tipada, mas o role `authenticated`
//    NÃO tem privilégio de tabela nela — tem apenas GRANT por COLUNA, e só de
//    SELECT, e só nas colunas seguras. `api_url`, `api_token`, `apikey`,
//    `webhook_secret` e `qrcode` ficam de fora do grant de propósito: são
//    credenciais de servidor. Por isso aqui nunca existe `select("*")` nessa
//    tabela — `*` estoura permissão — e não existe insert/update/delete: o
//    banco simplesmente não concede. Conectar instância é trabalho de Edge
//    Function, que roda com service role.
//
// 3. Permissões: o seed do banco (`seed_perfis_permissao`) grava só o par
//    `ver`/`editar` por módulo. A matriz da tela é mais granular
//    (ver/criar/editar/excluir). Ver `normalizarPermissoes` para a regra de
//    conciliação entre os dois formatos.
// ============================================================================

type QueryLivre = {
  from: (tabela: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
const db = supabase as unknown as QueryLivre;

// --------------------------------------------------------------------- erros

/** Texto de erro apresentável, sem vazar objeto cru na tela. */
export function mensagemErro(e: unknown): string {
  if (!e) return "Erro desconhecido.";
  if (typeof e === "string") return e;
  const err = e as { message?: string; details?: string; hint?: string };
  return err.message || err.details || err.hint || "Erro desconhecido.";
}

/** Violação de UNIQUE no Postgres. Usado para dar mensagem humana em vez de "23505". */
export function ehConflitoUnico(e: unknown): boolean {
  return (e as { code?: string })?.code === "23505";
}

/**
 * Erro para write que não atingiu nenhuma linha.
 *
 * UPDATE/DELETE barrado por RLS não retorna erro no PostgREST — retorna zero
 * linhas. Sem esta checagem a tela dava "salvo com sucesso" para uma operação
 * que o banco recusou, e o usuário só descobriria no próximo F5. Todo write
 * desta camada usa `.select()` e passa por aqui.
 */
function exigirLinha<T>(data: T | null | undefined, acao: string): T {
  if (!data) {
    throw new Error(
      `Não foi possível ${acao}: o banco não autorizou a operação ou o registro não existe mais.`,
    );
  }
  return data;
}

// ============================================================================
// PERFIS DE PERMISSÃO
// ============================================================================

export type Acao = "ver" | "criar" | "editar" | "excluir";

export const ACOES: { chave: Acao; rotulo: string; ajuda: string }[] = [
  { chave: "ver", rotulo: "Ver", ajuda: "Abrir a tela e consultar os registros." },
  { chave: "criar", rotulo: "Criar", ajuda: "Cadastrar registros novos." },
  { chave: "editar", rotulo: "Editar", ajuda: "Alterar registros já existentes." },
  { chave: "excluir", rotulo: "Excluir", ajuda: "Apagar registros. Conceda com parcimônia." },
];

export interface ModuloInfo {
  chave: string;
  rotulo: string;
  grupo: string;
}

// A lista é a UNIÃO do que o seed do banco grava com o que a navegação expõe.
// Módulo fora daqui que exista no jsonb é preservado no save (ver `mesclarPermissoes`),
// só não aparece na matriz — assim a tela nunca apaga permissão que não entende.
export const MODULOS: ModuloInfo[] = [
  { chave: "dashboard", rotulo: "Dashboard", grupo: "Operação" },
  { chave: "agenda", rotulo: "Agenda", grupo: "Operação" },
  { chave: "pacientes", rotulo: "Pacientes", grupo: "Operação" },
  { chave: "consultas", rotulo: "Consultas", grupo: "Operação" },
  { chave: "clinico", rotulo: "Prontuário clínico", grupo: "Clínico" },
  { chave: "protese", rotulo: "Prótese", grupo: "Clínico" },
  { chave: "estoque", rotulo: "Estoque", grupo: "Clínico" },
  { chave: "orcamentos", rotulo: "Orçamentos", grupo: "Comercial" },
  { chave: "crm", rotulo: "CRM / Funil", grupo: "Comercial" },
  { chave: "whatsapp", rotulo: "WhatsApp", grupo: "Comercial" },
  { chave: "financeiro", rotulo: "Financeiro", grupo: "Gestão" },
  { chave: "relatorios", rotulo: "Relatórios", grupo: "Gestão" },
  { chave: "equipe", rotulo: "Equipe", grupo: "Gestão" },
  { chave: "configuracoes", rotulo: "Configurações", grupo: "Gestão" },
];

export const GRUPOS_MODULO = ["Operação", "Clínico", "Comercial", "Gestão"] as const;

export type PermissoesModulo = Record<Acao, boolean>;
export type Permissoes = Record<string, PermissoesModulo>;

export interface PerfilPermissao {
  id: string;
  nome: string;
  sistema: boolean;
  permissoes: Permissoes;
  /** jsonb como veio do banco — preservado no save para não perder chave desconhecida. */
  brutas: Record<string, unknown>;
  criadoEm: string;
}

/**
 * Concilia o formato do banco com a matriz da tela.
 *
 * O seed grava `{ver, editar}`. Quando `criar`/`excluir` não existem no jsonb,
 * herdam o valor de `editar` — quem pode alterar o registro é quem cria e apaga.
 * Sem essa herança o perfil "Administrador" abriria com metade da matriz vazia,
 * dizendo uma coisa que o banco não disse. Assim que o usuário salva, as quatro
 * chaves passam a existir explicitamente e a herança deixa de valer.
 */
export function normalizarPermissoes(raw: unknown): Permissoes {
  const fonte = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const saida: Permissoes = {};

  for (const modulo of MODULOS) {
    const m = fonte[modulo.chave] ?? {};
    const editar = m.editar === true;
    saida[modulo.chave] = {
      ver: m.ver === true,
      criar: "criar" in m ? m.criar === true : editar,
      editar,
      excluir: "excluir" in m ? m.excluir === true : editar,
    };
  }
  return saida;
}

/** Junta a matriz editada ao jsonb original, sem descartar chave desconhecida. */
export function mesclarPermissoes(
  brutas: Record<string, unknown>,
  matriz: Permissoes,
): Record<string, unknown> {
  return { ...brutas, ...matriz };
}

export function contarLiberacoes(p: Permissoes): number {
  return Object.values(p).reduce(
    (acc, m) => acc + ACOES.filter((a) => m[a.chave]).length,
    0,
  );
}

export const TOTAL_LIBERACOES = MODULOS.length * ACOES.length;

/** Matriz zerada — base para perfil novo. */
export function permissoesVazias(): Permissoes {
  return normalizarPermissoes({});
}

export async function listarPerfis(clinicaId: string): Promise<PerfilPermissao[]> {
  const { data, error } = await db
    .from("perfis_permissao")
    .select("id, nome, permissoes, sistema, created_at")
    .eq("clinica_id", clinicaId)
    .order("sistema", { ascending: false })
    .order("nome");

  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    nome: String(r.nome),
    sistema: r.sistema === true,
    permissoes: normalizarPermissoes(r.permissoes),
    brutas: (r.permissoes ?? {}) as Record<string, unknown>,
    criadoEm: String(r.created_at ?? ""),
  }));
}

export async function criarPerfil(
  clinicaId: string,
  nome: string,
  permissoes: Permissoes,
): Promise<void> {
  const { error } = await db.from("perfis_permissao").insert({
    clinica_id: clinicaId,
    nome: nome.trim(),
    permissoes,
    sistema: false,
  });
  if (error) throw error;
}

export async function atualizarPerfil(
  id: string,
  clinicaId: string,
  patch: { nome?: string; permissoes?: Record<string, unknown> },
): Promise<void> {
  const corpo: Record<string, unknown> = {};
  if (patch.nome !== undefined) corpo.nome = patch.nome.trim();
  if (patch.permissoes !== undefined) corpo.permissoes = patch.permissoes;

  const { data, error } = await db
    .from("perfis_permissao")
    .update(corpo)
    .eq("id", id)
    .eq("clinica_id", clinicaId) // cinto e suspensório: a RLS já filtra, mas o filtro explícito evita update largo se a policy mudar
    .select("id")
    .maybeSingle();
  if (error) throw error;
  exigirLinha(data, "salvar o perfil");
}

export async function excluirPerfil(id: string, clinicaId: string): Promise<void> {
  const { data, error } = await db
    .from("perfis_permissao")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  exigirLinha(data, "excluir o perfil");
}

/**
 * Recria os perfis padrão (Administrador, Dentista, Recepção, Auxiliar).
 * A função no banco usa `on conflict do nothing`: perfil existente NÃO é
 * sobrescrito — só volta o que tinha sido excluído. A tela precisa dizer isso.
 */
export async function restaurarPerfisPadrao(clinicaId: string): Promise<void> {
  const { error } = await db.rpc("seed_perfis_permissao", { p_clinica: clinicaId });
  if (error) throw error;
}

// ============================================================================
// EQUIPE
// ============================================================================

export type Papel = "admin" | "professional" | "receptionist";

export const PAPEIS: Papel[] = ["admin", "professional", "receptionist"];

export const PAPEL_LABEL: Record<Papel, string> = {
  admin: "Administrador",
  professional: "Profissional",
  receptionist: "Recepção",
};

export const PAPEL_DESCRICAO: Record<Papel, string> = {
  admin: "Acesso total, incluindo financeiro, equipe e configurações.",
  professional: "Agenda, pacientes e prontuário dos próprios atendimentos.",
  receptionist: "Agenda, cadastro de pacientes e atendimento no WhatsApp.",
};

export const PAPEL_CLASSE: Record<Papel, string> = {
  admin: "bg-brand-100 text-brand-800 border-0",
  professional: "bg-sky-100 text-sky-800 border-0",
  receptionist: "bg-amber-100 text-amber-800 border-0",
};

export const STATUS_MEMBRO_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
};

export const STATUS_MEMBRO_CLASSE: Record<string, string> = {
  active: "bg-brand-100 text-brand-800 border-0",
  inactive: "bg-gray-100 text-gray-600 border-0",
  pending: "bg-amber-100 text-amber-800 border-0",
};

export interface MembroEquipe {
  id: string;
  nome: string;
  email: string | null;
  papel: Papel;
  status: string;
  especialidade: string | null;
  registro: string | null;
}

const PAPEL_VALIDO = (v: unknown): Papel =>
  PAPEIS.includes(v as Papel) ? (v as Papel) : "receptionist";

export async function listarEquipe(clinicaId: string): Promise<MembroEquipe[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status, especialidade, registro_profissional")
    .eq("clinica_id", clinicaId)
    .order("full_name");

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    nome: r.full_name || r.email || "Sem nome",
    email: r.email,
    papel: PAPEL_VALIDO(r.role),
    status: r.status || "active",
    especialidade: r.especialidade,
    registro: r.registro_profissional,
  }));
}

/** Só admin consegue: a policy `profiles_admin_manage` exige `is_admin()`. */
export async function alterarPapel(
  id: string,
  clinicaId: string,
  papel: Papel,
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: papel })
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .select("id, role")
    .maybeSingle();
  if (error) throw error;
  // Sem admin, `profiles_admin_manage` não casa e o UPDATE some sem erro.
  // Sem esta linha a tela mostrava "papel atualizado" para uma troca recusada.
  exigirLinha(data, "alterar o papel");
}

// ============================================================================
// PÁGINA PÚBLICA
// ============================================================================

// Espelha o CHECK do banco: `^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])?$`.
// Repare que 2 caracteres NÃO passam (ou 1, ou de 3 a 60) — o banco é assim,
// e validar antes evita mandar o usuário tomar erro 23514 no save.
export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])?$/;

export function normalizarSlug(valor: string): string {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acento: "saúde" → "saude"
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}

export function erroSlug(slug: string): string | null {
  if (!slug) return "Informe o endereço da página.";
  if (slug.length === 2) return "Use 1 caractere ou de 3 a 60.";
  if (slug.length > 60) return "Máximo de 60 caracteres.";
  if (!SLUG_REGEX.test(slug)) {
    return "Use apenas letras minúsculas, números e hífen — sem hífen no começo ou no fim.";
  }
  return null;
}

/**
 * Endereço público da clínica.
 *
 * O prefixo é `/c/` porque é o único contrato escrito no repositório: a
 * migration 0023, que criou `perfil_publico`, documenta a URL como
 * `/c/<slug>`. A rota ainda não existe em `App.tsx` (fora do alcance deste
 * módulo) — quando for criada, tem que ser `/c/:slug`, senão todo link
 * divulgado pela clínica cai no NotFound.
 */
export function urlPublica(slug: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/c/${slug}`;
}

export interface PerfilPublico {
  id: string | null;
  slug: string;
  bio: string;
  fotoUrl: string;
  capaUrl: string;
  especialidades: string[];
  aceitaAgendamento: boolean;
  publicado: boolean;
}

export const PERFIL_PUBLICO_VAZIO: PerfilPublico = {
  id: null,
  slug: "",
  bio: "",
  fotoUrl: "",
  capaUrl: "",
  especialidades: [],
  aceitaAgendamento: true,
  publicado: false,
};

export async function carregarPerfilPublico(clinicaId: string): Promise<PerfilPublico | null> {
  const { data, error } = await db
    .from("perfil_publico")
    .select("id, slug, bio, foto_url, capa_url, especialidades, aceita_agendamento, publicado")
    .eq("clinica_id", clinicaId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    slug: String(r.slug ?? ""),
    bio: String(r.bio ?? ""),
    fotoUrl: String(r.foto_url ?? ""),
    capaUrl: String(r.capa_url ?? ""),
    especialidades: Array.isArray(r.especialidades) ? (r.especialidades as string[]) : [],
    aceitaAgendamento: r.aceita_agendamento !== false,
    publicado: r.publicado === true,
  };
}

export async function salvarPerfilPublico(
  clinicaId: string,
  perfil: PerfilPublico,
): Promise<PerfilPublico> {
  const corpo = {
    clinica_id: clinicaId,
    slug: perfil.slug,
    bio: perfil.bio.trim() || null,
    foto_url: perfil.fotoUrl.trim() || null,
    capa_url: perfil.capaUrl.trim() || null,
    especialidades: perfil.especialidades,
    aceita_agendamento: perfil.aceitaAgendamento,
    publicado: perfil.publicado,
  };

  // `clinica_id` é UNIQUE: uma clínica tem no máximo uma página pública.
  const { data, error } = await db
    .from("perfil_publico")
    .upsert(corpo, { onConflict: "clinica_id" })
    .select("id, slug, bio, foto_url, capa_url, especialidades, aceita_agendamento, publicado")
    .maybeSingle();

  if (error) throw error;
  // Upsert barrado pela RLS volta sem linha e sem erro — não pode virar "salvo".
  const r = exigirLinha(data, "salvar a página pública") as Record<string, unknown>;

  return {
    id: r.id ? String(r.id) : perfil.id,
    slug: String(r.slug ?? perfil.slug),
    bio: String(r.bio ?? ""),
    fotoUrl: String(r.foto_url ?? ""),
    capaUrl: String(r.capa_url ?? ""),
    especialidades: Array.isArray(r.especialidades)
      ? (r.especialidades as string[])
      : perfil.especialidades,
    aceitaAgendamento: r.aceita_agendamento !== false,
    publicado: r.publicado === true,
  };
}

/**
 * Checagem de disponibilidade do slug — best effort, e o "best effort" importa:
 * a RLS de `perfil_publico` só deixa ler o perfil da própria clínica e os de
 * outras clínicas que estejam PUBLICADOS. Slug reservado por uma clínica que
 * ainda não publicou é invisível daqui. Por isso o save trata 23505: o UNIQUE
 * do banco é a autoridade final, esta função só antecipa o caso comum.
 */
export async function slugEmUso(slug: string, clinicaId: string): Promise<boolean> {
  // `neq` no lugar de trazer o `clinica_id` alheio para o navegador: a resposta
  // precisa ser um booleano, não o identificador de outra clínica.
  const { data, error } = await db
    .from("perfil_publico")
    .select("slug")
    .eq("slug", slug)
    .neq("clinica_id", clinicaId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

/** Especialidades já cadastradas pela clínica — vira sugestão no editor. */
export async function especialidadesDaClinica(clinicaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("clinica_especialidades")
    .select("especialidades(nome)")
    .eq("clinica_id", clinicaId);

  if (error) throw error;

  return (data ?? [])
    .map((r) => (r.especialidades as { nome: string } | null)?.nome)
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ------------------------------------------------------------ link de agenda

export type TipoBookingToken = "agendamento" | "cadastro";

export const TIPO_TOKEN_LABEL: Record<TipoBookingToken, string> = {
  agendamento: "Agendamento",
  cadastro: "Cadastro do paciente",
};

export const TIPO_TOKEN_AJUDA: Record<TipoBookingToken, string> = {
  agendamento: "O paciente escolhe horário direto na sua agenda.",
  cadastro: "O paciente preenche a ficha antes de chegar na clínica.",
};

export interface BookingToken {
  id: string;
  token: string;
  tipo: TipoBookingToken;
  expiraEm: string;
  usadoEm: string | null;
  criadoEm: string;
}

export function tokenExpirado(t: BookingToken): boolean {
  return new Date(t.expiraEm).getTime() <= Date.now();
}

export function urlToken(slug: string, token: string): string {
  return `${urlPublica(slug)}?t=${token}`;
}

export async function listarTokens(clinicaId: string): Promise<BookingToken[]> {
  const { data, error } = await db
    .from("booking_tokens")
    .select("id, token, tipo, expira_em, usado_em, created_at")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    token: String(r.token),
    tipo: (r.tipo === "cadastro" ? "cadastro" : "agendamento") as TipoBookingToken,
    expiraEm: String(r.expira_em),
    usadoEm: r.usado_em ? String(r.usado_em) : null,
    criadoEm: String(r.created_at ?? ""),
  }));
}

/** O `token` em si é gerado pelo banco (`gen_random_bytes`) — nunca pelo cliente. */
export async function gerarToken(
  clinicaId: string,
  tipo: TipoBookingToken,
  diasValidade = 7,
): Promise<BookingToken> {
  const expira = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("booking_tokens")
    .insert({ clinica_id: clinicaId, tipo, expira_em: expira })
    .select("id, token, tipo, expira_em, usado_em, created_at")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("O link não voltou do banco. Tente de novo.");

  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    token: String(r.token),
    tipo,
    expiraEm: String(r.expira_em),
    usadoEm: null,
    criadoEm: String(r.created_at ?? ""),
  };
}

export async function revogarToken(id: string, clinicaId: string): Promise<void> {
  const { data, error } = await db
    .from("booking_tokens")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  exigirLinha(data, "revogar o link");
}

// ============================================================================
// INTEGRAÇÕES — WhatsApp
// ============================================================================

// `provider` NÃO aparece aqui de propósito. A coluna existe (enum wa_provider,
// migration 0010), mas ficou de fora do único GRANT de coluna concedido ao
// role `authenticated` (migration 0017, linhas 39-42). Pedir `provider` no
// select faz o Postgres devolver 42501 e NEGAR A QUERY INTEIRA — a tela de
// Integrações mostrava toast de erro e lista vazia em 100% das cargas.
// Se o provedor precisar ser exibido, o caminho é uma migration nova com
// `grant select (provider) on public.whatsapp_instances to authenticated`,
// não um select otimista aqui.

export const WA_STATUS_LABEL: Record<string, string> = {
  connected: "Conectado",
  connecting: "Conectando",
  disconnected: "Desconectado",
};

export const WA_STATUS_CLASSE: Record<string, string> = {
  connected: "bg-brand-100 text-brand-800 border-0",
  connecting: "bg-amber-100 text-amber-800 border-0",
  disconnected: "bg-red-100 text-red-800 border-0",
};

export const WA_STATUS_AJUDA: Record<string, string> = {
  connected: "A instância está online e enviando/recebendo mensagens.",
  connecting: "Pareamento em andamento. Conclua a leitura do QR Code no provedor.",
  disconnected: "Sem sessão ativa. Mensagens novas ficam na fila até reconectar.",
};

export const WEBHOOK_MODE_LABEL: Record<string, string> = {
  direct: "Direto",
  shared: "Compartilhado",
  proxy: "Via proxy",
  disabled: "Desligado",
};

export const WEBHOOK_MODE_AJUDA: Record<string, string> = {
  direct: "O provedor entrega os eventos direto neste sistema.",
  shared: "Os eventos chegam a mais de um sistema a partir da mesma instância.",
  proxy: "Os eventos passam por um intermediário antes de chegar aqui.",
  disabled: "Nenhum evento é recebido — só envio.",
};

export interface InstanciaWhatsApp {
  id: string;
  nome: string;
  instanceId: string;
  status: string;
  numero: string | null;
  perfil: string | null;
  compartilhada: boolean;
  sistemaExterno: string | null;
  webhookMode: string;
  degradada: boolean;
  conectadaEm: string | null;
  vistaEm: string | null;
  criadaEm: string | null;
}

/**
 * ATENÇÃO: a lista de colunas abaixo não é estética — é a superfície de
 * segurança, e é uma CÓPIA EXATA do grant da migration 0017:
 *
 *   grant select (id, clinica_id, instance_id, name, status, degraded,
 *                 connected_at, last_seen_at, profile_name, owner_number,
 *                 shared_external, external_system, webhook_mode,
 *                 created_at, updated_at)
 *     on public.whatsapp_instances to authenticated;
 *
 * `api_url`, `api_token`, `apikey`, `webhook_secret`, `qrcode`, `external_ref`
 * e `provider` estão FORA do grant. Pedir qualquer uma delas (ou usar
 * `select("*")`) faz o Postgres negar a query inteira com 42501. Credencial só
 * existe do lado do servidor. Não acrescente coluna aqui sem conferir o grant.
 */
const COLUNAS_SEGURAS_WA =
  "id, name, instance_id, status, owner_number, profile_name, " +
  "shared_external, external_system, webhook_mode, degraded, connected_at, last_seen_at, created_at";

export async function listarInstancias(clinicaId: string): Promise<InstanciaWhatsApp[]> {
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select(COLUNAS_SEGURAS_WA)
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    nome: String(r.name ?? "Instância"),
    instanceId: String(r.instance_id ?? ""),
    status: String(r.status ?? "disconnected"),
    numero: r.owner_number ? String(r.owner_number) : null,
    perfil: r.profile_name ? String(r.profile_name) : null,
    compartilhada: r.shared_external === true,
    sistemaExterno: r.external_system ? String(r.external_system) : null,
    webhookMode: String(r.webhook_mode ?? "direct"),
    degradada: r.degraded === true,
    conectadaEm: r.connected_at ? String(r.connected_at) : null,
    vistaEm: r.last_seen_at ? String(r.last_seen_at) : null,
    criadaEm: r.created_at ? String(r.created_at) : null,
  }));
}

/** Formata telefone só para leitura — não valida, não altera o dado guardado. */
export function formatarNumero(numero: string | null): string {
  if (!numero) return "—";
  const d = numero.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return numero;
}

export const dataHoraBR = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const dataBR = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";
