-- ============================================================================
-- VITTALHUB · 0017 · Blindagem do WhatsApp compartilhado + destravamento do login
-- ----------------------------------------------------------------------------
-- 🔴 api_token das instâncias do Diamond (SolarMax / Lobo / Eforte) era legível
--    e EDITÁVEL por qualquer usuário logado da clínica — e ainda era empurrado
--    pro navegador pelo Realtime. Caminho direto pra quebrar o Diamond.
-- 🔴 set_clinic_code/generate_clinic_code são INVOKER e leem `clinicas`; com a
--    RLS fechada na 0015 iam quebrar a criação de clínica.
-- 🔴 3 usuários em auth.users sem profile = trancados fora do app pra sempre.
-- 🟠 outbox sem reaper: item preso em 'sending' = mensagem perdida sem volta.
-- 🟠 ack 'failed' podia rebaixar mensagem já entregue/lida (ruído ou ataque).
-- ============================================================================

begin;

-- ══ 1. Código da clínica: DEFINER (senão a 0015 quebra o cadastro) ══════════
alter function public.generate_clinic_code() security definer set search_path = public;
alter function public.set_clinic_code()      security definer set search_path = public;

-- ══ 2. Destravar os usuários existentes ═════════════════════════════════════
-- Sem profile, current_clinica_id() é NULL e o app inteiro fica invisível.
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email)
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- limpeza de profile órfão só é possível se a FK cascatear
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;

-- ══ 3. Segredos das instâncias fora do alcance do cliente ═══════════════════
-- api_token/api_url/webhook_secret só existem pro backend. O front enxerga
-- apenas o que precisa pra mostrar status na tela.
alter publication supabase_realtime drop table public.whatsapp_instances;

revoke all on public.whatsapp_instances from anon, authenticated;
grant select (id, clinica_id, instance_id, name, status, degraded, connected_at,
              last_seen_at, profile_name, owner_number, shared_external,
              external_system, webhook_mode, created_at, updated_at)
  on public.whatsapp_instances to authenticated;

-- ══ 4. Instância compartilhada é imutável e indeletável pelo app ════════════
-- O comentário da 0011 dizia "nunca gerenciar de forma destrutiva daqui" —
-- comentário não é constraint. Agora é.
create or replace function public.wa_proteger_instancia_compartilhada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.shared_external then
    raise exception 'instância % é compartilhada com % — exclusão bloqueada',
      old.instance_id, coalesce(old.external_system,'outro sistema');
  end if;
  if tg_op = 'UPDATE' and old.shared_external
     and (new.api_url     is distinct from old.api_url
       or new.api_token   is distinct from old.api_token
       or new.clinica_id  is distinct from old.clinica_id
       or new.instance_id is distinct from old.instance_id) then
    raise exception 'instância compartilhada: api_url/api_token/clinica_id/instance_id são imutáveis';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_wa_inst_protect on public.whatsapp_instances;
create trigger trg_wa_inst_protect
  before update or delete on public.whatsapp_instances
  for each row execute function public.wa_proteger_instancia_compartilhada();

-- ══ 5. Ack 'failed' não rebaixa mensagem já entregue ════════════════════════
-- Sem isso, um POST no webhook com status=0 marcaria mensagens já lidas de
-- qualquer clínica como falhadas.
create or replace function public.wa_message_status_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'failed' then
      -- já entregue/lido/tocado: ack de falha é ruído (ou ataque) — ignora
      if public.wa_status_rank(old.status) >= 3 then
        new.status := old.status;
      end if;
    elsif public.wa_status_rank(new.status) < public.wa_status_rank(old.status) then
      new.status := old.status;   -- nunca rebaixa
    end if;
  end if;
  if new.status = 'sent'      then new.sent_at      := coalesce(new.sent_at, now()); end if;
  if new.status = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
  if new.status in ('read','played') then new.read_at := coalesce(new.read_at, now()); end if;
  new.updated_at := now();
  return new;
end $$;

-- ══ 6. Fila: claim atômico + reaper de item preso ═══════════════════════════
create index if not exists idx_outbox_sending
  on public.whatsapp_outbox(updated_at) where status = 'sending';

-- claim com SKIP LOCKED: sem corrida entre invocações concorrentes
create or replace function public.wa_outbox_claim(p_limit int default 20)
returns setof public.whatsapp_outbox
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.whatsapp_outbox o
     set status = 'sending', attempts = o.attempts + 1, updated_at = now()
   where o.id in (
     select id from public.whatsapp_outbox
      where status in ('queued','failed') and next_attempt_at <= now()
      order by scheduled_at
      limit p_limit
      for update skip locked)
  returning o.*;
end $$;
revoke execute on function public.wa_outbox_claim(int) from public, anon, authenticated;
grant   execute on function public.wa_outbox_claim(int) to service_role;

-- reaper: item preso em 'sending' volta pra fila — MAS só se não tiver
-- external_id (guard do Diamond: nunca reenviar o que já foi entregue).
create or replace function public.wa_outbox_reaper(p_lease_seconds int default 300)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with revived as (
    update public.whatsapp_outbox o
       set status = case when o.attempts >= o.max_attempts then 'dead' else 'failed' end,
           last_error = coalesce(o.last_error,'') || ' [reaper: preso em sending]',
           next_attempt_at = now(), updated_at = now()
     where o.status = 'sending'
       and o.external_id is null
       and o.updated_at < now() - make_interval(secs => p_lease_seconds)
    returning 1)
  select count(*) into n from revived;
  return n;
end $$;
revoke execute on function public.wa_outbox_reaper(int) from public, anon, authenticated;
grant   execute on function public.wa_outbox_reaper(int) to service_role;

-- ══ 7. Eco do envio reconcilia com a mensagem otimista ══════════════════════
-- Sem isso, quando o webhook direto for ligado, a mensagem enviada aparece
-- DUAS vezes na tela (uma com relógio eterno).
create or replace function public.wa_ingerir_eco(p_chat_id uuid, p_external_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.whatsapp_messages m
     set external_id = p_external_id, status = 'sent'
   where m.id = (
     select id from public.whatsapp_messages
      where chat_id = p_chat_id and from_me and external_id is null and status = 'pending'
      order by created_at desc limit 1
      for update skip locked)
  returning m.id into v_id;
  return v_id;   -- null = não havia otimista; o webhook insere normalmente
end $$;
revoke execute on function public.wa_ingerir_eco(uuid, text) from public, anon, authenticated;
grant   execute on function public.wa_ingerir_eco(uuid, text) to service_role;

-- ══ 8. Enfileiramento: valida texto e bloqueia instância só-saída ═══════════
create or replace function public.wa_enfileirar_texto(
  p_chat_id uuid, p_texto text, p_scheduled_at timestamptz default now()
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_chat record; v_msg uuid;
begin
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'Texto vazio';
  end if;

  select c.id as chat_id, c.clinica_id, c.contact_phone, c.remote_jid,
         i.id as inst_id, i.shared_external, i.webhook_mode, i.external_system, i.instance_id
    into v_chat
    from public.whatsapp_chats c
    join public.whatsapp_instances i on i.id = c.instance_id
   where c.id = p_chat_id and c.clinica_id = public.current_clinica_id();
  if not found then raise exception 'chat inexistente ou de outra clínica'; end if;

  -- instância compartilhada em modo só-saída: a resposta do paciente vai pro
  -- outro sistema e o atendente nunca a vê. Melhor falhar alto que enganar.
  if v_chat.shared_external and v_chat.webhook_mode = 'none' then
    raise exception 'instância % é compartilhada com % em modo somente-saída: a resposta do paciente não chegaria aqui',
      v_chat.instance_id, coalesce(v_chat.external_system,'outro sistema');
  end if;

  insert into public.whatsapp_messages (chat_id, clinica_id, content, from_me, status, message_type, sender_name)
    values (p_chat_id, v_chat.clinica_id, p_texto, true, 'pending', 'text', 'Você')
    returning id into v_msg;

  insert into public.whatsapp_outbox (clinica_id, instance_id, chat_id, message_id, to_number, kind, payload, scheduled_at, next_attempt_at, created_by)
    values (v_chat.clinica_id, v_chat.inst_id, p_chat_id, v_msg,
            coalesce(v_chat.contact_phone, v_chat.remote_jid), 'text',
            jsonb_build_object('text', p_texto), p_scheduled_at, p_scheduled_at, auth.uid());

  return v_msg;
end $$;
revoke execute on function public.wa_enfileirar_texto(uuid, text, timestamptz) from public, anon;
grant   execute on function public.wa_enfileirar_texto(uuid, text, timestamptz) to authenticated;

commit;

-- agenda o reaper (fora da transação)
-- Condicional: pg_cron não vem ligado num projeto Supabase novo. Sem o guard, a
-- migração inteira aborta aqui. Se o schema `cron` não existir, o agendamento é
-- pulado com aviso — ligue a extensão em Database → Extensions → pg_cron e
-- reexecute só este bloco.
do $agenda$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('whatsapp-outbox-reaper', '*/5 * * * *',
      $cron$ select public.wa_outbox_reaper(300) $cron$);
    raise notice 'reaper do outbox agendado (*/5 * * * *)';
  else
    raise warning 'pg_cron ausente — reaper NAO agendado. Ligue a extensao pg_cron e rode: select cron.schedule(''whatsapp-outbox-reaper'', ''*/5 * * * *'', $$select public.wa_outbox_reaper(300)$$);';
  end if;
end
$agenda$;
