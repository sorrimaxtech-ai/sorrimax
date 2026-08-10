-- ============================================================================
-- 0044 — Painel da Plataforma (o lado de dentro do SaaS)
-- ----------------------------------------------------------------------------
-- Até aqui o Sorrimax só tinha administração DA CLÍNICA (role 'admin' em
-- profiles). Quem é dono do SaaS não tinha lugar nenhum: para saber quantas
-- clínicas existem, quanto entra por mês ou para dar 3 meses de teste para um
-- parceiro, só abrindo o SQL Editor do Supabase na mão. Esta migration cria a
-- camada que faltava.
--
-- DECISÃO CENTRAL — o painel NÃO enxerga dado de paciente.
-- O caminho preguiçoso seria dar cross-tenant a um super-usuário (`or
-- is_plataforma()` em toda policy). Isso abriria prontuário, anamnese, alergia
-- e conversa de WhatsApp de todas as clínicas para uma única conta — dado de
-- saúde, com a ANPD do outro lado. Aqui o acesso é o inverso: RPC agregadora
-- SECURITY DEFINER, uma por pergunta, devolvendo CONTAGEM e METADADO DE CONTA.
-- O painel sabe que a clínica X tem 412 pacientes; não sabe o nome de nenhum.
-- Nenhuma policy de tenant é afrouxada por esta migration.
--
-- O que entra:
--   1. plataforma_membros        quem é do time do SaaS (dono / suporte)
--   2. condição comercial        valor negociado, ciclo, trial estendido,
--                                trial infinito, cortesia, bloqueio
--   3. plataforma_leads          potenciais clientes (o funil ANTES da clínica)
--   4. plataforma_convites       criar clínica pelo painel e o dono cair nela
--   5. plataforma_auditoria      quem fez o quê do lado de dentro
--   6. RPCs de métrica           visão geral, série mensal, localidade,
--                                segmentação, lista e detalhe de clínica
--   7. RPCs de ação              criar clínica, plano/valor, trial, cortesia,
--                                bloqueio, leads, membros
--   8. bloqueio real             policy RESTRICTIVE derivada, com fail-OPEN
--
-- Rodar `select * from auditoria_saude();` depois. Esperado: só GERAL / OK.
-- ============================================================================

begin;

-- ============================================================================
-- 1. QUEM É DO TIME DA PLATAFORMA
-- ----------------------------------------------------------------------------
-- Tabela separada, e não `profiles.role = 'dono'`, por dois motivos: o CHECK de
-- profiles.role só aceita admin/professional/receptionist, e esse campo é lido
-- por current_role()/is_admin() dentro das policies de TENANT — inventar valor
-- novo ali mexe no caminho mais quente da segurança do sistema. Aditivo é mais
-- seguro: quem não está nesta tabela não vira ninguém.
-- ============================================================================

do $$ begin
  create type public.plataforma_papel as enum ('dono', 'suporte');
exception when duplicate_object then null; end $$;

create table if not exists public.plataforma_membros (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nome       text,
  papel      public.plataforma_papel not null default 'suporte',
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plataforma_membros is
  'Time do SaaS. dono = mexe em dinheiro e em quem entra aqui; suporte = lê tudo e mexe em trial/lead.';

-- SECURITY DEFINER pelo mesmo motivo de current_clinica_id(): a policy da
-- própria tabela chama esta função. INVOKER entraria em recursão infinita.
create or replace function public.is_plataforma()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.plataforma_membros m
     where m.user_id = auth.uid() and m.ativo
  )
$$;

create or replace function public.is_plataforma_dono()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.plataforma_membros m
     where m.user_id = auth.uid() and m.ativo and m.papel = 'dono'
  )
$$;

alter table public.plataforma_membros enable row level security;

drop policy if exists plataforma_membros_leitura on public.plataforma_membros;
create policy plataforma_membros_leitura on public.plataforma_membros
  for select to authenticated
  using (public.is_plataforma());

-- só o dono promove/rebaixa gente — suporte não amplia o próprio acesso
drop policy if exists plataforma_membros_dono on public.plataforma_membros;
create policy plataforma_membros_dono on public.plataforma_membros
  for all to authenticated
  using (public.is_plataforma_dono())
  with check (public.is_plataforma_dono());

drop trigger if exists trg_plataforma_membros_touch on public.plataforma_membros;
create trigger trg_plataforma_membros_touch before update on public.plataforma_membros
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- semeadura
-- Sem isto ninguém entra no painel e não há como se promover pela UI (ovo e
-- galinha). Troque/acrescente e-mails aqui; quem não existir em auth.users é
-- ignorado com aviso, não quebra a migration.
do $$
declare
  donos text[] := array['guilhermevvui765@gmail.com'];
  e text;
  uid uuid;
begin
  foreach e in array donos loop
    select id into uid from auth.users where lower(email) = lower(e) limit 1;
    if uid is null then
      raise notice '[0044] dono % ainda não existe em auth.users — cadastre-se e rode: insert into plataforma_membros(user_id,email,papel) select id, email, ''dono'' from auth.users where lower(email)=lower(%L);', e, e;
    else
      insert into public.plataforma_membros (user_id, email, nome, papel)
      values (uid, e, coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = uid), e), 'dono')
      on conflict (user_id) do update set papel = 'dono', ativo = true;
      raise notice '[0044] dono da plataforma: %', e;
    end if;
  end loop;
end $$;

-- ============================================================================
-- 2. CONDIÇÃO COMERCIAL DA CLÍNICA
-- ----------------------------------------------------------------------------
-- `asaas_assinaturas` (0027) já guardava plano, valor, status e trial_termina_em.
-- Faltava tudo que um contrato real tem: ciclo (anual não é MRR, é MRR/12),
-- cortesia (sócio, parceiro, clínica-piloto — usa e não paga, e NÃO pode entrar
-- no MRR senão a métrica mente), trial sem prazo, e bloqueio manual.
-- ============================================================================

do $$ begin
  create type public.plataforma_ciclo as enum ('mensal', 'trimestral', 'semestral', 'anual');
exception when duplicate_object then null; end $$;

alter table public.asaas_assinaturas
  add column if not exists ciclo           public.plataforma_ciclo not null default 'mensal',
  add column if not exists trial_infinito  boolean not null default false,
  add column if not exists cortesia        boolean not null default false,
  add column if not exists bloqueada       boolean not null default false,
  add column if not exists bloqueio_motivo text,
  add column if not exists observacao      text,
  add column if not exists origem          text,
  add column if not exists responsavel     text;

comment on column public.asaas_assinaturas.ciclo is
  'Periodicidade do que está em `valor`. MRR normaliza dividindo pelos meses do ciclo.';
comment on column public.asaas_assinaturas.trial_infinito is
  'Teste grátis sem data de fim. Ignora trial_termina_em; nunca vence.';
comment on column public.asaas_assinaturas.cortesia is
  'Usa de graça por decisão comercial. Fica FORA do MRR — cortesia contada como receita é métrica mentindo.';
comment on column public.asaas_assinaturas.bloqueada is
  'Trava o uso do sistema pela clínica. Manual: NADA bloqueia sozinho por trial vencido.';

create index if not exists idx_asaas_assinaturas_status  on public.asaas_assinaturas (status);
create index if not exists idx_asaas_assinaturas_trial   on public.asaas_assinaturas (trial_termina_em) where trial_infinito = false;

-- Toda clínica precisa da linha de assinatura, senão ela some das métricas e
-- não tem onde gravar condição comercial. O 0027 semeou o passado; isto cobre
-- o futuro. DEFINER porque trigger que faz INSERT roda como INVOKER e bate na
-- RLS no meio do onboarding (é o check TRIGGER da auditoria_saude).
create or replace function public.plataforma_semear_assinatura()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.asaas_assinaturas (clinica_id)
  values (new.id)
  on conflict (clinica_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_clinica_semeia_assinatura on public.clinicas;
create trigger trg_clinica_semeia_assinatura after insert on public.clinicas
  for each row execute function public.plataforma_semear_assinatura();

insert into public.asaas_assinaturas (clinica_id)
  select id from public.clinicas on conflict (clinica_id) do nothing;

-- ============================================================================
-- 3. LEADS DA PLATAFORMA (potenciais clientes)
-- ----------------------------------------------------------------------------
-- Não confundir com `leads_sistema` (paciente que preencheu formulário de
-- clínica, com CPF e alergia) nem com `leads` (funil de captação DE paciente,
-- dentro do tenant). Este é o funil do SaaS: clínica que pediu demonstração.
--
-- A coluna da clínica convertida chama `convertida_clinica_id` de propósito.
-- Com o nome `clinica_id`, a auditoria_saude() acusaria "tem clinica_id e
-- nenhuma policy usa current_clinica_id()" — e estaria certa em acusar: esta
-- tabela é da plataforma, não de tenant nenhum. O nome diz isso.
-- ============================================================================

do $$ begin
  create type public.plataforma_lead_status as enum
    ('novo', 'contatado', 'qualificado', 'convertido', 'perdido');
exception when duplicate_object then null; end $$;

create table if not exists public.plataforma_leads (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null,
  email                text,
  telefone             text,
  clinica_nome         text,
  cidade               text,
  estado               text,
  cadeiras             int,
  profissionais        int,
  plano_interesse      public.plano_saas,
  origem               text,          -- orgânico, indicação, anúncio, outbound…
  campanha             text,          -- utm_campaign
  mensagem             text,
  status               public.plataforma_lead_status not null default 'novo',
  observacao           text,
  convertida_clinica_id uuid references public.clinicas(id) on delete set null,
  convertido_em        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint plataforma_lead_nome_valido check (length(btrim(nome)) between 1 and 120),
  constraint plataforma_lead_uf check (estado is null or estado ~ '^[A-Z]{2}$')
);

create index if not exists idx_plataforma_leads_status   on public.plataforma_leads (status, created_at desc);
create index if not exists idx_plataforma_leads_clinica  on public.plataforma_leads (convertida_clinica_id);
create index if not exists idx_plataforma_leads_criado   on public.plataforma_leads (created_at desc);

alter table public.plataforma_leads enable row level security;

-- formulário público do site: grava e nunca lê (mesmo padrão de leads_sistema)
drop policy if exists plataforma_leads_insert_publico on public.plataforma_leads;
create policy plataforma_leads_insert_publico on public.plataforma_leads
  for insert to anon, authenticated with check (true);

drop policy if exists plataforma_leads_time on public.plataforma_leads;
create policy plataforma_leads_time on public.plataforma_leads
  for all to authenticated
  using (public.is_plataforma())
  with check (public.is_plataforma());

drop trigger if exists trg_plataforma_leads_touch on public.plataforma_leads;
create trigger trg_plataforma_leads_touch before update on public.plataforma_leads
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. CONVITES — criar a clínica antes do dono existir
-- ----------------------------------------------------------------------------
-- Quando o painel cria uma clínica (venda fechada no telefone), o dono ainda
-- não tem conta. Em vez de inventar usuário em auth.users na marra, deixamos um
-- convite pelo e-mail: no signup, o handle_new_user encontra o convite e já
-- amarra o profile na clínica certa, com o papel certo. Sem convite pendente,
-- nada muda no fluxo normal.
-- ============================================================================

-- `destino_clinica_id`, e não `clinica_id`, pelo mesmo motivo de plataforma_leads:
-- com o nome canônico a auditoria_saude() exigiria (com razão) policy de tenant
-- numa tabela que é da plataforma, não de clínica nenhuma.
create table if not exists public.plataforma_convites (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  destino_clinica_id uuid not null references public.clinicas(id) on delete cascade,
  papel              text not null default 'admin' check (papel in ('admin','professional','receptionist')),
  token              text not null default encode(gen_random_bytes(16), 'hex'),
  expira_em          date not null default (current_date + 90),
  usado_em           timestamptz,
  usado_por          uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint plataforma_convites_token_unico unique (token)
);

create unique index if not exists plataforma_convites_email_pendente
  on public.plataforma_convites (lower(email)) where usado_em is null;
create index if not exists idx_plataforma_convites_clinica on public.plataforma_convites (destino_clinica_id);
create index if not exists idx_plataforma_convites_usuario on public.plataforma_convites (usado_por);

alter table public.plataforma_convites enable row level security;

drop policy if exists plataforma_convites_time on public.plataforma_convites;
create policy plataforma_convites_time on public.plataforma_convites
  for all to authenticated
  using (public.is_plataforma())
  with check (public.is_plataforma());

-- ---------------------------------------------------------------- handle_new_user
-- Reescrito: mesma responsabilidade de antes (criar o profile no signup) mais o
-- resgate do convite. Ganha search_path fixo, que a versão legada não tinha.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_convite public.plataforma_convites%rowtype;
begin
  select * into v_convite
    from public.plataforma_convites
   where lower(email) = lower(new.email)
     and usado_em is null
     and expira_em >= current_date
   limit 1;

  insert into public.profiles (id, clinica_id, email, full_name, role, status)
  values (
    new.id,
    v_convite.destino_clinica_id,              -- NULL quando não há convite
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(v_convite.papel, 'professional'),
    'active'
  )
  on conflict (id) do update
     set clinica_id = coalesce(public.profiles.clinica_id, excluded.clinica_id),
         email      = excluded.email;

  if v_convite.id is not null then
    update public.plataforma_convites
       set usado_em = now(), usado_por = new.id
     where id = v_convite.id;
  end if;

  return new;
end $$;

-- ============================================================================
-- 5. AUDITORIA DA PLATAFORMA
-- ----------------------------------------------------------------------------
-- Toda ação daqui mexe em dinheiro ou em acesso de terceiro. Sem trilha, um
-- "por que essa clínica está de graça desde março?" não tem resposta.
-- ============================================================================

create table if not exists public.plataforma_auditoria (
  id              uuid primary key default gen_random_uuid(),
  ator_id         uuid references auth.users(id) on delete set null,
  ator_email      text,
  acao            text not null,
  alvo_clinica_id uuid references public.clinicas(id) on delete set null,
  alvo_nome       text,
  antes           jsonb,
  depois          jsonb,
  motivo          text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_plataforma_auditoria_data    on public.plataforma_auditoria (created_at desc);
create index if not exists idx_plataforma_auditoria_clinica on public.plataforma_auditoria (alvo_clinica_id, created_at desc);
create index if not exists idx_plataforma_auditoria_ator    on public.plataforma_auditoria (ator_id);

alter table public.plataforma_auditoria enable row level security;

-- leitura para o time; escrita SÓ pelas funções DEFINER abaixo (sem policy de
-- insert, o RLS nega por padrão — ninguém forja registro pelo cliente)
drop policy if exists plataforma_auditoria_leitura on public.plataforma_auditoria;
create policy plataforma_auditoria_leitura on public.plataforma_auditoria
  for select to authenticated
  using (public.is_plataforma());

create or replace function public.plataforma_registrar(
  p_acao text, p_clinica uuid, p_antes jsonb, p_depois jsonb, p_motivo text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.plataforma_auditoria
    (ator_id, ator_email, acao, alvo_clinica_id, alvo_nome, antes, depois, motivo)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    p_acao,
    p_clinica,
    (select nome_clinica from public.clinicas where id = p_clinica),
    p_antes, p_depois, nullif(btrim(coalesce(p_motivo,'')), '')
  );
end $$;

-- guarda usado por toda RPC de ação
create or replace function public.plataforma_exigir(p_dono boolean default false)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_plataforma() then
    raise exception 'Esta área é do time Sorrimax. Sua conta não tem acesso.';
  end if;
  if p_dono and not public.is_plataforma_dono() then
    raise exception 'Só o responsável pela plataforma pode alterar plano, valor ou acesso.';
  end if;
end $$;

-- ============================================================================
-- 6. BLOQUEIO REAL DE UMA CLÍNICA
-- ----------------------------------------------------------------------------
-- Bloqueio que só esconde botão no front é teatro: a anon key é pública e as
-- queries são chamáveis à mão. Aqui ele é uma policy RESTRICTIVE — restritivas
-- entram com AND em cima das permissivas, então uma só fecha a tabela inteira
-- sem tocar em nenhuma policy de tenant existente.
--
-- Regras de projeto, todas deliberadas:
--   · FAIL-OPEN. Sem linha de assinatura, NULL, qualquer dúvida → liberado. Um
--     bug aqui derrubaria todas as clínicas de uma vez; o custo do erro é
--     assimétrico, então o padrão é deixar passar.
--   · MANUAL. Trial vencido NÃO bloqueia nada sozinho. Quem decide é gente.
--   · A clínica bloqueada continua enxergando `clinicas`, `profiles` e
--     `asaas_assinaturas` — precisa ver o aviso e conseguir pagar. Bloquear a
--     porta de saída do bloqueio seria armadilha.
--   · O time da plataforma passa (`is_plataforma()`) para conseguir dar suporte.
-- ============================================================================

create or replace function public.acesso_liberado()
returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce(
    (select a.bloqueada
       from public.asaas_assinaturas a
      where a.clinica_id = public.current_clinica_id()),
    false)
$$;

do $$
declare
  t text;
  -- ficam de fora: as tabelas por onde a clínica bloqueada lê o aviso e paga,
  -- e as que não são de operação diária.
  isentas text[] := array[
    'clinicas', 'profiles', 'asaas_assinaturas', 'assinaturas',
    'clinica_integracao_asaas', 'asaas_cobrancas', 'leads_sistema',
    'perfis_permissao', 'enderecos_clinica'
  ];
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join pg_tables pt on pt.schemaname = 'public' and pt.tablename = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'clinica_id'
       and not (c.table_name = any (isentas))
     group by c.table_name
  loop
    execute format('drop policy if exists %I on public.%I', t || '_acesso_liberado', t);
    execute format($f$
      create policy %I on public.%I
        as restrictive for all to authenticated
        using (public.acesso_liberado() or public.is_plataforma())
        with check (public.acesso_liberado() or public.is_plataforma())
    $f$, t || '_acesso_liberado', t);
  end loop;
end $$;

-- ============================================================================
-- 7. CONTEXTO DA SESSÃO — o front precisa saber três coisas novas
-- ----------------------------------------------------------------------------
-- (1) sou do time da plataforma? → mostra a porta do painel
-- (2) minha clínica está bloqueada? → mostra o aviso em vez de tela vazia
-- (3) meu teste vence quando (ou nunca)? → o que o painel configurou aparece
--     para o cliente, em vez do "created_at + 7" chutado no front.
-- returns table muda de assinatura, então precisa de drop antes do create.
-- ============================================================================

drop function if exists public.meu_contexto();
create or replace function public.meu_contexto()
returns table(
  user_id uuid, email text, nome text, role text,
  clinica_id uuid, clinica_nome text, clinica_codigo text,
  plataforma boolean, plataforma_papel text,
  plano text, assinatura_status text,
  trial_termina_em date, trial_infinito boolean,
  cortesia boolean, bloqueada boolean, bloqueio_motivo text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.full_name, p.role,
         c.id, c.nome_clinica, c.codigo_clinica,
         public.is_plataforma(),
         (select m.papel::text from public.plataforma_membros m
           where m.user_id = auth.uid() and m.ativo),
         coalesce(a.plano::text, c.plano::text, 'trial'),
         coalesce(a.status::text, c.assinatura_status::text, 'trial'),
         a.trial_termina_em,
         coalesce(a.trial_infinito, false),
         coalesce(a.cortesia, false),
         coalesce(a.bloqueada, false),
         a.bloqueio_motivo
    from public.profiles p
    left join public.clinicas c          on c.id = p.clinica_id
    left join public.asaas_assinaturas a on a.clinica_id = p.clinica_id
   where p.id = auth.uid()
$$;

-- ============================================================================
-- 8. MÉTRICAS — as perguntas que o dono do SaaS faz
-- ----------------------------------------------------------------------------
-- MRR normaliza o ciclo (anual de R$1.970 = R$164,17/mês) e ignora cortesia.
-- "Ativa" no sentido de USO é login nos últimos 30 dias — assinatura paga com
-- ninguém entrando há 45 dias é churn que ainda não avisou.
-- Clínica com `sistema = true` (demo/interna) fica fora de tudo.
-- ============================================================================

create or replace function public.plataforma_meses_ciclo(p public.plataforma_ciclo)
returns numeric
language sql immutable set search_path = public as $$
  select case p when 'mensal' then 1 when 'trimestral' then 3
                when 'semestral' then 6 when 'anual' then 12 else 1 end::numeric
$$;

create or replace function public.plataforma_visao_geral()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  ini_mes date := date_trunc('month', current_date)::date;
  ini_ant date := (date_trunc('month', current_date) - interval '1 month')::date;
begin
  perform public.plataforma_exigir();

  with base as (
    select c.id, c.created_at, c.cidade, c.estado, c.sistema,
           a.plano, a.status, a.valor, a.ciclo, a.cortesia, a.bloqueada,
           a.trial_termina_em, a.trial_infinito
      from public.clinicas c
      left join public.asaas_assinaturas a on a.clinica_id = c.id
     where not c.sistema
  ),
  uso as (
    select p.clinica_id, max(u.last_sign_in_at) as ultimo_acesso, count(*) as usuarios
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.clinica_id is not null
     group by p.clinica_id
  ),
  receita as (
    select
      coalesce(sum(case when status = 'ativa' and not coalesce(cortesia,false) and valor is not null
                        then valor / public.plataforma_meses_ciclo(ciclo) end), 0) as mrr,
      count(*) filter (where status = 'ativa' and not coalesce(cortesia,false)) as pagantes
    from base
  )
  select jsonb_build_object(
    -- ---------------------------------------------------------- contas
    'clinicas_total',      (select count(*) from base),
    'clinicas_pagantes',   (select pagantes from receita),
    'clinicas_trial',      (select count(*) from base where status = 'trial'),
    'clinicas_cortesia',   (select count(*) from base where cortesia),
    'clinicas_atrasadas',  (select count(*) from base where status = 'atrasada'),
    'clinicas_canceladas', (select count(*) from base where status = 'cancelada'),
    'clinicas_bloqueadas', (select count(*) from base where bloqueada),

    -- ---------------------------------------------------------- receita
    'mrr',                 round((select mrr from receita), 2),
    'arr',                 round((select mrr from receita) * 12, 2),
    'ticket_medio',        round(case when (select pagantes from receita) > 0
                                 then (select mrr from receita) / (select pagantes from receita)
                                 else 0 end, 2),
    'receita_potencial',   round((select coalesce(sum(
                              case when status in ('trial','atrasada') and valor is not null
                                   then valor / public.plataforma_meses_ciclo(ciclo) end), 0) from base), 2),

    -- ---------------------------------------------------------- uso real
    'usuarios_total',      (select count(*) from public.profiles p join base b on b.id = p.clinica_id),
    'usuarios_ativos_7d',  (select count(*) from public.profiles p join base b on b.id = p.clinica_id
                              join auth.users u on u.id = p.id
                             where u.last_sign_in_at > now() - interval '7 days'),
    'usuarios_ativos_30d', (select count(*) from public.profiles p join base b on b.id = p.clinica_id
                              join auth.users u on u.id = p.id
                             where u.last_sign_in_at > now() - interval '30 days'),
    'usuarios_nunca_entraram', (select count(*) from public.profiles p join base b on b.id = p.clinica_id
                                  join auth.users u on u.id = p.id
                                 where u.last_sign_in_at is null),
    'clinicas_ativas_30d', (select count(*) from uso us join base b on b.id = us.clinica_id
                             where us.ultimo_acesso > now() - interval '30 days'),
    'clinicas_paradas_14d',(select count(*) from base b left join uso us on us.clinica_id = b.id
                             where coalesce(us.ultimo_acesso, b.created_at) < now() - interval '14 days'),

    -- ---------------------------------------------------------- crescimento
    'novas_mes',           (select count(*) from base where created_at >= ini_mes),
    'novas_mes_anterior',  (select count(*) from base where created_at >= ini_ant and created_at < ini_mes),
    'canceladas_mes',      (select count(*) from base b join public.asaas_assinaturas a on a.clinica_id = b.id
                             where a.status = 'cancelada' and a.updated_at >= ini_mes),
    'conversao_trial_pct', (select case when count(*) > 0
                              then round(100.0 * count(*) filter (where status = 'ativa') / count(*), 1)
                              else 0 end
                             from base where status in ('ativa','cancelada','trial')),

    -- ---------------------------------------------------------- atenção
    'trials_expirando_7d', (select count(*) from base
                             where status = 'trial' and not coalesce(trial_infinito,false)
                               and trial_termina_em between current_date and current_date + 7),
    'trials_vencidos',     (select count(*) from base
                             where status = 'trial' and not coalesce(trial_infinito,false)
                               and trial_termina_em < current_date),

    -- ---------------------------------------------------------- funil (antes da conta)
    'leads_total',         (select count(*) from public.plataforma_leads),
    'leads_novos_mes',     (select count(*) from public.plataforma_leads where created_at >= ini_mes),
    'leads_abertos',       (select count(*) from public.plataforma_leads where status in ('novo','contatado','qualificado')),
    'leads_convertidos',   (select count(*) from public.plataforma_leads where status = 'convertido'),
    'lead_conversao_pct',  (select case when count(*) > 0
                              then round(100.0 * count(*) filter (where status = 'convertido') / count(*), 1)
                              else 0 end from public.plataforma_leads),

    -- ---------------------------------------------------------- volume operado
    -- Contagem pura. Nenhum nome, nenhum dado de paciente sai daqui.
    'pacientes_total',     (select count(*) from public.pacientes p join base b on b.id = p.clinica_id),
    'consultas_30d',       (select count(*) from public.consultas ct join base b on b.id = ct.clinica_id
                             where ct.inicio > now() - interval '30 days'),
    'orcamentos_30d',      (select count(*) from public.orcamentos o join base b on b.id = o.clinica_id
                             where o.created_at > now() - interval '30 days'),
    'cadeiras_total',      (select count(*) from public.cadeiras cd join base b on b.id = cd.clinica_id where cd.ativo),
    'whatsapp_conectados', (select count(distinct i.clinica_id) from public.whatsapp_instances i
                              join base b on b.id = i.clinica_id),
    'atualizado_em',       now()
  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------- lista de contas
create or replace function public.plataforma_clinicas(
  p_busca  text default null,
  p_status text default null,   -- trial | ativa | atrasada | cancelada | bloqueada | cortesia
  p_plano  text default null,
  p_uf     text default null,
  p_ordem  text default 'recentes',  -- recentes | mrr | uso | nome | risco
  p_limite int  default 200
)
returns table(
  id uuid, nome text, codigo text, email text, telefone text,
  cidade text, estado text,
  plano text, status text, valor numeric, ciclo text, mrr numeric,
  cortesia boolean, bloqueada boolean, bloqueio_motivo text,
  trial_termina_em date, trial_infinito boolean, dias_trial int,
  usuarios int, pacientes int, consultas_30d int, cadeiras int,
  ultimo_acesso timestamptz, dias_sem_acesso int,
  criada_em timestamptz, observacao text, origem text, responsavel text
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.plataforma_exigir();

  return query
  with uso as (
    select p.clinica_id, count(*)::int as usuarios, max(u.last_sign_in_at) as ultimo
      from public.profiles p join auth.users u on u.id = p.id
     where p.clinica_id is not null group by p.clinica_id
  )
  select c.id, c.nome_clinica, c.codigo_clinica, c.email_clinica, c.telefone,
         c.cidade, c.estado,
         coalesce(a.plano::text, 'trial'),
         coalesce(a.status::text, 'trial'),
         a.valor,
         coalesce(a.ciclo::text, 'mensal'),
         round(case when a.status = 'ativa' and not coalesce(a.cortesia,false) and a.valor is not null
                    then a.valor / public.plataforma_meses_ciclo(a.ciclo) else 0 end, 2),
         coalesce(a.cortesia, false),
         coalesce(a.bloqueada, false),
         a.bloqueio_motivo,
         a.trial_termina_em,
         coalesce(a.trial_infinito, false),
         case when coalesce(a.trial_infinito,false) then null
              else (a.trial_termina_em - current_date)::int end,
         coalesce(us.usuarios, 0),
         (select count(*)::int from public.pacientes  pa where pa.clinica_id = c.id),
         (select count(*)::int from public.consultas  ct where ct.clinica_id = c.id and ct.inicio > now() - interval '30 days'),
         (select count(*)::int from public.cadeiras   cd where cd.clinica_id = c.id and cd.ativo),
         us.ultimo,
         case when us.ultimo is null then null
              else extract(day from now() - us.ultimo)::int end,
         c.created_at,
         a.observacao, a.origem, a.responsavel
    from public.clinicas c
    left join public.asaas_assinaturas a on a.clinica_id = c.id
    left join uso us on us.clinica_id = c.id
   where not c.sistema
     and (p_busca is null or btrim(p_busca) = '' or
          c.nome_clinica ilike '%'||p_busca||'%' or
          c.codigo_clinica ilike '%'||p_busca||'%' or
          coalesce(c.email_clinica,'') ilike '%'||p_busca||'%' or
          coalesce(c.cidade,'') ilike '%'||p_busca||'%')
     and (p_status is null or p_status = '' or
          (p_status = 'bloqueada' and coalesce(a.bloqueada,false)) or
          (p_status = 'cortesia'  and coalesce(a.cortesia,false)) or
          (p_status not in ('bloqueada','cortesia') and coalesce(a.status::text,'trial') = p_status))
     and (p_plano is null or p_plano = '' or coalesce(a.plano::text,'trial') = p_plano)
     and (p_uf is null or p_uf = '' or c.estado = upper(p_uf))
   order by
     case when p_ordem = 'nome' then c.nome_clinica end asc,
     case when p_ordem = 'mrr'  then coalesce(a.valor,0) / public.plataforma_meses_ciclo(a.ciclo) end desc,
     case when p_ordem = 'uso'  then us.ultimo end desc nulls last,
     case when p_ordem = 'risco' then us.ultimo end asc nulls first,
     case when p_ordem = 'recentes' then c.created_at end desc
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
end $$;

-- ---------------------------------------------------------------- série mensal
create or replace function public.plataforma_serie_mensal(p_meses int default 12)
returns table(mes date, rotulo text, novas int, canceladas int, ativas_acumulado int, mrr numeric, leads int)
language plpgsql stable security definer set search_path = public as $$
declare v_meses int := greatest(1, least(coalesce(p_meses, 12), 36));
begin
  perform public.plataforma_exigir();

  return query
  with meses as (
    select generate_series(
      date_trunc('month', current_date) - ((v_meses - 1) || ' months')::interval,
      date_trunc('month', current_date),
      interval '1 month')::date as m
  )
  select
    ms.m,
    to_char(ms.m, 'TMMon/YY'),
    (select count(*)::int from public.clinicas c
      where not c.sistema and date_trunc('month', c.created_at)::date = ms.m),
    (select count(*)::int from public.asaas_assinaturas a
       join public.clinicas c on c.id = a.clinica_id and not c.sistema
      where a.status = 'cancelada' and date_trunc('month', a.updated_at)::date = ms.m),
    (select count(*)::int from public.clinicas c
      where not c.sistema and date_trunc('month', c.created_at)::date <= ms.m),
    -- MRR é uma foto do agora: o banco não guarda histórico de valor. Só o mês
    -- corrente é real; os anteriores repetem a foto. Melhor assumir do que
    -- inventar série falsa — o gráfico rotula isso.
    (select round(coalesce(sum(case when a.status = 'ativa' and not coalesce(a.cortesia,false) and a.valor is not null
              then a.valor / public.plataforma_meses_ciclo(a.ciclo) end), 0), 2)
       from public.asaas_assinaturas a
       join public.clinicas c on c.id = a.clinica_id and not c.sistema
      where date_trunc('month', c.created_at)::date <= ms.m),
    (select count(*)::int from public.plataforma_leads l
      where date_trunc('month', l.created_at)::date = ms.m)
  from meses ms
  order by ms.m;
end $$;

-- ---------------------------------------------------------------- onde elas estão
create or replace function public.plataforma_localidades()
returns table(estado text, cidade text, clinicas int, pagantes int, mrr numeric, usuarios int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.plataforma_exigir();

  return query
  with base as (
    select c.id,
           coalesce(c.estado, '—')                        as uf,
           coalesce(nullif(btrim(c.cidade), ''), '—')     as cid,
           a.status, a.valor, a.ciclo, a.cortesia
      from public.clinicas c
      left join public.asaas_assinaturas a on a.clinica_id = c.id
     where not c.sistema
  ),
  -- contagem de usuários agregada ANTES do group by. Como subquery correlacionada
  -- dentro do select agrupado, `c.estado` não está no grupo e o Postgres recusa.
  equipe as (
    select p.clinica_id, count(*)::int as n
      from public.profiles p
     where p.clinica_id is not null
     group by p.clinica_id
  )
  select b.uf, b.cid,
         count(*)::int,
         count(*) filter (where b.status = 'ativa' and not coalesce(b.cortesia,false))::int,
         round(coalesce(sum(case when b.status = 'ativa' and not coalesce(b.cortesia,false) and b.valor is not null
                  then b.valor / public.plataforma_meses_ciclo(b.ciclo) end), 0), 2),
         coalesce(sum(e.n), 0)::int
    from base b
    left join equipe e on e.clinica_id = b.id
   group by b.uf, b.cid
   order by 3 desc, 1, 2;
end $$;

-- ---------------------------------------------------------------- quem são elas
-- Explode o jsonb que a Clara coleta no onboarding (0035). Serve para saber com
-- quem estamos falando: perfil de quem cadastrou, tamanho, dor declarada.
create or replace function public.plataforma_segmentacao()
returns table(pergunta text, resposta text, clinicas int, pct numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_total int;
begin
  perform public.plataforma_exigir();

  select count(*) into v_total from public.clinicas
   where not sistema and segmentacao is not null and segmentacao <> '{}'::jsonb;

  return query
  with pares as (
    select s.key as pergunta, s.value as valor
      from public.clinicas c, jsonb_each(c.segmentacao) s
     where not c.sistema and c.segmentacao <> '{}'::jsonb
  ),
  -- A resposta pode ser texto ("dentista") ou lista ("agenda","cobrança"). O
  -- CASE só normaliza para array — a explosão fica no LATERAL, porque função
  -- que retorna conjunto dentro de CASE o Postgres recusa.
  respostas as (
    select p.pergunta, x.resposta
      from pares p
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(p.valor) = 'array' then p.valor
             else jsonb_build_array(p.valor) end
      ) as x(resposta)
  )
  select r.pergunta,
         coalesce(nullif(btrim(r.resposta), ''), '—'),
         count(*)::int,
         case when v_total > 0 then round(100.0 * count(*) / v_total, 1) else 0 end
    from respostas r
   group by 1, 2
   order by 1, 3 desc;
end $$;

-- ---------------------------------------------------------------- ficha da conta
create or replace function public.plataforma_clinica_detalhe(p_clinica uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.plataforma_exigir();

  select jsonb_build_object(
    'clinica', jsonb_build_object(
      'id', c.id, 'nome', c.nome_clinica, 'codigo', c.codigo_clinica,
      'email', c.email_clinica, 'telefone', c.telefone, 'cnpj', c.cnpj,
      'cidade', c.cidade, 'estado', c.estado, 'criada_em', c.created_at,
      'segmentacao', c.segmentacao
    ),
    'assinatura', jsonb_build_object(
      'plano', coalesce(a.plano::text,'trial'), 'status', coalesce(a.status::text,'trial'),
      'valor', a.valor, 'ciclo', coalesce(a.ciclo::text,'mensal'),
      'mrr', round(case when a.status='ativa' and not coalesce(a.cortesia,false) and a.valor is not null
                        then a.valor / public.plataforma_meses_ciclo(a.ciclo) else 0 end, 2),
      'trial_termina_em', a.trial_termina_em, 'trial_infinito', coalesce(a.trial_infinito,false),
      'cortesia', coalesce(a.cortesia,false), 'bloqueada', coalesce(a.bloqueada,false),
      'bloqueio_motivo', a.bloqueio_motivo, 'proximo_vencimento', a.proximo_vencimento,
      'observacao', a.observacao, 'origem', a.origem, 'responsavel', a.responsavel
    ),
    -- equipe: nome/e-mail/papel/último acesso. Dado de conta, não de paciente.
    'equipe', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', p.full_name, 'email', p.email, 'papel', p.role,
               'status', p.status, 'ultimo_acesso', u.last_sign_in_at)
             order by u.last_sign_in_at desc nulls last)
        from public.profiles p join auth.users u on u.id = p.id
       where p.clinica_id = c.id), '[]'::jsonb),
    'uso', jsonb_build_object(
      'pacientes',    (select count(*) from public.pacientes  where clinica_id = c.id),
      'consultas',    (select count(*) from public.consultas  where clinica_id = c.id),
      'consultas_30d',(select count(*) from public.consultas  where clinica_id = c.id and inicio > now() - interval '30 days'),
      'orcamentos',   (select count(*) from public.orcamentos where clinica_id = c.id),
      'cadeiras',     (select count(*) from public.cadeiras   where clinica_id = c.id and ativo),
      'profissionais',(select count(*) from public.profiles   where clinica_id = c.id and status = 'active')
    ),
    'integracoes', jsonb_build_object(
      'whatsapp',   (select count(*) from public.whatsapp_instances where clinica_id = c.id),
      'asaas',      exists (select 1 from public.clinica_integracao_asaas where clinica_id = c.id and conectado)
    ),
    'historico', coalesce((
      select jsonb_agg(jsonb_build_object(
               'acao', h.acao, 'quem', h.ator_email, 'motivo', h.motivo, 'quando', h.created_at)
             order by h.created_at desc)
        from (select * from public.plataforma_auditoria
               where alvo_clinica_id = c.id order by created_at desc limit 30) h), '[]'::jsonb)
  ) into v
  from public.clinicas c
  left join public.asaas_assinaturas a on a.clinica_id = c.id
  where c.id = p_clinica;

  if v is null then
    raise exception 'Clínica não encontrada.';
  end if;
  return v;
end $$;

-- ============================================================================
-- 9. AÇÕES DO PAINEL
-- ============================================================================

-- ---------------------------------------------------------------- criar clínica
-- Fecha venda no telefone e a conta já nasce com a condição combinada: preço
-- que a gente quiser, ciclo, teste do tamanho que a gente quiser (ou sem fim).
-- O dono ainda não tem login — fica o convite, e no signup ele cai direto aqui.
create or replace function public.plataforma_criar_clinica(
  p_nome           text,
  p_email_dono     text,
  p_telefone       text default null,
  p_cidade         text default null,
  p_estado         text default null,
  p_plano          text default 'trial',
  p_valor          numeric default null,
  p_ciclo          text default 'mensal',
  p_trial_dias     int default 7,
  p_trial_infinito boolean default false,
  p_cortesia       boolean default false,
  p_status         text default 'trial',
  p_origem         text default null,
  p_responsavel    text default null,
  p_observacao     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinica uuid;
  v_codigo  text;
  v_token   text;
  v_uid     uuid;
begin
  perform public.plataforma_exigir(true);

  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'Informe o nome da clínica.';
  end if;
  if coalesce(btrim(p_email_dono), '') = '' then
    raise exception 'Informe o e-mail do responsável — é por ele que a conta é entregue.';
  end if;

  insert into public.clinicas (nome_clinica, email_clinica, telefone, cidade, estado)
  values (btrim(p_nome), lower(btrim(p_email_dono)), p_telefone,
          nullif(btrim(coalesce(p_cidade,'')), ''), nullif(upper(btrim(coalesce(p_estado,''))), ''))
  returning id, codigo_clinica into v_clinica, v_codigo;

  -- o trigger já semeou a linha; aqui grava a condição combinada
  update public.asaas_assinaturas
     set plano            = coalesce(nullif(p_plano,'')::public.plano_saas, 'trial'),
         status           = coalesce(nullif(p_status,'')::public.assinatura_status, 'trial'),
         valor            = p_valor,
         ciclo            = coalesce(nullif(p_ciclo,'')::public.plataforma_ciclo, 'mensal'),
         trial_infinito   = coalesce(p_trial_infinito, false),
         trial_termina_em = case when coalesce(p_trial_infinito, false) then trial_termina_em
                                 else current_date + greatest(coalesce(p_trial_dias, 7), 0) end,
         cortesia         = coalesce(p_cortesia, false),
         origem           = p_origem,
         responsavel      = p_responsavel,
         observacao       = p_observacao,
         updated_at       = now()
   where clinica_id = v_clinica;

  -- se o dono já tem login e está solto (sem clínica), amarra na hora
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email_dono)) limit 1;

  if v_uid is not null and (select clinica_id from public.profiles where id = v_uid) is null then
    update public.profiles
       set clinica_id = v_clinica, role = 'admin', status = 'active'
     where id = v_uid;
  else
    insert into public.plataforma_convites (email, destino_clinica_id, papel)
    values (lower(btrim(p_email_dono)), v_clinica, 'admin')
    on conflict do nothing
    returning token into v_token;
  end if;

  perform public.plataforma_registrar(
    'clinica_criada', v_clinica, null,
    jsonb_build_object('plano', p_plano, 'valor', p_valor, 'ciclo', p_ciclo,
                       'trial_dias', p_trial_dias, 'trial_infinito', p_trial_infinito,
                       'cortesia', p_cortesia, 'email', p_email_dono),
    p_observacao);

  return jsonb_build_object(
    'clinica_id', v_clinica,
    'codigo', v_codigo,
    'convite_token', v_token,
    'vinculado_direto', v_uid is not null and v_token is null
  );
end $$;

-- ---------------------------------------------------------------- plano e preço
create or replace function public.plataforma_definir_plano(
  p_clinica uuid,
  p_plano   text,
  p_valor   numeric default null,
  p_ciclo   text default 'mensal',
  p_status  text default null,
  p_motivo  text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_antes jsonb; v_depois jsonb;
begin
  perform public.plataforma_exigir(true);

  select to_jsonb(a) into v_antes from public.asaas_assinaturas a where a.clinica_id = p_clinica;
  if v_antes is null then raise exception 'Clínica não encontrada.'; end if;

  update public.asaas_assinaturas
     set plano  = coalesce(nullif(p_plano,'')::public.plano_saas, plano),
         valor  = coalesce(p_valor, valor),
         ciclo  = coalesce(nullif(p_ciclo,'')::public.plataforma_ciclo, ciclo),
         status = coalesce(nullif(p_status,'')::public.assinatura_status, status),
         updated_at = now()
   where clinica_id = p_clinica
  returning to_jsonb(asaas_assinaturas) into v_depois;

  -- espelho em `clinicas` (gating rápido, sem join no caminho quente)
  update public.clinicas
     set plano = (v_depois->>'plano')::public.plano_saas,
         assinatura_status = (v_depois->>'status')::public.assinatura_status
   where id = p_clinica;

  perform public.plataforma_registrar('plano_alterado', p_clinica, v_antes, v_depois, p_motivo);
  return v_depois;
end $$;

-- ---------------------------------------------------------------- teste grátis
-- Três formas de dar mais teste, porque as três aparecem na vida real:
--   dias    → "dá mais 30 dias pra ele"
--   até     → "deixa até o fim do congresso, dia 12/09"
--   infinito→ "esse é parceiro, nunca cobra"
create or replace function public.plataforma_estender_trial(
  p_clinica  uuid,
  p_dias     int default null,
  p_ate      date default null,
  p_infinito boolean default null,
  p_motivo   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_antes jsonb; v_depois jsonb;
begin
  perform public.plataforma_exigir();   -- suporte também pode esticar teste

  select to_jsonb(a) into v_antes from public.asaas_assinaturas a where a.clinica_id = p_clinica;
  if v_antes is null then raise exception 'Clínica não encontrada.'; end if;

  if p_dias is null and p_ate is null and p_infinito is null then
    raise exception 'Diga quanto tempo a mais: dias, uma data ou sem prazo.';
  end if;

  update public.asaas_assinaturas
     set trial_infinito = coalesce(p_infinito, trial_infinito),
         -- estende a partir de HOJE quando o teste já venceu; do fim atual
         -- quando ainda está correndo (senão prorrogar encurtaria)
         trial_termina_em = case
           when p_ate is not null then p_ate
           when p_dias is not null then greatest(trial_termina_em, current_date) + p_dias
           else trial_termina_em end,
         status = case when coalesce(p_infinito, trial_infinito) or
                            (p_ate is not null and p_ate >= current_date) or
                            p_dias is not null
                       then 'trial'::public.assinatura_status else status end,
         updated_at = now()
   where clinica_id = p_clinica
  returning to_jsonb(asaas_assinaturas) into v_depois;

  perform public.plataforma_registrar('trial_estendido', p_clinica, v_antes, v_depois, p_motivo);
  return v_depois;
end $$;

-- ---------------------------------------------------------------- cortesia
create or replace function public.plataforma_definir_cortesia(
  p_clinica uuid, p_cortesia boolean, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_antes jsonb; v_depois jsonb;
begin
  perform public.plataforma_exigir(true);

  select to_jsonb(a) into v_antes from public.asaas_assinaturas a where a.clinica_id = p_clinica;
  if v_antes is null then raise exception 'Clínica não encontrada.'; end if;

  update public.asaas_assinaturas
     set cortesia = coalesce(p_cortesia, false),
         trial_infinito = case when coalesce(p_cortesia,false) then true else trial_infinito end,
         updated_at = now()
   where clinica_id = p_clinica
  returning to_jsonb(asaas_assinaturas) into v_depois;

  perform public.plataforma_registrar(
    case when p_cortesia then 'cortesia_concedida' else 'cortesia_removida' end,
    p_clinica, v_antes, v_depois, p_motivo);
  return v_depois;
end $$;

-- ---------------------------------------------------------------- bloqueio
create or replace function public.plataforma_bloquear(
  p_clinica uuid, p_bloquear boolean, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_antes jsonb; v_depois jsonb;
begin
  perform public.plataforma_exigir(true);

  if coalesce(p_bloquear,false) and coalesce(btrim(p_motivo),'') = '' then
    raise exception 'Escreva o motivo do bloqueio — é o que a clínica vai ler na tela.';
  end if;

  select to_jsonb(a) into v_antes from public.asaas_assinaturas a where a.clinica_id = p_clinica;
  if v_antes is null then raise exception 'Clínica não encontrada.'; end if;

  update public.asaas_assinaturas
     set bloqueada = coalesce(p_bloquear, false),
         bloqueio_motivo = case when coalesce(p_bloquear,false) then btrim(p_motivo) else null end,
         updated_at = now()
   where clinica_id = p_clinica
  returning to_jsonb(asaas_assinaturas) into v_depois;

  perform public.plataforma_registrar(
    case when p_bloquear then 'clinica_bloqueada' else 'clinica_liberada' end,
    p_clinica, v_antes, v_depois, p_motivo);
  return v_depois;
end $$;

-- ---------------------------------------------------------------- anotação
create or replace function public.plataforma_anotar_conta(
  p_clinica uuid, p_observacao text, p_origem text default null, p_responsavel text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_depois jsonb;
begin
  perform public.plataforma_exigir();

  update public.asaas_assinaturas
     set observacao  = p_observacao,
         origem      = coalesce(p_origem, origem),
         responsavel = coalesce(p_responsavel, responsavel),
         updated_at  = now()
   where clinica_id = p_clinica
  returning to_jsonb(asaas_assinaturas) into v_depois;

  if v_depois is null then raise exception 'Clínica não encontrada.'; end if;
  perform public.plataforma_registrar('conta_anotada', p_clinica, null, v_depois, null);
  return v_depois;
end $$;

-- ---------------------------------------------------------------- leads
create or replace function public.plataforma_lead_salvar(
  p_id uuid default null,
  p_nome text default null, p_email text default null, p_telefone text default null,
  p_clinica_nome text default null, p_cidade text default null, p_estado text default null,
  p_cadeiras int default null, p_profissionais int default null,
  p_plano_interesse text default null, p_origem text default null, p_campanha text default null,
  p_mensagem text default null, p_status text default null, p_observacao text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.plataforma_exigir();

  if p_id is null then
    insert into public.plataforma_leads
      (nome, email, telefone, clinica_nome, cidade, estado, cadeiras, profissionais,
       plano_interesse, origem, campanha, mensagem, status, observacao)
    values (coalesce(btrim(p_nome),'(sem nome)'), p_email, p_telefone, p_clinica_nome,
            p_cidade, nullif(upper(btrim(coalesce(p_estado,''))),''), p_cadeiras, p_profissionais,
            nullif(p_plano_interesse,'')::public.plano_saas, p_origem, p_campanha, p_mensagem,
            coalesce(nullif(p_status,'')::public.plataforma_lead_status, 'novo'), p_observacao)
    returning to_jsonb(plataforma_leads) into v;
  else
    update public.plataforma_leads
       set nome = coalesce(nullif(btrim(coalesce(p_nome,'')),''), nome),
           email = coalesce(p_email, email),
           telefone = coalesce(p_telefone, telefone),
           clinica_nome = coalesce(p_clinica_nome, clinica_nome),
           cidade = coalesce(p_cidade, cidade),
           estado = coalesce(nullif(upper(btrim(coalesce(p_estado,''))),''), estado),
           cadeiras = coalesce(p_cadeiras, cadeiras),
           profissionais = coalesce(p_profissionais, profissionais),
           plano_interesse = coalesce(nullif(p_plano_interesse,'')::public.plano_saas, plano_interesse),
           origem = coalesce(p_origem, origem),
           campanha = coalesce(p_campanha, campanha),
           mensagem = coalesce(p_mensagem, mensagem),
           status = coalesce(nullif(p_status,'')::public.plataforma_lead_status, status),
           observacao = coalesce(p_observacao, observacao),
           updated_at = now()
     where id = p_id
    returning to_jsonb(plataforma_leads) into v;
    if v is null then raise exception 'Contato não encontrado.'; end if;
  end if;

  return v;
end $$;

create or replace function public.plataforma_leads_listar(
  p_status text default null, p_busca text default null, p_limite int default 300
)
returns table(
  id uuid, nome text, email text, telefone text, clinica_nome text,
  cidade text, estado text, cadeiras int, profissionais int,
  plano_interesse text, origem text, campanha text, mensagem text,
  status text, observacao text, convertida_clinica_id uuid,
  clinica_convertida text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.plataforma_exigir();
  return query
  select l.id, l.nome, l.email, l.telefone, l.clinica_nome,
         l.cidade, l.estado, l.cadeiras, l.profissionais,
         l.plano_interesse::text, l.origem, l.campanha, l.mensagem,
         l.status::text, l.observacao, l.convertida_clinica_id,
         c.nome_clinica, l.created_at
    from public.plataforma_leads l
    left join public.clinicas c on c.id = l.convertida_clinica_id
   where (p_status is null or p_status = '' or l.status::text = p_status)
     and (p_busca is null or btrim(p_busca) = '' or
          l.nome ilike '%'||p_busca||'%' or
          coalesce(l.clinica_nome,'') ilike '%'||p_busca||'%' or
          coalesce(l.email,'') ilike '%'||p_busca||'%' or
          coalesce(l.telefone,'') ilike '%'||p_busca||'%')
   order by l.created_at desc
   limit greatest(1, least(coalesce(p_limite, 300), 1000));
end $$;

-- lead vira clínica sem redigitar nada
create or replace function public.plataforma_converter_lead(
  p_lead uuid,
  p_plano text default 'trial', p_valor numeric default null, p_ciclo text default 'mensal',
  p_trial_dias int default 7, p_trial_infinito boolean default false,
  p_cortesia boolean default false, p_status text default 'trial'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.plataforma_leads%rowtype; v jsonb;
begin
  perform public.plataforma_exigir(true);

  select * into l from public.plataforma_leads where id = p_lead;
  if not found then raise exception 'Contato não encontrado.'; end if;
  if l.convertida_clinica_id is not null then
    raise exception 'Este contato já virou clínica.';
  end if;
  if coalesce(btrim(coalesce(l.email,'')),'') = '' then
    raise exception 'Sem e-mail no contato não dá para entregar a conta. Preencha o e-mail antes.';
  end if;

  v := public.plataforma_criar_clinica(
    coalesce(nullif(btrim(coalesce(l.clinica_nome,'')),''), l.nome),
    l.email, l.telefone, l.cidade, l.estado,
    p_plano, p_valor, p_ciclo, p_trial_dias, p_trial_infinito, p_cortesia, p_status,
    coalesce(l.origem, 'lead'), null,
    'Convertido do contato ' || l.nome);

  update public.plataforma_leads
     set status = 'convertido',
         convertida_clinica_id = (v->>'clinica_id')::uuid,
         convertido_em = now(), updated_at = now()
   where id = p_lead;

  return v;
end $$;

-- ---------------------------------------------------------------- time
create or replace function public.plataforma_membro_salvar(
  p_email text, p_papel text default 'suporte', p_ativo boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v jsonb;
begin
  perform public.plataforma_exigir(true);

  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'Esse e-mail ainda não tem conta no Sorrimax. Peça para se cadastrar primeiro.';
  end if;

  insert into public.plataforma_membros (user_id, email, nome, papel, ativo)
  values (v_uid, lower(btrim(p_email)),
          (select coalesce(full_name, email) from public.profiles where id = v_uid),
          coalesce(nullif(p_papel,'')::public.plataforma_papel, 'suporte'),
          coalesce(p_ativo, true))
  on conflict (user_id) do update
     set papel = excluded.papel, ativo = excluded.ativo, updated_at = now()
  returning to_jsonb(plataforma_membros) into v;

  perform public.plataforma_registrar('membro_salvo', null, null, v, p_email);
  return v;
end $$;

create or replace function public.plataforma_membros_listar()
returns table(user_id uuid, email text, nome text, papel text, ativo boolean,
              ultimo_acesso timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.plataforma_exigir();
  return query
  select m.user_id, m.email, m.nome, m.papel::text, m.ativo, u.last_sign_in_at, m.created_at
    from public.plataforma_membros m
    left join auth.users u on u.id = m.user_id
   order by m.papel, m.email;
end $$;

-- ---------------------------------------------------------------- trilha
create or replace function public.plataforma_auditoria_listar(p_limite int default 200)
returns table(id uuid, acao text, quem text, clinica text, clinica_id uuid,
              motivo text, antes jsonb, depois jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.plataforma_exigir();
  return query
  select a.id, a.acao, a.ator_email, a.alvo_nome, a.alvo_clinica_id,
         a.motivo, a.antes, a.depois, a.created_at
    from public.plataforma_auditoria a
   order by a.created_at desc
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
end $$;

-- ============================================================================
-- 10. PERMISSÕES DAS FUNÇÕES NOVAS
-- ----------------------------------------------------------------------------
-- O Postgres concede EXECUTE a PUBLIC em toda função criada. Para SECURITY
-- DEFINER isso é falha de segurança (a 0019 varreu o que existia até então) e a
-- auditoria_saude() acusa como FUNÇÃO-ANON. Aqui a varredura é reaplicada nas
-- funções desta migration, e o EXECUTE volta só para quem loga.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'plataforma\_%' or p.proname in
            ('is_plataforma','is_plataforma_dono','acesso_liberado','meu_contexto','handle_new_user'))
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'plataforma\_%' or p.proname in
            ('is_plataforma','is_plataforma_dono','acesso_liberado','meu_contexto'))
       -- gatilhos e escrita interna de auditoria não são chamáveis pelo cliente
       and p.proname not in ('plataforma_semear_assinatura','plataforma_registrar')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

commit;

-- ============================================================================
-- Depois de aplicar:
--
--   select * from auditoria_saude();          -- esperado: só GERAL / OK
--   select plataforma_visao_geral();          -- logado como membro da plataforma
--
-- Se o dono ainda não existia em auth.users quando isto rodou, o NOTICE do
-- passo 1 imprimiu o insert pronto para copiar depois do cadastro.
--
-- Para desfazer um bloqueio feito por engano, sem UI:
--   update asaas_assinaturas set bloqueada = false where clinica_id = '...';
-- ============================================================================
