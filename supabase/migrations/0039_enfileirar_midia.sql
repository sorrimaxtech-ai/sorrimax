-- ============================================================================
-- 0039 · Enviar mídia pelo chat (foto, documento, áudio, vídeo)
-- ----------------------------------------------------------------------------
-- O worker de envio JÁ sabe mandar mídia (sendMedia em whatsapp-providers.ts) e
-- o enum de tipos já existe — mas não havia como PEDIR: só existia
-- `wa_enfileirar_texto`, então nenhuma linha da fila nascia com kind != 'text'.
-- Capacidade construída e inalcançável.
--
-- Numa clínica odontológica isso não é enfeite: o orçamento é a entidade central
-- do negócio e ele sai da cadeira em PDF. Sem isto, a recepção fecha o sistema e
-- manda pelo celular — e o registro do que foi combinado se perde.
-- ============================================================================

begin;

create or replace function public.wa_enfileirar_midia(
  p_chat_id      uuid,
  p_tipo         text,                    -- image | video | document | audio | ptt
  p_url          text,                    -- URL pública (R2 assinado) ou data:<mime>;base64
  p_legenda      text default null,
  p_nome_arquivo text default null,       -- só para document
  p_scheduled_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_chat record; v_msg uuid; v_tipo text;
begin
  v_tipo := lower(coalesce(p_tipo, ''));
  if v_tipo not in ('image','video','document','audio','ptt') then
    raise exception 'Tipo de arquivo não suportado';
  end if;
  if coalesce(btrim(p_url), '') = '' then
    raise exception 'Arquivo ausente';
  end if;

  select c.id as chat_id, c.clinica_id, c.contact_phone, c.remote_jid,
         i.id as inst_id, i.shared_external, i.webhook_mode, i.external_system, i.instance_id
    into v_chat
    from public.whatsapp_chats c
    join public.whatsapp_instances i on i.id = c.instance_id
   where c.id = p_chat_id and c.clinica_id = public.current_clinica_id();
  if not found then raise exception 'chat inexistente ou de outra clínica'; end if;

  -- Mesma guarda do texto: instância compartilhada em modo só-saída faz a
  -- resposta do paciente ir para outro sistema. Falhar alto é melhor que enganar.
  if v_chat.shared_external and v_chat.webhook_mode = 'none' then
    raise exception 'instância % é compartilhada com % em modo somente-saída: a resposta do paciente não chegaria aqui',
      v_chat.instance_id, coalesce(v_chat.external_system, 'outro sistema');
  end if;

  -- A bolha nasce otimista com a URL já visível: o atendente vê a foto que
  -- acabou de mandar sem esperar a volta do provedor.
  insert into public.whatsapp_messages
      (chat_id, clinica_id, content, from_me, status, message_type, media_url, file_name, sender_name)
    values (p_chat_id, v_chat.clinica_id, p_legenda, true, 'pending', v_tipo::wa_msg_type,
            p_url, p_nome_arquivo, 'Você')
    returning id into v_msg;

  insert into public.whatsapp_outbox
      (clinica_id, instance_id, chat_id, message_id, to_number, kind, payload, scheduled_at, next_attempt_at, created_by)
    values (v_chat.clinica_id, v_chat.inst_id, p_chat_id, v_msg,
            coalesce(v_chat.contact_phone, v_chat.remote_jid),
            -- `kind` é do enum wa_msg_type (não existe 'media'): o tipo real vai
            -- aqui, e é ele que a Edge repassa ao provedor.
            v_tipo::wa_msg_type,
            -- nomes conferidos contra whatsapp-outbox/index.ts:106, que lê
            -- p.url / p.caption / p.filename. Inventar nome aqui faria o envio
            -- sair sem arquivo e sem legenda.
            jsonb_build_object(
              'url', p_url,
              'caption', p_legenda,
              'filename', p_nome_arquivo
            ),
            p_scheduled_at, p_scheduled_at, auth.uid());

  return v_msg;
end $$;

revoke execute on function public.wa_enfileirar_midia(uuid, text, text, text, text, timestamptz) from public, anon;
grant  execute on function public.wa_enfileirar_midia(uuid, text, text, text, text, timestamptz) to authenticated;

commit;
