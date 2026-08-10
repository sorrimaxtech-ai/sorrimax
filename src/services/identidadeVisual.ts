import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Identidade visual da clínica — a marca que assina os documentos
// ----------------------------------------------------------------------------
// Cor, modelo de cabeçalho e logo (posição + fundo). Guardado SEM migration:
// a meta vai em `clinicas.configuracoes.identidade` (jsonb já existente) e a
// logo em `clinicas.logo_url` (data URL). Zero coluna nova = zero risco de
// mexer em RLS/auditoria. O admin já pode dar UPDATE em `clinicas` (mesma
// policy que a tela de Ajustes › Clínica usa).
// ============================================================================

export type TemplateDoc = "faixa" | "classico" | "minimalista" | "elegante";
export type PosicaoLogo = "esquerda" | "centro" | "direita";

export interface IdentidadeVisual {
  corMarca: string;
  template: TemplateDoc;
  logoPosicao: PosicaoLogo;
  logoFundoRemovido: boolean;
  /** data URL (ou http). `null` = sem logo ainda. */
  logoUrl: string | null;
}

export interface DadosClinicaMarca {
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
}

export const IDENTIDADE_PADRAO: IdentidadeVisual = {
  corMarca: "#0077b6",
  template: "faixa",
  logoPosicao: "esquerda",
  logoFundoRemovido: false,
  logoUrl: null,
};

export const TEMPLATES: { id: TemplateDoc; nome: string; descricao: string }[] = [
  { id: "faixa", nome: "Faixa colorida", descricao: "Cabeçalho em bloco com a cor da marca. Impacto imediato." },
  { id: "classico", nome: "Clássico", descricao: "Logo centralizada e filete fino. Sóbrio e atemporal." },
  { id: "minimalista", nome: "Minimalista", descricao: "Logo discreta e muito respiro. Elegância silenciosa." },
  { id: "elegante", nome: "Elegante", descricao: "Tipografia serifada e linha de cor. Ar de consultório premium." },
];

/** Paleta de partida — cores que ficam bem em cabeçalho impresso. */
export const CORES_PRESET = [
  "#0077b6", "#0099c7", "#1e3a8a", "#0f766e",
  "#7c3aed", "#be123c", "#b45309", "#111827",
];

export const POSICOES: { id: PosicaoLogo; rotulo: string }[] = [
  { id: "esquerda", rotulo: "Esquerda" },
  { id: "centro", rotulo: "Centro" },
  { id: "direita", rotulo: "Direita" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const corValida = (c: string) => HEX.test(c.trim());

export function mensagemErro(e: unknown): string {
  const err = e as { message?: string; details?: string } | undefined;
  return err?.message || err?.details || "Não foi possível salvar a identidade visual.";
}

/** Nunca confia no jsonb cru: valida cada campo contra o que a tela conhece. */
function sanear(raw: unknown): Omit<IdentidadeVisual, "logoUrl"> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const templates = new Set(TEMPLATES.map((t) => t.id));
  const posicoes = new Set(POSICOES.map((p) => p.id));
  return {
    corMarca: corValida(String(r.corMarca ?? "")) ? String(r.corMarca) : IDENTIDADE_PADRAO.corMarca,
    template: templates.has(r.template as TemplateDoc) ? (r.template as TemplateDoc) : IDENTIDADE_PADRAO.template,
    logoPosicao: posicoes.has(r.logoPosicao as PosicaoLogo) ? (r.logoPosicao as PosicaoLogo) : IDENTIDADE_PADRAO.logoPosicao,
    logoFundoRemovido: r.logoFundoRemovido === true,
  };
}

export interface IdentidadeCarregada {
  identidade: IdentidadeVisual;
  clinica: DadosClinicaMarca;
}

export async function carregarIdentidade(clinicaId: string): Promise<IdentidadeCarregada> {
  const { data, error } = await supabase
    .from("clinicas")
    .select("nome_clinica, cnpj, endereco, numero, complemento, cidade, estado, telefone, logo_url, configuracoes")
    .eq("id", clinicaId)
    .maybeSingle();
  if (error) throw error;

  const cfg = (data?.configuracoes ?? {}) as Record<string, unknown>;
  const identidade: IdentidadeVisual = {
    ...sanear(cfg.identidade),
    logoUrl: (data?.logo_url as string | null) ?? null,
  };

  const endereco =
    [
      [data?.endereco, data?.numero, data?.complemento].filter(Boolean).join(", "),
      [data?.cidade, data?.estado].filter(Boolean).join("/"),
    ]
      .filter(Boolean)
      .join(" — ") || null;

  const nome = String(data?.nome_clinica ?? "");
  return {
    identidade,
    clinica: {
      // "Clínica de <fulano>" é o nome-placeholder do cadastro; no preview usa genérico
      nome: !nome || /^Clínica de /i.test(nome) ? "Sua Clínica" : nome,
      cnpj: (data?.cnpj as string) || null,
      endereco,
      telefone: (data?.telefone as string) || null,
    },
  };
}

export async function salvarIdentidade(clinicaId: string, id: IdentidadeVisual): Promise<void> {
  // relê configuracoes pra não descartar chaves de outras features
  const { data: atual, error: e1 } = await supabase
    .from("clinicas")
    .select("configuracoes")
    .eq("id", clinicaId)
    .maybeSingle();
  if (e1) throw e1;

  const cfg = (atual?.configuracoes ?? {}) as Record<string, unknown>;
  const novoCfg = {
    ...cfg,
    identidade: {
      corMarca: id.corMarca,
      template: id.template,
      logoPosicao: id.logoPosicao,
      logoFundoRemovido: id.logoFundoRemovido,
    },
  };

  const { data, error } = await supabase
    .from("clinicas")
    .update({ configuracoes: novoCfg, logo_url: id.logoUrl })
    .eq("id", clinicaId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  // UPDATE barrado por RLS volta sem linha e sem erro — não pode virar "salvo".
  if (!data) throw new Error("O banco não autorizou salvar. Faça login como administrador.");
}
