-- =========================================================
-- FIX CRM RLS (Permissive Access for Custom Auth)
-- =========================================================

-- Como o sistema usa um login personalizado (sem Supabase Auth), 
-- o auth.uid() é nulo nas requisições. 
-- Precisamos liberar acesso público às tabelas do CRM para funcionar.
-- (Em um ambiente de produção real, isso deveria ser via API segura).

-- 1. Pipeline Stages
ALTER TABLE pipeline_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own clinic stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Users can manage own clinic stages" ON pipeline_stages;

CREATE POLICY "Enable all access for CRM stages" ON pipeline_stages
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Leads
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own clinic leads" ON leads;
DROP POLICY IF EXISTS "Users can manage own clinic leads" ON leads;

CREATE POLICY "Enable all access for CRM leads" ON leads
  FOR ALL USING (true) WITH CHECK (true);
