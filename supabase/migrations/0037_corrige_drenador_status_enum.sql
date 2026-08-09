-- ============================================================================
-- 0037 · Corrige o drenador da fila: 'pending' não existe no enum
-- ----------------------------------------------------------------------------
-- BUG (meu, introduzido na 0036): a função comparava
--     status in ('queued', 'pending')
-- mas `whatsapp_outbox.status` é do enum `wa_outbox_status`, cujos valores são
-- queued | sending | sent | failed | dead | canceled. 'pending' não existe, o
-- Postgres estoura "invalid input value for enum" na PRIMEIRA consulta, a
-- função morre antes de chamar a Edge de envio e NENHUMA mensagem sai da fila.
--
-- Sintoma exato: a resposta do atendente fica com relógio para sempre e a linha
-- permanece 'queued' com attempts=0 — nem sequer é tentada.
--
-- Além do enum, passa a considerar `failed` cujo next_attempt_at já venceu: são
-- as que falharam por rede/4xx e têm direito a nova tentativa (a Edge faz o
-- backoff). Sem isso, uma falha temporária congelava a mensagem para sempre.
-- ============================================================================

begin;

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
  -- Nada pendente? Não acorda a Edge — invocação vazia a cada minuto custa e
  -- enterra o log. `failed` entra só quando o backoff já venceu.
  select count(*) into v_pend
    from public.whatsapp_outbox
   where (
           status = 'queued'::wa_outbox_status
           or (status = 'failed'::wa_outbox_status
               and next_attempt_at is not null
               and next_attempt_at <= now())
         )
     and (scheduled_at is null or scheduled_at <= now());

  if v_pend = 0 then return; end if;

  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into v_segredo
    from vault.decrypted_secrets where name = 'outbox_secret';

  if v_segredo is null or v_segredo = 'DEFINIR' then
    raise warning 'wa_drenar_outbox: segredo do outbox nao definido — % mensagem(ns) esperando', v_pend;
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

commit;

-- ══ Verificação ═════════════════════════════════════════════════════════════
-- select public.wa_drenar_outbox();            -- não pode levantar exceção
-- select status, attempts from whatsapp_outbox order by created_at desc;
