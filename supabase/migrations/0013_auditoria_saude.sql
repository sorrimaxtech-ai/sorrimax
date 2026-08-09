-- ============================================================================
-- SORRIMAX · 0013 · Auditoria de saúde permanente
-- ----------------------------------------------------------------------------
-- O bug "new row violates row-level security policy for table pipeline_stages"
-- é de uma CLASSE de problema, não um caso isolado. Esta função transforma as
-- invariantes do sistema em verificação executável, para que a classe inteira
-- seja pega antes de chegar no usuário.
--
-- Uso:   select * from public.auditoria_saude() where status <> 'OK';
--        (0 linhas = sistema íntegro)
--
-- Rodar: depois de CADA migration, antes de cada deploy, e no CI.
-- ============================================================================

begin;

create or replace function public.auditoria_saude()
returns table(categoria text, item text, status text, detalhe text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ── 1. Toda tabela pública precisa de RLS ────────────────────────────────
  -- Sem RLS, a anon key (que vai no bundle do site) lê/escreve a tabela toda.
  return query
  select 'RLS'::text, t.tablename::text, 'FALHA'::text,
         'tabela pública SEM row level security'::text
    from pg_tables t
   where t.schemaname = 'public'
     and not t.rowsecurity;

  -- ── 2. Tabela com RLS ligado mas SEM nenhuma policy = inacessível ────────
  -- (bloqueia até o dono; sintoma clássico: "some tudo da tela")
  return query
  select 'RLS'::text, t.tablename::text, 'ALERTA'::text,
         'RLS ligado porém SEM policy: ninguém consegue ler/escrever'::text
    from pg_tables t
   where t.schemaname = 'public'
     and t.rowsecurity
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename);

  -- ── 3. Tabela com clinica_id precisa isolar por tenant ───────────────────
  -- Se a policy não referencia current_clinica_id(), uma clínica vê a outra.
  return query
  select 'MULTI-TENANT'::text, c.table_name::text, 'FALHA'::text,
         'tem clinica_id mas nenhuma policy usa current_clinica_id()'::text
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.column_name = 'clinica_id'
     and exists (select 1 from pg_tables t
                  where t.schemaname='public' and t.tablename=c.table_name)
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.table_name
          and (coalesce(p.qual,'') || coalesce(p.with_check,'')) like '%current_clinica_id%');

  -- ── 4. SECURITY DEFINER sem search_path = escalonamento de privilégio ────
  -- Um schema malicioso no search_path sequestra a resolução de nomes e roda
  -- código com os privilégios do owner.
  return query
  select 'FUNÇÃO'::text, p.proname::text, 'FALHA'::text,
         'SECURITY DEFINER sem search_path fixo'::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'));

  -- ── 5. Trigger de seed precisa ser DEFINER ───────────────────────────────
  -- ESTE é o bug do cadastro: trigger que semeia dado padrão rodando como
  -- INVOKER estoura a RLS quando ainda não há usuário com tenant.
  return query
  select 'TRIGGER'::text, p.proname::text, 'FALHA'::text,
         'trigger que faz INSERT roda como INVOKER: vai estourar RLS no onboarding'::text
    from pg_trigger tg
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
   where not tg.tgisinternal
     and n.nspname = 'public'
     and not p.prosecdef
     and p.prosrc ilike '%insert into%';

  -- ── 6. View sem security_invoker IGNORA a RLS das tabelas de base ────────
  -- Vazamento entre clínicas pela porta dos fundos.
  return query
  select 'VIEW'::text, c.relname::text, 'FALHA'::text,
         'view sem security_invoker=on: ignora RLS e vaza entre tenants'::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     and (c.reloptions is null
          or not exists (select 1 from unnest(c.reloptions) o where o like 'security_invoker=%on%'));

  -- ── 7. FK sem índice = lock e lentidão em cascata ────────────────────────
  return query
  select 'ÍNDICE'::text, (con.conrelid::regclass::text || '.' || a.attname)::text, 'ALERTA'::text,
         'chave estrangeira sem índice de suporte'::text
    from pg_constraint con
    join pg_namespace n on n.oid = con.connamespace
    join lateral unnest(con.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
   where con.contype = 'f'
     and n.nspname = 'public'
     and array_length(con.conkey, 1) = 1
     and not exists (
       select 1 from pg_index i
        where i.indrelid = con.conrelid
          and i.indkey[0] = k.attnum);

  -- ── 8. Consistência do onboarding ────────────────────────────────────────
  return query
  select 'ONBOARDING'::text, 'profiles órfãos'::text, 'ALERTA'::text,
         count(*)::text || ' profile(s) sem clinica_id — usuário loga e não enxerga nada'
    from public.profiles where clinica_id is null
   having count(*) > 0;

  return query
  select 'ONBOARDING'::text, 'clínicas órfãs'::text, 'ALERTA'::text,
         count(*)::text || ' clínica(s) sem nenhum profile — lixo de cadastro interrompido'
    from public.clinicas c
   where not exists (select 1 from public.profiles p where p.clinica_id = c.id)
  having count(*) > 0;

  -- ── 9. Instância de WhatsApp compartilhada com outro sistema ─────────────
  -- Proteção contra quebrar o Diamond em produção.
  return query
  select 'WHATSAPP'::text, i.name::text, 'ALERTA'::text,
         'instância compartilhada com ' || coalesce(i.external_system,'?') ||
         ' está com webhook_mode=' || i.webhook_mode ||
         ' — se for direct, o outro sistema PARA de receber'
    from public.whatsapp_instances i
   where i.shared_external and i.webhook_mode = 'direct';

  -- ── tudo certo ───────────────────────────────────────────────────────────
  if not found then
    return query select 'GERAL'::text, 'todas as invariantes'::text, 'OK'::text,
                        'nenhum problema encontrado'::text;
  end if;
end $$;

revoke all on function public.auditoria_saude() from public, anon;
grant execute on function public.auditoria_saude() to authenticated, service_role;

commit;
