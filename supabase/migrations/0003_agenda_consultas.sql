-- ============================================================================
-- VITTALHUB · 0003 · Agenda: disponibilidade, bloqueios, consultas, recorrência
-- ----------------------------------------------------------------------------
-- Substitui os mocks de src/pages/Agenda.tsx.
-- Destaques em relação ao benchmark:
--   · modalidade DOMICILIAR (eles só têm presencial/online)
--   · recorrência DIÁRIA (eles começam na semanal)
--   · status EM_ATENDIMENTO (check-in / sala de espera — inexistente lá)
--   · double-booking bloqueado no BANCO via EXCLUDE, não só na UI
--   · função slots_disponiveis() que alimenta o agendamento público
-- ============================================================================

begin;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.status_consulta as enum (
    'pendente',              -- veio do booking público, aguarda aprovação da clínica
    'agendado',
    'confirmado',            -- paciente confirmou presença
    'em_atendimento',        -- check-in feito (nosso, não existe no concorrente)
    'concluido',
    'reagendado',
    'desmarcado',            -- clínica desmarcou
    'recusado',              -- clínica recusou solicitação do booking
    'nao_compareceu',        -- no-show
    'cancelado',
    'cancelado_pelo_cliente'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_recorrencia as enum (
    'diaria', 'semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.origem_consulta as enum (
    'interno', 'booking_publico', 'whatsapp', 'crm', 'importacao'
  );
exception when duplicate_object then null; end $$;

-- Estados em que a consulta ocupa a agenda de fato.
-- Usado pelo EXCLUDE e por slots_disponiveis(). IMMUTABLE de propósito:
-- constraint de exclusão não aceita função volátil.
create or replace function public.consulta_ocupa_agenda(s public.status_consulta)
returns boolean
language sql
immutable
as $$
  select s in ('pendente','agendado','confirmado','em_atendimento','concluido')
$$;

-- ============================================================================
-- disponibilidades — grade semanal recorrente por profissional
-- ============================================================================
create table if not exists public.disponibilidades (
  id               uuid primary key default gen_random_uuid(),
  clinica_id       uuid not null references public.clinicas(id) on delete cascade,
  profissional_id  uuid not null references public.profiles(id) on delete cascade,
  dia_semana       smallint not null check (dia_semana between 0 and 6),  -- 0=domingo
  hora_inicio      time not null,
  hora_fim         time not null,
  intervalo_slot_min int not null default 30 check (intervalo_slot_min between 5 and 240),
  modalidades      public.modalidade_atendimento[] not null default '{presencial}',
  vigencia_inicio  date,
  vigencia_fim     date,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint disp_horario_valido check (hora_fim > hora_inicio),
  constraint disp_vigencia_valida check (
    vigencia_inicio is null or vigencia_fim is null or vigencia_fim >= vigencia_inicio
  )
);

create index if not exists idx_disp_prof_dia
  on public.disponibilidades(profissional_id, dia_semana) where ativo;

-- ============================================================================
-- bloqueios_agenda — férias, feriado, almoço, congresso
-- ============================================================================
create table if not exists public.bloqueios_agenda (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  -- profissional_id nulo = bloqueio da clínica inteira (feriado)
  profissional_id uuid references public.profiles(id) on delete cascade,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  motivo          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint bloqueio_periodo_valido check (fim > inicio)
);

create index if not exists idx_bloqueios_periodo
  on public.bloqueios_agenda using gist (tstzrange(inicio, fim));
create index if not exists idx_bloqueios_prof
  on public.bloqueios_agenda(profissional_id, inicio);

-- ============================================================================
-- recorrencias — regra que gera a série de consultas
-- ============================================================================
create table if not exists public.recorrencias (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  tipo            public.tipo_recorrencia not null,
  intervalo       int not null default 1 check (intervalo between 1 and 52),
  qtd_repeticoes  int check (qtd_repeticoes between 1 and 365),
  dias_semana     smallint[] not null default '{}',
  ate             date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- ou repete N vezes, ou repete até uma data: precisa de um dos dois
  constraint recorrencia_tem_fim check (qtd_repeticoes is not null or ate is not null)
);

-- ============================================================================
-- consultas
-- ============================================================================
create table if not exists public.consultas (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  paciente_id     uuid not null references public.pacientes(id) on delete restrict,
  profissional_id uuid not null references public.profiles(id)  on delete restrict,
  servico_id      uuid references public.servicos(id) on delete set null,

  titulo          text,
  observacoes     text,

  inicio          timestamptz not null,
  fim             timestamptz not null,

  modalidade      public.modalidade_atendimento not null default 'presencial',
  status          public.status_consulta        not null default 'agendado',

  valor           numeric(12,2) not null default 0 check (valor    >= 0),
  desconto        numeric(12,2) not null default 0 check (desconto >= 0),
  total           numeric(12,2) generated always as (valor - desconto) stored,

  recorrencia_id  uuid references public.recorrencias(id) on delete set null,
  origem          public.origem_consulta not null default 'interno',

  -- integrações
  google_event_id text,
  meet_url        text,

  -- telemetria do funil anti no-show
  confirmado_em        timestamptz,
  lembrete_enviado_em  timestamptz,
  checkin_em           timestamptz,
  concluido_em         timestamptz,
  cancelado_em         timestamptz,
  motivo_cancelamento  text,

  criado_por      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint consulta_periodo_valido check (fim > inicio),
  constraint consulta_desconto_valido check (desconto <= valor)
);

-- ---------------------------------------------------------------- anti double-booking
-- A UI pode errar; o banco não. Duas consultas ativas do mesmo profissional
-- não podem se sobrepor no tempo. Requer btree_gist (criada em 0001).
alter table public.consultas
  drop constraint if exists consultas_sem_sobreposicao;
alter table public.consultas
  add constraint consultas_sem_sobreposicao
  exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim) with &&
  )
  where (public.consulta_ocupa_agenda(status));

create index if not exists idx_consultas_clinica_periodo
  on public.consultas(clinica_id, inicio desc);
create index if not exists idx_consultas_prof_periodo
  on public.consultas(profissional_id, inicio);
create index if not exists idx_consultas_paciente
  on public.consultas(paciente_id, inicio desc);
create index if not exists idx_consultas_status
  on public.consultas(clinica_id, status);
create index if not exists idx_consultas_recorrencia
  on public.consultas(recorrencia_id);
-- fila de lembretes: consultas futuras ainda não lembradas
create index if not exists idx_consultas_lembrete_pendente
  on public.consultas(inicio)
  where lembrete_enviado_em is null and status in ('agendado','confirmado');

-- ---------------------------------------------------------------- timestamps de estado
-- Carimba automaticamente as datas do funil quando o status muda.
create or replace function public.consulta_carimbar_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    case new.status
      when 'confirmado'      then new.confirmado_em := coalesce(new.confirmado_em, now());
      when 'em_atendimento'  then new.checkin_em    := coalesce(new.checkin_em, now());
      when 'concluido'       then new.concluido_em  := coalesce(new.concluido_em, now());
      when 'cancelado'               then new.cancelado_em := coalesce(new.cancelado_em, now());
      when 'cancelado_pelo_cliente'  then new.cancelado_em := coalesce(new.cancelado_em, now());
      when 'desmarcado'              then new.cancelado_em := coalesce(new.cancelado_em, now());
      else null;
    end case;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consulta_status on public.consultas;
create trigger trg_consulta_status
  before update on public.consultas
  for each row execute function public.consulta_carimbar_status();

-- ============================================================================
-- slots_disponiveis() — motor do agendamento (interno e público)
-- ----------------------------------------------------------------------------
-- Cruza a grade de disponibilidade com bloqueios e consultas já ocupadas,
-- respeitando os buffers do serviço. Retorna os horários realmente livres.
-- ============================================================================
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
  v_clinica_id  uuid;
  v_tz          text;
  v_duracao     int;
  v_buf_antes   int := 0;
  v_buf_depois  int := 0;
begin
  select p.clinica_id into v_clinica_id
    from public.profiles p where p.id = p_profissional_id;

  if v_clinica_id is null then
    return;
  end if;

  select coalesce(c.timezone, 'America/Sao_Paulo') into v_tz
    from public.clinicas c where c.id = v_clinica_id;

  if p_servico_id is not null then
    select coalesce(sp.duracao_override_min, s.duracao_min),
           s.buffer_antes_min, s.buffer_depois_min
      into v_duracao, v_buf_antes, v_buf_depois
      from public.servicos s
      left join public.servico_profissional sp
             on sp.servico_id = s.id
            and sp.profissional_id = p_profissional_id
            and sp.ativo
     where s.id = p_servico_id;
  end if;

  return query
  with grade as (
    select d.hora_inicio, d.hora_fim,
           coalesce(v_duracao, d.intervalo_slot_min) as passo_min
      from public.disponibilidades d
     where d.profissional_id = p_profissional_id
       and d.ativo
       and d.dia_semana = extract(dow from p_data)::smallint
       and (d.vigencia_inicio is null or p_data >= d.vigencia_inicio)
       and (d.vigencia_fim    is null or p_data <= d.vigencia_fim)
  ),
  candidatos as (
    select
      ((p_data + g.hora_inicio) at time zone v_tz)
        + (n * g.passo_min || ' minutes')::interval as ini,
      ((p_data + g.hora_inicio) at time zone v_tz)
        + ((n * g.passo_min) + g.passo_min || ' minutes')::interval as f
    from grade g
    cross join lateral generate_series(
      0,
      greatest(
        0,
        (extract(epoch from (g.hora_fim - g.hora_inicio)) / 60 / g.passo_min)::int - 1
      )
    ) as n
  )
  select c.ini, c.f
    from candidatos c
   where c.ini > now()                                   -- nada no passado
     and not exists (                                    -- não colide com consulta
       select 1 from public.consultas k
        where k.profissional_id = p_profissional_id
          and public.consulta_ocupa_agenda(k.status)
          and tstzrange(
                k.inicio - (v_buf_antes  || ' minutes')::interval,
                k.fim    + (v_buf_depois || ' minutes')::interval
              ) && tstzrange(c.ini, c.f)
     )
     and not exists (                                    -- não colide com bloqueio
       select 1 from public.bloqueios_agenda b
        where b.clinica_id = v_clinica_id
          and (b.profissional_id = p_profissional_id or b.profissional_id is null)
          and tstzrange(b.inicio, b.fim) && tstzrange(c.ini, c.f)
     )
   order by c.ini;
end;
$$;

grant execute on function public.slots_disponiveis(uuid, date, uuid) to authenticated, anon;

-- ---------------------------------------------------------------- RLS + triggers
select public.apply_tenant_rls('disponibilidades');
select public.apply_tenant_rls('bloqueios_agenda');
select public.apply_tenant_rls('recorrencias');
select public.apply_tenant_rls('consultas');

commit;
