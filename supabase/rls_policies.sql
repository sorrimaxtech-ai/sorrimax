-- ============================================
-- Políticas de RLS para Permitir Inserção de Dados
-- VITTALHUB - Sistema de Gestão de Clínicas
-- ============================================
-- 
-- IMPORTANTE: Execute este script ANTES de tentar criar dados de teste
-- Estas políticas permitem que usuários autenticados criem suas próprias clínicas
-- ============================================

-- ============================================
-- POLÍTICAS PARA TABELA: clinicas
-- ============================================

-- Permitir que usuários autenticados criem clínicas
CREATE POLICY "Authenticated users can create clinics" ON clinicas
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Permitir que usuários vejam suas próprias clínicas
DROP POLICY IF EXISTS "Users can view own clinic" ON clinicas;
CREATE POLICY "Users can view own clinic" ON clinicas
  FOR SELECT USING (
    id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Permitir que admins atualizem suas clínicas
DROP POLICY IF EXISTS "Admins can update own clinic" ON clinicas;
CREATE POLICY "Admins can update own clinic" ON clinicas
  FOR UPDATE USING (
    id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA: enderecos_clinica
-- ============================================

-- Permitir inserção de endereços para clínicas do usuário
CREATE POLICY "Users can create clinic address" ON enderecos_clinica
  FOR INSERT 
  WITH CHECK (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
    OR auth.role() = 'authenticated'
  );

-- Permitir visualização de endereços
DROP POLICY IF EXISTS "Users can view clinic address" ON enderecos_clinica;
CREATE POLICY "Users can view clinic address" ON enderecos_clinica
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Permitir atualização de endereços para admins
DROP POLICY IF EXISTS "Admins can manage clinic address" ON enderecos_clinica;
CREATE POLICY "Admins can update clinic address" ON enderecos_clinica
  FOR UPDATE USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete clinic address" ON enderecos_clinica
  FOR DELETE USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA: profiles
-- ============================================

-- Permitir que usuários vejam seu próprio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Permitir que usuários atualizem seu próprio perfil
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Permitir que admins vejam perfis da mesma clínica
CREATE POLICY "Admins can view clinic profiles" ON profiles
  FOR SELECT USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA: assinaturas
-- ============================================

-- Permitir visualização de assinaturas da clínica
DROP POLICY IF EXISTS "Users can view clinic subscription" ON assinaturas;
CREATE POLICY "Users can view clinic subscription" ON assinaturas
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Permitir que admins atualizem assinaturas
CREATE POLICY "Admins can update subscription" ON assinaturas
  FOR UPDATE USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA: configuracoes_pagamento
-- ============================================

-- Permitir visualização de configurações de pagamento
DROP POLICY IF EXISTS "Users can view payment config" ON configuracoes_pagamento;
CREATE POLICY "Users can view payment config" ON configuracoes_pagamento
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Permitir que admins gerenciem configurações de pagamento
DROP POLICY IF EXISTS "Admins can manage payment config" ON configuracoes_pagamento;
CREATE POLICY "Admins can update payment config" ON configuracoes_pagamento
  FOR UPDATE USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA: clinica_especialidades
-- ============================================

-- Permitir inserção de especialidades
CREATE POLICY "Users can add clinic specialties" ON clinica_especialidades
  FOR INSERT 
  WITH CHECK (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Permitir visualização de especialidades
CREATE POLICY "Users can view clinic specialties" ON clinica_especialidades
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Permitir remoção de especialidades para admins
CREATE POLICY "Admins can remove clinic specialties" ON clinica_especialidades
  FOR DELETE USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA: especialidades
-- ============================================

-- Permitir que todos vejam especialidades disponíveis
CREATE POLICY "Anyone can view specialties" ON especialidades
  FOR SELECT USING (true);

-- ============================================
-- VERIFICAÇÃO DAS POLÍTICAS
-- ============================================

-- Execute esta query para ver todas as políticas criadas:
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================
-- NOTAS IMPORTANTES:
-- ============================================
-- 
-- 1. Estas políticas permitem que usuários autenticados criem clínicas
-- 2. Após criar a clínica, o usuário precisa ser associado a ela na tabela profiles
-- 3. Os triggers automáticos criarão assinatura e configurações de pagamento
-- 4. Para dados de teste, você pode desabilitar temporariamente o RLS:
--    ALTER TABLE clinicas DISABLE ROW LEVEL SECURITY;
--    (NÃO RECOMENDADO EM PRODUÇÃO!)
-- 
-- ============================================
