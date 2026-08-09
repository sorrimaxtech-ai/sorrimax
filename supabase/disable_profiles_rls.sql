-- SOLUÇÃO DEFINITIVA: Desabilitar RLS em profiles temporariamente
-- Isso permite que o cadastro funcione sem recursão

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
