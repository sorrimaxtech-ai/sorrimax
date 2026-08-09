-- ============================================
-- RLS POLICIES - VITTALHUB (CORREÇÃO DE PERMISSÕES)
-- ============================================

-- 1. CLINICAS
ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for own clinic" ON clinicas
  FOR SELECT USING (id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Enable update for own clinic admins" ON clinicas
  FOR UPDATE USING (id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- CRÍTICO: Permitir INSERT durante o cadastro
CREATE POLICY "Enable insert for registration" ON clinicas
  FOR INSERT WITH CHECK (true);

-- 2. PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Enable update for own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Enable insert for registration" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. ESPECIALIDADES
ALTER TABLE especialidades ENABLE ROW LEVEL SECURITY;

-- Todos podem ver as especialidades disponíveis
CREATE POLICY "Enable read access for all users" ON especialidades
  FOR SELECT USING (true);

-- Permitir criar novas especialidades (necessário para o wizard)
CREATE POLICY "Enable insert for authenticated users" ON especialidades
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 4. CLINICA_ESPECIALIDADES
ALTER TABLE clinica_especialidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for own clinic" ON clinica_especialidades
  FOR SELECT USING (clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid()));

-- CRÍTICO: Permitir vincular especialidades durante o setup
CREATE POLICY "Enable insert for own clinic" ON clinica_especialidades
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable delete for own clinic" ON clinica_especialidades
  FOR DELETE USING (clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid()));
