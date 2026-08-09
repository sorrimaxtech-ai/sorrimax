-- ============================================================================
-- 🚨 HOTFIX DE SEGURANÇA — APLICAR AGORA no SQL Editor do Supabase
-- Projeto: irqlxtyvtpsnteqbdsix
-- ----------------------------------------------------------------------------
-- A tabela public.leads_sistema está SEM RLS. A chave anon (pública, embutida
-- no bundle do site) consegue LER, INSERIR e APAGAR todos os registros —
-- incluindo CPF, RG, data de nascimento, endereço, convênio, alergias e e-mail.
-- Confirmado por auditoria em 06/08/2026 (leitura, INSERT 201 e DELETE 204).
--
-- Este script apenas TRANCA a porta. Ele NÃO define quem pode ler — depois de
-- aplicar, o acesso legítimo (o backend/serviço que grava esses leads) precisa
-- usar a service_role key OU uma policy específica. Ajuste o passo 3 conforme
-- como esses leads são gravados hoje.
-- ============================================================================

-- 1. Liga RLS. Sem nenhuma policy, o padrão vira NEGAR TUDO para anon/authenticated.
alter table public.leads_sistema enable row level security;
alter table public.leads_sistema force row level security;

-- 2. Remove qualquer policy permissiva que exista.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'leads_sistema'
  loop
    execute format('drop policy %I on public.leads_sistema', pol.policyname);
  end loop;
end $$;

-- 3. (ESCOLHA UMA — deixe comentado até decidir)
--
-- 3a. Captação vem de um formulário público que só INSERE (landing page):
--     libera só INSERT anônimo, mantém leitura/edição/exclusão fechadas.
-- create policy leads_sistema_insert_publico on public.leads_sistema
--   for insert to anon, authenticated with check (true);
--
-- 3b. Só o backend (service_role) acessa: NÃO crie policy nenhuma.
--     A service_role ignora RLS e continua funcionando. anon fica 100% bloqueado.
--     (Recomendado se os leads são gravados por uma Edge Function / servidor.)

-- 4. Verificação — deve voltar rowsecurity = true e 0 (ou 1) policies.
-- select relname, relrowsecurity, relforcerowsecurity
--   from pg_class where relname = 'leads_sistema';
-- select policyname, cmd, roles from pg_policies
--  where tablename = 'leads_sistema';

-- ============================================================================
-- DEPOIS DE APLICAR, faça também (fora do SQL):
--   1. Rotacione a ANON key e a SERVICE_ROLE key em Settings → API.
--      (A anon atual já circulou; a service_role está versionada no .env.)
--   2. Reponha a nova anon key no .env do front e faça novo deploy.
--   3. Verifique NO DASHBOARD se há OUTRAS tabelas sem RLS:
--      Database → Tables → coluna "RLS enabled". Toda tabela pública precisa de RLS.
--   4. Avalie notificação à ANPD (LGPD art. 48) — houve exposição de dado
--      pessoal sensível (saúde) a qualquer pessoa na internet.
-- ============================================================================
