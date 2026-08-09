-- ============================================================================
-- VITTALHUB · 0005 · Núcleo ODONTOLÓGICO
-- ----------------------------------------------------------------------------
-- Vira o produto para odontologia. Traz o que nenhum dos dois benchmarks
-- entrega junto:
--   · odontograma FDI (permanente + decíduo) com estado por FACE
--   · procedimento com granularidade declarada (dente / face / arcada / boca)
--   · preço em função de (procedimento × convênio), não valor fixo
--   · cadeira como recurso agendável (clínica com N consultórios)
-- ============================================================================

begin;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.dentição as enum ('permanente', 'decidua');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.face_dental as enum (
    'mesial', 'distal', 'vestibular', 'lingual', 'palatina',
    'oclusal', 'incisal', 'cervical'
  );
exception when duplicate_object then null; end $$;

-- Granularidade em que o procedimento é lançado.
do $$ begin
  create type public.aplicacao_procedimento as enum (
    'dente',      -- restauração, extração
    'face',       -- restauração de face específica
    'quadrante',  -- raspagem por quadrante
    'arcada',     -- prótese total
    'boca',       -- profilaxia, clareamento
    'regiao',     -- HOF / face (fora do odontograma)
    'sem_dente'   -- consulta, documentação, avaliação
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_odontograma as enum (
    'planejado',   -- saiu do orçamento, ainda não executado
    'em_execucao',
    'finalizado',
    'condicao'     -- achado clínico (cárie, ausente, fratura) sem tratamento vinculado
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_convenio as enum ('particular', 'convenio');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- convênios
alter table public.convenios
  add column if not exists tipo public.tipo_convenio not null default 'convenio';

-- Toda clínica precisa de um "Particular". Criado por trigger no cadastro.
create or replace function public.seed_convenio_particular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.convenios (clinica_id, nome, tipo, prazo_repasse_dias)
  values (new.id, 'Particular', 'particular', 0)
  on conflict (clinica_id, nome) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_clinica_convenio_particular on public.clinicas;
create trigger trg_clinica_convenio_particular
  after insert on public.clinicas
  for each row execute function public.seed_convenio_particular();

-- ============================================================================
-- servicos → procedimentos
-- ----------------------------------------------------------------------------
-- Em odontologia o vocabulário é "procedimento" e ele tem granularidade
-- (dente/face/arcada). Renomeia se 0002 já foi aplicado; cria se não.
-- ============================================================================
do $$ begin
  if to_regclass('public.servicos') is not null
     and to_regclass('public.procedimentos') is null then
    alter table public.servicos rename to procedimentos;
    alter table public.servico_profissional rename to procedimento_profissional;
    alter table public.procedimento_profissional rename column servico_id to procedimento_id;
  end if;
end $$;

alter table public.procedimentos
  add column if not exists codigo        text,
  add column if not exists codigo_tuss   text,
  add column if not exists especialidade text,      -- dentística, endodontia, ortodontia, HOF...
  add column if not exists aplicacao     public.aplicacao_procedimento not null default 'dente',
  add column if not exists faces_padrao  public.face_dental[] not null default '{}',
  add column if not exists sessoes_previstas int not null default 1 check (sessoes_previstas >= 1),
  add column if not exists exige_prótese boolean not null default false;

create unique index if not exists uq_procedimentos_codigo
  on public.procedimentos(clinica_id, codigo) where codigo is not null and codigo <> '';
create index if not exists idx_procedimentos_especialidade
  on public.procedimentos(clinica_id, especialidade) where ativo;

-- ---------------------------------------------------------------- preço por convênio
-- Simples Dental chama de "Planos e Tabelas de valores": o preço é função de
-- (procedimento × convênio). Sem isso não se atende convênio.
create table if not exists public.procedimento_precos (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  procedimento_id uuid not null references public.procedimentos(id) on delete cascade,
  convenio_id     uuid not null references public.convenios(id)     on delete cascade,
  valor           numeric(12,2) not null check (valor >= 0),
  -- repasse ao profissional: % ou valor fixo (alimenta o módulo de comissão)
  comissao_percentual numeric(5,2) check (comissao_percentual between 0 and 100),
  comissao_valor      numeric(12,2) check (comissao_valor >= 0),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (procedimento_id, convenio_id),
  constraint comissao_exclusiva check (
    comissao_percentual is null or comissao_valor is null
  )
);

create index if not exists idx_proc_precos_convenio
  on public.procedimento_precos(convenio_id) where ativo;

-- ============================================================================
-- cadeiras — recurso físico agendável
-- ============================================================================
create table if not exists public.cadeiras (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references public.clinicas(id) on delete cascade,
  nome        text not null,
  cor         text default '#60a5fa' check (cor is null or cor ~ '^#[0-9A-Fa-f]{6}$'),
  observacoes text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (clinica_id, nome)
);

-- Consulta passa a alocar cadeira além do profissional.
alter table public.consultas
  add column if not exists cadeira_id uuid references public.cadeiras(id) on delete set null;

create index if not exists idx_consultas_cadeira on public.consultas(cadeira_id, inicio);

-- Uma cadeira não pode receber duas consultas ao mesmo tempo.
alter table public.consultas drop constraint if exists consultas_cadeira_sem_sobreposicao;
alter table public.consultas
  add constraint consultas_cadeira_sem_sobreposicao
  exclude using gist (
    cadeira_id with =,
    tstzrange(inicio, fim) with &&
  )
  where (cadeira_id is not null and public.consulta_ocupa_agenda(status));

-- ============================================================================
-- odontograma
-- ----------------------------------------------------------------------------
-- Um registro por (paciente, dente, conjunto de faces). Guarda tanto CONDIÇÃO
-- clínica (cárie, ausente) quanto TRATAMENTO planejado/executado.
-- ============================================================================
create table if not exists public.odontograma_registros (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  paciente_id     uuid not null references public.pacientes(id) on delete cascade,

  denticao        public.dentição not null default 'permanente',
  -- Notação FDI. Permanentes 11-18/21-28/31-38/41-48; decíduos 51-55/61-65/71-75/81-85.
  -- Nulo quando o lançamento é de arcada/boca/região.
  dente           smallint,
  faces           public.face_dental[] not null default '{}',
  -- para lançamentos que não são por dente
  regiao          text,

  procedimento_id uuid references public.procedimentos(id) on delete set null,
  estado          public.estado_odontograma not null default 'planejado',
  -- condição clínica livre quando estado = 'condicao' (cárie, fratura, ausente, giroverso...)
  condicao        text,
  anotacao        text,

  consulta_id     uuid references public.consultas(id) on delete set null,
  profissional_id uuid references public.profiles(id)  on delete set null,
  orcamento_item_id uuid,   -- FK criada em 0006

  executado_em    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint odonto_dente_fdi_valido check (
    dente is null or (
      (denticao = 'permanente' and (
         dente between 11 and 18 or dente between 21 and 28 or
         dente between 31 and 38 or dente between 41 and 48))
      or
      (denticao = 'decidua' and (
         dente between 51 and 55 or dente between 61 and 65 or
         dente between 71 and 75 or dente between 81 and 85))
    )
  ),
  -- ou é lançamento de dente, ou de região. Nunca nenhum dos dois.
  constraint odonto_alvo_definido check (dente is not null or regiao is not null),
  constraint odonto_condicao_coerente check (
    (estado = 'condicao' and condicao is not null)
    or (estado <> 'condicao' and procedimento_id is not null)
  )
);

create index if not exists idx_odonto_paciente
  on public.odontograma_registros(paciente_id, denticao);
create index if not exists idx_odonto_dente
  on public.odontograma_registros(paciente_id, dente) where dente is not null;
create index if not exists idx_odonto_estado
  on public.odontograma_registros(clinica_id, estado);
create index if not exists idx_odonto_faces
  on public.odontograma_registros using gin(faces);
create index if not exists idx_odonto_consulta
  on public.odontograma_registros(consulta_id);

-- ---------------------------------------------------------------- evoluções
-- Evolução clínica é append-only: exigência de prontuário (CFO/LGPD art. 11).
-- Correção se faz por novo registro que referencia o anterior, nunca por UPDATE.
create table if not exists public.evolucoes (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  paciente_id     uuid not null references public.pacientes(id) on delete cascade,
  consulta_id     uuid references public.consultas(id) on delete set null,
  profissional_id uuid not null references public.profiles(id) on delete restrict,
  conteudo        text not null,
  dentes          smallint[] not null default '{}',
  retifica_id     uuid references public.evolucoes(id) on delete set null,
  assinado_em     timestamptz,
  hash_assinatura text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_evolucoes_paciente
  on public.evolucoes(paciente_id, created_at desc);

-- ---------------------------------------------------------------- RLS
select public.apply_tenant_rls('procedimento_precos');
select public.apply_tenant_rls('cadeiras');
select public.apply_tenant_rls('odontograma_registros');

-- procedimentos / procedimento_profissional: reaplica após o rename
select public.apply_tenant_rls('procedimentos');
select public.apply_tenant_rls('procedimento_profissional');

-- evolucoes: RLS própria, APPEND-ONLY (sem update, sem delete)
alter table public.evolucoes enable row level security;
drop policy if exists evolucoes_tenant on public.evolucoes;
drop policy if exists evolucoes_select on public.evolucoes;
drop policy if exists evolucoes_insert on public.evolucoes;

create policy evolucoes_select on public.evolucoes
  for select to authenticated
  using (clinica_id = public.current_clinica_id());

create policy evolucoes_insert on public.evolucoes
  for insert to authenticated
  with check (
    clinica_id = public.current_clinica_id()
    and profissional_id = auth.uid()
  );
-- Sem policy de UPDATE nem DELETE: prontuário não se altera nem se apaga.

commit;
