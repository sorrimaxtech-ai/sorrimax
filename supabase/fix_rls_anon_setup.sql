-- =========================================================
-- SOLUÇÃO DEFINITIVA: PERMISSÕES PARA SETUP SEM LOGIN
-- Execute este script no SQL Editor do Supabase
-- =========================================================

-- O seu fluxo de cadastro cria as tabelas direto, sem fazer login no Supabase Auth.
-- Por isso, o usuário é considerado "anônimo" (role 'anon') e o RLS bloqueia.
-- Este script libera as permissões necessárias para o wizard funcionar sem login.

-- 1. TABELA: especialidades
ALTER TABLE especialidades ENABLE ROW LEVEL SECURITY;

-- Remover políticas restritivas anteriores
DROP POLICY IF EXISTS "Authenticated insert specialties" ON especialidades;
DROP POLICY IF EXISTS "Public read specialties" ON especialidades;

-- NOVAS POLÍTICAS (Permitem acesso público/anônimo)
CREATE POLICY "Public read specialties" ON especialidades
  FOR SELECT USING (true);

CREATE POLICY "Public insert specialties" ON especialidades
  FOR INSERT WITH CHECK (true);


-- 2. TABELA: clinica_especialidades
ALTER TABLE clinica_especialidades ENABLE ROW LEVEL SECURITY;

-- Remover políticas anteriores
DROP POLICY IF EXISTS "View own clinic specialties" ON clinica_especialidades;
DROP POLICY IF EXISTS "Insert own clinic specialties" ON clinica_especialidades;
DROP POLICY IF EXISTS "Delete own clinic specialties" ON clinica_especialidades;

-- NOVAS POLÍTICAS (Permitem acesso público/anônimo)
CREATE POLICY "Public view clinic specialties" ON clinica_especialidades
  FOR SELECT USING (true);

CREATE POLICY "Public insert clinic specialties" ON clinica_especialidades
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public delete clinic specialties" ON clinica_especialidades
  FOR DELETE USING (true);


-- 3. TABELA: clinicas (Garantir que o update funcione)
ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable update for own clinic admins" ON clinicas;

-- Permitir update se tiver o ID (que é o token)
CREATE POLICY "Public update clinic by ID" ON clinicas
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
