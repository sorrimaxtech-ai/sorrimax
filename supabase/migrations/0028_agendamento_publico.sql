-- ============================================================================
-- 0028 — Agendamento público (o link /c/<slug> que a clínica divulga)
-- ----------------------------------------------------------------------------
-- A superauditoria (crítico) apontou: a clínica distribui um link de
-- agendamento que caía no NotFound — a rota nunca existiu. O funil de tráfego
-- pago (anúncio → página → marcação) morria aí.
--
-- Aqui: 3 funções SECURITY DEFINER anon-acessíveis, TODAS escopadas ao slug de
-- um perfil PUBLICADO que aceita agendamento. Exposição mínima (nome da clínica,
-- profissionais, horários livres) e a marcação nasce PENDENTE — a clínica
-- confirma. anon nunca vê dado de outro tenant nem cria consulta confirmada.
--
-- As 3 funções entram na allow-list da auditoria (são anon de propósito, como
-- current_clinica_id/is_admin já são).
-- ============================================================================

begin;

-- ---------------------------------------------------------------- perfil por slug
-- Devolve a clínica + profissionais de um perfil publicado que aceita agenda.
create or replace function public.booking_perfil(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_perfil record;
  v_profs jsonb;
begin
  select pp.clinica_id, c.nome_clinica, pp.bio, pp.foto_url, pp.capa_url, pp.especialidades
    into v_perfil
    from perfil_publico pp
    join clinicas c on c.id = pp.clinica_id
   where pp.slug = p_slug and pp.publicado and pp.aceita_agendamento;
  if not found then
    return jsonb_build_object('encontrado', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id, 'nome', pr.full_name, 'especialidade', pr.especialidade
         ) order by pr.full_name), '[]'::jsonb)
    into v_profs
    from profiles pr
   where pr.clinica_id = v_perfil.clinica_id and pr.status = 'active';

  return jsonb_build_object(
    'encontrado', true,
    'clinica_id', v_perfil.clinica_id,
    'nome_clinica', v_perfil.nome_clinica,
    'bio', v_perfil.bio,
    'foto_url', v_perfil.foto_url,
    'capa_url', v_perfil.capa_url,
    'especialidades', v_perfil.especialidades,
    'profissionais', v_profs
  );
end $$;

-- ---------------------------------------------------------------- horários livres
-- Valida que o profissional é da clínica do slug e delega pro slots_disponiveis.
create or replace function public.booking_slots(
  p_slug text, p_profissional_id uuid, p_data date, p_servico_id uuid default null
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_clinica uuid;
begin
  select pp.clinica_id into v_clinica
    from perfil_publico pp
   where pp.slug = p_slug and pp.publicado and pp.aceita_agendamento;
  if v_clinica is null then return; end if;

  -- profissional precisa ser da clínica do slug (senão anon sondaria agendas alheias)
  if not exists (select 1 from profiles where id = p_profissional_id and clinica_id = v_clinica) then
    return;
  end if;

  return query
    select to_jsonb(s) from public.slots_disponiveis(p_profissional_id, p_data, p_servico_id) s;
end $$;

-- ---------------------------------------------------------------- marcar
-- Cria (ou reusa) o paciente pelo celular e agenda uma consulta PENDENTE.
-- A assinatura ganhou p_nascimento; dropa a versão anterior (troca de assinatura).
drop function if exists public.booking_agendar(text, uuid, timestamptz, text, text, uuid);
create or replace function public.booking_agendar(
  p_slug text,
  p_profissional_id uuid,
  p_inicio timestamptz,
  p_nome text,
  p_celular text,
  p_nascimento date,
  p_servico_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clinica uuid;
  v_fone text := regexp_replace(coalesce(p_celular,''), '\D', '', 'g');
  v_dur int := 30;
  v_fim timestamptz;
  v_pac uuid;
  v_id uuid;
begin
  -- clínica do slug (publicada + aceita agenda)
  select pp.clinica_id into v_clinica
    from perfil_publico pp
   where pp.slug = p_slug and pp.publicado and pp.aceita_agendamento;
  if v_clinica is null then
    return jsonb_build_object('ok', false, 'erro', 'Agendamento indisponível');
  end if;

  if length(v_fone) < 10 or coalesce(btrim(p_nome),'') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Informe nome e celular válidos');
  end if;
  if not exists (select 1 from profiles where id = p_profissional_id and clinica_id = v_clinica) then
    return jsonb_build_object('ok', false, 'erro', 'Profissional inválido');
  end if;
  if p_inicio < now() then
    return jsonb_build_object('ok', false, 'erro', 'Horário no passado');
  end if;

  -- duração do serviço (se houver), senão 30 min
  if p_servico_id is not null then
    select coalesce(duracao_min, 30) into v_dur from procedimentos
     where id = p_servico_id and clinica_id = v_clinica;
  end if;
  v_fim := p_inicio + make_interval(mins => coalesce(v_dur, 30));

  -- anti-spam simples: mesmo celular já tem marcação pública futura nesta clínica
  if exists (
    select 1 from consultas c join pacientes pa on pa.id = c.paciente_id
     where c.clinica_id = v_clinica and pa.celular = v_fone
       and c.origem = 'booking_publico' and c.inicio > now()
       and c.status in ('pendente','agendado','confirmado')
  ) then
    return jsonb_build_object('ok', false, 'erro', 'Já existe uma solicitação de agendamento para este número');
  end if;

  -- paciente: reusa pelo celular, senão cria mínimo
  select id into v_pac from pacientes
   where clinica_id = v_clinica and celular = v_fone limit 1;
  if v_pac is null then
    insert into pacientes (clinica_id, nome_completo, celular, data_nascimento, observacoes)
    values (v_clinica, btrim(p_nome), v_fone, p_nascimento, 'Cadastro via agendamento online')
    returning id into v_pac;
  end if;

  -- consulta PENDENTE (a clínica confirma). O EXCLUDE de sobreposição do banco
  -- barra choque de horário; devolvemos erro amigável nesse caso.
  begin
    insert into consultas (clinica_id, paciente_id, profissional_id, servico_id,
                           inicio, fim, status, origem, titulo)
    values (v_clinica, v_pac, p_profissional_id, p_servico_id,
            p_inicio, v_fim, 'pendente', 'booking_publico', 'Agendamento online')
    returning id into v_id;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'Este horário acabou de ficar indisponível');
  end;

  return jsonb_build_object('ok', true, 'consulta_id', v_id);
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.booking_perfil(text) from public;
revoke all on function public.booking_slots(text, uuid, date, uuid) from public;
revoke all on function public.booking_agendar(text, uuid, timestamptz, text, text, date, uuid) from public;
grant execute on function public.booking_perfil(text) to anon, authenticated;
grant execute on function public.booking_slots(text, uuid, date, uuid) to anon, authenticated;
grant execute on function public.booking_agendar(text, uuid, timestamptz, text, text, date, uuid) to anon, authenticated;

-- ---------------------------------------------------------------- allow-list da auditoria
-- As 3 funções são anon DE PROPÓSITO (agendamento público). Sem reescrever o
-- corpo enorme de auditoria_saude, renomeio a implementação atual para _impl e
-- ponho um wrapper que filtra os 3 falsos-positivos. Idempotente: só renomeia
-- se ainda não foi renomeada.
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='_auditoria_saude_impl') then
    alter function public.auditoria_saude() rename to _auditoria_saude_impl;
  end if;
end $$;

create or replace function public.auditoria_saude()
returns table(categoria text, item text, status text, detalhe text)
language plpgsql
security definer
set search_path to 'public'
as $af$
begin
  return query select * from public._auditoria_saude_impl() ai
    where not (ai.categoria = 'FUNÇÃO-ANON'
               and ai.item in ('booking_perfil','booking_slots','booking_agendar'));
end $af$;

-- o wrapper recriado herda EXECUTE de public por padrao; o original era so
-- authenticated/service_role. Reproduz isso, senao a propria auditoria vira anon.
revoke all on function public.auditoria_saude() from public, anon;
grant execute on function public.auditoria_saude() to authenticated, service_role;

commit;
