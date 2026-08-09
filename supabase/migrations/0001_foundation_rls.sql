-- ============================================================================
-- SORRIMAX · 0001 · Fundação e RLS consolidado
-- ----------------------------------------------------------------------------
-- Substitui: fix_rls.sql, fix_rls_v2, fix_rls_anon_setup, fix_rls_definitive,
--            fix_rls_especialidades, fix_rls_final, fix_rls_profiles_login,
--            fix_crm_rls, fix_insert_policy, rls_completo, rls_geral,
--            rls_policies, complete_rls_solution, disable_profiles_rls,
--            allow_update_clinicas.
-- Esses 15 arquivos eram remendos sobrepostos. Este é o modelo único.
--
-- Multi-tenant: TODA tabela de domínio carrega clinica_id e usa a mesma policy.
-- A função current_clinica_id() é SECURITY DEFINER para quebrar a recursão
-- clássica de "policy de profiles que consulta profiles".
-- ============================================================================

begin;

-- ---------------------------------------------------------------- extensões
create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";   -- necessário p/ EXCLUDE em 0003

-- ---------------------------------------------------------------- helpers
-- Tenant do usuário logado. SECURITY DEFINER: roda como owner, então NÃO
-- dispara as policies de profiles → sem recursão infinita.
create or replace function public.current_clinica_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinica_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

revoke all on function public.current_clinica_id() from public;
revoke all on function public.current_role()       from public;
revoke all on function public.is_admin()           from public;
grant execute on function public.current_clinica_id() to authenticated;
grant execute on function public.current_role()       to authenticated;
grant execute on function public.is_admin()           to authenticated;

-- updated_at automático, reaproveitado por todas as tabelas
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Aplica o padrão de isolamento por tenant numa tabela.
-- Uso: select public.apply_tenant_rls('pacientes');
create or replace function public.apply_tenant_rls(p_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_tenant', p_table);
  execute format($f$
    create policy %I on public.%I
      for all
      to authenticated
      using (clinica_id = public.current_clinica_id())
      with check (clinica_id = public.current_clinica_id())
  $f$, p_table || '_tenant', p_table);

  execute format('drop trigger if exists %I on public.%I', 'trg_' || p_table || '_touch', p_table);
  execute format(
    'create trigger %I before update on public.%I
       for each row execute function public.touch_updated_at()',
    'trg_' || p_table || '_touch', p_table
  );
end;
$$;

-- ============================================================================
-- RLS das tabelas JÁ existentes — reescrito do zero
-- ============================================================================

-- ---------------------------------------------------------------- clinicas
alter table public.clinicas enable row level security;

drop policy if exists clinicas_select on public.clinicas;
drop policy if exists clinicas_update on public.clinicas;
drop policy if exists clinicas_insert_anon on public.clinicas;

-- membro enxerga a própria clínica
create policy clinicas_select on public.clinicas
  for select to authenticated
  using (id = public.current_clinica_id());

-- só admin altera dados da clínica
create policy clinicas_update on public.clinicas
  for update to authenticated
  using (id = public.current_clinica_id() and public.is_admin())
  with check (id = public.current_clinica_id() and public.is_admin());

-- cadastro público de clínica (fluxo de signup, antes de existir profile)
create policy clinicas_insert_signup on public.clinicas
  for insert to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------- profiles
-- Aqui mora o bug histórico: policy de profiles que faz subselect em profiles
-- entra em recursão. Resolvido usando current_clinica_id() (SECURITY DEFINER).
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_team on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_admin_manage on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;

-- sempre pode ler a si mesmo (necessário no login, antes de ter tenant)
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- e os colegas da mesma clínica
create policy profiles_select_team on public.profiles
  for select to authenticated
  using (clinica_id = public.current_clinica_id());

-- edita o próprio cadastro, sem poder trocar de clínica nem se promover.
-- Usa as funções SECURITY DEFINER de propósito: subselect direto em profiles
-- dentro de uma policy de profiles reativa as policies e volta a recursar.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and clinica_id is not distinct from public.current_clinica_id()
    and role       is not distinct from public.current_role()
  );

-- admin gerencia a equipe da própria clínica
create policy profiles_admin_manage on public.profiles
  for all to authenticated
  using (clinica_id = public.current_clinica_id() and public.is_admin())
  with check (clinica_id = public.current_clinica_id() and public.is_admin());

-- criação do próprio profile logo após o signup
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- especialidades
-- Catálogo global (leitura livre p/ autenticado), escrita só de admin.
alter table public.especialidades enable row level security;

drop policy if exists especialidades_read on public.especialidades;
drop policy if exists especialidades_write on public.especialidades;

create policy especialidades_read on public.especialidades
  for select to authenticated, anon
  using (true);

create policy especialidades_write on public.especialidades
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------- tabelas com clinica_id
do $$
declare t text;
begin
  foreach t in array array[
    'enderecos_clinica',
    'clinica_especialidades',
    'leads',
    'pipeline_stages',
    'assinaturas',
    'configuracoes_pagamento',
    'whatsapp_instances'
    -- whatsapp_chats / whatsapp_messages: sem clinica_id direto, tratadas abaixo
  ]
  loop
    if to_regclass('public.' || t) is not null then
      -- garante a coluna updated_at antes de plugar o trigger
      execute format(
        'alter table public.%I add column if not exists updated_at timestamptz default now()', t
      );
      perform public.apply_tenant_rls(t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- whatsapp (tenant indireto)
-- chats e messages não têm clinica_id: o tenant vem pela instância.
-- Cadeia: whatsapp_messages → chat_id → whatsapp_chats → instance_id → whatsapp_instances.clinica_id
do $$ begin
  if to_regclass('public.whatsapp_chats') is not null then
    alter table public.whatsapp_chats enable row level security;
    drop policy if exists whatsapp_chats_tenant on public.whatsapp_chats;
    create policy whatsapp_chats_tenant on public.whatsapp_chats
      for all to authenticated
      using (exists (
        select 1 from public.whatsapp_instances i
         where i.id = whatsapp_chats.instance_id
           and i.clinica_id = public.current_clinica_id()))
      with check (exists (
        select 1 from public.whatsapp_instances i
         where i.id = whatsapp_chats.instance_id
           and i.clinica_id = public.current_clinica_id()));
  end if;

  if to_regclass('public.whatsapp_messages') is not null then
    alter table public.whatsapp_messages enable row level security;
    drop policy if exists whatsapp_messages_tenant on public.whatsapp_messages;
    create policy whatsapp_messages_tenant on public.whatsapp_messages
      for all to authenticated
      using (exists (
        select 1 from public.whatsapp_chats c
          join public.whatsapp_instances i on i.id = c.instance_id
         where c.id = whatsapp_messages.chat_id
           and i.clinica_id = public.current_clinica_id()))
      with check (exists (
        select 1 from public.whatsapp_chats c
          join public.whatsapp_instances i on i.id = c.instance_id
         where c.id = whatsapp_messages.chat_id
           and i.clinica_id = public.current_clinica_id()));
  end if;
end $$;

commit;

-- ============================================================================
-- Verificação pós-migration — nenhuma tabela pública pode ficar sem RLS
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and rowsecurity = false;
-- ============================================================================
