// ============================================================================
// Envio de mensagem — porta do caminho sendMessage (Diamond) para o Sorrimax.
// O envio NÃO chama a Evolution/uazapi direto do navegador: enfileira via RPC
// (wa_enfileirar_texto), que cria a mensagem otimista (pending) + o item na
// outbox de forma atômica. O worker (Edge Function whatsapp-outbox) envia e o
// Realtime devolve o status. Isso dá: UI otimista, retry, DLQ e pacing.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";

/**
 * Enfileira um texto para um chat. Retorna o id da mensagem otimista (que já
 * aparece na tela como "pending"). O status evolui sozinho via Realtime.
 */
export async function enqueueText(chatId: string, texto: string): Promise<string | null> {
  const clean = texto.trim();
  if (!clean) return null;
  const { data, error } = await supabase.rpc("wa_enfileirar_texto", {
    p_chat_id: chatId,
    p_texto: clean,
  });
  if (error) {
    console.error("[wa] enqueueText", error.message);
    throw error;
  }
  return data as string;
}

export type TipoMidiaWa = "image" | "video" | "document" | "audio" | "ptt";

/** Deduz o tipo que o WhatsApp entende a partir do arquivo escolhido. */
export function tipoDoArquivo(file: File): TipoMidiaWa {
  const m = file.type || "";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Envia arquivo pelo chat: sobe para o nosso armazenamento e enfileira.
 *
 * O arquivo NÃO vai em base64 pelo banco (incharia a fila e a linha da
 * mensagem). Ele sobe para o R2 pela função que já existe, e o que segue para o
 * provedor é uma URL assinada — o mesmo caminho dos anexos de paciente.
 */
export async function enqueueMedia(
  chatId: string,
  file: File,
  legenda?: string,
): Promise<string | null> {
  const tipo = tipoDoArquivo(file);

  // 1. reserva o lugar e pega a URL de subida
  const { data: criado, error: e1 } = await supabase.functions.invoke("r2-storage", {
    body: {
      acao: "criar",
      nome: file.name,
      contentType: file.type || "application/octet-stream",
      tamanho: file.size,
      categoria: "documento",
    },
  });
  if (e1 || (criado as any)?.erro) throw new Error((criado as any)?.erro ?? e1?.message ?? "Falha ao preparar o envio");

  // 2. sobe o arquivo direto para o armazenamento (não passa pelo nosso servidor)
  const up = await fetch((criado as any).uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!up.ok) throw new Error("Não foi possível enviar o arquivo");

  // 3. URL de leitura para o provedor buscar
  const { data: lido, error: e2 } = await supabase.functions.invoke("r2-storage", {
    body: { acao: "url", arquivoId: (criado as any).arquivoId },
  });
  if (e2 || (lido as any)?.erro) throw new Error((lido as any)?.erro ?? e2?.message ?? "Falha ao liberar o arquivo");

  // 4. enfileira — a bolha já nasce na tela com o arquivo visível
  const { data, error } = await supabase.rpc("wa_enfileirar_midia", {
    p_chat_id: chatId,
    p_tipo: tipo,
    p_url: (lido as any).url,
    p_legenda: legenda?.trim() || null,
    p_nome_arquivo: tipo === "document" ? file.name : null,
  });
  if (error) throw error;
  return data as string;
}

/** Zera as não-lidas ao abrir o chat (porta o mark-as-read). */
export async function markChatRead(chatId: string): Promise<void> {
  const { error } = await supabase.rpc("wa_marcar_chat_lido", { p_chat_id: chatId });
  if (error) console.error("[wa] markChatRead", error.message);
}

/** Atribui o chat a um atendente (assign). */
export async function assignChat(chatId: string, profileId: string | null): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_chats")
    .update({ assigned_to: profileId })
    .eq("id", chatId);
  if (error) throw error;
}

/** Adiciona/remove etiqueta do chat. */
export async function setChatTags(chatId: string, tags: string[]): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_chats")
    .update({ tags })
    .eq("id", chatId);
  if (error) throw error;
}

/** Arquiva/desarquiva o chat. */
export async function archiveChat(chatId: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_chats")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", chatId);
  if (error) throw error;
}
