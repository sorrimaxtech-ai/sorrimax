-- ============================================================================
-- 0035 — Segmentação da clínica (respostas do onboarding conversacional)
-- ----------------------------------------------------------------------------
-- O onboarding com a Clara (orbe) coleta perguntas de segmentação — função de
-- quem cadastrou, como a clínica se organiza hoje, dores a resolver, nº de
-- cadeiras. Guardamos como jsonb na própria clínica (é dado dela, 1:1), pra
-- usar em ativação/marketing sem inventar tabela nova.
-- ============================================================================

begin;
alter table public.clinicas add column if not exists segmentacao jsonb not null default '{}'::jsonb;
commit;
