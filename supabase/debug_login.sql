-- =========================================================
-- DIAGNÓSTICO: VERIFICAR DADOS DO USUÁRIO
-- Execute no SQL Editor do Supabase para debugar o login
-- =========================================================

-- 1. Verificar se o usuário existe
SELECT 
  id,
  email,
  full_name,
  clinica_id,
  role,
  status,
  -- Verificar se a coluna senha existe e tem valor
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' 
      AND column_name = 'senha'
    ) THEN 'Coluna senha EXISTE'
    ELSE 'Coluna senha NÃO EXISTE'
  END as coluna_senha_status
FROM profiles
WHERE email = 'guilhermevgamer765@gmail.com';

-- 2. Verificar a estrutura da tabela profiles
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- 3. Se o usuário existir mas não conseguir logar, 
--    verificar se a senha está correta (apenas para debug)
-- ATENÇÃO: Descomentar apenas em ambiente de desenvolvimento!
-- SELECT email, senha FROM profiles WHERE email = 'guilhermevgamer765@gmail.com';
