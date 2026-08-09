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

-- ---------------------------------------------------------------------------
-- Os ALTERs abaixo são condicionais: cada função só é endurecida se existir.
-- Motivo: várias delas nasceram nos `.sql` soltos da raiz de supabase/ (fix_rls,
-- crm_schema, 01_schema_principal), aplicados à mão no projeto antigo. Num
-- projeto Supabase novo, algumas podem não existir, e um ALTER direto aborta a
-- migração inteira. O que existe é endurecido; o que não existe não é risco.
-- ---------------------------------------------------------------------------
do $hardening$
declare
  alvo text;
  alvos text[] := array[
    -- o bug do cadastro + demais triggers de seed
    'public.create_default_pipeline_stages()',
    'public.create_default_payment_config()',
    'public.create_trial_subscription()',
    -- search_path faltando
    'public.handle_new_user()',
    'public.get_auth_user_clinic_id()',
    'public.get_auth_user_role()',
    -- duas sobrecargas (4 e 5 parâmetros)
    'public.create_clinic_and_link_admin(text, text, text, text)',
    'public.create_clinic_and_link_admin(text, text, text, text, text)'
  ];
begin
  foreach alvo in array alvos loop
    if to_regprocedure(alvo) is not null then
      execute format('alter function %s security definer set search_path = public', alvo);
      raise notice 'endurecida: %', alvo;
    else
      raise notice 'ausente (ignorada): %', alvo;
    end if;
  end loop;
end
$hardening$;

-- ---------------------------------------------------------------- verificação
-- Nenhuma função DEFINER pode ficar sem search_path:
--   select p.proname, p.prosecdef, p.proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef
--      and (p.proconfig is null or not exists (
--            select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
--   -- esperado: 0 linhas

commit;
