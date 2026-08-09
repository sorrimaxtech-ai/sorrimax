-- =========================================================
-- CORREÇÃO DE ERRO RLS - ESPECIALIDADES
-- Execute este script no SQL Editor do Supabase
-- =========================================================

-- 1. Habilitar RLS (caso não esteja)
ALTER TABLE especialidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinica_especialidades ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas antigas para evitar conflitos de nome
DROP POLICY IF EXISTS "Enable read access for all users" ON especialidades;
DROP POLICY IF EXISTS "Anyone can view specialties" ON especialidades;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON especialidades;
DROP POLICY IF EXISTS "Authenticated users can insert specialties" ON especialidades;
DROP POLICY IF EXISTS "Public read access for specialties" ON especialidades;

-- 3. Criar políticas PERMISSIVAS para Especialidades
-- Leitura pública (para o autocomplete funcionar)
CREATE POLICY "Public read specialties" ON especialidades
  FOR SELECT USING (true);

-- Permissão de INSERÇÃO para usuários logados (corrige o erro do print)
CREATE POLICY "Authenticated insert specialties" ON especialidades
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 4. Limpar políticas antigas de clinica_especialidades
DROP POLICY IF EXISTS "Enable read for own clinic" ON clinica_especialidades;
DROP POLICY IF EXISTS "Enable insert for own clinic" ON clinica_especialidades;
DROP POLICY IF EXISTS "View own clinic specialties" ON clinica_especialidades;
DROP POLICY IF EXISTS "Insert own clinic specialties" ON clinica_especialidades;
DROP POLICY IF EXISTS "Delete own clinic specialties" ON clinica_especialidades;

-- 5. Criar políticas para Vínculo (Clinica <-> Especialidade)
-- Ver especialidades da própria clínica
CREATE POLICY "View own clinic specialties" ON clinica_especialidades
  FOR SELECT USING (auth.role() = 'authenticated');

-- Adicionar especialidades (Insert)
CREATE POLICY "Insert own clinic specialties" ON clinica_especialidades
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Remover especialidades (Delete)
CREATE POLICY "Delete own clinic specialties" ON clinica_especialidades
  FOR DELETE USING (auth.role() = 'authenticated');
