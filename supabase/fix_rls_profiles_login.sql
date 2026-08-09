-- =========================================================
-- FIX: PERMITIR LOGIN (SELECT EM PROFILES)
-- Execute no SQL Editor do Supabase
-- =========================================================

-- O login falha porque a tabela profiles não permite SELECT para anônimos
-- Esta política permite que qualquer um LEIA os profiles (necessário para o login)

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Remover política antiga se existir
DROP POLICY IF EXISTS "Public read for login" ON profiles;

-- Criar política que permite leitura pública (necessária para login)
CREATE POLICY "Public read for login" ON profiles
  FOR SELECT USING (true);
