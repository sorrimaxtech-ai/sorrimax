-- =========================================================
-- CRM MODULE SCHEMA
-- Tables for Kanban Pipeline and Leads
-- =========================================================

-- 1. Tabela: pipeline_stages (Fases do Funil)
CREATE TABLE pipeline_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  cor TEXT DEFAULT '#E2E8F0', -- Cor da coluna no kanban
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_pipeline_clinica ON pipeline_stages(clinica_id);
CREATE INDEX idx_pipeline_ordem ON pipeline_stages(ordem);

-- 2. Tabela: leads (Contatos/Pacientes em Potencial)
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL, -- Se a fase for deletada, lead fica sem fase (ou tratar via trigger)
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT,
  origem TEXT, -- Instagram, Indicaçao, Google...
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'archived')),
  valor_estimado DECIMAL(10,2),
  anotacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_leads_clinica ON leads(clinica_id);
CREATE INDEX idx_leads_stage ON leads(stage_id);
CREATE INDEX idx_leads_telefone ON leads(telefone);

-- =========================================================
-- ROW LEVEL SECURITY (RLS)
-- =========================================================

-- Enable RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policies for pipeline_stages
CREATE POLICY "Users can view own clinic stages" ON pipeline_stages
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage own clinic stages" ON pipeline_stages
  FOR ALL USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Policies for leads
CREATE POLICY "Users can view own clinic leads" ON leads
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage own clinic leads" ON leads
  FOR ALL USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- =========================================================
-- TRIGGERS & FUNCTIONS
-- =========================================================

-- Função para criar fases padrão ao criar uma nova clínica
CREATE OR REPLACE FUNCTION create_default_pipeline_stages()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pipeline_stages (clinica_id, nome, ordem, cor) VALUES
  (NEW.id, 'Novo Lead', 1, '#3B82F6'),      -- Azul
  (NEW.id, 'Agendado', 2, '#F59E0B'),       -- Laranja
  (NEW.id, 'Compareceu', 3, '#10B981'),     -- Verde
  (NEW.id, 'Não Compareceu', 4, '#EF4444'), -- Vermelho
  (NEW.id, 'Fechamento', 5, '#8B5CF6');     -- Roxo
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para novas clínicas
CREATE TRIGGER after_insert_clinica_pipeline
  AFTER INSERT ON clinicas
  FOR EACH ROW
  EXECUTE FUNCTION create_default_pipeline_stages();

-- =========================================================
-- MIGRATION HELPER (Para clínicas existentes)
-- =========================================================

-- Insere stages padrão para clínicas que já existem e não têm stages
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM clinicas LOOP
    IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE clinica_id = r.id) THEN
      INSERT INTO pipeline_stages (clinica_id, nome, ordem, cor) VALUES
      (r.id, 'Novo Lead', 1, '#3B82F6'),
      (r.id, 'Agendado', 2, '#F59E0B'),
      (r.id, 'Compareceu', 3, '#10B981'),
      (r.id, 'Não Compareceu', 4, '#EF4444'),
      (r.id, 'Fechamento', 5, '#8B5CF6');
    END IF;
  END LOOP;
END;
$$;
