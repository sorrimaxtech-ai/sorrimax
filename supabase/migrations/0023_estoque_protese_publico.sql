-- ============================================================================
-- VITTALHUB · 0023 · Estoque, Prótese, Página Pública e Perfis de Permissão
-- ----------------------------------------------------------------------------
-- 4 blocos:
--   1. ESTOQUE     — produtos + movimentos (entrada/saida/ajuste/perda) e a
--                    view vw_estoque_atual com saldo calculado + alerta de
--                    estoque baixo. Saldo NUNCA é coluna: é derivado dos
--                    movimentos (fonte única da verdade, auditável).
--   2. PRÓTESE     — fluxo laboratorial da peça protética por etapa.
--   3. PÁG. PÚBLICA— perfil público da clínica (slug) + tokens de booking.
--   4. PERMISSÕES  — perfis de permissão por clínica com seed padrão.
--
-- ⚠️ Toda tabela: clinica_id NOT NULL → clinicas ON DELETE CASCADE e RLS via
--    public.apply_tenant_rls(). View com security_invoker=on (senão a view
--    roda como OWNER e ignora o RLS das bases — vazaria entre clínicas).
-- ============================================================================

begin;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.tipo_movimento_estoque as enum ('entrada', 'saida', 'ajuste', 'perda');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.etapa_protese as enum
    ('pre_laboratorio', 'envio', 'laboratorio', 'prova', 'agenda', 'realizado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_booking_token as enum ('cadastro', 'agendamento');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 1. ESTOQUE
-- ============================================================================

-- ---------------------------------------------------------------- produtos
create table if not exists public.produtos (
  id             uuid primary key default gen_random_uuid(),
  clinica_id     uuid not null references public.clinicas(id) on delete cascade,
  nome           text not null,
  sku            text,
  categoria      text,
  unidade        text not null default 'un',
  estoque_minimo numeric(12,3) not null default 0 check (estoque_minimo >= 0),
  custo_medio    numeric(12,2) check (custo_medio >= 0),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (clinica_id, nome)
);

create index if not exists idx_produtos_clinica on public.produtos(clinica_id) where ativo;
create unique index if not exists uq_produtos_sku
  on public.produtos(clinica_id, sku) where sku is not null;

-- ---------------------------------------------------------------- movimentos
-- 'ajuste' aceita quantidade negativa OU positiva (delta de inventário);
-- os demais tipos exigem quantidade > 0 — o sinal vem do TIPO, não do número.
create table if not exists public.estoque_movimentos (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  produto_id      uuid not null references public.produtos(id) on delete cascade,
  tipo            public.tipo_movimento_estoque not null,
  quantidade      numeric(12,3) not null,
  custo_unitario  numeric(12,2) check (custo_unitario >= 0),
  motivo          text,
  consulta_id     uuid references public.consultas(id) on delete set null,
  profissional_id uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  check (
    (tipo = 'ajuste' and quantidade <> 0)
    or (tipo <> 'ajuste' and quantidade > 0)
  )
);

create index if not exists idx_estmov_clinica  on public.estoque_movimentos(clinica_id);
create index if not exists idx_estmov_produto  on public.estoque_movimentos(produto_id, created_at desc);
create index if not exists idx_estmov_consulta on public.estoque_movimentos(consulta_id) where consulta_id is not null;
create index if not exists idx_estmov_prof     on public.estoque_movimentos(profissional_id) where profissional_id is not null;
create index if not exists idx_estmov_created_by on public.estoque_movimentos(created_by) where created_by is not null;

-- ---------------------------------------------------------------- view saldo
-- security_invoker=on OBRIGATÓRIO: a view herda o RLS de produtos e
-- estoque_movimentos do usuário logado — sem isso vaza entre clínicas.
create or replace view public.vw_estoque_atual
with (security_invoker = on) as
select
  p.id            as produto_id,
  p.clinica_id,
  p.nome,
  p.sku,
  p.categoria,
  p.unidade,
  p.estoque_minimo,
  p.custo_medio,
  p.ativo,
  coalesce(m.saldo, 0)                          as saldo,
  coalesce(m.ultima_movimentacao, null)         as ultima_movimentacao,
  (coalesce(m.saldo, 0) < p.estoque_minimo)     as alerta_estoque_baixo
from public.produtos p
left join lateral (
  select
    sum(case em.tipo
          when 'entrada' then em.quantidade
          when 'saida'   then -em.quantidade
          when 'perda'   then -em.quantidade
          when 'ajuste'  then em.quantidade   -- delta assinado
        end)              as saldo,
    max(em.created_at)    as ultima_movimentacao
  from public.estoque_movimentos em
  where em.produto_id = p.id
) m on true;

-- ============================================================================
-- 2. PRÓTESE — fluxo laboratorial
-- ============================================================================
create table if not exists public.protese_servicos (
  id               uuid primary key default gen_random_uuid(),
  clinica_id       uuid not null references public.clinicas(id) on delete cascade,
  paciente_id      uuid not null references public.pacientes(id) on delete cascade,
  laboratorio      text,
  tipo_peca        text not null,
  dentes           smallint[] not null default '{}',
  cor              text,
  etapa            public.etapa_protese not null default 'pre_laboratorio',
  enviado_em       date,
  previsao_retorno date,
  retornado_em     date,
  valor_custo      numeric(12,2) check (valor_custo >= 0),
  observacoes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (retornado_em is null or enviado_em is null or retornado_em >= enviado_em)
);

create index if not exists idx_protese_clinica  on public.protese_servicos(clinica_id, etapa);
create index if not exists idx_protese_paciente on public.protese_servicos(paciente_id);
create index if not exists idx_protese_retorno  on public.protese_servicos(clinica_id, previsao_retorno)
  where retornado_em is null;

-- ============================================================================
-- 3. PÁGINA PÚBLICA
-- ============================================================================

-- ---------------------------------------------------------------- perfil
-- 1 perfil por clínica. Slug é a URL pública (/c/<slug>) — único GLOBAL.
create table if not exists public.perfil_publico (
  id                 uuid primary key default gen_random_uuid(),
  clinica_id         uuid not null references public.clinicas(id) on delete cascade,
  slug               text not null unique
                     check (slug ~ '^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])?$'),
  bio                text,
  foto_url           text,
  capa_url           text,
  especialidades     text[] not null default '{}',
  aceita_agendamento boolean not null default true,
  publicado          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (clinica_id)
);

-- ---------------------------------------------------------------- tokens
-- Token de uso único enviado ao paciente (link de cadastro/agendamento).
-- Validação/consumo acontece server-side (RPC/Edge Function) — anon NÃO tem
-- SELECT direto aqui.
create table if not exists public.booking_tokens (
  id         uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  token      text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  tipo       public.tipo_booking_token not null default 'agendamento',
  expira_em  timestamptz not null default now() + interval '7 days',
  usado_em   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expira_em > created_at)
);

create index if not exists idx_booking_tokens_clinica on public.booking_tokens(clinica_id);
create index if not exists idx_booking_tokens_validos on public.booking_tokens(token)
  where usado_em is null;

-- ============================================================================
-- 4. PERFIS DE PERMISSÃO
-- ----------------------------------------------------------------------------
-- permissoes = jsonb { "<modulo>": { "ver": bool, "editar": bool } }.
-- Módulos: agenda, pacientes, clinico, orcamentos, crm, financeiro, estoque,
--          protese, whatsapp, relatorios, configuracoes, equipe.
-- sistema=true → perfil padrão semeado (não deletável pela UI).
-- ============================================================================
create table if not exists public.perfis_permissao (
  id         uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome       text not null,
  permissoes jsonb not null default '{}'::jsonb,
  sistema    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, nome)
);

create index if not exists idx_perfis_permissao_clinica on public.perfis_permissao(clinica_id);

-- ---------------------------------------------------------------- seed
-- Idempotente (ON CONFLICT DO NOTHING). SECURITY DEFINER com search_path fixo;
-- EXECUTE revogado de anon logo abaixo (invariante da auditoria_saude).
create or replace function public.seed_perfis_permissao(p_clinica uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Administrador: tudo true
  insert into public.perfis_permissao (clinica_id, nome, permissoes, sistema)
  values (p_clinica, 'Administrador', jsonb_build_object(
    'agenda',        jsonb_build_object('ver', true,  'editar', true),
    'pacientes',     jsonb_build_object('ver', true,  'editar', true),
    'clinico',       jsonb_build_object('ver', true,  'editar', true),
    'orcamentos',    jsonb_build_object('ver', true,  'editar', true),
    'crm',           jsonb_build_object('ver', true,  'editar', true),
    'financeiro',    jsonb_build_object('ver', true,  'editar', true),
    'estoque',       jsonb_build_object('ver', true,  'editar', true),
    'protese',       jsonb_build_object('ver', true,  'editar', true),
    'whatsapp',      jsonb_build_object('ver', true,  'editar', true),
    'relatorios',    jsonb_build_object('ver', true,  'editar', true),
    'configuracoes', jsonb_build_object('ver', true,  'editar', true),
    'equipe',        jsonb_build_object('ver', true,  'editar', true)
  ), true)
  on conflict (clinica_id, nome) do nothing;

  -- Dentista: foco clínico (agenda, pacientes, prontuário, orçamento, prótese)
  insert into public.perfis_permissao (clinica_id, nome, permissoes, sistema)
  values (p_clinica, 'Dentista', jsonb_build_object(
    'agenda',        jsonb_build_object('ver', true,  'editar', true),
    'pacientes',     jsonb_build_object('ver', true,  'editar', true),
    'clinico',       jsonb_build_object('ver', true,  'editar', true),
    'orcamentos',    jsonb_build_object('ver', true,  'editar', true),
    'crm',           jsonb_build_object('ver', false, 'editar', false),
    'financeiro',    jsonb_build_object('ver', false, 'editar', false),
    'estoque',       jsonb_build_object('ver', true,  'editar', false),
    'protese',       jsonb_build_object('ver', true,  'editar', true),
    'whatsapp',      jsonb_build_object('ver', true,  'editar', false),
    'relatorios',    jsonb_build_object('ver', true,  'editar', false),
    'configuracoes', jsonb_build_object('ver', false, 'editar', false),
    'equipe',        jsonb_build_object('ver', false, 'editar', false)
  ), true)
  on conflict (clinica_id, nome) do nothing;

  -- Recepção: agenda + pacientes + financeiro em leitura
  insert into public.perfis_permissao (clinica_id, nome, permissoes, sistema)
  values (p_clinica, 'Recepção', jsonb_build_object(
    'agenda',        jsonb_build_object('ver', true,  'editar', true),
    'pacientes',     jsonb_build_object('ver', true,  'editar', true),
    'clinico',       jsonb_build_object('ver', false, 'editar', false),
    'orcamentos',    jsonb_build_object('ver', true,  'editar', false),
    'crm',           jsonb_build_object('ver', true,  'editar', true),
    'financeiro',    jsonb_build_object('ver', true,  'editar', false),
    'estoque',       jsonb_build_object('ver', false, 'editar', false),
    'protese',       jsonb_build_object('ver', true,  'editar', false),
    'whatsapp',      jsonb_build_object('ver', true,  'editar', true),
    'relatorios',    jsonb_build_object('ver', false, 'editar', false),
    'configuracoes', jsonb_build_object('ver', false, 'editar', false),
    'equipe',        jsonb_build_object('ver', false, 'editar', false)
  ), true)
  on conflict (clinica_id, nome) do nothing;

  -- Auxiliar: leitura
  insert into public.perfis_permissao (clinica_id, nome, permissoes, sistema)
  values (p_clinica, 'Auxiliar', jsonb_build_object(
    'agenda',        jsonb_build_object('ver', true,  'editar', false),
    'pacientes',     jsonb_build_object('ver', true,  'editar', false),
    'clinico',       jsonb_build_object('ver', true,  'editar', false),
    'orcamentos',    jsonb_build_object('ver', true,  'editar', false),
    'crm',           jsonb_build_object('ver', false, 'editar', false),
    'financeiro',    jsonb_build_object('ver', false, 'editar', false),
    'estoque',       jsonb_build_object('ver', true,  'editar', false),
    'protese',       jsonb_build_object('ver', true,  'editar', false),
    'whatsapp',      jsonb_build_object('ver', false, 'editar', false),
    'relatorios',    jsonb_build_object('ver', false, 'editar', false),
    'configuracoes', jsonb_build_object('ver', false, 'editar', false),
    'equipe',        jsonb_build_object('ver', false, 'editar', false)
  ), true)
  on conflict (clinica_id, nome) do nothing;
end;
$$;

revoke all on function public.seed_perfis_permissao(uuid) from public, anon;
grant execute on function public.seed_perfis_permissao(uuid) to authenticated, service_role;

-- Clínica nova ganha os 4 perfis automaticamente (mesmo padrão do
-- seed_convenio_particular do 0005).
create or replace function public.trg_seed_perfis_permissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_perfis_permissao(new.id);
  return new;
end;
$$;
revoke all on function public.trg_seed_perfis_permissao() from public, anon;

drop trigger if exists trg_clinica_perfis_permissao on public.clinicas;
create trigger trg_clinica_perfis_permissao
  after insert on public.clinicas
  for each row execute function public.trg_seed_perfis_permissao();

-- Backfill: clínicas já existentes (fora as de sistema) recebem o seed agora.
select public.seed_perfis_permissao(c.id)
  from public.clinicas c
 where not c.sistema;

-- ============================================================================
-- RLS — isolamento por tenant em TODAS as tabelas novas
-- ============================================================================
select public.apply_tenant_rls('produtos');
select public.apply_tenant_rls('estoque_movimentos');
select public.apply_tenant_rls('protese_servicos');
select public.apply_tenant_rls('perfil_publico');
select public.apply_tenant_rls('booking_tokens');
select public.apply_tenant_rls('perfis_permissao');

-- Página pública: anon/authenticated podem LER apenas perfis PUBLICADOS
-- (qual restrito a publicado=true — não é USING(true), passa na auditoria).
-- Escrita continua exclusiva do tenant via policy do apply_tenant_rls.
drop policy if exists perfil_publico_leitura_publica on public.perfil_publico;
create policy perfil_publico_leitura_publica on public.perfil_publico
  for select
  to anon, authenticated
  using (publicado = true);

-- ============================================================================
-- FIX pré-existente: auditoria_saude se auto-flagrava no check GUARD-NULL
-- ----------------------------------------------------------------------------
-- O regex `<>\s*(public\.)?current_clinica_id\(\)` do check casa com o PRÓPRIO
-- corpo do auditor (o padrão está literal no prosrc). O 0019 já reconheceu o
-- falso positivo e criou auditoria_guard_null com `not like 'auditoria%'`, mas
-- não corrigiu o auditor em si — desde então auditoria_saude reporta 1 FALHA
-- eterna. Recria com a MESMA exclusão do 0019. Corpo idêntico ao 0018
-- (md5 conferido contra o implantado) fora essa única linha.
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

  return query select 'FUNÇÃO-ANON'::text, p.proname::text, 'FALHA'::text,
    'SECURITY DEFINER executável por anon — fura RLS sem login'::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('current_clinica_id','current_role','is_admin');

  -- guard NULL-unsafe — exclui 'auditoria%' (o regex está literal no corpo
  -- destas funções; mesma exclusão que o 0019 aplicou em auditoria_guard_null)
  return query select 'GUARD-NULL'::text, p.proname::text, 'FALHA'::text,
    'compara tenant com <> (NULL-unsafe): use `is distinct from`'::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and p.proname not like 'auditoria%'
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

  return query select 'SEGREDO'::text, (table_name||'.'||column_name)::text, 'FALHA'::text,
    'coluna de segredo com SELECT concedido a authenticated/anon'::text
    from information_schema.column_privileges
   where table_schema='public' and privilege_type='SELECT'
     and grantee in ('anon','authenticated')
     and column_name in ('api_token','apikey','webhook_secret','service_key','secret','password','senha');

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

commit;
