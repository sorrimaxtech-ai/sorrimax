-- ============================================================================
-- VITTALHUB · 0002 · Núcleo clínico: convênios, pacientes, serviços
-- ----------------------------------------------------------------------------
-- Substitui os mocks de src/pages/Pacientes.tsx por dados reais.
-- Perfil de produto: CLÍNICA MULTI-PROFISSIONAL (vocabulário paciente/consulta,
-- convênios, vínculo serviço↔profissional).
-- ============================================================================

begin;

create extension if not exists "pg_trgm";   -- busca por nome com ILIKE rápida

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.modalidade_atendimento as enum ('presencial', 'online', 'domiciliar');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_pessoa as enum ('fisica', 'juridica');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- convenios
-- ============================================================================
create table if not exists public.convenios (
  id            uuid primary key default gen_random_uuid(),
  clinica_id    uuid not null references public.clinicas(id) on delete cascade,
  nome          text not null,
  registro_ans  text,
  telefone      text,
  observacoes   text,
  -- prazo médio de repasse, usado no fluxo de caixa projetado
  prazo_repasse_dias int not null default 30 check (prazo_repasse_dias >= 0),
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (clinica_id, nome)
);

create index if not exists idx_convenios_clinica on public.convenios(clinica_id) where ativo;

-- ============================================================================
-- pacientes
-- ============================================================================
create table if not exists public.pacientes (
  id                uuid primary key default gen_random_uuid(),
  clinica_id        uuid not null references public.clinicas(id) on delete cascade,

  -- identificação
  nome_completo     text not null,
  apelido           text,
  -- celular é obrigatório de propósito: é a chave do canal (WhatsApp), não o CPF.
  celular           text not null,
  email             text,
  data_nascimento   date not null,
  cpf               text,
  rg                text,
  genero            text,
  estado_civil      text,
  profissao         text,
  foto_url          text,

  -- endereço
  cep               text,
  logradouro        text,
  numero            text,
  complemento       text,
  bairro            text,
  cidade            text,
  uf                char(2),

  -- contato de emergência
  emergencia_nome       text,
  emergencia_celular    text,
  emergencia_celular2   text,
  emergencia_parentesco text,

  -- clínico e comercial
  convenio_id       uuid references public.convenios(id) on delete set null,
  numero_carteirinha text,
  alergias          text[] not null default '{}',
  observacoes       text,
  tags              text[] not null default '{}',

  -- rastreio de origem: fecha o funil CRM → paciente (vantagem sobre o concorrente)
  lead_id           uuid,
  origem            text not null default 'manual'
                    check (origem in ('manual','crm','booking_publico','whatsapp','importacao')),

  ativo             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint pacientes_nascimento_valido check (data_nascimento <= current_date),
  constraint pacientes_uf_valida check (uf is null or uf ~ '^[A-Z]{2}$')
);

-- CPF único por clínica, mas só quando informado (CPF é opcional)
create unique index if not exists uq_pacientes_cpf_clinica
  on public.pacientes(clinica_id, cpf) where cpf is not null and cpf <> '';

create index if not exists idx_pacientes_clinica  on public.pacientes(clinica_id) where ativo;
create index if not exists idx_pacientes_celular  on public.pacientes(clinica_id, celular);
create index if not exists idx_pacientes_convenio on public.pacientes(convenio_id);
create index if not exists idx_pacientes_lead     on public.pacientes(lead_id);
create index if not exists idx_pacientes_tags     on public.pacientes using gin(tags);
create index if not exists idx_pacientes_nome_trgm
  on public.pacientes using gin(nome_completo gin_trgm_ops);
-- aniversariantes do mês (card da home) sem full scan
create index if not exists idx_pacientes_aniversario
  on public.pacientes(clinica_id, (extract(month from data_nascimento)));

-- FK opcional para leads, só se a tabela existir neste ambiente
do $$ begin
  if to_regclass('public.leads') is not null then
    alter table public.pacientes
      drop constraint if exists pacientes_lead_id_fkey,
      add  constraint pacientes_lead_id_fkey
           foreign key (lead_id) references public.leads(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- servicos
-- ============================================================================
create table if not exists public.servicos (
  id             uuid primary key default gen_random_uuid(),
  clinica_id     uuid not null references public.clinicas(id) on delete cascade,
  nome           text not null,
  descricao      text,
  categoria      text,
  duracao_min    int  not null default 50 check (duracao_min between 5 and 1440),
  valor          numeric(12,2) not null default 0 check (valor >= 0),
  -- cor no calendário: o concorrente não tem, e sem isso agenda cheia vira sopa
  cor            text not null default '#4ade80' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  -- folga antes/depois: preparo de sala, higienização, retorno de deslocamento
  buffer_antes_min  int not null default 0  check (buffer_antes_min  between 0 and 240),
  buffer_depois_min int not null default 0  check (buffer_depois_min between 0 and 240),
  modalidades    public.modalidade_atendimento[] not null default '{presencial}',
  -- expõe o serviço na página pública de agendamento
  publico_no_perfil boolean not null default false,
  exige_anamnese boolean not null default false,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (clinica_id, nome),
  constraint servicos_modalidades_nao_vazia check (array_length(modalidades, 1) >= 1)
);

create index if not exists idx_servicos_clinica on public.servicos(clinica_id) where ativo;
create index if not exists idx_servicos_publico on public.servicos(clinica_id) where publico_no_perfil and ativo;

-- ---------------------------------------------------------------- serviço ↔ profissional
-- Numa clínica multi-profissional nem todo mundo executa todo serviço, e o
-- preço pode variar por profissional (sênior x júnior).
create table if not exists public.servico_profissional (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  servico_id      uuid not null references public.servicos(id) on delete cascade,
  profissional_id uuid not null references public.profiles(id) on delete cascade,
  valor_override  numeric(12,2) check (valor_override >= 0),
  duracao_override_min int check (duracao_override_min between 5 and 1440),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (servico_id, profissional_id)
);

create index if not exists idx_servprof_prof on public.servico_profissional(profissional_id) where ativo;
create index if not exists idx_servprof_serv on public.servico_profissional(servico_id) where ativo;

-- ---------------------------------------------------------------- RLS + triggers
select public.apply_tenant_rls('convenios');
select public.apply_tenant_rls('pacientes');
select public.apply_tenant_rls('servicos');
select public.apply_tenant_rls('servico_profissional');

commit;
