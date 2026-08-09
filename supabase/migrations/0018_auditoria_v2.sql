-- ============================================================================
-- SORRIMAX · 0018 · Auditoria v2 — fecha as lacunas do próprio auditor
-- ----------------------------------------------------------------------------
-- A v1 não pegou `clinicas_all_access` (USING(true) TO public) porque só
-- verificava "existe alguma policy com current_clinica_id". Policies são
-- somadas com OR: UMA permissiva anula todas as restritivas. Agora checa isso.
-- Também passa a pegar: função privilegiada ao alcance de anon, guard de tenant
-- NULL-unsafe (`<>` em vez de `is distinct from`) e segredo exposto ao cliente.
-- ============================================================================
create or replace function public.auditoria_saude()
returns table(categoria text, item text, status text, detalhe text)
language plpgsql security definer set search_path = public as $$
begin
  return query select 'RLS'::text, t.tablename::text, 'FALHA'::text,
    'tabela pública SEM row level security'::text
    from pg_tables t where t.schemaname='public' and not t.rowsecurity;

  return query select 'RLS'::text, t.tablename::text, 'FALHA'::text,
    'RLS ligado porém SEM policy'::text
    from pg_tables t where t.schemaname='public' and t.rowsecurity
     and t.tablename not in ('follow_up','prontuário','leads_sistema')
     and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.tablename);

  -- 🆕 policy permissiva anula as restritivas (a que passou batido antes)
  return query select 'RLS-PERMISSIVA'::text, (p.tablename||' / '||p.policyname)::text, 'FALHA'::text,
    ('policy '||p.cmd||' para '||p.roles::text||' com USING(true) — anula o isolamento por OR')::text
    from pg_policies p
   where p.schemaname='public'
     and p.permissive='PERMISSIVE'
     and (p.roles::text like '%public%' or p.roles::text like '%anon%')
     and coalesce(p.qual,'true')='true'
     and p.cmd <> 'INSERT'
     and p.tablename not in ('especialidades','leads_sistema');

  return query select 'MULTI-TENANT'::text, c.table_name::text, 'FALHA'::text,
    'tem clinica_id mas nenhuma policy usa current_clinica_id()'::text
    from information_schema.columns c
   where c.table_schema='public' and c.column_name='clinica_id'
     and exists (select 1 from pg_tables t where t.schemaname='public' and t.tablename=c.table_name)
     and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.table_name
                      and (coalesce(p.qual,'')||coalesce(p.with_check,'')) like '%current_clinica_id%');

  return query select 'FUNÇÃO'::text, p.proname::text, 'FALHA'::text,
    'SECURITY DEFINER sem search_path fixo'::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));

  -- 🆕 função privilegiada executável por anônimo
  return query select 'FUNÇÃO-ANON'::text, p.proname::text, 'FALHA'::text,
    'SECURITY DEFINER executável por anon — fura RLS sem login'::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('current_clinica_id','current_role','is_admin');

  -- 🆕 guard de tenant NULL-unsafe: `<> current_clinica_id()` falha ABERTO
  return query select 'GUARD-NULL'::text, p.proname::text, 'FALHA'::text,
    'compara tenant com <> (NULL-unsafe): use `is distinct from`'::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and p.prosrc ~ '<>\s*(public\.)?current_clinica_id\(\)';

  return query select 'TRIGGER'::text, p.proname::text, 'FALHA'::text,
    'trigger que faz INSERT roda como INVOKER: estoura RLS no onboarding'::text
    from pg_trigger tg join pg_proc p on p.oid=tg.tgfoid join pg_namespace n on n.oid=p.pronamespace
   where not tg.tgisinternal and n.nspname='public' and not p.prosecdef and p.prosrc ilike '%insert into%';

  return query select 'VIEW'::text, c.relname::text, 'FALHA'::text,
    'view sem security_invoker=on: ignora RLS'::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='v'
     and (c.reloptions is null or not exists (select 1 from unnest(c.reloptions) o where o like 'security_invoker=%on%'));

  -- 🆕 segredo de integração legível pelo cliente
  return query select 'SEGREDO'::text, (table_name||'.'||column_name)::text, 'FALHA'::text,
    'coluna de segredo com SELECT concedido a authenticated/anon'::text
    from information_schema.column_privileges
   where table_schema='public' and privilege_type='SELECT'
     and grantee in ('anon','authenticated')
     and column_name in ('api_token','apikey','webhook_secret','service_key','secret','password','senha');

  -- 🆕 tabela com segredo publicada no Realtime
  return query select 'REALTIME'::text, pt.tablename::text, 'FALHA'::text,
    'tabela com coluna de segredo publicada no Realtime — vaza pro navegador'::text
    from pg_publication_tables pt
   where pt.pubname='supabase_realtime'
     and exists (select 1 from information_schema.columns c
                  where c.table_schema='public' and c.table_name=pt.tablename
                    and c.column_name in ('api_token','apikey','webhook_secret','secret','senha'));

  return query select 'ÍNDICE'::text, (con.conrelid::regclass::text||'.'||a.attname)::text, 'ALERTA'::text,
    'FK sem índice de suporte'::text
    from pg_constraint con join pg_namespace n on n.oid=con.connamespace
    join lateral unnest(con.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum
   where con.contype='f' and n.nspname='public' and array_length(con.conkey,1)=1
     and not exists (select 1 from pg_index i where i.indrelid=con.conrelid and i.indkey[0]=k.attnum);

  return query select 'ONBOARDING'::text, 'usuários trancados'::text, 'FALHA'::text,
    count(*)::text||' usuário(s) em auth.users sem profile — logam e não veem nada'
    from auth.users u where not exists (select 1 from public.profiles p where p.id=u.id) having count(*)>0;

  return query select 'ONBOARDING'::text, 'clínicas órfãs'::text, 'ALERTA'::text,
    count(*)::text||' clínica(s) sem profile'
    from public.clinicas c where not c.sistema
     and not exists (select 1 from public.profiles p where p.clinica_id=c.id) having count(*)>0;

  return query select 'WHATSAPP'::text, i.name::text, 'FALHA'::text,
    ('compartilhada com '||coalesce(i.external_system,'?')||' e webhook_mode=direct — o outro sistema PARA de receber')::text
    from public.whatsapp_instances i where i.shared_external and i.webhook_mode='direct';

  if not found then
    return query select 'GERAL'::text,'todas as invariantes'::text,'OK'::text,'nenhum problema encontrado'::text;
  end if;
end $$;
revoke all on function public.auditoria_saude() from public, anon;
grant execute on function public.auditoria_saude() to authenticated, service_role;
