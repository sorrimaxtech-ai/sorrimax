-- ============================================================================
-- 0024 — A agenda vira o centro operacional da clínica
-- ----------------------------------------------------------------------------
-- Até aqui a agenda era só um calendário de consultas, e a venda vivia num
-- módulo separado. Software odontológico não funciona assim: o dia da clínica
-- ACONTECE na agenda, e é de lá que sai o dinheiro. Três lacunas estruturais:
--
--   1. `paciente_id` NOT NULL  → impossível marcar reunião, manutenção de
--      equipamento, almoço, visita de protético. Tudo que não é paciente
--      simplesmente não cabia na agenda.
--   2. Sem rótulos            → não dava para marcar "primeira consulta",
--      "retorno", "urgência", "cortesia" e filtrar/colorir por isso.
--   3. Sem vínculo com venda  → `consultas.valor/desconto/total` era um número
--      solto que não virava orçamento nem conta a receber. Dinheiro digitado
--      na agenda evaporava.
--
-- Esta migration resolve as três.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tipo de agendamento: consulta (tem paciente) vs compromisso (não tem)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_agendamento') then
    create type public.tipo_agendamento as enum ('consulta', 'compromisso');
  end if;
end $$;

alter table public.consultas
  add column if not exists tipo public.tipo_agendamento not null default 'consulta';

-- paciente deixa de ser obrigatório — mas só para compromisso
alter table public.consultas alter column paciente_id drop not null;

-- A integridade que o NOT NULL garantia passa a ser condicional ao tipo.
-- Sem isso, um bug de UI criaria "consulta sem paciente" e a ficha do
-- paciente perderia o atendimento silenciosamente.
alter table public.consultas drop constraint if exists consulta_tipo_coerente;
alter table public.consultas add constraint consulta_tipo_coerente check (
  (tipo = 'consulta'   and paciente_id is not null) or
  (tipo = 'compromisso' and paciente_id is null and servico_id is null)
);

-- Compromisso precisa de nome próprio: não há paciente para rotular o bloco.
alter table public.consultas drop constraint if exists compromisso_tem_titulo;
alter table public.consultas add constraint compromisso_tem_titulo check (
  tipo <> 'compromisso' or (titulo is not null and length(btrim(titulo)) > 0)
);

comment on column public.consultas.tipo is
  'consulta = atendimento de paciente; compromisso = bloco interno (reunião, manutenção, protético) que ocupa agenda mas não tem paciente nem procedimento.';

-- ---------------------------------------------------------------------------
-- 2. Rótulos de agenda
-- ---------------------------------------------------------------------------
create table if not exists public.agenda_rotulos (
  id         uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome       text not null,
  cor        text not null default '#64748b',
  ordem      int  not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_rotulo_nome_valido check (length(btrim(nome)) between 1 and 40),
  -- hex de 6 dígitos: a cor entra direto em style={{background}}, então precisa
  -- ser validada aqui — classe Tailwind montada em runtime não é gerada.
  constraint agenda_rotulo_cor_hex check (cor ~ '^#[0-9a-fA-F]{6}$')
);

create unique index if not exists agenda_rotulos_nome_unico
  on public.agenda_rotulos (clinica_id, lower(btrim(nome)));

select public.apply_tenant_rls('agenda_rotulos');

-- Junção N:N — uma consulta pode ser "retorno" + "convênio" ao mesmo tempo.
create table if not exists public.consulta_rotulos (
  clinica_id  uuid not null references public.clinicas(id) on delete cascade,
  consulta_id uuid not null references public.consultas(id) on delete cascade,
  rotulo_id   uuid not null references public.agenda_rotulos(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (consulta_id, rotulo_id)
);

create index if not exists consulta_rotulos_rotulo on public.consulta_rotulos (rotulo_id);
create index if not exists consulta_rotulos_clinica on public.consulta_rotulos (clinica_id);

alter table public.consulta_rotulos enable row level security;
alter table public.consulta_rotulos force row level security;
drop policy if exists consulta_rotulos_tenant on public.consulta_rotulos;
create policy consulta_rotulos_tenant on public.consulta_rotulos
  for all to authenticated
  using (clinica_id = public.current_clinica_id())
  with check (clinica_id = public.current_clinica_id());
revoke all on public.consulta_rotulos from anon;

-- O clinica_id da junção tem que ser o MESMO da consulta. Sem isso, um insert
-- forjado com o clinica_id próprio apontando para consulta_id alheio passaria
-- na policy e vazaria a existência do agendamento de outra clínica.
create or replace function public.consulta_rotulo_coerencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_clinica_consulta uuid; v_clinica_rotulo uuid;
begin
  select clinica_id into v_clinica_consulta from public.consultas   where id = new.consulta_id;
  select clinica_id into v_clinica_rotulo   from public.agenda_rotulos where id = new.rotulo_id;

  if v_clinica_consulta is null or v_clinica_rotulo is null then
    raise exception 'Consulta ou rótulo inexistente.';
  end if;
  if v_clinica_consulta is distinct from v_clinica_rotulo then
    raise exception 'Rótulo pertence a outra clínica.';
  end if;

  new.clinica_id := v_clinica_consulta;
  return new;
end $$;

drop trigger if exists trg_consulta_rotulo_coerencia on public.consulta_rotulos;
create trigger trg_consulta_rotulo_coerencia
  before insert or update on public.consulta_rotulos
  for each row execute function public.consulta_rotulo_coerencia();

-- ---------------------------------------------------------------------------
-- 3. Rótulos padrão — clínica nova já nasce utilizável
-- ---------------------------------------------------------------------------
create or replace function public.semear_rotulos_agenda(p_clinica_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.agenda_rotulos (clinica_id, nome, cor, ordem)
  values
    (p_clinica_id, 'Primeira consulta', '#0ea5e9', 1),
    (p_clinica_id, 'Retorno',           '#8b5cf6', 2),
    (p_clinica_id, 'Urgência',          '#ef4444', 3),
    (p_clinica_id, 'Manutenção',        '#14b8a6', 4),
    (p_clinica_id, 'Documentação',      '#f59e0b', 5),
    (p_clinica_id, 'Cortesia',          '#64748b', 6)
  on conflict do nothing;
end $$;

revoke all on function public.semear_rotulos_agenda(uuid) from anon, public;
grant execute on function public.semear_rotulos_agenda(uuid) to authenticated;

-- clínicas que já existem também recebem
do $$
declare c record;
begin
  for c in select id from public.clinicas loop
    perform public.semear_rotulos_agenda(c.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Venda nasce na agenda
-- ---------------------------------------------------------------------------
alter table public.consultas
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null;

create index if not exists consultas_orcamento on public.consultas (orcamento_id)
  where orcamento_id is not null;

comment on column public.consultas.orcamento_id is
  'Orçamento gerado/executado a partir deste atendimento. É o elo que faz a venda nascer na agenda.';

-- Lança os procedimentos executados no atendimento como orçamento do paciente.
-- Reaproveita o orçamento já vinculado se houver (lançar duas vezes no mesmo
-- atendimento acrescenta itens em vez de criar orçamento duplicado).
create or replace function public.consulta_lancar_venda(
  p_consulta_id uuid,
  p_itens jsonb           -- [{procedimento_id, dente, faces[], quantidade, valor_unitario, desconto}]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_consulta   public.consultas%rowtype;
  v_clinica    uuid := public.current_clinica_id();
  v_orcamento  uuid;
  v_item       jsonb;
  v_valor      numeric;
begin
  if v_clinica is null then
    raise exception 'Sem clínica no contexto.';
  end if;

  select * into v_consulta from public.consultas where id = p_consulta_id;
  if not found or v_consulta.clinica_id is distinct from v_clinica then
    raise exception 'Atendimento não encontrado nesta clínica.';
  end if;
  if v_consulta.tipo <> 'consulta' or v_consulta.paciente_id is null then
    raise exception 'Compromisso interno não gera venda.';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um procedimento.';
  end if;

  v_orcamento := v_consulta.orcamento_id;

  if v_orcamento is null then
    insert into public.orcamentos (clinica_id, paciente_id, titulo, status)
    values (v_clinica, v_consulta.paciente_id,
            'Atendimento de ' || to_char(v_consulta.inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
            'aberto')
    returning id into v_orcamento;

    update public.consultas set orcamento_id = v_orcamento where id = p_consulta_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    -- valor do procedimento vem do cadastro quando não for informado, para a
    -- recepção não precisar digitar preço (e não errar).
    v_valor := nullif(v_item->>'valor_unitario', '')::numeric;
    if v_valor is null then
      select valor into v_valor from public.procedimentos
       where id = (v_item->>'procedimento_id')::uuid and clinica_id = v_clinica;
    end if;

    insert into public.orcamento_itens (
      clinica_id, orcamento_id, procedimento_id, dente, faces,
      quantidade, valor_unitario, desconto, status
    ) values (
      v_clinica, v_orcamento,
      (v_item->>'procedimento_id')::uuid,
      nullif(v_item->>'dente','')::int,
      -- `faces` é NOT NULL default '{}': procedimento que não é por face
      -- (extração, profilaxia) precisa de array vazio, nunca NULL.
      coalesce(
        (select array_agg(x::public.face_dental)
           from jsonb_array_elements_text(coalesce(v_item->'faces', '[]'::jsonb)) x),
        '{}'::public.face_dental[]
      ),
      coalesce(nullif(v_item->>'quantidade','')::numeric, 1),
      coalesce(v_valor, 0),
      coalesce(nullif(v_item->>'desconto','')::numeric, 0),
      'aprovado'   -- foi executado no atendimento: já nasce aprovado
    );
  end loop;

  return v_orcamento;
end $$;

revoke all on function public.consulta_lancar_venda(uuid, jsonb) from anon, public;
grant execute on function public.consulta_lancar_venda(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Visão da agenda já com rótulos e situação financeira
-- ---------------------------------------------------------------------------
create or replace view public.vw_agenda_dia
with (security_invoker = on) as
select
  c.id, c.clinica_id, c.tipo, c.inicio, c.fim, c.status, c.modalidade,
  c.titulo, c.observacoes, c.cadeira_id, c.profissional_id, c.paciente_id,
  c.orcamento_id, c.servico_id,
  p.nome_completo  as paciente_nome,
  p.celular        as paciente_celular,
  pr.full_name     as profissional_nome,
  s.nome           as procedimento_nome,
  s.cor            as procedimento_cor,
  cad.nome         as cadeira_nome,
  cad.cor          as cadeira_cor,
  o.total_aprovado as venda_total,
  coalesce(
    (select jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'cor', r.cor) order by r.ordem)
       from public.consulta_rotulos cr
       join public.agenda_rotulos r on r.id = cr.rotulo_id
      where cr.consulta_id = c.id),
    '[]'::jsonb
  ) as rotulos
from public.consultas c
left join public.pacientes     p   on p.id   = c.paciente_id
left join public.profiles      pr  on pr.id  = c.profissional_id
left join public.procedimentos s   on s.id   = c.servico_id
left join public.cadeiras      cad on cad.id = c.cadeira_id
left join public.orcamentos    o   on o.id   = c.orcamento_id;

revoke all on public.vw_agenda_dia from anon;
grant select on public.vw_agenda_dia to authenticated;

-- Trigger function não precisa ser chamável por ninguém: o trigger executa com
-- o dono da tabela. Deixá-la em `public` a expunha ao anon — pego pela própria
-- auditoria_saude() logo após o primeiro apply.
revoke all on function public.consulta_rotulo_coerencia() from anon, public;
