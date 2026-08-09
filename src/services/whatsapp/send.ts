// ============================================================================
// Envio de mensagem — porta do caminho sendMessage (Diamond) para o Vittalhub.
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
