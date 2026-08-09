-- ============================================================================
-- 0041 · Prévia da conversa em português, não em rótulo técnico
-- ----------------------------------------------------------------------------
-- A prévia na lista de conversas caía em `'[' || message_type || ']'` quando a
-- mensagem não tinha texto — ou seja, mídia. Na tela isso apareceu como "Você:"
-- pelado (áudio enviado, conteúdo vazio) e como "[ptt]" / "[image]" nos demais.
--
-- No WhatsApp de verdade a lista diz "🎤 Mensagem de voz", "📷 Foto". É o que a
-- recepção precisa para saber o que aconteceu sem abrir a conversa — e cumpre a
-- regra de produto: nada de jargão técnico para o usuário final.
-- ============================================================================

begin;

create or replace function public.wa_rotulo_mensagem(
  p_tipo public.wa_msg_type, p_conteudo text, p_arquivo text default null
) returns text
language sql immutable
set search_path = public
as $$
  select case
    when coalesce(btrim(p_conteudo), '') <> '' then left(p_conteudo, 120)
    when p_tipo = 'image'    then '📷 Foto'
    when p_tipo = 'video'    then '🎬 Vídeo'
    when p_tipo = 'ptt'      then '🎤 Mensagem de voz'
    when p_tipo = 'audio'    then '🎵 Áudio'
    when p_tipo = 'document' then '📄 ' || coalesce(nullif(btrim(p_arquivo), ''), 'Documento')
    when p_tipo = 'sticker'  then '💬 Figurinha'
    when p_tipo = 'location' then '📍 Localização'
    when p_tipo = 'contact'  then '📇 Contato'
    when p_tipo = 'reaction' then '👍 Reação'
    when p_tipo = 'call'     then '📞 Chamada'
    when p_tipo = 'system'   then 'Mensagem do sistema'
    else 'Mensagem'
  end
$$;

create or replace function public.wa_message_bump_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_clinica uuid;
begin
  select clinica_id into v_clinica from public.whatsapp_chats where id = new.chat_id;
  if new.clinica_id is null then new.clinica_id := v_clinica; end if;

  update public.whatsapp_chats c set
    last_message_content = case when new.from_me then 'Você: ' else '' end
                           || public.wa_rotulo_mensagem(new.message_type, new.content, new.file_name),
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

-- Reescreve as prévias que já ficaram feias na lista.
update public.whatsapp_chats c
   set last_message_content = (
     select case when m.from_me then 'Você: ' else '' end
            || public.wa_rotulo_mensagem(m.message_type, m.content, m.file_name)
       from public.whatsapp_messages m
      where m.chat_id = c.id
      order by m.created_at desc
      limit 1
   )
 where exists (select 1 from public.whatsapp_messages m2 where m2.chat_id = c.id)
   and (
     c.last_message_content is null
     or c.last_message_content ~ '\[[a-z_]+\]'
     or c.last_message_content ilike '%undecryptable%'
     or btrim(c.last_message_content) in ('Você:', '')
   );

commit;
