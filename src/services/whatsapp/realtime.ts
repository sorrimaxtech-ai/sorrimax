// ============================================================================
// Realtime do chat — porta de useChatsRealtime.ts (Diamond, Pusher) para
// Supabase Realtime. A ADR 0001 mostra que o navegador quase só RECEBE
// (subscribe); publicar é o backend. Aqui o "publish" é o próprio Postgres:
// toda mudança em whatsapp_messages/whatsapp_chats (via webhook/trigger) é
// empurrada pelo canal de Realtime. Um lugar assina; N componentes reagem.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface WaMessageRow {
  id: string;
  chat_id: string;
  clinica_id: string;
  content: string | null;
  from_me: boolean;
  status: string;
  message_type: string;
  media_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  sender_name: string | null;
  external_id: string | null;
  created_at: string;
}

export interface WaChatRow {
  id: string;
  clinica_id: string;
  name: string | null;
  contact_phone: string | null;
  profile_pic_url: string | null;
  last_message_content: string | null;
  last_message_time: string | null;
  unread_count: number;
  assigned_to: string | null;
  tags: string[];
  archived_at: string | null;
  paciente_id: string | null;
}

interface Handlers {
  onNewMessage?: (m: WaMessageRow) => void;      // evento "new-message" do Diamond
  onMessageUpdated?: (m: WaMessageRow) => void;  // evento "message-updated" (status/ack)
  onChatChanged?: (c: WaChatRow) => void;        // preview/unread/assign mudou
}

/**
 * Assina o canal de chat de UMA clínica. Retorna a função de cleanup.
 * Substitui `subscribe(chat-channel-{accountId})` + binds do Pusher.
 *
 *   const off = subscribeChatRealtime(clinicaId, { onNewMessage, onMessageUpdated });
 *   // ...
 *   off();
 */
export function subscribeChatRealtime(
  clinicaId: string,
  handlers: Handlers,
  /** Sufixo do canal — dois assinantes simultâneos (página + chat flutuante)
   * precisam de tópicos distintos, senão um removeChannel derruba o outro. */
  canal = "",
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`chat-${clinicaId}${canal}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `clinica_id=eq.${clinicaId}` },
      (payload) => handlers.onNewMessage?.(payload.new as WaMessageRow),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: `clinica_id=eq.${clinicaId}` },
      (payload) => handlers.onMessageUpdated?.(payload.new as WaMessageRow),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "whatsapp_chats", filter: `clinica_id=eq.${clinicaId}` },
      (payload) => handlers.onChatChanged?.(payload.new as WaChatRow),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
