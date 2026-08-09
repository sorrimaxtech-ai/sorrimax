-- ============================================================================
-- VITTALHUB · 0014 · Correções apontadas pela auditoria de saúde (0013)
-- ----------------------------------------------------------------------------
-- Achados corrigidos aqui:
--   🔴 2 triggers com INSERT rodando como INVOKER (mesma classe do bug do cadastro)
--   🟠 45 chaves estrangeiras sem índice (lock em cascade + lentidão)
--   🟠 clínica-holder de sistema aparecendo como "órfã" (falso positivo)
--   🟠 lixo de sonda de auditoria no banco
-- ============================================================================

begin;

-- ── 1. Triggers de orçamento: INVOKER → DEFINER ─────────────────────────────
-- Mesma classe do bug do cadastro. Hoje funcionam porque só rodam com usuário
-- logado, mas quebrariam no fluxo em que o PACIENTE aprova o orçamento por link
-- público (sem sessão) — que é justamente a feature de aquisição planejada.
-- É seguro: o tenant vem de NEW.clinica_id (a linha que o usuário já podia
-- acessar via RLS de orcamento_itens), nunca do usuário.
alter function public.orcamento_item_para_odontograma()
  security definer set search_path = public;

alter function public.orcamento_sincronizar_funil()
  security definer set search_path = public;

-- ── 2. Índice em toda FK sem suporte ────────────────────────────────────────
-- Sem índice na coluna que referencia, todo DELETE/UPDATE no pai varre a tabela
-- filha inteira segurando lock. Gera lentidão que só aparece com volume.
do $$
declare
  r record;
  v_tbl text;
  v_idx text;
begin
  for r in
    select con.conrelid::regclass::text as tbl_full, a.attname::text as col
      from pg_constraint con
      join pg_namespace n on n.oid = con.connamespace
      join lateral unnest(con.conkey) k(attnum) on true
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
     where con.contype = 'f'
       and n.nspname = 'public'
       and array_length(con.conkey, 1) = 1
       and not exists (
         select 1 from pg_index i
          where i.indrelid = con.conrelid and i.indkey[0] = k.attnum)
  loop
    v_tbl := replace(r.tbl_full, 'public.', '');
    v_idx := left('idx_fk_' || v_tbl || '_' || r.col, 63);
    execute format('create index if not exists %I on public.%I (%I)', v_idx, v_tbl, r.col);
  end loop;
end $$;

-- ── 3. Clínica de sistema (holder) não é órfã ───────────────────────────────
-- A clínica que segura as instâncias uazapi compartilhadas não tem — nem deve
-- ter — profile vinculado. Marcar para não poluir a auditoria.
alter table public.clinicas
  add column if not exists sistema boolean not null default false;

comment on column public.clinicas.sistema is
  'true = clínica técnica (holder de recursos), não é cliente. Excluída das checagens de órfã.';

update public.clinicas set sistema = true where codigo_clinica = 'UAZAPI-SHARED';

-- ── 4. Limpeza de lixo de auditoria ─────────────────────────────────────────
delete from public.clinicas
 where nome_clinica in ('AUDIT-PROBE-DELETEME', '__AUDIT_SIGNUP__', '__TESTE_QA__', '__WA_QA__', '__E2E__')
    or codigo_clinica in ('QA-99999', 'WAQA-1', 'E2E-1');

-- ── 5. Auditor refinado ─────────────────────────────────────────────────────
-- Exclui clínicas de sistema da checagem de órfã e reconhece que as tabelas
-- legadas (follow_up, prontuário) são fail-closed de propósito: pertencem a
-- outro sistema e só devem ser acessadas por service_role.
create or replace function public.auditoria_saude()
returns table(categoria text, item text, status text, detalhe text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select 'RLS'::text, t.tablename::text, 'FALHA'::text,
         'tabela pública SEM row level security'::text
    from pg_tables t
   where t.schemaname = 'public' and not t.rowsecurity;

  -- RLS sem policy é INTENCIONAL nas tabelas legadas de outro sistema
  -- (fail-closed: só service_role acessa). Nas nossas, é bug.
  return query
  select 'RLS'::text, t.tablename::text, 'FALHA'::text,
         'RLS ligado porém SEM policy: ninguém consegue ler/escrever'::text
    from pg_tables t
   where t.schemaname = 'public'
     and t.rowsecurity
     and t.tablename not in ('follow_up', 'prontuário', 'leads_sistema')
     and not exists (select 1 from pg_policies p
                      where p.schemaname='public' and p.tablename=t.tablename);

  return query
  select 'MULTI-TENANT'::text, c.table_name::text, 'FALHA'::text,
         'tem clinica_id mas nenhuma policy usa current_clinica_id()'::text
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.column_name = 'clinica_id'
     and exists (select 1 from pg_tables t where t.schemaname='public' and t.tablename=c.table_name)
     and not exists (
       select 1 from pg_policies p
        where p.schemaname='public' and p.tablename=c.table_name
          and (coalesce(p.qual,'') || coalesce(p.with_check,'')) like '%current_clinica_id%');

  return query
  select 'FUNÇÃO'::text, p.proname::text, 'FALHA'::text,
         'SECURITY DEFINER sem search_path fixo'::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'));

  return query
  select 'TRIGGER'::text, p.proname::text, 'FALHA'::text,
         'trigger que faz INSERT roda como INVOKER: vai estourar RLS no onboarding'::text
    from pg_trigger tg
    join pg_proc p on p.oid=tg.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
   where not tg.tgisinternal and n.nspname='public'
     and not p.prosecdef and p.prosrc ilike '%insert into%';

  return query
  select 'VIEW'::text, c.relname::text, 'FALHA'::text,
         'view sem security_invoker=on: ignora RLS e vaza entre tenants'::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='v'
     and (c.reloptions is null
          or not exists (select 1 from unnest(c.reloptions) o where o like 'security_invoker=%on%'));

  return query
  select 'ÍNDICE'::text, (con.conrelid::regclass::text || '.' || a.attname)::text, 'ALERTA'::text,
         'chave estrangeira sem índice de suporte'::text
    from pg_constraint con
    join pg_namespace n on n.oid=con.connamespace
    join lateral unnest(con.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum
   where con.contype='f' and n.nspname='public' and array_length(con.conkey,1)=1
     and not exists (select 1 from pg_index i where i.indrelid=con.conrelid and i.indkey[0]=k.attnum);

  return query
  select 'ONBOARDING'::text, 'profiles órfãos'::text, 'ALERTA'::text,
         count(*)::text || ' profile(s) sem clinica_id — usuário loga e não enxerga nada'
    from public.profiles where clinica_id is null having count(*) > 0;

  return query
  select 'ONBOARDING'::text, 'clínicas órfãs'::text, 'ALERTA'::text,
         count(*)::text || ' clínica(s) sem profile — lixo de cadastro interrompido'
    from public.clinicas c
   where not c.sistema
     and not exists (select 1 from public.profiles p where p.clinica_id=c.id)
  having count(*) > 0;

  return query
  select 'WHATSAPP'::text, i.name::text, 'FALHA'::text,
         'instância compartilhada com ' || coalesce(i.external_system,'?') ||
         ' com webhook_mode=direct — o outro sistema PARA de receber'
    from public.whatsapp_instances i
   where i.shared_external and i.webhook_mode = 'direct';

  if not found then
    return query select 'GERAL'::text, 'todas as invariantes'::text, 'OK'::text,
                        'nenhum problema encontrado'::text;
  end if;
end $$;

revoke all on function public.auditoria_saude() from public, anon;
grant execute on function public.auditoria_saude() to authenticated, service_role;

commit;
