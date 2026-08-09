-- ============================================================================
-- VITTALHUB · 0012 · Hardening das funções (corrige o bug do cadastro)
-- ----------------------------------------------------------------------------
-- BUG REPORTADO: ao criar conta, o toast mostra
--   "new row violates row-level security policy for table pipeline_stages"
--
-- CAUSA: o INSERT em `clinicas` dispara triggers AFTER INSERT que semeiam
-- dados padrão (pipeline do CRM, config de pagamento, assinatura trial).
-- `create_default_pipeline_stages` era SECURITY **INVOKER**: rodava com os
-- privilégios de quem inseriu. No cadastro ainda não existe usuário logado com
-- profile, então `current_clinica_id()` devolve NULL e a policy
-- `clinica_id = current_clinica_id()` rejeita a linha.
--
-- CORREÇÃO: trigger que semeia dado do sistema roda como DEFINER. Ele não
-- decide "de quem" é a linha a partir do usuário — a clínica vem do NEW.id,
-- que é a linha recém-criada. Não há escalonamento: a função só escreve na
-- clínica que acabou de nascer.
--
-- BÔNUS DE SEGURANÇA: toda função SECURITY DEFINER SEM `search_path` fixo é
-- vetor de escalonamento de privilégio — um schema malicioso no search_path do
-- chamador pode sequestrar a resolução de nomes e rodar código como owner.
-- Aqui TODAS passam a ter `search_path = public` explícito.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- o bug
alter function public.create_default_pipeline_stages()
  security definer set search_path = public;

-- ---------------------------------------------------------------- mesmos triggers de seed
alter function public.create_default_payment_config()
  security definer set search_path = public;

alter function public.create_trial_subscription()
  security definer set search_path = public;

-- ---------------------------------------------------------------- search_path faltando
alter function public.handle_new_user()
  security definer set search_path = public;

alter function public.get_auth_user_clinic_id()
  security definer set search_path = public;

alter function public.get_auth_user_role()
  security definer set search_path = public;

-- duas sobrecargas (4 e 5 parâmetros)
alter function public.create_clinic_and_link_admin(text, text, text, text)
  security definer set search_path = public;

alter function public.create_clinic_and_link_admin(text, text, text, text, text)
  security definer set search_path = public;

-- ---------------------------------------------------------------- verificação
-- Nenhuma função DEFINER pode ficar sem search_path:
--   select p.proname, p.prosecdef, p.proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef
--      and (p.proconfig is null or not exists (
--            select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
--   -- esperado: 0 linhas

commit;
