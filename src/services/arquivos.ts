import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Arquivos (anexos de paciente) — front fala com a edge `r2-storage`, nunca com
// o R2 direto. A edge devolve URL pré-assinada e o navegador sobe/baixa o
// arquivo direto do R2 (os bytes não passam pelo nosso servidor).
// ============================================================================

export interface ArquivoRow {
  id: string;
  categoria: string;
  nome_original: string;
  content_type: string | null;
  tamanho_bytes: number | null;
  created_at: string;
  paciente_id: string | null;
}

export const CATEGORIAS_ARQUIVO = [
  { valor: "exame", rotulo: "Exame" },
  { valor: "raio-x", rotulo: "Raio-X" },
  { valor: "foto", rotulo: "Foto" },
  { valor: "documento", rotulo: "Documento" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export const MAX_ARQUIVO_BYTES = 25 * 1024 * 1024;

/** Envelope comum do edge: { erro, detalhe } em falha de negócio. */
async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("r2-storage", { body: corpo });
  if (error) {
    const ctx = (error as any)?.context;
    let msg = error.message, det: string | undefined;
    try {
      const c = typeof ctx?.body === "string" ? JSON.parse(ctx.body) : ctx?.body;
      if (c?.erro) { msg = c.erro; det = c.detalhe; }
    } catch { /* mantém msg de transporte */ }
    throw new Error(det ? `${msg} — ${det}` : msg);
  }
  if (data && typeof data === "object" && "erro" in (data as any)) {
    const d = data as any;
    throw new Error(d.detalhe ? `${d.erro} — ${d.detalhe}` : d.erro);
  }
  return data as T;
}

export async function listarArquivos(clinicaId: string, pacienteId: string): Promise<ArquivoRow[]> {
  const { data, error } = await supabase
    .from("arquivos")
    .select("id, categoria, nome_original, content_type, tamanho_bytes, created_at, paciente_id")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ArquivoRow[];
}

/**
 * Sobe um arquivo: pede a URL de upload à edge, faz o PUT direto no R2. Se o PUT
 * falhar, reverte a linha órfã pra não deixar item quebrado na lista.
 */
export async function subirArquivo(params: {
  file: File;
  pacienteId: string;
  categoria: string;
  consultaId?: string | null;
}): Promise<void> {
  const { file, pacienteId, categoria, consultaId } = params;
  if (file.size > MAX_ARQUIVO_BYTES) throw new Error("Arquivo acima do limite de 25 MB.");

  const contentType = file.type || "application/octet-stream";
  const { arquivoId, uploadUrl } = await chamar<{ arquivoId: string; uploadUrl: string }>({
    acao: "criar",
    nome: file.name,
    contentType,
    tamanho: file.size,
    pacienteId,
    consultaId: consultaId ?? null,
    categoria,
  });

  const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "content-type": contentType } });
  if (!put.ok) {
    await chamar({ acao: "excluir", arquivoId }).catch(() => { /* melhor esforço */ });
    throw new Error("Falha ao enviar o arquivo. Tente de novo.");
  }
}

/** URL pré-assinada (curta) pra ver/baixar o arquivo. */
export async function urlDoArquivo(arquivoId: string): Promise<string> {
  const { url } = await chamar<{ url: string }>({ acao: "url", arquivoId });
  return url;
}

export async function excluirArquivo(arquivoId: string): Promise<void> {
  await chamar({ acao: "excluir", arquivoId });
}

export function tamanhoLegivel(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const ehImagem = (ct: string | null) => !!ct && ct.startsWith("image/");
