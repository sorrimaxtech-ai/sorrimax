-- ============================================================================
-- 0038 · Resgate da mídia recebida (imagem/áudio/vídeo/documento)
-- ----------------------------------------------------------------------------
-- PROBLEMA: `whatsapp_messages.media_url` guarda a URL que veio no evento do
-- provedor — arquivo CRIPTOGRAFADO (.enc) no CDN do WhatsApp, com validade
-- curta. A tela renderiza <img src={media_url}> e a imagem NUNCA abre; a que
-- abrisse morreria em dias. Numa clínica isso é a radiografia que o paciente
-- mandou sumindo do prontuário — e o histórico clínico tem valor legal.
--
-- SOLUÇÃO: a Edge `whatsapp-media` baixa do provedor (que devolve decifrado),
-- guarda no R2 e reaponta `media_url` para um endereço permanente nosso.
-- Aqui só o agendamento.
-- ============================================================================

begin;

create or replace function public.wa_resgatar_midia()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base    text;
  v_pend    int;
begin
  -- Só acorda a Edge se houver mídia ainda apontando para domínio efêmero.
  select count(*) into v_pend
    from public.whatsapp_messages
   where message_type in ('image','video','audio','ptt','document','sticker')
     and media_url is not null
     and (media_url ~* 'whatsapp\.net' or media_url ~* '\.enc' or media_url ~* 'uazapi');
  if v_pend = 0 then return; end if;

  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'functions_base_url';
  if v_base is null then
    raise warning 'wa_resgatar_midia: functions_base_url ausente no Vault — % arquivo(s) esperando', v_pend;
    return;
  end if;

  perform net.http_post(
    url     := v_base || '/whatsapp-media',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('acao', 'resgatar'),
    timeout_milliseconds := 110000
  );
end $$;

revoke execute on function public.wa_resgatar_midia() from public, anon, authenticated;

-- A cada 2 minutos: rápido o bastante para a foto abrir enquanto o atendente
-- ainda está na conversa, sem transformar o resgate em rajada.
do $agenda$
begin
  if to_regnamespace('cron') is null then
    raise warning 'pg_cron ausente — resgate de midia NAO agendado';
    return;
  end if;
  perform cron.unschedule('whatsapp-media-resgate')
    where exists (select 1 from cron.job where jobname = 'whatsapp-media-resgate');
  perform cron.schedule('whatsapp-media-resgate', '*/2 * * * *',
    $c$ select public.wa_resgatar_midia() $c$);
end
$agenda$;

commit;
