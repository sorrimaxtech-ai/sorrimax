-- ============================================================================
-- 0045 · Confirmação de consulta por BOTÃO (fecha o ciclo contra faltas)
-- ----------------------------------------------------------------------------
-- O lembrete pedia "responda SIM" — o que depende do paciente digitar certo E
-- de alguém ler a resposta conversa por conversa. Ninguém lia. O recurso que o
-- produto vende como combate ao no-show nunca fechou o ciclo.
--
-- Agora: o lembrete sai com botões (Confirmar / Remarcar), a resposta chega
-- como mensagem, e ESTA função casa a resposta com a consulta e carimba
-- `confirmado_em`. A agenda do dia passa a dizer quem realmente vem.
--
-- Como o pareamento é feito: a resposta não traz o id da consulta, então casa-se
-- pelo TELEFONE + a consulta futura mais próxima daquele paciente que já
-- recebeu lembrete. É como a recepção faria à mão, e erra menos: mais de uma
-- consulta futura no mesmo telefone é raro, e o desempate é a mais próxima.
-- ============================================================================

begin;

-- ---------------------------------------------------- registrar a confirmação
create or replace function public.wa_registrar_confirmacao(
  p_chat_id  uuid,
  p_texto    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat     record;
  v_consulta uuid;
  v_norm     text;
  v_confirma boolean;
  v_remarca  boolean;
begin
  select c.id, c.clinica_id, c.paciente_id,
         regexp_replace(coalesce(c.contact_phone,''), '\D', '', 'g') as fone
    into v_chat
    from public.whatsapp_chats c
   where c.id = p_chat_id;
  if not found then return null; end if;

  -- Sem acento e minúsculo: "Confirmar", "confirmo", "SIM" e "Sim ✅" viram a
  -- mesma coisa. O paciente responde como quiser.
  v_norm := lower(translate(coalesce(p_texto,''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));

  v_confirma := v_norm ~ '(confirm|^sim\M|\Msim\M|^ok\M|estarei|vou\s+sim)';
  v_remarca  := v_norm ~ '(remarc|reagend|nao\s+poss|nao\s+vou|cancel|outro\s+dia|desmarc)';

  -- Nada a fazer: é conversa normal, não resposta de lembrete.
  if not v_confirma and not v_remarca then return null; end if;

  -- Consulta futura mais próxima que JÁ recebeu lembrete, do paciente do chat
  -- (ou de qualquer paciente com aquele telefone, quando o chat não está
  -- vinculado — é o caso comum antes de alguém ligar conversa e prontuário).
  select cs.id into v_consulta
    from public.consultas cs
    join public.pacientes pa on pa.id = cs.paciente_id
   where cs.clinica_id = v_chat.clinica_id
     and cs.inicio > now() - interval '2 hours'
     and cs.status in ('agendado', 'confirmado')
     and cs.lembrete_enviado_em is not null
     and (
       (v_chat.paciente_id is not null and cs.paciente_id = v_chat.paciente_id)
       or regexp_replace(coalesce(pa.celular,''), '\D', '', 'g') like '%' || right(v_chat.fone, 8)
     )
   order by cs.inicio
   limit 1;

  if v_consulta is null then return null; end if;

  if v_confirma then
    update public.consultas
       set status = 'confirmado', confirmado_em = now()
     where id = v_consulta and status <> 'confirmado';
  else
    -- Remarcar NÃO cancela sozinho: cancelar por interpretação de texto é
    -- perigoso (cadeira vazia por falso positivo). Só sinaliza para a recepção.
    update public.consultas
       set observacoes = coalesce(observacoes || E'\n', '')
                         || '[' || to_char(now(),'DD/MM HH24:MI') || '] Paciente pediu para remarcar pelo WhatsApp.'
     where id = v_consulta;
  end if;

  return v_consulta;
end $$;

revoke execute on function public.wa_registrar_confirmacao(uuid, text) from public, anon;

-- ------------------------------------------------- lembrete agora vai com botão
-- Substitui o enfileiramento de texto puro por menu com opções. O payload ganha
-- `choices`; a Edge de envio decide o formato por causa desse campo.
create or replace function public.wa_enfileirar_menu(
  p_chat_id  uuid,
  p_texto    text,
  p_opcoes   text[],
  p_rodape   text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_chat record; v_msg uuid;
begin
  select c.id as chat_id, c.clinica_id, c.contact_phone, c.remote_jid,
         i.id as inst_id, i.shared_external, i.webhook_mode
    into v_chat
    from public.whatsapp_chats c
    join public.whatsapp_instances i on i.id = c.instance_id
   where c.id = p_chat_id;
  if not found then raise exception 'chat inexistente'; end if;
  if v_chat.shared_external and v_chat.webhook_mode = 'none' then
    raise exception 'instância compartilhada em modo somente-saída';
  end if;

  insert into public.whatsapp_messages
      (chat_id, clinica_id, content, from_me, status, message_type, sender_name)
    values (p_chat_id, v_chat.clinica_id, p_texto, true, 'pending', 'text', 'Você')
    returning id into v_msg;

  insert into public.whatsapp_outbox
      (clinica_id, instance_id, chat_id, message_id, to_number, kind, payload, scheduled_at, next_attempt_at)
    values (v_chat.clinica_id, v_chat.inst_id, p_chat_id, v_msg,
            coalesce(v_chat.contact_phone, v_chat.remote_jid), 'text',
            jsonb_build_object('text', p_texto, 'choices', to_jsonb(p_opcoes), 'footer', p_rodape),
            now(), now());

  return v_msg;
end $$;

revoke execute on function public.wa_enfileirar_menu(uuid, text, text[], text) from public, anon;

commit;
