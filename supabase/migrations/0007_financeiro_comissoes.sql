-- ============================================================================
-- SORRIMAX · 0007 · Financeiro, parcelamento e comissões
-- ----------------------------------------------------------------------------
-- Fecha o loop: orçamento aprovado → débitos parcelados → recebimento →
-- comissão do profissional. Inclui taxa de cartão para calcular RECEBÍVEL
-- LÍQUIDO (o que a clínica de fato recebe), não só o valor bruto.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.tipo_lancamento as enum ('receber', 'pagar');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_parcela as enum (
    'pendente', 'pago', 'atrasado', 'cancelado', 'estornado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.forma_pagamento as enum (
    'dinheiro', 'pix', 'debito', 'credito', 'boleto',
    'transferencia', 'cheque', 'convenio', 'financiamento', 'cortesia'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_conta_financeira as enum ('caixa', 'banco', 'carteira_digital');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- cadastros de apoio
-- ============================================================================
create table if not exists public.contas_financeiras (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references public.clinicas(id) on delete cascade,
  nome        text not null,
  tipo        public.tipo_conta_financeira not null default 'caixa',
  banco       text,
  agencia     text,
  numero      text,
  saldo_inicial numeric(12,2) not null default 0,
  principal   boolean not null default false,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (clinica_id, nome)
);

create table if not exists public.categorias_financeiras (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references public.clinicas(id) on delete cascade,
  nome        text not null,
  tipo        public.tipo_lancamento not null,
  cor         text check (cor is null or cor ~ '^#[0-9A-Fa-f]{6}$'),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (clinica_id, nome, tipo)
);

-- Taxa por bandeira e faixa de parcelamento → recebível líquido e prazo real.
create table if not exists public.taxas_cartao (
  id             uuid primary key default gen_random_uuid(),
  clinica_id     uuid not null references public.clinicas(id) on delete cascade,
  adquirente     text not null,                    -- Asaas, Cielo, Stone, Saúde Service...
  bandeira       text,                             -- null = todas
  parcelas_de    smallint not null default 1 check (parcelas_de >= 1),
  parcelas_ate   smallint not null default 1 check (parcelas_ate >= 1),
  percentual     numeric(5,2) not null default 0 check (percentual >= 0),
  valor_fixo     numeric(12,2) not null default 0 check (valor_fixo >= 0),
  prazo_dias     smallint not null default 30 check (prazo_dias >= 0),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint faixa_parcelas_valida check (parcelas_ate >= parcelas_de)
);

create index if not exists idx_taxas_cartao_faixa
  on public.taxas_cartao(clinica_id, adquirente, parcelas_de, parcelas_ate) where ativo;

-- ============================================================================
-- lancamentos + parcelas
-- ============================================================================
create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  tipo            public.tipo_lancamento not null,

  descricao       text not null,
  categoria_id    uuid references public.categorias_financeiras(id) on delete set null,
  conta_id        uuid references public.contas_financeiras(id)     on delete set null,

  -- vínculos opcionais: receita "sem vínculo" (aluguel, venda de produto) é
  -- caso de uso explícito do benchmark e não exige paciente.
  paciente_id     uuid references public.pacientes(id)  on delete set null,
  orcamento_id    uuid references public.orcamentos(id) on delete set null,
  consulta_id     uuid references public.consultas(id)  on delete set null,
  profissional_id uuid references public.profiles(id)   on delete set null,

  valor_total     numeric(12,2) not null check (valor_total >= 0),
  forma_pagamento public.forma_pagamento,
  qtd_parcelas    smallint not null default 1 check (qtd_parcelas between 1 and 120),
  observacoes     text,

  criado_por      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_lancamentos_clinica  on public.lancamentos(clinica_id, tipo, created_at desc);
create index if not exists idx_lancamentos_paciente on public.lancamentos(paciente_id);
create index if not exists idx_lancamentos_orcamento on public.lancamentos(orcamento_id);

create table if not exists public.lancamento_parcelas (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  lancamento_id   uuid not null references public.lancamentos(id) on delete cascade,

  numero          smallint not null check (numero >= 1),
  valor           numeric(12,2) not null check (valor >= 0),
  vencimento      date not null,

  status          public.status_parcela not null default 'pendente',
  pago_em         date,
  valor_pago      numeric(12,2) check (valor_pago >= 0),
  forma_pagamento public.forma_pagamento,
  conta_id        uuid references public.contas_financeiras(id) on delete set null,

  -- líquido após taxa de cartão/gateway
  taxa_valor      numeric(12,2) not null default 0 check (taxa_valor >= 0),
  valor_liquido   numeric(12,2) generated always as
                    (coalesce(valor_pago, valor) - taxa_valor) stored,
  previsao_credito date,

  -- integração com gateway (Asaas e afins)
  gateway_id      text,
  gateway_status  text,
  link_pagamento  text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (lancamento_id, numero)
);

create index if not exists idx_parcelas_vencimento on public.lancamento_parcelas(clinica_id, vencimento);
create index if not exists idx_parcelas_status     on public.lancamento_parcelas(clinica_id, status);
-- KPI "débitos em atraso" (o 1º card do dashboard do benchmark)
create index if not exists idx_parcelas_atrasadas
  on public.lancamento_parcelas(clinica_id, vencimento)
  where status in ('pendente', 'atrasado');
create index if not exists idx_parcelas_gateway on public.lancamento_parcelas(gateway_id);

-- Marca atraso automaticamente na leitura do dia (chamar via cron diário).
create or replace function public.marcar_parcelas_atrasadas()
returns integer
language sql
security definer
set search_path = public
as $$
  with atualizadas as (
    update public.lancamento_parcelas
       set status = 'atrasado', updated_at = now()
     where status = 'pendente' and vencimento < current_date
     returning 1
  )
  select count(*)::int from atualizadas
$$;

-- ---------------------------------------------------------------- despesas fixas
create table if not exists public.despesas_fixas (
  id             uuid primary key default gen_random_uuid(),
  clinica_id     uuid not null references public.clinicas(id) on delete cascade,
  descricao      text not null,
  valor          numeric(12,2) not null check (valor >= 0),
  dia_vencimento smallint not null check (dia_vencimento between 1 and 31),
  categoria_id   uuid references public.categorias_financeiras(id) on delete set null,
  conta_id       uuid references public.contas_financeiras(id)     on delete set null,
  inicio         date not null default current_date,
  fim            date,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================================
-- comissões
-- ----------------------------------------------------------------------------
-- Em clínica odontológica o dentista costuma receber % do procedimento.
-- A comissão nasce do item de orçamento aprovado e só é liberada quando a
-- parcela correspondente é efetivamente recebida.
-- ============================================================================
create table if not exists public.comissoes (
  id                uuid primary key default gen_random_uuid(),
  clinica_id        uuid not null references public.clinicas(id) on delete cascade,
  profissional_id   uuid not null references public.profiles(id) on delete restrict,
  orcamento_item_id uuid references public.orcamento_itens(id) on delete set null,
  parcela_id        uuid references public.lancamento_parcelas(id) on delete set null,
  procedimento_id   uuid references public.procedimentos(id) on delete set null,

  base_calculo      numeric(12,2) not null check (base_calculo >= 0),
  percentual        numeric(5,2)  check (percentual between 0 and 100),
  valor             numeric(12,2) not null check (valor >= 0),

  -- 'prevista' vira 'liberada' quando a parcela é paga
  status            text not null default 'prevista'
                    check (status in ('prevista', 'liberada', 'paga', 'cancelada')),
  liberada_em       timestamptz,
  paga_em           timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_comissoes_prof
  on public.comissoes(clinica_id, profissional_id, status);

-- Parcela paga → libera as comissões vinculadas.
create or replace function public.parcela_liberar_comissoes()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'pago' and old.status is distinct from 'pago' then
    update public.comissoes
       set status = 'liberada', liberada_em = now(), updated_at = now()
     where parcela_id = new.id and status = 'prevista';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parcela_comissao on public.lancamento_parcelas;
create trigger trg_parcela_comissao
  after update on public.lancamento_parcelas
  for each row execute function public.parcela_liberar_comissoes();

-- ============================================================================
-- gerar_debitos_orcamento() — orçamento aprovado vira dinheiro a receber
-- ----------------------------------------------------------------------------
-- Chamada explícita (não trigger) porque a clínica decide forma de pagamento
-- e nº de parcelas no ato do fechamento.
-- ============================================================================
create or replace function public.gerar_debitos_orcamento(
  p_orcamento_id    uuid,
  p_forma           public.forma_pagamento,
  p_qtd_parcelas    smallint default 1,
  p_primeiro_venc   date default current_date,
  p_conta_id        uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orc         record;
  v_lancamento  uuid;
  v_valor_parc  numeric(12,2);
  v_resto       numeric(12,2);
  i             smallint;
begin
  select * into v_orc from public.orcamentos where id = p_orcamento_id;
  if not found then
    raise exception 'Orçamento % não encontrado', p_orcamento_id;
  end if;
  if v_orc.clinica_id <> public.current_clinica_id() then
    raise exception 'Orçamento de outra clínica';
  end if;
  if v_orc.status not in ('aprovado', 'aprovado_parcial') then
    raise exception 'Orçamento precisa estar aprovado (status atual: %)', v_orc.status;
  end if;
  if v_orc.total_aprovado <= 0 then
    raise exception 'Orçamento sem valor aprovado';
  end if;
  if exists (select 1 from public.lancamentos where orcamento_id = p_orcamento_id) then
    raise exception 'Este orçamento já gerou lançamento financeiro';
  end if;

  insert into public.lancamentos (
    clinica_id, tipo, descricao, paciente_id, orcamento_id, profissional_id,
    valor_total, forma_pagamento, qtd_parcelas, conta_id, criado_por
  ) values (
    v_orc.clinica_id, 'receber',
    'Orçamento #' || v_orc.numero, v_orc.paciente_id, v_orc.id, v_orc.profissional_id,
    v_orc.total_aprovado, p_forma, greatest(p_qtd_parcelas, 1), p_conta_id, auth.uid()
  ) returning id into v_lancamento;

  -- divide em parcelas; a diferença de arredondamento vai na primeira
  v_valor_parc := round(v_orc.total_aprovado / greatest(p_qtd_parcelas, 1), 2);
  v_resto      := v_orc.total_aprovado - (v_valor_parc * greatest(p_qtd_parcelas, 1));

  for i in 1..greatest(p_qtd_parcelas, 1) loop
    insert into public.lancamento_parcelas (
      clinica_id, lancamento_id, numero, valor, vencimento, conta_id, forma_pagamento
    ) values (
      v_orc.clinica_id, v_lancamento, i,
      v_valor_parc + case when i = 1 then v_resto else 0 end,
      (p_primeiro_venc + ((i - 1) || ' month')::interval)::date,
      p_conta_id, p_forma
    );
  end loop;

  -- comissões previstas a partir dos itens aprovados
  insert into public.comissoes (
    clinica_id, profissional_id, orcamento_item_id, procedimento_id,
    base_calculo, percentual, valor
  )
  select v_orc.clinica_id,
         coalesce(v_orc.profissional_id, auth.uid()),
         oi.id, oi.procedimento_id,
         oi.total,
         pp.comissao_percentual,
         coalesce(pp.comissao_valor, round(oi.total * coalesce(pp.comissao_percentual, 0) / 100, 2))
    from public.orcamento_itens oi
    left join public.procedimento_precos pp
           on pp.procedimento_id = oi.procedimento_id
          and pp.convenio_id     = v_orc.convenio_id
   where oi.orcamento_id = p_orcamento_id
     and oi.status = 'aprovado'
     and coalesce(pp.comissao_percentual, pp.comissao_valor, 0) > 0;

  return v_lancamento;
end;
$$;

grant execute on function public.gerar_debitos_orcamento(uuid, public.forma_pagamento, smallint, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------- RLS
select public.apply_tenant_rls('contas_financeiras');
select public.apply_tenant_rls('categorias_financeiras');
select public.apply_tenant_rls('taxas_cartao');
select public.apply_tenant_rls('lancamentos');
select public.apply_tenant_rls('lancamento_parcelas');
select public.apply_tenant_rls('despesas_fixas');
select public.apply_tenant_rls('comissoes');

commit;
