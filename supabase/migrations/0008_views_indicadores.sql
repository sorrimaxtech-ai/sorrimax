-- ============================================================================
-- VITTALHUB · 0008 · Views de indicadores
-- ----------------------------------------------------------------------------
-- ⚠️ TODAS com `security_invoker = on`. View comum no Postgres roda com os
-- privilégios do OWNER, o que IGNORA o RLS das tabelas de base — seria um
-- vazamento entre clínicas pela porta dos fundos. Exige PG15+ (Supabase ok).
-- ============================================================================

begin;

-- ============================================================================
-- KPIs do dashboard (espelham os 3 cards do benchmark, que medem DINHEIRO
-- PARADO em vez de volume de atendimento)
-- ============================================================================
create or replace view public.vw_dashboard_kpis
with (security_invoker = on) as
select
  c.id as clinica_id,
  -- 1. débitos em atraso
  coalesce((
    select sum(p.valor) from public.lancamento_parcelas p
     where p.clinica_id = c.id and p.status in ('pendente','atrasado')
       and p.vencimento < current_date
  ), 0) as debitos_em_atraso,
  -- 2. orçamentos em aberto + reprovados (receita não capturada)
  coalesce((
    select sum(o.total_itens) from public.orcamentos o
     where o.clinica_id = c.id and o.status in ('aberto','aprovado_parcial','reprovado')
  ), 0) as orcamentos_nao_fechados,
  -- 3. aniversariantes nos próximos 30 dias
  (
    select count(*) from public.pacientes pa
     where pa.clinica_id = c.id and pa.ativo
       and to_char(pa.data_nascimento, 'MM-DD') between
           to_char(current_date, 'MM-DD') and to_char(current_date + 30, 'MM-DD')
  ) as aniversariantes_30d,
  -- 4. a receber no mês corrente
  coalesce((
    select sum(p.valor) from public.lancamento_parcelas p
     where p.clinica_id = c.id and p.status = 'pendente'
       and date_trunc('month', p.vencimento) = date_trunc('month', current_date)
  ), 0) as a_receber_mes,
  -- 5. recebido no mês corrente (líquido de taxa)
  coalesce((
    select sum(p.valor_liquido) from public.lancamento_parcelas p
     where p.clinica_id = c.id and p.status = 'pago'
       and date_trunc('month', p.pago_em) = date_trunc('month', current_date)
  ), 0) as recebido_mes
from public.clinicas c;

-- ============================================================================
-- 🏆 FUNIL COMPLETO — lead → paciente → orçamento → tratamento → recebido
-- ----------------------------------------------------------------------------
-- A pergunta que nem o VitalHub nem o Simples Dental conseguem responder,
-- porque cada um só tem metade do funil.
-- ============================================================================
create or replace view public.vw_funil_completo
with (security_invoker = on) as
with base as (
  select
    p.clinica_id,
    date_trunc('month', p.created_at) as mes,
    p.id            as paciente_id,
    p.origem,
    p.lead_id,
    (select count(*) from public.orcamentos o where o.paciente_id = p.id)          as qtd_orcamentos,
    (select coalesce(sum(o.total_itens), 0) from public.orcamentos o
      where o.paciente_id = p.id)                                                  as valor_orcado,
    (select coalesce(sum(o.total_aprovado), 0) from public.orcamentos o
      where o.paciente_id = p.id and o.status in ('aprovado','aprovado_parcial'))  as valor_aprovado,
    (select coalesce(sum(pa.valor_liquido), 0)
       from public.lancamento_parcelas pa
       join public.lancamentos l on l.id = pa.lancamento_id
      where l.paciente_id = p.id and pa.status = 'pago')                           as valor_recebido,
    (select count(*) from public.odontograma_registros r
      where r.paciente_id = p.id and r.estado = 'finalizado')                      as procedimentos_concluidos
  from public.pacientes p
)
select
  clinica_id,
  mes,
  origem,
  count(*)                                          as pacientes,
  count(*) filter (where lead_id is not null)       as vindos_do_crm,
  count(*) filter (where qtd_orcamentos > 0)        as com_orcamento,
  count(*) filter (where valor_aprovado > 0)        as com_orcamento_aprovado,
  count(*) filter (where procedimentos_concluidos > 0) as com_tratamento_concluido,
  sum(valor_orcado)                                 as valor_orcado,
  sum(valor_aprovado)                               as valor_aprovado,
  sum(valor_recebido)                               as valor_recebido,
  -- taxa de conversão do orçamento (o número que define a saúde comercial)
  round(
    100.0 * nullif(sum(valor_aprovado), 0) / nullif(sum(valor_orcado), 0), 2
  )                                                 as taxa_aprovacao_pct,
  -- quanto do aprovado virou dinheiro no caixa
  round(
    100.0 * nullif(sum(valor_recebido), 0) / nullif(sum(valor_aprovado), 0), 2
  )                                                 as taxa_recebimento_pct
from base
group by clinica_id, mes, origem;

-- ============================================================================
-- Faturamento por procedimento / especialidade
-- ============================================================================
create or replace view public.vw_faturamento_procedimento
with (security_invoker = on) as
select
  oi.clinica_id,
  date_trunc('month', o.aprovado_em) as mes,
  pr.id            as procedimento_id,
  pr.nome          as procedimento,
  pr.especialidade,
  count(*)         as qtd,
  sum(oi.total)    as valor_aprovado,
  avg(oi.total)    as ticket_medio
from public.orcamento_itens oi
join public.orcamentos    o  on o.id  = oi.orcamento_id
join public.procedimentos pr on pr.id = oi.procedimento_id
where oi.status = 'aprovado' and o.aprovado_em is not null
group by oi.clinica_id, date_trunc('month', o.aprovado_em), pr.id, pr.nome, pr.especialidade;

-- ============================================================================
-- Ocupação de agenda por profissional e por cadeira
-- ============================================================================
create or replace view public.vw_ocupacao_agenda
with (security_invoker = on) as
select
  k.clinica_id,
  date_trunc('month', k.inicio) as mes,
  k.profissional_id,
  k.cadeira_id,
  count(*)                                                   as total_consultas,
  count(*) filter (where k.status = 'concluido')             as concluidas,
  count(*) filter (where k.status = 'nao_compareceu')        as no_show,
  count(*) filter (where k.status in ('cancelado','cancelado_pelo_cliente')) as canceladas,
  round(100.0 * count(*) filter (where k.status = 'nao_compareceu')
        / nullif(count(*), 0), 2)                            as taxa_no_show_pct,
  sum(extract(epoch from (k.fim - k.inicio)) / 3600.0)       as horas_agendadas
from public.consultas k
group by k.clinica_id, date_trunc('month', k.inicio), k.profissional_id, k.cadeira_id;

-- ============================================================================
-- Pacientes inativos — motor do "alerta de retorno" (feature do plano top deles)
-- ============================================================================
create or replace view public.vw_pacientes_inativos
with (security_invoker = on) as
select
  p.clinica_id,
  p.id           as paciente_id,
  p.nome_completo,
  p.celular,
  max(k.inicio)  as ultima_consulta,
  (current_date - max(k.inicio)::date)                       as dias_sem_vir,
  coalesce((
    select sum(o.total_itens) from public.orcamentos o
     where o.paciente_id = p.id and o.status in ('aberto','aprovado_parcial')
  ), 0)                                                      as valor_em_aberto,
  exists (
    select 1 from public.odontograma_registros r
     where r.paciente_id = p.id and r.estado in ('planejado','em_execucao')
  )                                                          as tem_tratamento_pendente
from public.pacientes p
left join public.consultas k
       on k.paciente_id = p.id and k.status = 'concluido'
where p.ativo
group by p.clinica_id, p.id, p.nome_completo, p.celular
having max(k.inicio) is null or max(k.inicio) < now() - interval '6 months';

-- ============================================================================
-- Comissões por profissional
-- ============================================================================
create or replace view public.vw_comissoes_profissional
with (security_invoker = on) as
select
  cm.clinica_id,
  cm.profissional_id,
  pf.full_name as profissional,
  date_trunc('month', cm.created_at) as mes,
  count(*)                                                as qtd,
  sum(cm.valor)                                           as total,
  sum(cm.valor) filter (where cm.status = 'prevista')     as prevista,
  sum(cm.valor) filter (where cm.status = 'liberada')     as liberada,
  sum(cm.valor) filter (where cm.status = 'paga')         as paga
from public.comissoes cm
join public.profiles pf on pf.id = cm.profissional_id
group by cm.clinica_id, cm.profissional_id, pf.full_name, date_trunc('month', cm.created_at);

-- ============================================================================
-- Fluxo de caixa mensal (realizado + previsto)
-- ============================================================================
create or replace view public.vw_fluxo_caixa_mensal
with (security_invoker = on) as
select
  pa.clinica_id,
  date_trunc('month', pa.vencimento) as mes,
  l.tipo,
  sum(pa.valor)                                          as previsto,
  sum(pa.valor)      filter (where pa.status = 'pago')   as realizado,
  sum(pa.valor_liquido) filter (where pa.status = 'pago') as liquido,
  sum(pa.taxa_valor) filter (where pa.status = 'pago')   as taxas,
  sum(pa.valor)      filter (where pa.status in ('pendente','atrasado')) as em_aberto
from public.lancamento_parcelas pa
join public.lancamentos l on l.id = pa.lancamento_id
group by pa.clinica_id, date_trunc('month', pa.vencimento), l.tipo;

commit;

-- ============================================================================
-- Verificação obrigatória — nenhuma view pode ignorar RLS
--   select c.relname, c.reloptions
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'v';
--   -- toda linha precisa conter security_invoker=on
-- ============================================================================
