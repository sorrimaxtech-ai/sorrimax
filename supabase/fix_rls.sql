-- ============================================
-- Correção de Erro de Recursão Infinita (RLS)
-- ============================================

-- 1. Criar função segura para checar dados do usuário sem acionar RLS
-- SECURITY DEFINER permite que esta função rode com permissões de systema, quebrando o loop.
CREATE OR REPLACE FUNCTION get_auth_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_auth_user_clinic_id()
RETURNS UUID AS $$
  SELECT clinica_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Remover política problemática antiga
DROP POLICY IF EXISTS "Admins can view clinic profiles" ON profiles;

-- 3. Criar nova política usando as funções seguras
CREATE POLICY "Admins can view clinic profiles" ON profiles
  FOR SELECT USING (
    clinica_id = get_auth_user_clinic_id() 
    AND get_auth_user_role() = 'admin'
  );

-- Bônus: Garantir que atualização também funcione
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Confirmação
SELECT 'Correção de RLS aplicada com sucesso!' as status;
