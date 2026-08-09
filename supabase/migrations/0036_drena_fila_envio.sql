-- ============================================================================
-- 0036 · Drena a fila de envio de WhatsApp (o 🕐 vira ✓)
-- ----------------------------------------------------------------------------
-- SINTOMA: a mensagem respondida pelo atendente fica com relógio para sempre.
-- CAUSA: nada invocava a Edge `whatsapp-outbox`. O único agendamento de WhatsApp
-- era o reaper (0017), que apenas destrava item preso em 'sending' — ele não
-- envia nada. A fila enchia e ninguém a esvaziava.
--
-- Por que não estava agendado antes: no projeto ANTIGO havia invocação externa,
-- e agendar um segundo drenador competindo enviaria WhatsApp de verdade duas
-- vezes para pessoas reais. Neste projeto novo não existe invocação externa
-- nenhuma (fila vazia, zero mensagens), então agendar aqui é seguro.
--
-- O segredo NÃO fica escrito nesta migration: é lido do Vault em tempo de
-- execução. Migration com segredo dentro vaza no git e no histórico do banco.
-- ============================================================================

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda a URL do projeto e o segredo no Vault (o valor é gravado fora daqui).
-- `create_secret` falha se já existir; o do-block torna a migration reexecutável.
do $seed$
begin
  if not exists (select 1 from vault.secrets where name = 'outbox_secret') then
    perform vault.create_secret('DEFINIR', 'outbox_secret',
      'Mesmo valor do env OUTBOX_SECRET da Edge Function whatsapp-outbox');
  end if;
  if not exists (select 1 from vault.secrets where name = 'functions_base_url') then
    perform vault.create_secret(
      'https://vcaloytujryxaqutxpgy.supabase.co/functions/v1',
      'functions_base_url', 'Base das Edge Functions');
  end if;
end
$seed$;

-- ---------------------------------------------------------------- o drenador
-- Chama a Edge de envio. Ela é que fala com o provedor, respeita o ritmo entre
-- mensagens e move para a DLQ o que falhar de vez.
create or replace function public.wa_drenar_outbox()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base    text;
  v_segredo text;
  v_pend    int;
begin
  -- Nada pendente? Não acorda a função — cada invocação é cobrada e o log fica
  -- ilegível se encher de chamadas vazias a cada minuto.
  select count(*) into v_pend
    from public.whatsapp_outbox
   where status in ('queued', 'pending')
     and (scheduled_at is null or scheduled_at <= now());
  if v_pend = 0 then return; end if;

  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into v_segredo
    from vault.decrypted_secrets where name = 'outbox_secret';

  if v_segredo is null or v_segredo = 'DEFINIR' then
    raise warning 'wa_drenar_outbox: segredo do outbox nao definido no Vault — % mensagem(ns) esperando', v_pend;
    return;
  end if;

  perform net.http_post(
    url     := v_base || '/whatsapp-outbox',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-outbox-secret', v_segredo),
    body    := '{}'::jsonb,
    timeout_milliseconds := 110000
  );
end $$;

revoke execute on function public.wa_drenar_outbox() from public, anon, authenticated;

-- ---------------------------------------------------------------- agendamento
-- A cada minuto: é o intervalo que faz a resposta do atendente sair rápido o
-- bastante para parecer instantânea sem martelar a função quando não há fila.
do $agenda$
begin
  if to_regnamespace('cron') is null then
    raise warning 'pg_cron ausente — envio NAO agendado. Ligue a extensao e rode: select cron.schedule(''whatsapp-outbox-drain'',''* * * * *'',$$select public.wa_drenar_outbox()$$);';
    return;
  end if;
  perform cron.unschedule('whatsapp-outbox-drain')
    where exists (select 1 from cron.job where jobname = 'whatsapp-outbox-drain');
  perform cron.schedule('whatsapp-outbox-drain', '* * * * *',
    $c$ select public.wa_drenar_outbox() $c$);
end
$agenda$;

commit;

-- ══ Depois de aplicar ═══════════════════════════════════════════════════════
-- 1. Definir o segredo dos DOIS lados com o MESMO valor:
--      supabase secrets set OUTBOX_SECRET=<valor>
--      select vault.update_secret((select id from vault.secrets where name='outbox_secret'), '<valor>');
-- 2. Conferir:  select jobname, schedule, active from cron.job;
