-- ============================================
-- RLS GERAL PARA CLINICAS E PROFILES
-- ============================================

-- TABELA: clinicas
-- Remover todas as políticas antigas
DROP POLICY IF EXISTS "Allow authenticated insert" ON clinicas;
DROP POLICY IF EXISTS "Allow read own clinic" ON clinicas;
DROP POLICY IF EXISTS "Allow update clinicas" ON clinicas;
DROP POLICY IF EXISTS "Users can view own clinic" ON clinicas;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON clinicas;
DROP POLICY IF EXISTS "Authenticated users can create clinics" ON clinicas;

-- Criar políticas gerais permissivas
CREATE POLICY "clinicas_all_access" ON clinicas
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TABELA: profiles
-- Remover todas as políticas antigas
DROP POLICY IF EXISTS "Allow insert profiles" ON profiles;
DROP POLICY IF EXISTS "Allow select profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Criar políticas gerais permissivas
CREATE POLICY "profiles_all_access" ON profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Garantir que RLS está ativado (mas com políticas permissivas)
ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
