-- ============================================================================
-- 0027 — Integração Asaas (pagamentos): cobrança de paciente + assinatura SaaS
-- ----------------------------------------------------------------------------
-- Dois fluxos, um PSP:
--
--  A. COBRANÇA DE PACIENTE — Pix/boleto sobre uma parcela a receber. Usa a chave
--     Asaas DA CLÍNICA (o dinheiro é dela). Webhook PAYMENT_RECEIVED → baixa
--     automática da parcela. É o "Cobrança Invisível" do docs/VISAO-INOVACAO.
--
--  B. ASSINATURA DO SAAS — planos R$97/197/297. Usa a chave Asaas DA SORRIMAX
--     (env global no edge, o dinheiro vem pra nós). Webhook atualiza o status;
--     inadimplência trava o acesso. Fecha o crítico nº1 da superauditoria.
--
-- Segurança: a chave da clínica é digitada pela própria clínica na UI (nunca
-- pelo código). RLS tenant isola tudo; a baixa roda por RPC DEFINER idempotente.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type public.asaas_ambiente as enum ('sandbox', 'production');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.asaas_billing as enum ('PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plano_saas as enum ('trial', 'essencial', 'profissional', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.assinatura_status as enum ('trial', 'ativa', 'atrasada', 'cancelada');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- conexão da clínica
-- Uma conexão Asaas por clínica. A api_key é da clínica (o dinheiro das cobranças
-- de paciente cai na conta dela). webhook_token valida os eventos que chegam.
create table if not exists public.clinica_integracao_asaas (
  clinica_id      uuid primary key references public.clinicas(id) on delete cascade,
  api_key         text not null,
  ambiente        public.asaas_ambiente not null default 'sandbox',
  -- token único por clínica; o webhook resolve a clínica e confere este valor
  webhook_token   text not null default encode(gen_random_bytes(24), 'hex'),
  asaas_wallet_id text,
  conectado       boolean not null default false,
  ultima_erro     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint clinica_integracao_asaas_token_unico unique (webhook_token)
);

-- ---------------------------------------------------------------- cobranças (fluxo A)
create table if not exists public.asaas_cobrancas (
  id                 uuid primary key default gen_random_uuid(),
  clinica_id         uuid not null references public.clinicas(id) on delete cascade,
  parcela_id         uuid not null references public.lancamento_parcelas(id) on delete cascade,
  asaas_payment_id   text not null,
  asaas_customer_id  text,
  billing_type       public.asaas_billing not null,
  status             text not null default 'PENDING',
  valor              numeric(12,2) not null,
  invoice_url        text,
  bank_slip_url      text,
  pix_payload        text,   -- copia-e-cola
  pix_qr_image       text,   -- base64 do QR
  due_date           date,
  pago_em            date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- uma cobrança Asaas viva por parcela (recobrar substitui via upsert)
  constraint asaas_cobrancas_parcela_unico unique (parcela_id),
  constraint asaas_cobrancas_payment_unico unique (asaas_payment_id)
);
create index if not exists idx_asaas_cobrancas_clinica on public.asaas_cobrancas (clinica_id, created_at desc);
create index if not exists idx_asaas_cobrancas_parcela on public.asaas_cobrancas (parcela_id);

-- ---------------------------------------------------------------- assinatura SaaS (fluxo B)
create table if not exists public.asaas_assinaturas (
  clinica_id           uuid primary key references public.clinicas(id) on delete cascade,
  asaas_subscription_id text,
  asaas_customer_id     text,
  plano                 public.plano_saas not null default 'trial',
  valor                 numeric(12,2),
  status                public.assinatura_status not null default 'trial',
  proximo_vencimento    date,
  trial_termina_em      date not null default (current_date + 7),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- coluna espelho na clínica p/ gating rápido (sem join no caminho quente)
alter table public.clinicas
  add column if not exists plano public.plano_saas not null default 'trial',
  add column if not exists assinatura_status public.assinatura_status not null default 'trial';

-- ---------------------------------------------------------------- log idempotente de webhook
create table if not exists public.asaas_webhook_eventos (
  id                 uuid primary key default gen_random_uuid(),
  asaas_event_id     text unique,          -- dedup: Asaas reentrega
  event              text not null,
  asaas_payment_id   text,
  external_reference text,
  payload            jsonb not null,
  processado_em      timestamptz,
  erro               text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_asaas_webhook_pending on public.asaas_webhook_eventos (created_at)
  where processado_em is null;

-- ---------------------------------------------------------------- RLS
-- Tenant padrão nas tabelas de dados. A conexão (com a api_key) é mais restrita:
-- leitura/escrita só admin da própria clínica.
select public.apply_tenant_rls('asaas_cobrancas');
select public.apply_tenant_rls('asaas_assinaturas');

alter table public.clinica_integracao_asaas enable row level security;
drop policy if exists clinica_integracao_asaas_admin on public.clinica_integracao_asaas;
create policy clinica_integracao_asaas_admin on public.clinica_integracao_asaas
  for all to authenticated
  using (clinica_id = public.current_clinica_id() and public.is_admin())
  with check (clinica_id = public.current_clinica_id() and public.is_admin());

drop trigger if exists trg_clinica_integracao_asaas_touch on public.clinica_integracao_asaas;
create trigger trg_clinica_integracao_asaas_touch before update on public.clinica_integracao_asaas
  for each row execute function public.touch_updated_at();

-- webhook_eventos: só o service role do edge escreve/lê. Policy que NEGA
-- authenticated explicitamente (using false) — intenção auto-documentada e
-- passa a auditoria (que trata "RLS on sem policy" como erro de esquecimento).
alter table public.asaas_webhook_eventos enable row level security;
drop policy if exists asaas_webhook_eventos_service_only on public.asaas_webhook_eventos;
create policy asaas_webhook_eventos_service_only on public.asaas_webhook_eventos
  for all to authenticated using (false) with check (false);

-- ---------------------------------------------------------------- baixa automática (RPC)
-- Chamada pelo edge (service role) ao receber PAYMENT_RECEIVED/CONFIRMED. Acha a
-- parcela pelo externalReference (= parcela_id) e dá baixa — idempotente: se já
-- está paga, não faz nada e não duplica. Toda a lógica de dinheiro num lugar só.
create or replace function public.asaas_baixar_cobranca(
  p_external_reference text,
  p_asaas_payment_id   text,
  p_valor              numeric,
  p_pago_em            date,
  p_billing_type       text
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_parcela lancamento_parcelas%rowtype;
  v_forma forma_pagamento;
begin
  select * into v_parcela from lancamento_parcelas
   where id = p_external_reference::uuid;
  if not found then
    return 'parcela_inexistente';
  end if;

  -- idempotência: webhook reentregue não dá baixa de novo
  if v_parcela.status = 'pago' then
    update asaas_cobrancas
       set status = 'RECEIVED', pago_em = p_pago_em, updated_at = now()
     where parcela_id = v_parcela.id;
    return 'ja_pago';
  end if;

  v_forma := case upper(p_billing_type)
               when 'PIX' then 'pix'
               when 'BOLETO' then 'boleto'
               when 'CREDIT_CARD' then 'credito'
               else 'pix'
             end::forma_pagamento;

  -- mesma escrita do baixarParcela do app (dispara o trigger de comissão)
  update lancamento_parcelas
     set status = 'pago',
         pago_em = p_pago_em,
         valor_pago = coalesce(p_valor, valor),
         forma_pagamento = v_forma,
         updated_at = now()
   where id = v_parcela.id;

  update asaas_cobrancas
     set status = 'RECEIVED', pago_em = p_pago_em, updated_at = now()
   where parcela_id = v_parcela.id;

  return 'baixado';
end $$;

revoke all on function public.asaas_baixar_cobranca(text, text, numeric, date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- resolver clínica do webhook
-- O edge não tem contexto de tenant; esta função devolve a clínica dona de um
-- externalReference (parcela → clínica) e o webhook_token esperado, para o edge
-- validar o header sem furar RLS.
create or replace function public.asaas_clinica_de_referencia(p_external_reference text)
returns table (clinica_id uuid, webhook_token text)
language sql
security definer
set search_path to 'public'
as $$
  select p.clinica_id, i.webhook_token
    from lancamento_parcelas p
    join clinica_integracao_asaas i on i.clinica_id = p.clinica_id
   where p.id = p_external_reference::uuid
$$;

revoke all on function public.asaas_clinica_de_referencia(text) from public, anon, authenticated;

-- semeia a linha de assinatura (trial) para clínicas que já existem
insert into public.asaas_assinaturas (clinica_id)
  select id from public.clinicas
  on conflict (clinica_id) do nothing;

commit;
