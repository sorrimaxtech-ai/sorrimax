import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Campanhas automáticas — service
// ----------------------------------------------------------------------------
// Modelo Codental (benchmark §5), execução nossa: mensagem livre via uazapi,
// runner diário no pg_cron, dedup por chave no banco. O front só liga/desliga,
// edita o texto e mostra o preview de alcance — quem dispara é o banco.
// ============================================================================

export type TipoCampanha =
  | "aniversario"
  | "retorno"
  | "inadimplencia"
  | "pos_consulta"
  | "personalizada";

export interface Campanha {
  id: string;
  clinica_id: string;
  tipo: TipoCampanha;
  nome: string;
  mensagem: string;
  ativa: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EnvioCampanha {
  id: string;
  campanha_id: string;
  paciente_id: string | null;
  telefone: string;
  mensagem: string;
  status: "enfileirado" | "enviado" | "erro" | "pulado";
  motivo: string | null;
  created_at: string;
  campanhas?: { nome: string; tipo: TipoCampanha } | null;
  pacientes?: { nome_completo: string } | null;
}

/** Catálogo das campanhas nativas: o que aparece na Central mesmo antes de existir linha no banco. */
export const CATALOGO: Array<{
  tipo: TipoCampanha;
  nome: string;
  descricao: string;
  emoji: string;
  mensagemPadrao: string;
  config?: Record<string, unknown>;
}> = [
  {
    tipo: "aniversario",
    nome: "Aniversariantes",
    emoji: "🎂",
    descricao: "Parabenize os pacientes no dia do aniversário, automaticamente.",
    mensagemPadrao:
      "Olá {nome}, tudo bem? 🎂\n\nPassando para desejar um feliz aniversário! Que o novo ciclo venha cheio de saúde, conquistas e sorrisos.\n\nUm abraço de toda a equipe da {clinica}! 💙",
  },
  {
    tipo: "retorno",
    nome: "Retorno semestral",
    emoji: "🗓️",
    descricao: "Convida quem fez a última consulta há mais de 6 meses para uma revisão.",
    mensagemPadrao:
      "Oi {nome}! Aqui é da {clinica} 😊\n\nJá faz um tempinho desde a sua última consulta. Que tal agendar uma revisão para manter o sorriso em dia?\n\nÉ só responder esta mensagem que a gente encontra o melhor horário para você!",
    config: { meses: 6 },
  },
  {
    tipo: "inadimplencia",
    nome: "Cobrança de pendências",
    emoji: "💰",
    descricao: "Lembra com delicadeza os pacientes com parcelas em aberto.",
    mensagemPadrao:
      "Olá {nome}, tudo bem? Aqui é da {clinica}.\n\nNotamos que existe um valor de R$ {valor} em aberto no seu tratamento. Podemos te ajudar a regularizar?\n\nQualquer dúvida, é só responder por aqui. 💙",
  },
];

// ---------------------------------------------------------------- CRUD

export async function listarCampanhas(clinicaId: string): Promise<Campanha[]> {
  const { data, error } = await supabase
    .from("campanhas")
    .select("*")
    .eq("clinica_id", clinicaId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Campanha[];
}

/** Cria a linha da campanha nativa na primeira interação (lazy). */
export async function garantirCampanha(
  clinicaId: string,
  tipo: TipoCampanha,
): Promise<Campanha> {
  const item = CATALOGO.find((c) => c.tipo === tipo);
  if (!item) throw new Error("Campanha desconhecida");
  const { data, error } = await supabase
    .from("campanhas")
    .upsert(
      {
        clinica_id: clinicaId,
        tipo,
        nome: item.nome,
        mensagem: item.mensagemPadrao,
        config: item.config ?? {},
      },
      { onConflict: "clinica_id,tipo,nome", ignoreDuplicates: false },
    )
    .select()
    .single();
  if (error) throw error;
  return data as Campanha;
}

export async function salvarCampanha(
  id: string,
  patch: Partial<Pick<Campanha, "mensagem" | "ativa" | "config">>,
): Promise<void> {
  const { error } = await supabase.from("campanhas").update(patch).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- preview

/** "Ao ativar você atingirá ~N pacientes nos próximos 30 dias" — direto do banco. */
export async function previewAlcance(
  tipo: TipoCampanha,
  config: Record<string, unknown> = {},
): Promise<number> {
  const { data, error } = await supabase.rpc("campanha_preview_alcance", {
    p_tipo: tipo,
    p_config: config,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// ---------------------------------------------------------------- histórico

export async function listarEnvios(clinicaId: string, limite = 100): Promise<EnvioCampanha[]> {
  const { data, error } = await supabase
    .from("campanha_envios")
    .select("*, campanhas(nome, tipo), pacientes(nome_completo)")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as EnvioCampanha[];
}
