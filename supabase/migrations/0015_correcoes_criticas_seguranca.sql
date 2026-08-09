-- ============================================================================
-- VITTALHUB · 0015 · CORREÇÕES CRÍTICAS DE SEGURANÇA
-- ----------------------------------------------------------------------------
-- Achados de auditoria (06/08/2026), todos comprovados por exploração real:
--   🔴 clinicas: anon podia LER/ALTERAR/APAGAR todas → 33 FKs ON DELETE CASCADE
--                = wipe do banco inteiro com a chave que está no bundle público
--   🔴 gerar_debitos_orcamento: guard de tenant com `<>` falha ABERTO em NULL
--   🟠 marcar_parcelas_atrasadas / slots_disponiveis: DEFINER sem filtro de tenant
--                exposta a anon
--   🟡 anon com TODOS os privilégios (inclusive TRUNCATE, que RLS não filtra)
--   🟡 policies duplicadas da renomeação servicos→procedimentos
-- ============================================================================

begin;

-- ══ 1. clinicas: remover as policies permissivas que anulavam as restritivas ══
-- Policies permissivas somam com OR: UMA `using(true)` derruba todas as outras.
drop policy if exists "clinicas_all_access"        on public.clinicas;
drop policy if exists "Public update clinic by ID" on public.clinicas;
drop policy if exists "clinicas_insert"            on public.clinicas;
drop policy if exists "clinicas_insert_signup"     on public.clinicas;

-- Cadastro passa a exigir usuário autenticado (signUp primeiro, clínica depois).
-- Fecha também a criação anônima em massa de clínicas.
create policy clinicas_insert_signup on public.clinicas
  for insert to authenticated with check (true);
-- clinicas_select e clinicas_update permanecem (já corretas, com is_admin()).

-- ══ 2. Guard de tenant NULL-safe ═════════════════════════════════════════════
-- `uuid <> NULL` devolve NULL, e `if NULL then` NÃO dispara — o guard falhava
-- ABERTO para anon e para qualquer usuário sem profiles.clinica_id.
-- `is distinct from` é NULL-safe e é a forma correta.
create or replace function public.gerar_debitos_orcamento(
  p_orcamento_id    uuid,
  p_forma           public.forma_pagamento,
  p_qtd_parcelas    smallint default 1,
  p_primeiro_venc   date default current_date,
  p_conta_id        uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orc         record;
  v_lancamento  uuid;
  v_valor_parc  numeric(12,2);
  v_resto       numeric(12,2);
  v_clinica     uuid;
  i             smallint;
begin
  -- exige sessão com tenant resolvido — sem isso, nada prossegue
  v_clinica := public.current_clinica_id();
  if v_clinica is null then
    raise exception 'Sem clínica no contexto: operação exige usuário autenticado';
  end if;

  select * into v_orc from public.orcamentos where id = p_orcamento_id;
  if not found then
    raise exception 'Orçamento % não encontrado', p_orcamento_id;
  end if;

  -- NULL-safe: `is distinct from` trata NULL como valor comparável
  if v_orc.clinica_id is distinct from v_clinica then
    raise exception 'Orçamento de outra clínica';
  end if;
  if v_orc.status not in ('aprovado', 'aprovado_parcial') then
    raise exception 'Orçamento precisa estar aprovado (status atual: %)', v_orc.status;
  end if;
  if v_orc.total_aprovado <= 0 then
    raise exception 'Orçamento sem valor aprovado';
  end if;
  if exists (select 1 from public.lancamentos where orcamento_id = p_orcamento_id) then
    raise exception 'Este orçamento já gerou lançamento financeiro';
  end if;

  insert into public.lancamentos (
    clinica_id, tipo, descricao, paciente_id, orcamento_id, profissional_id,
    valor_total, forma_pagamento, qtd_parcelas, conta_id, criado_por
  ) values (
    v_orc.clinica_id, 'receber',
    'Orçamento #' || v_orc.numero, v_orc.paciente_id, v_orc.id, v_orc.profissional_id,
    v_orc.total_aprovado, p_forma, greatest(p_qtd_parcelas, 1), p_conta_id, auth.uid()
  ) returning id into v_lancamento;

  v_valor_parc := round(v_orc.total_aprovado / greatest(p_qtd_parcelas, 1), 2);
  v_resto      := v_orc.total_aprovado - (v_valor_parc * greatest(p_qtd_parcelas, 1));

  for i in 1..greatest(p_qtd_parcelas, 1) loop
    insert into public.lancamento_parcelas (
      clinica_id, lancamento_id, numero, valor, vencimento, conta_id, forma_pagamento
    ) values (
      v_orc.clinica_id, v_lancamento, i,
      v_valor_parc + case when i = 1 then v_resto else 0 end,
      (p_primeiro_venc + ((i - 1) || ' month')::interval)::date,
      p_conta_id, p_forma
    );
  end loop;

  insert into public.comissoes (
    clinica_id, profissional_id, orcamento_item_id, procedimento_id,
    base_calculo, percentual, valor
  )
  select v_orc.clinica_id,
         coalesce(v_orc.profissional_id, auth.uid()),
         oi.id, oi.procedimento_id, oi.total, pp.comissao_percentual,
         coalesce(pp.comissao_valor, round(oi.total * coalesce(pp.comissao_percentual, 0) / 100, 2))
    from public.orcamento_itens oi
    left join public.procedimento_precos pp
           on pp.procedimento_id = oi.procedimento_id
          and pp.convenio_id     = v_orc.convenio_id
   where oi.orcamento_id = p_orcamento_id
     and oi.status = 'aprovado'
     and coalesce(pp.comissao_percentual, pp.comissao_valor, 0) > 0;

  return v_lancamento;
end $$;

-- ══ 3. slots_disponiveis: exige tenant e valida o profissional ═══════════════
-- Era DEFINER sem filtro de clínica e exposta a anon: com um UUID de
-- profissional dava pra enumerar a agenda de qualquer clínica.
create or replace function public.slots_disponiveis(
  p_profissional_id uuid,
  p_data            date,
  p_servico_id      uuid default null
)
returns table (inicio timestamptz, fim timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid; v_tz text; v_duracao int;
  v_buf_antes int := 0; v_buf_depois int := 0; v_ctx uuid;
begin
  v_ctx := public.current_clinica_id();
  if v_ctx is null then
    raise exception 'Sem clínica no contexto';
  end if;

  select p.clinica_id into v_clinica_id
    from public.profiles p where p.id = p_profissional_id;

  -- o profissional precisa ser DA MESMA clínica do solicitante
  if v_clinica_id is null or v_clinica_id is distinct from v_ctx then
    return;
  end if;

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
end $$;

-- ══ 4. Revogar RPCs privilegiadas do alcance de anon ═════════════════════════
revoke execute on function public.gerar_debitos_orcamento(uuid, public.forma_pagamento, smallint, date, uuid) from public, anon;
grant   execute on function public.gerar_debitos_orcamento(uuid, public.forma_pagamento, smallint, date, uuid) to authenticated;

revoke execute on function public.slots_disponiveis(uuid, date, uuid) from public, anon;
grant   execute on function public.slots_disponiveis(uuid, date, uuid) to authenticated;

-- rotina de manutenção: só o backend (service_role) roda
revoke execute on function public.marcar_parcelas_atrasadas() from public, anon, authenticated;
grant   execute on function public.marcar_parcelas_atrasadas() to service_role;

revoke execute on function public.wa_enfileirar_texto(uuid, text, timestamptz) from public, anon;
grant   execute on function public.wa_enfileirar_texto(uuid, text, timestamptz) to authenticated;
revoke execute on function public.wa_marcar_chat_lido(uuid) from public, anon;
grant   execute on function public.wa_marcar_chat_lido(uuid) to authenticated;

-- ══ 5. Defesa em profundidade: anon não precisa de tudo ══════════════════════
-- anon tinha DELETE/TRUNCATE/UPDATE em todas as tabelas. TRUNCATE **não é
-- filtrado por RLS** — só o fato de o PostgREST não expor salvava.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- o mínimo que o app anônimo precisa:
grant select on public.especialidades to anon;   -- catálogo público
grant insert on public.leads_sistema  to anon;   -- formulário de captação (sistema legado)

-- ══ 6. Policies duplicadas (herança do rename servicos→procedimentos) ════════
drop policy if exists servicos_tenant             on public.procedimentos;
drop policy if exists servico_profissional_tenant on public.procedimento_profissional;

-- ══ 7. clinica_id NOT NULL onde é seguro ════════════════════════════════════
-- Linha com clinica_id NULL fica invisível a toda policy de tenant (órfã eterna).
-- profiles fica nullable de propósito: no signup o profile nasce sem clínica.
do $$
declare t text;
begin
  foreach t in array array['assinaturas','configuracoes_pagamento','enderecos_clinica',
                           'whatsapp_chats','whatsapp_messages']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('delete from public.%I where clinica_id is null', t);
      execute format('alter table public.%I alter column clinica_id set not null', t);
    end if;
  end loop;
end $$;

commit;
