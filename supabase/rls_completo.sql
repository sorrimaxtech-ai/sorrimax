-- ============================================
-- RLS POLICIES - VITTALHUB
-- Políticas de segurança Row Level Security
-- ============================================

-- ============================================
-- 1. TABELA: clinicas
-- ============================================

-- Habilitar RLS
ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;

-- Permitir SELECT para usuários autenticados da própria clínica
CREATE POLICY "Users can view own clinic" ON clinicas
  FOR SELECT
  USING (
    id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Permitir UPDATE para admins da clínica
CREATE POLICY "Admins can update own clinic" ON clinicas
  FOR UPDATE
  USING (
    id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Permitir INSERT para novos registros (durante cadastro)
CREATE POLICY "Allow insert for new clinics" ON clinicas
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- 2. TABELA: profiles
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Ver próprio perfil
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Atualizar próprio perfil
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Inserir perfil (durante registro)
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 3. TABELA: especialidades
-- ============================================

ALTER TABLE especialidades ENABLE ROW LEVEL SECURITY;

-- Todos podem ver especialidades
CREATE POLICY "Anyone can view specialties" ON especialidades
  FOR SELECT
  USING (true);

-- Usuários autenticados podem criar especialidades
CREATE POLICY "Authenticated users can insert specialties" ON especialidades
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- 4. TABELA: clinica_especialidades
-- ============================================

ALTER TABLE clinica_especialidades ENABLE ROW LEVEL SECURITY;

-- Ver especialidades da própria clínica
CREATE POLICY "Users can view own clinic specialties" ON clinica_especialidades
  FOR SELECT
  USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Inserir especialidades na própria clínica
CREATE POLICY "Users can insert own clinic specialties" ON clinica_especialidades
  FOR INSERT
  WITH CHECK (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
    OR
    -- Permitir durante configuração inicial (quando ainda não tem profile completo)
    auth.uid() IS NOT NULL
  );

-- Deletar especialidades da própria clínica
CREATE POLICY "Users can delete own clinic specialties" ON clinica_especialidades
  FOR DELETE
  USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================
-- 5. TABELA: assinaturas
-- ============================================

ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;

-- Ver assinatura da própria clínica
CREATE POLICY "Users can view own subscription" ON assinaturas
  FOR SELECT
  USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Permitir criação de assinatura (trigger automático)
CREATE POLICY "Allow insert subscription" ON assinaturas
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- 6. TABELA: configuracoes_pagamento
-- ============================================

ALTER TABLE configuracoes_pagamento ENABLE ROW LEVEL SECURITY;

-- Ver configurações da própria clínica
CREATE POLICY "Users can view payment config" ON configuracoes_pagamento
  FOR SELECT
  USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Admins podem atualizar
CREATE POLICY "Admins can update payment config" ON configuracoes_pagamento
  FOR UPDATE
  USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Permitir criação (trigger automático)
CREATE POLICY "Allow insert payment config" ON configuracoes_pagamento
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- 7. TABELA: enderecos_clinica (se existir)
-- ============================================

-- Caso você tenha uma tabela separada de endereços
-- ALTER TABLE enderecos_clinica ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can view clinic address" ON enderecos_clinica
--   FOR SELECT
--   USING (
--     clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
--   );

-- CREATE POLICY "Admins can manage clinic address" ON enderecos_clinica
--   FOR ALL
--   USING (
--     clinica_id IN (
--       SELECT clinica_id FROM profiles 
--       WHERE id = auth.uid() AND role = 'admin'
--     )
--   );

-- ============================================
-- OBSERVAÇÕES IMPORTANTES
-- ============================================

-- 1. Durante o cadastro inicial, o usuário ainda não tem um profile completo
--    Por isso algumas políticas permitem INSERT com auth.uid() IS NOT NULL
--
-- 2. As políticas de especialidades são mais permissivas para permitir
--    que usuários adicionem especialidades durante a configuração inicial
--
-- 3. Se você tiver outras tabelas (pacientes, agendamentos, etc.),
--    adicione políticas similares seguindo o padrão:
--    - SELECT: apenas dados da própria clínica
--    - INSERT/UPDATE/DELETE: apenas usuários da clínica (ou admins)
