-- ============================================================================
-- 0036 — Endereço da clínica (coletado no onboarding via CEP)
-- ----------------------------------------------------------------------------
-- A Clara pergunta o CEP e preenche o endereço (busca ViaCEP). `clinicas` não
-- tinha essas colunas — o wizard antigo até tentava gravá-las (bug latente que
-- teria quebrado o "Finalizar"). Aqui elas passam a existir.
-- ============================================================================

begin;
alter table public.clinicas
  add column if not exists cep         text,
  add column if not exists endereco    text,
  add column if not exists numero      text,
  add column if not exists complemento text,
  add column if not exists bairro      text,
  add column if not exists cidade      text,
  add column if not exists estado      text;
commit;
