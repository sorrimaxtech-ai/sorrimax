-- ============================================================================
-- VITTALHUB · 0009 · Processos simultâneos do chat WhatsApp
-- ----------------------------------------------------------------------------
-- Porta os processos concorrentes do Diamond CRM para a realidade do Vittalhub.
-- Mapeamento de arquitetura (Diamond → aqui):
--   uazapi                → Evolution API (Baileys), que o projeto já usa
--   Pusher (realtime)     → Supabase Realtime (CDC de whatsapp_messages/chats)
--   fila em processo Node → tabela whatsapp_outbox drenada por Edge Function
--   worker/DLQ Nitro      → status na outbox (queued/sending/sent/failed/dead)
--   parser SSE + webhook  → UM parser só na Edge Function (recomendação da auditoria 03)
-- Algoritmos portados fiéis: status rank (nunca retrocede), split de mensagem,
-- circuit breaker por lentidão, dedupe por external_id, SLA first_response.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- enums
-- Status com ORDEM (rank). failed pode ocorrer a qualquer momento.
-- Porta MessageStatus + isValidStatusProgression do Diamond.
do $$ begin
  create type public.wa_msg_status as enum ('pending','sent','delivered','read','played','failed');
exception when duplicate_object then null; end $$;

-- Tipos de mensagem — parser único (a auditoria 03 aponta os 3 parsers divergentes
-- como raiz de bug; aqui é um enum só).
do $$ begin
  create type public.wa_msg_type as enum (
    'text','image','video','audio','ptt','document','location','contact',
    'reaction','sticker','call','system','unknown'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wa_outbox_status as enum ('queued','sending','sent','failed','dead','canceled');
exception when duplicate_object then null; end $$;

-- rank do status: usado para NUNCA rebaixar (delivered não volta pra sent)
create or replace function public.wa_status_rank(s public.wa_msg_status)
returns int language sql immutable as $$
  select case s
    when 'pending' then 1 when 'sent' then 2 when 'delivered' then 3
    when 'read' then 4 when 'played' then 5 when 'failed' then 0 end
$$;

-- ============================================================================
-- enriquecimento das tabelas existentes
-- ============================================================================

-- whatsapp_instances: token/estado da conexão + webhook
alter table public.whatsapp_instances
  add column if not exists connected_at    timestamptz,
  add column if not exists last_seen_at     timestamptz,
  add column if not exists degraded         boolean not null default false,  -- circuit breaker
  add column if not exists webhook_secret   text;

-- whatsapp_chats: atendimento (assign), etiquetas, SLA, denormalização de tenant
alter table public.whatsapp_chats
  add column if not exists clinica_id       uuid references public.clinicas(id) on delete cascade,
  add column if not exists contact_phone    text,
  add column if not exists assigned_to      uuid references public.profiles(id) on delete set null,
  add column if not exists tags             text[] not null default '{}',
  add column if not exists first_response_at timestamptz,   -- SLA: 1ª resposta do atendente
  add column if not exists last_from_me     boolean,
  add column if not exists archived_at      timestamptz,
  add column if not exists paciente_id      uuid references public.pacientes(id) on delete set null,
  add column if not exists lead_id          uuid;

-- backfill clinica_id nos chats a partir da instância
update public.whatsapp_chats c
   set clinica_id = i.clinica_id
  from public.whatsapp_instances i
 where c.instance_id = i.id and c.clinica_id is null;

-- whatsapp_messages: tipo, ordenação de rajada, mídia, metadata, acks, tenant
alter table public.whatsapp_messages
  add column if not exists clinica_id     uuid references public.clinicas(id) on delete cascade,
  add column if not exists message_type   public.wa_msg_type not null default 'text',
  add column if not exists seqid          bigint,            -- ordenação em rajada (auditoria A4-03)
  add column if not exists sender_name    text,
  add column if not exists reply_to       text,              -- external_id da mensagem citada
  add column if not exists metadata       jsonb not null default '{}'::jsonb,
  add column if not exists mime_type      text,
  add column if not exists file_name      text,
  add column if not exists sent_at        timestamptz,
  add column if not exists delivered_at   timestamptz,
  add column if not exists read_at        timestamptz,
  add column if not exists failed_reason  text;

-- migra a coluna status (text) para o enum, preservando valores conhecidos
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='whatsapp_messages'
                and column_name='status' and data_type <> 'USER-DEFINED') then
    alter table public.whatsapp_messages
      alter column status drop default,
      alter column status type public.wa_msg_status
        using (case lower(coalesce(status,'sent'))
                 when 'pending' then 'pending' when 'sent' then 'sent'
                 when 'delivered' then 'delivered' when 'read' then 'read'
                 when 'played' then 'played' when 'failed' then 'failed'
                 else 'sent' end)::public.wa_msg_status,
      alter column status set default 'sent';
  end if;
end $$;

-- backfill tenant nas mensagens
update public.whatsapp_messages m
   set clinica_id = c.clinica_id
  from public.whatsapp_chats c
 where m.chat_id = c.id and m.clinica_id is null;

-- dedupe: uma mensagem externa nunca entra duas vezes (webhook idempotente)
create unique index if not exists uq_wa_messages_external
  on public.whatsapp_messages(chat_id, external_id) where external_id is not null;
create index if not exists idx_wa_messages_seqid on public.whatsapp_messages(chat_id, seqid);
create index if not exists idx_wa_chats_assigned on public.whatsapp_chats(assigned_to) where archived_at is null;
create index if not exists idx_wa_chats_clinica  on public.whatsapp_chats(clinica_id, last_message_time desc);
create index if not exists idx_wa_chats_tags     on public.whatsapp_chats using gin(tags);

-- ============================================================================
-- whatsapp_outbox — fila de envio (porta message-queue + DLQ + pacing)
-- ============================================================================
create table if not exists public.whatsapp_outbox (
  id            uuid primary key default gen_random_uuid(),
  clinica_id    uuid not null references public.clinicas(id) on delete cascade,
  instance_id   uuid not null references public.whatsapp_instances(id) on delete cascade,
  chat_id       uuid references public.whatsapp_chats(id) on delete set null,
  message_id    uuid references public.whatsapp_messages(id) on delete set null,  -- msg otimista

  to_number     text not null,
  kind          public.wa_msg_type not null default 'text',
  payload       jsonb not null,                 -- {text} | {url,caption,mime,filename} | ...

  status        public.wa_outbox_status not null default 'queued',
  attempts      int not null default 0,
  max_attempts  int not null default 5,
  scheduled_at  timestamptz not null default now(),   -- pacing / agendamento
  next_attempt_at timestamptz not null default now(), -- backoff
  external_id   text,                                 -- id retornado pela Evolution
  last_error    text,

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- índice do worker: próximos a enviar, em ordem
create index if not exists idx_outbox_due
  on public.whatsapp_outbox(next_attempt_at)
  where status in ('queued','failed');
create index if not exists idx_outbox_clinica on public.whatsapp_outbox(clinica_id, created_at desc);
create index if not exists idx_outbox_dead on public.whatsapp_outbox(clinica_id) where status = 'dead';

-- ============================================================================
-- TRIGGERS — os "processos" que rodam junto a cada mensagem
-- ============================================================================

-- 1) STATUS RANK: nunca rebaixa (delivered não volta a sent). Carimba acks.
--    Porta isValidStatusProgression.
create or replace function public.wa_message_status_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- failed pode a qualquer momento; senão só avança
    if new.status <> 'failed'
       and public.wa_status_rank(new.status) < public.wa_status_rank(old.status) then
      new.status := old.status;   -- ignora rebaixamento
    end if;
  end if;
  -- carimba timestamps de ack (idempotente)
  if new.status = 'sent'      then new.sent_at      := coalesce(new.sent_at, now()); end if;
  if new.status = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
  if new.status in ('read','played') then new.read_at := coalesce(new.read_at, now()); end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_wa_msg_status on public.whatsapp_messages;
create trigger trg_wa_msg_status
  before update on public.whatsapp_messages
  for each row execute function public.wa_message_status_guard();

-- 2) CHAT BUMP: cada mensagem atualiza o chat (preview, unread, SLA, tenant).
--    Porta o "Você:" prefix, unread++, first_response_at.
create or replace function public.wa_message_bump_chat()
returns trigger language plpgsql as $$
declare v_clinica uuid;
begin
  -- garante tenant na mensagem (herda do chat)
  select clinica_id into v_clinica from public.whatsapp_chats where id = new.chat_id;
  if new.clinica_id is null then new.clinica_id := v_clinica; end if;

  update public.whatsapp_chats c set
    last_message_content = case when new.from_me then 'Você: ' else '' end
                           || left(coalesce(new.content, '[' || new.message_type::text || ']'), 120),
    last_message_time    = coalesce(new.created_at, now()),
    last_from_me         = new.from_me,
    -- inbound aumenta não-lidas; outbound zera
    unread_count         = case when new.from_me then 0 else c.unread_count + 1 end,
    last_read_at         = case when new.from_me then now() else c.last_read_at end,
    -- SLA: 1ª resposta do atendente após mensagem do cliente
    first_response_at    = case
                             when new.from_me and c.first_response_at is null
                                  and c.last_from_me is not true
                             then now() else c.first_response_at end,
    updated_at           = now()
  where c.id = new.chat_id;
  return new;
end $$;

drop trigger if exists trg_wa_msg_bump on public.whatsapp_messages;
create trigger trg_wa_msg_bump
  after insert on public.whatsapp_messages
  for each row execute function public.wa_message_bump_chat();

-- também precisa setar clinica_id ANTES do insert (before) para a RLS de insert
create or replace function public.wa_message_set_tenant()
returns trigger language plpgsql as $$
begin
  if new.clinica_id is null then
    select clinica_id into new.clinica_id from public.whatsapp_chats where id = new.chat_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_wa_msg_tenant on public.whatsapp_messages;
create trigger trg_wa_msg_tenant
  before insert on public.whatsapp_messages
  for each row execute function public.wa_message_set_tenant();

-- 3) MARK-AS-READ: função para o atendente zerar não-lidas ao abrir o chat
create or replace function public.wa_marcar_chat_lido(p_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.whatsapp_chats
     set unread_count = 0, last_read_at = now(), updated_at = now()
   where id = p_chat_id and clinica_id = public.current_clinica_id();
end $$;
grant execute on function public.wa_marcar_chat_lido(uuid) to authenticated;

-- 4) ENFILEIRAR ENVIO: cria msg otimista (pending) + item na outbox, atômico.
--    Porta o caminho sendMessage (otimista) + enqueue.
create or replace function public.wa_enfileirar_texto(
  p_chat_id uuid, p_texto text, p_scheduled_at timestamptz default now()
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chat record; v_msg uuid; v_out uuid;
begin
  select c.*, i.id as inst_id into v_chat
    from public.whatsapp_chats c join public.whatsapp_instances i on i.id = c.instance_id
   where c.id = p_chat_id and c.clinica_id = public.current_clinica_id();
  if not found then raise exception 'chat inexistente ou de outra clínica'; end if;

  insert into public.whatsapp_messages (chat_id, clinica_id, content, from_me, status, message_type, sender_name)
    values (p_chat_id, v_chat.clinica_id, p_texto, true, 'pending', 'text', 'Você')
    returning id into v_msg;

  insert into public.whatsapp_outbox (clinica_id, instance_id, chat_id, message_id, to_number, kind, payload, scheduled_at, next_attempt_at, created_by)
    values (v_chat.clinica_id, v_chat.inst_id, p_chat_id, v_msg, coalesce(v_chat.contact_phone, v_chat.remote_jid), 'text',
            jsonb_build_object('text', p_texto), p_scheduled_at, p_scheduled_at, auth.uid())
    returning id into v_out;

  return v_msg;
end $$;
grant execute on function public.wa_enfileirar_texto(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------- RLS
select public.apply_tenant_rls('whatsapp_outbox');

-- chats/messages já têm RLS por tenant indireto (0001); agora têm clinica_id
-- direto também — reforço com policy direta (mais rápida que o join).
do $$ begin
  drop policy if exists whatsapp_chats_tenant on public.whatsapp_chats;
  create policy whatsapp_chats_tenant on public.whatsapp_chats for all to authenticated
    using (clinica_id = public.current_clinica_id() or exists (
      select 1 from public.whatsapp_instances i
       where i.id = whatsapp_chats.instance_id and i.clinica_id = public.current_clinica_id()))
    with check (clinica_id = public.current_clinica_id() or exists (
      select 1 from public.whatsapp_instances i
       where i.id = whatsapp_chats.instance_id and i.clinica_id = public.current_clinica_id()));
end $$;

-- ---------------------------------------------------------------- Realtime
-- Publica as tabelas do chat no canal de Realtime do Supabase (substitui o Pusher).
-- O front assina mudanças destas tabelas filtradas por clinica_id.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- add table é idempotente via catch
    begin execute 'alter publication supabase_realtime add table public.whatsapp_messages'; exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.whatsapp_chats'; exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.whatsapp_instances'; exception when duplicate_object then null; end;
  end if;
end $$;

-- REPLICA IDENTITY FULL: o Realtime precisa do row completo pra RLS no canal
alter table public.whatsapp_messages replica identity full;
alter table public.whatsapp_chats    replica identity full;

commit;
