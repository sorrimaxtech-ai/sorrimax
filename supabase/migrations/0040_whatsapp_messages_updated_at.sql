-- ============================================================================
-- 0040 · whatsapp_messages.updated_at — a coluna que travava TODO status
-- ----------------------------------------------------------------------------
-- SINTOMA: a mensagem enviada ficava com o relógio para sempre. O envio
-- funcionava de verdade — a fila marcava 'sent', o provedor confirmava e
-- devolvia o id do WhatsApp — mas a LINHA DA MENSAGEM continuava 'pending', e é
-- ela que a tela lê. Nenhum erro visível: o worker registra a falha no console
-- da Edge e segue.
--
-- CAUSA: o gatilho `wa_message_status_guard()` (0009, linha 175) faz
--     new.updated_at := now();
-- mas `whatsapp_messages` NÃO TEM a coluna — a 0009 cria `updated_at` só em
-- whatsapp_outbox (linha 145). A tabela de mensagens nasceu antes, num dos .sql
-- soltos aplicados à mão, sem a coluna. Resultado: TODA escrita de status é
-- abortada com "record new has no field updated_at" — inclusive o ✓✓ do
-- provedor e o eco.
--
-- Quarta ocorrência do mesmo padrão nesta migração (clinicas, leads_sistema,
-- whatsapp_chats.last_read_at e agora esta): função que assume coluna criada
-- fora das migrations numeradas.
-- ============================================================================

begin;

alter table public.whatsapp_messages
  add column if not exists updated_at timestamptz not null default now();

comment on column public.whatsapp_messages.updated_at is
  'Carimbo do gatilho de status. Sem esta coluna, wa_message_status_guard() aborta e a mensagem nunca sai de pending.';

-- Destrava o que ficou preso: mensagem nossa que a fila já confirmou como
-- enviada, mas que não conseguiu gravar o status por causa deste bug.
update public.whatsapp_messages m
   set status = 'sent',
       external_id = coalesce(m.external_id, o.external_id)
  from public.whatsapp_outbox o
 where o.message_id = m.id
   and o.status = 'sent'
   and m.status = 'pending';

commit;

-- ══ Verificação ═════════════════════════════════════════════════════════════
-- update whatsapp_messages set status='sent' where id='<uuid>';  -- UPDATE 1
-- select status, count(*) from whatsapp_messages group by status;
