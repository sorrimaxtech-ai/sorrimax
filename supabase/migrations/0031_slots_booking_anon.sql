-- ============================================================================
-- 0031 — slots_disponiveis tolera contexto anon (corrige agendamento publico)
-- ----------------------------------------------------------------------------
-- A funcao exigia current_clinica_id() nao-nulo (raise 'Sem clinica no
-- contexto'). No caminho do agendamento publico (booking_slots, anon) nao ha
-- contexto de clinica -> nenhum horario aparecia na pagina /c/<slug>.
-- Agora: contexto null e permitido (booking_slots ja validou o profissional no
-- slug publicado); usuario AUTENTICADO segue barrado de sondar outra clinica.
-- Nao afrouxa a seguranca: slots_disponiveis nao e concedida a anon direto,
-- so via booking_slots (SECURITY DEFINER, escopado ao slug).
-- ============================================================================

begin;

CREATE OR REPLACE FUNCTION public.slots_disponiveis(p_profissional_id uuid, p_data date, p_servico_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(inicio timestamp with time zone, fim timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_clinica_id uuid; v_tz text; v_duracao int;
  v_buf_antes int := 0; v_buf_depois int := 0; v_ctx uuid;
begin
  v_ctx := public.current_clinica_id();  -- null no caminho anon (agendamento publico)

  select p.clinica_id into v_clinica_id
    from public.profiles p where p.id = p_profissional_id;
  if v_clinica_id is null then return; end if;

  -- usuario autenticado nao pode sondar agenda de outra clinica; anon (booking)
  -- ja foi validado em booking_slots e nao tem contexto de clinica.
  if v_ctx is not null and v_clinica_id is distinct from v_ctx then return; end if;
  v_ctx := v_clinica_id;  -- daqui pra frente o corpo usa a clinica do profissional

  select coalesce(c.timezone, 'America/Sao_Paulo') into v_tz
    from public.clinicas c where c.id = v_clinica_id;

  if p_servico_id is not null then
    select coalesce(sp.duracao_override_min, s.duracao_min), s.buffer_antes_min, s.buffer_depois_min
      into v_duracao, v_buf_antes, v_buf_depois
      from public.procedimentos s
      left join public.procedimento_profissional sp
             on sp.procedimento_id = s.id and sp.profissional_id = p_profissional_id and sp.ativo
     where s.id = p_servico_id and s.clinica_id = v_ctx;
  end if;

  return query
  with grade as (
    select d.hora_inicio, d.hora_fim, coalesce(v_duracao, d.intervalo_slot_min) as passo_min
      from public.disponibilidades d
     where d.profissional_id = p_profissional_id and d.ativo
       and d.dia_semana = extract(dow from p_data)::smallint
       and (d.vigencia_inicio is null or p_data >= d.vigencia_inicio)
       and (d.vigencia_fim    is null or p_data <= d.vigencia_fim)
  ),
  candidatos as (
    select ((p_data + g.hora_inicio) at time zone v_tz) + (n * g.passo_min || ' minutes')::interval as ini,
           ((p_data + g.hora_inicio) at time zone v_tz) + ((n * g.passo_min) + g.passo_min || ' minutes')::interval as f
      from grade g
      cross join lateral generate_series(0, greatest(0,
        (extract(epoch from (g.hora_fim - g.hora_inicio)) / 60 / g.passo_min)::int - 1)) as n
  )
  select c.ini, c.f from candidatos c
   where c.ini > now()
     and not exists (
       select 1 from public.consultas k
        where k.profissional_id = p_profissional_id
          and public.consulta_ocupa_agenda(k.status)
          and tstzrange(k.inicio - (v_buf_antes || ' minutes')::interval,
                        k.fim    + (v_buf_depois || ' minutes')::interval) && tstzrange(c.ini, c.f))
     and not exists (
       select 1 from public.bloqueios_agenda b
        where b.clinica_id = v_clinica_id
          and (b.profissional_id = p_profissional_id or b.profissional_id is null)
          and tstzrange(b.inicio, b.fim) && tstzrange(c.ini, c.f))
   order by c.ini;
end $function$;

commit;
