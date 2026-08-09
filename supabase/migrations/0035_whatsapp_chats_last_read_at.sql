-- ============================================================================
-- 0035 · whatsapp_chats.last_read_at — a coluna que faltava
-- ----------------------------------------------------------------------------
-- SINTOMA: nenhuma mensagem entrava. O webhook autenticava, o parser acertava,
-- a conversa era criada — e o INSERT em whatsapp_messages estourava com
-- "column c.last_read_at does not exist", dentro do gatilho wa_message_bump_chat().
-- A função de borda respondia {"ok":true,"saved":0} e devolvia HTTP 200: do lado
-- do provedor o envio "deu certo". Silêncio total, em toda a corrente.
--
-- CAUSA: a 0009 USA `last_read_at` (no gatilho e em wa_marcar_chat_lido) mas
-- nunca CRIA a coluna. Ela nascia em `supabase/add_unread_tracking.sql`, um dos
-- arquivos soltos aplicados à mão no projeto antigo — o mesmo tipo de buraco que
-- `clinicas` e `leads_sistema` deixaram, e que só aparece em projeto novo.
--
-- Depois desta migration, rodar auditoria_saude() e reexecutar o teste de ponta
-- a ponta do webhook antes de considerar resolvido.
-- ============================================================================

begin;

alter table public.whatsapp_chats
  add column if not exists last_read_at timestamptz;

comment on column public.whatsapp_chats.last_read_at is
  'Quando o atendente abriu a conversa pela última vez. Zera unread_count e alimenta o cálculo de não-lidas.';

-- Conversas que já existem: sem marca de leitura, todas as mensagens contam
-- como não-lidas. É o comportamento correto para quem nunca abriu o chat.

commit;

-- ══ Verificação ═════════════════════════════════════════════════════════════
-- Nenhuma função deve referenciar coluna inexistente de whatsapp_chats:
-- insert into whatsapp_messages (chat_id, clinica_id, content, from_me, status,
--   message_type) values ('<chat>','<clinica>','ping', false,'delivered','text');
-- -- esperado: INSERT 0 1
