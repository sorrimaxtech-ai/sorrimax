-- ============================================================================
-- 0044 · Healthcheck do número + fila morta visível
-- ----------------------------------------------------------------------------
-- O PIOR modo de falha deste canal é o silencioso: o WhatsApp cai (celular sem
-- bateria, sessão derrubada, número desconectado no aparelho) e a instância
-- continua marcada como 'connected' no banco. Os lembretes de consulta seguem
-- sendo enfileirados, morrem, e a clínica só descobre pela cadeira vazia.
--
-- Aqui: uma verificação periódica que pergunta ao provedor como a linha está de
-- verdade, e uma visão da fila morta para alguém poder agir.
--
-- Cuidado deliberado: só marca 'disconnected' quando o PROVEDOR confirma. Se o
-- provedor não responde, isso é indisponibilidade dele — marcar a linha como
-- caída faria a tela mentir na direção oposta.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- healthcheck
create or replace function public.wa_verificar_conexoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base    text;
  v_segredo text;
  v_qtd     int;
begin
  select count(*) into v_qtd
    from public.whatsapp_instances
   where shared_external is not true
     and status in ('connected', 'connecting');
  if v_qtd = 0 then return; end if;

  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'functions_base_url';
  if v_base is null then return; end if;

  select decrypted_secret into v_segredo
    from vault.decrypted_secrets where name = 'outbox_secret';
  if v_segredo is null or v_segredo = 'DEFINIR' then
    raise warning 'wa_verificar_conexoes: segredo ausente — verificação não roda';
    return;
  end if;

  -- A Edge já sabe sincronizar uma instância; aqui só pedimos que ela passe em
  -- todas. `acao: sincronizar_todas` é tratada com service role.
  perform net.http_post(
    url     := v_base || '/whatsapp-instances',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-outbox-secret', v_segredo),
    body    := jsonb_build_object('acao', 'sincronizar_todas'),
    timeout_milliseconds := 60000
  );
end $$;

revoke execute on function public.wa_verificar_conexoes() from public, anon, authenticated;

do $agenda$
begin
  if to_regnamespace('cron') is null then
    raise warning 'pg_cron ausente — healthcheck NAO agendado';
    return;
  end if;
  perform cron.unschedule('whatsapp-healthcheck')
    where exists (select 1 from cron.job where jobname = 'whatsapp-healthcheck');
  -- a cada 5 min: rápido para a clínica saber no mesmo turno, sem martelar o
  -- provedor nem estourar invocação de função.
  perform cron.schedule('whatsapp-healthcheck', '*/5 * * * *',
    $c$ select public.wa_verificar_conexoes() $c$);
end
$agenda$;

-- --------------------------------------------------------------- fila morta
-- Mensagem que morreu precisa de dono. Sem esta visão, ela some do mundo: o
-- paciente não recebeu, e ninguém na clínica sabe.
create or replace view public.vw_envios_com_problema
with (security_invoker = on) as
select
  o.id,
  o.clinica_id,
  o.chat_id,
  c.name              as contato,
  c.contact_phone     as telefone,
  o.kind::text        as tipo,
  o.status::text      as situacao,
  o.attempts          as tentativas,
  o.last_error        as motivo,
  o.created_at,
  o.updated_at
  from public.whatsapp_outbox o
  left join public.whatsapp_chats c on c.id = o.chat_id
 where o.status in ('dead', 'failed')
 order by o.updated_at desc;

comment on view public.vw_envios_com_problema is
  'Mensagens que não chegaram ao paciente. Sem isto a falha é invisível.';

-- Reenfileirar uma mensagem morta, depois de resolvida a causa.
create or replace function public.wa_reenviar(p_outbox_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_clinica uuid := public.current_clinica_id();
begin
  update public.whatsapp_outbox
     set status = 'queued',
         attempts = 0,
         last_error = null,
         next_attempt_at = now(),
         scheduled_at = now()
   where id = p_outbox_id
     and clinica_id = v_clinica
     and status in ('dead', 'failed');
  if not found then
    raise exception 'Envio não encontrado ou já processado';
  end if;

  -- a bolha volta a "enviando" para o atendente ver o que está acontecendo
  update public.whatsapp_messages m
     set status = 'pending'
    from public.whatsapp_outbox o
   where o.id = p_outbox_id and m.id = o.message_id;
end $$;

revoke execute on function public.wa_reenviar(uuid) from public, anon;
grant  execute on function public.wa_reenviar(uuid) to authenticated;

commit;
