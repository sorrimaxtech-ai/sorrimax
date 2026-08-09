-- ============================================================================
-- SORRIMAX · 0006 · ORÇAMENTO — a entidade central do negócio odontológico
-- ----------------------------------------------------------------------------
-- Lição do benchmark: em odontologia o centro não é a consulta (VitalHub) nem
-- o lead (SORRIMAX hoje). É o ORÇAMENTO. Aprovar um orçamento dispara:
--   1. planejamento no odontograma
--   2. débitos financeiros (0007)
--   3. movimento no funil comercial
-- E o que NÃO é aprovado vira oportunidade de venda.
--
-- Diferencial nosso: aprovação PARCIAL item a item (o Simples Dental tem)
-- + funil UNIFICADO lead → paciente → orçamento (nenhum dos dois tem).
-- ============================================================================

begin;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.status_orcamento as enum (
    'rascunho', 'aberto', 'aprovado_parcial', 'aprovado',
    'reprovado', 'expirado', 'cancelado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_item_orcamento as enum ('pendente', 'aprovado', 'recusado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.origem_oportunidade as enum ('lead', 'orcamento', 'manual', 'indicacao');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- orcamentos
-- ============================================================================
create table if not exists public.orcamentos (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  paciente_id     uuid not null references public.pacientes(id) on delete restrict,
  profissional_id uuid references public.profiles(id) on delete set null,
  convenio_id     uuid references public.convenios(id) on delete set null,

  numero          integer not null,          -- sequencial por clínica
  titulo          text,
  observacoes     text,

  status          public.status_orcamento not null default 'rascunho',
  validade        date,

  -- desconto aplicado sobre o total dos itens aprovados
  desconto        numeric(12,2) not null default 0 check (desconto >= 0),
  -- somatórios mantidos por trigger (evita recalcular em toda listagem)
  total_itens     numeric(12,2) not null default 0,
  total_aprovado  numeric(12,2) not null default 0,

  aprovado_em     timestamptz,
  reprovado_em    timestamptz,
  motivo_reprovacao text,
  -- aceite do paciente (link público / app)
  aceite_token    text,
  aceite_ip       inet,
  aceite_assinatura_url text,

  criado_por      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (clinica_id, numero)
);

create index if not exists idx_orcamentos_paciente on public.orcamentos(paciente_id, created_at desc);
create index if not exists idx_orcamentos_status   on public.orcamentos(clinica_id, status);
-- KPI "orçamentos em aberto" (dinheiro parado) sem full scan
create index if not exists idx_orcamentos_abertos
  on public.orcamentos(clinica_id, created_at desc)
  where status in ('aberto', 'aprovado_parcial');

-- numeração sequencial por clínica
create or replace function public.orcamento_set_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null or new.numero = 0 then
    select coalesce(max(numero), 0) + 1 into new.numero
      from public.orcamentos where clinica_id = new.clinica_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orcamento_numero on public.orcamentos;
create trigger trg_orcamento_numero
  before insert on public.orcamentos
  for each row execute function public.orcamento_set_numero();

-- ============================================================================
-- orcamento_itens — granularidade dente/face, aprovação individual
-- ============================================================================
create table if not exists public.orcamento_itens (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  orcamento_id    uuid not null references public.orcamentos(id) on delete cascade,
  procedimento_id uuid not null references public.procedimentos(id) on delete restrict,

  denticao        public.dentição not null default 'permanente',
  dente           smallint,
  faces           public.face_dental[] not null default '{}',
  regiao          text,

  quantidade      integer not null default 1 check (quantidade > 0),
  valor_unitario  numeric(12,2) not null check (valor_unitario >= 0),
  desconto        numeric(12,2) not null default 0 check (desconto >= 0),
  total           numeric(12,2) generated always as
                    ((valor_unitario * quantidade) - desconto) stored,

  status          public.status_item_orcamento not null default 'pendente',
  ordem           integer not null default 0,
  observacoes     text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint item_desconto_valido check (desconto <= valor_unitario * quantidade),
  constraint item_dente_fdi_valido check (
    dente is null or (
      (denticao = 'permanente' and (
         dente between 11 and 18 or dente between 21 and 28 or
         dente between 31 and 38 or dente between 41 and 48))
      or
      (denticao = 'decidua' and (
         dente between 51 and 55 or dente between 61 and 65 or
         dente between 71 and 75 or dente between 81 and 85))
    )
  )
);

create index if not exists idx_orc_itens_orcamento on public.orcamento_itens(orcamento_id, ordem);
create index if not exists idx_orc_itens_status    on public.orcamento_itens(orcamento_id, status);

-- FK reversa do odontograma (a coluna foi criada em 0005 sem FK)
alter table public.odontograma_registros
  drop constraint if exists odontograma_orcamento_item_fk;
alter table public.odontograma_registros
  add constraint odontograma_orcamento_item_fk
  foreign key (orcamento_item_id) references public.orcamento_itens(id) on delete set null;

-- ---------------------------------------------------------------- recálculo de totais
create or replace function public.orcamento_recalcular()
returns trigger
language plpgsql
as $$
declare
  v_orcamento_id uuid := coalesce(new.orcamento_id, old.orcamento_id);
  v_total        numeric(12,2);
  v_aprovado     numeric(12,2);
  v_pendentes    int;
  v_aprovados    int;
  v_recusados    int;
  v_desconto     numeric(12,2);
  v_status       public.status_orcamento;
begin
  select coalesce(sum(total), 0),
         coalesce(sum(total) filter (where status = 'aprovado'), 0),
         count(*) filter (where status = 'pendente'),
         count(*) filter (where status = 'aprovado'),
         count(*) filter (where status = 'recusado')
    into v_total, v_aprovado, v_pendentes, v_aprovados, v_recusados
    from public.orcamento_itens
   where orcamento_id = v_orcamento_id;

  select desconto, status into v_desconto, v_status
    from public.orcamentos where id = v_orcamento_id;

  -- status derivado dos itens (só mexe se o orçamento já saiu do rascunho
  -- e não foi cancelado/expirado manualmente)
  if v_status not in ('rascunho', 'cancelado', 'expirado') then
    if v_aprovados > 0 and v_pendentes = 0 and v_recusados = 0 then
      v_status := 'aprovado';
    elsif v_aprovados > 0 then
      v_status := 'aprovado_parcial';
    elsif v_recusados > 0 and v_pendentes = 0 then
      v_status := 'reprovado';
    else
      v_status := 'aberto';
    end if;
  end if;

  update public.orcamentos
     set total_itens    = v_total,
         total_aprovado = greatest(v_aprovado - coalesce(v_desconto, 0), 0),
         status         = v_status,
         aprovado_em    = case when v_status in ('aprovado','aprovado_parcial')
                               then coalesce(aprovado_em, now()) else aprovado_em end,
         reprovado_em   = case when v_status = 'reprovado'
                               then coalesce(reprovado_em, now()) else reprovado_em end,
         updated_at     = now()
   where id = v_orcamento_id;

  return null;
end;
$$;

drop trigger if exists trg_orc_item_recalcular on public.orcamento_itens;
create trigger trg_orc_item_recalcular
  after insert or update or delete on public.orcamento_itens
  for each row execute function public.orcamento_recalcular();

-- ---------------------------------------------------------------- item aprovado → odontograma
-- Aprovar um item lança o procedimento no odontograma como 'planejado'.
create or replace function public.orcamento_item_para_odontograma()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    insert into public.odontograma_registros (
      clinica_id, paciente_id, denticao, dente, faces, regiao,
      procedimento_id, estado, orcamento_item_id, profissional_id
    )
    select new.clinica_id, o.paciente_id, new.denticao, new.dente, new.faces, new.regiao,
           new.procedimento_id, 'planejado', new.id, o.profissional_id
      from public.orcamentos o
     where o.id = new.orcamento_id
       and not exists (
         select 1 from public.odontograma_registros r where r.orcamento_item_id = new.id
       );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orc_item_odontograma on public.orcamento_itens;
create trigger trg_orc_item_odontograma
  after update on public.orcamento_itens
  for each row execute function public.orcamento_item_para_odontograma();

-- ============================================================================
-- oportunidades — FUNIL UNIFICADO (a tese de produto)
-- ----------------------------------------------------------------------------
-- O CRM do SORRIMAX hoje é de LEAD (pré-paciente). O do Simples Dental é de
-- ORÇAMENTO (pós-paciente). Aqui os dois vivem no mesmo funil, então dá pra
-- responder: "de cada 100 leads captados, quantos reais viraram tratamento?"
-- ============================================================================
create table if not exists public.oportunidades (
  id            uuid primary key default gen_random_uuid(),
  clinica_id    uuid not null references public.clinicas(id) on delete cascade,

  origem        public.origem_oportunidade not null,
  lead_id       uuid,                                            -- FK condicional abaixo
  paciente_id   uuid references public.pacientes(id)  on delete set null,
  orcamento_id  uuid references public.orcamentos(id) on delete cascade,

  etapa_id      uuid,                                            -- FK condicional abaixo
  titulo        text not null,
  valor         numeric(12,2) not null default 0 check (valor >= 0),
  responsavel_id uuid references public.profiles(id) on delete set null,

  ganha_em      timestamptz,
  perdida_em    timestamptz,
  motivo_perda  text,
  ordem         integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_oport_etapa     on public.oportunidades(clinica_id, etapa_id, ordem);
create index if not exists idx_oport_orcamento on public.oportunidades(orcamento_id);
create index if not exists idx_oport_lead      on public.oportunidades(lead_id);

-- FKs opcionais: só amarra se as tabelas do CRM existirem neste ambiente
do $$ begin
  if to_regclass('public.leads') is not null then
    alter table public.oportunidades
      drop constraint if exists oportunidades_lead_fk,
      add  constraint oportunidades_lead_fk
           foreign key (lead_id) references public.leads(id) on delete set null;
  end if;
  if to_regclass('public.pipeline_stages') is not null then
    alter table public.oportunidades
      drop constraint if exists oportunidades_etapa_fk,
      add  constraint oportunidades_etapa_fk
           foreign key (etapa_id) references public.pipeline_stages(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------- orçamento ↔ funil
-- Orçamento aberto entra no funil; aprovado marca ganha; reprovado marca perdida.
-- Espelha o comportamento do Simples Dental ("orçamentos em aberto aparecerão
-- aqui como oportunidades" / "aprovados serão movidos automaticamente").
create or replace function public.orcamento_sincronizar_funil()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'aberto' then
    insert into public.oportunidades (
      clinica_id, origem, paciente_id, orcamento_id, titulo, valor, responsavel_id
    )
    select new.clinica_id, 'orcamento', new.paciente_id, new.id,
           coalesce(new.titulo, 'Orçamento #' || new.numero),
           new.total_itens, new.profissional_id
     where not exists (
       select 1 from public.oportunidades o where o.orcamento_id = new.id
     );

  elsif new.status in ('aprovado', 'aprovado_parcial') then
    update public.oportunidades
       set valor = new.total_aprovado, ganha_em = coalesce(ganha_em, now()), updated_at = now()
     where orcamento_id = new.id;

  elsif new.status = 'reprovado' then
    update public.oportunidades
       set perdida_em = coalesce(perdida_em, now()),
           motivo_perda = coalesce(motivo_perda, new.motivo_reprovacao),
           updated_at = now()
     where orcamento_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orcamento_funil on public.orcamentos;
create trigger trg_orcamento_funil
  after insert or update of status on public.orcamentos
  for each row execute function public.orcamento_sincronizar_funil();

-- ---------------------------------------------------------------- RLS
select public.apply_tenant_rls('orcamentos');
select public.apply_tenant_rls('orcamento_itens');
select public.apply_tenant_rls('oportunidades');

commit;
