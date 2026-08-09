-- ============================================================================
-- 0042 · Abrir conversa a partir do paciente (sem sair do sistema)
-- ----------------------------------------------------------------------------
-- Hoje o botão de chat na lista de pacientes manda para wa.me — joga o
-- atendimento para fora, e a conversa não fica no prontuário: o que foi
-- combinado com o paciente se perde num aplicativo à parte.
--
-- Pior: `whatsapp_chats` só nascia dentro do webhook, a partir de mensagem
-- RECEBIDA. Então não existia caminho nenhum para a clínica INICIAR conversa —
-- e é a clínica que inicia na maior parte do dia (confirmação, retorno,
-- cobrança, resultado de exame).
--
-- Esta função resolve as duas coisas: acha a conversa existente pelo telefone
-- ou cria uma, já vinculada ao paciente.
-- ============================================================================

begin;

create or replace function public.wa_abrir_conversa(
  p_paciente_id uuid default null,
  p_telefone    text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clinica  uuid := public.current_clinica_id();
  v_fone     text;
  v_nome     text;
  v_inst     record;
  v_jid      text;
  v_chat     uuid;
begin
  if v_clinica is null then
    raise exception 'Sessão sem clínica';
  end if;

  -- Telefone vem do paciente quando há um; senão, do parâmetro.
  if p_paciente_id is not null then
    select regexp_replace(coalesce(celular, ''), '\D', '', 'g'), nome_completo
      into v_fone, v_nome
      from public.pacientes
     where id = p_paciente_id and clinica_id = v_clinica;
    if not found then raise exception 'Paciente não encontrado nesta clínica'; end if;
  else
    v_fone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  end if;

  if length(v_fone) < 10 then
    raise exception 'Este paciente não tem um celular válido cadastrado';
  end if;
  -- DDI do Brasil: o provedor endereça em formato internacional. Sem isso a
  -- mensagem sai para um número inexistente.
  if left(v_fone, 2) <> '55' then v_fone := '55' || v_fone; end if;
  v_jid := v_fone || '@s.whatsapp.net';

  -- Conversa precisa de uma linha conectada para existir de verdade.
  select id, status into v_inst
    from public.whatsapp_instances
   where clinica_id = v_clinica
     and shared_external is not true
   order by (status = 'connected') desc, created_at
   limit 1;
  if v_inst.id is null then
    raise exception 'Nenhum número de WhatsApp cadastrado nesta clínica';
  end if;
  if v_inst.status is distinct from 'connected' then
    raise exception 'O WhatsApp da clínica não está conectado';
  end if;

  -- Já existe? Reaproveita — duas conversas para o mesmo número dividiriam o
  -- histórico do paciente em duas metades.
  select id into v_chat
    from public.whatsapp_chats
   where clinica_id = v_clinica
     and (remote_jid = v_jid or regexp_replace(coalesce(contact_phone,''), '\D', '', 'g') = v_fone)
   order by last_message_time desc nulls last
   limit 1;

  if v_chat is null then
    insert into public.whatsapp_chats
      (instance_id, clinica_id, remote_jid, contact_phone, name, paciente_id, unread_count)
    values (v_inst.id, v_clinica, v_jid, v_fone, coalesce(v_nome, v_fone), p_paciente_id, 0)
    returning id into v_chat;
  elsif p_paciente_id is not null then
    -- conversa existia sem vínculo: aproveita para ligar ao prontuário
    update public.whatsapp_chats
       set paciente_id = coalesce(paciente_id, p_paciente_id)
     where id = v_chat;
  end if;

  return v_chat;
end $$;

revoke execute on function public.wa_abrir_conversa(uuid, text) from public, anon;
grant  execute on function public.wa_abrir_conversa(uuid, text) to authenticated;

commit;
