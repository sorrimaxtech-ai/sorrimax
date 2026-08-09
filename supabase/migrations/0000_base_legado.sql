-- 0000_base · Schema legado estrutural (pré-migrations)
-- Concatena 01_schema_principal + crm_schema + whatsapp_schema, que eram
-- aplicados à mão no projeto antigo e de que as migrations dependem.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ══ 01_schema_principal.sql ══
-- ============================================
-- SORRIMAX - Schema Completo do Banco de Dados
-- Execute este script no SQL Editor do Supabase
-- ============================================

-- ============================================
-- 1. TABELA: clinicas
-- ============================================

CREATE TABLE clinicas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_clinica TEXT UNIQUE NOT NULL,
  nome_clinica TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  email_clinica TEXT,
  telefone TEXT,
  logo_url TEXT,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  horario_funcionamento JSONB DEFAULT '{
    "segunda": {"inicio": "08:00", "fim": "18:00", "ativo": true},
    "terca": {"inicio": "08:00", "fim": "18:00", "ativo": true},
    "quarta": {"inicio": "08:00", "fim": "18:00", "ativo": true},
    "quinta": {"inicio": "08:00", "fim": "18:00", "ativo": true},
    "sexta": {"inicio": "08:00", "fim": "18:00", "ativo": true},
    "sabado": {"inicio": "08:00", "fim": "12:00", "ativo": false},
    "domingo": {"inicio": "08:00", "fim": "12:00", "ativo": false}
  }'::jsonb,
  configuracoes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_clinicas_codigo ON clinicas(codigo_clinica);
CREATE INDEX idx_clinicas_cnpj ON clinicas(cnpj);

-- Função para gerar código único (VH-XXXXX)
CREATE OR REPLACE FUNCTION generate_clinic_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'VH-' || LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
    SELECT EXISTS(SELECT 1 FROM clinicas WHERE codigo_clinica = new_code) INTO code_exists;
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger para gerar código automaticamente
CREATE OR REPLACE FUNCTION set_clinic_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_clinica IS NULL OR NEW.codigo_clinica = '' THEN
    NEW.codigo_clinica := generate_clinic_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_insert_clinica
  BEFORE INSERT ON clinicas
  FOR EACH ROW
  EXECUTE FUNCTION set_clinic_code();

-- ============================================
-- 2. TABELA: enderecos_clinica
-- ============================================

CREATE TABLE enderecos_clinica (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  pais TEXT DEFAULT 'Brasil',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_enderecos_clinica ON enderecos_clinica(clinica_id);

-- ============================================
-- 3. TABELA: profiles
-- ============================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'professional' CHECK (role IN ('admin', 'professional', 'receptionist')),
  telefone TEXT,
  especialidade TEXT,
  registro_profissional TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_profiles_clinica ON profiles(clinica_id);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);

-- Trigger para criar profile ao registrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 4. TABELA: assinaturas
-- ============================================

CREATE TABLE assinaturas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE UNIQUE,
  plano TEXT DEFAULT 'trial' CHECK (plano IN ('trial', 'essencial', 'profissional', 'vittalhub_ai')),
  status TEXT DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'cancelled', 'expired', 'suspended')),
  trial_inicio DATE,
  trial_fim DATE,
  trial_dias_usados INTEGER DEFAULT 0,
  trial_dias_totais INTEGER DEFAULT 14,
  data_inicio DATE,
  data_fim DATE,
  valor_mensal DECIMAL(10,2),
  forma_pagamento TEXT,
  max_profissionais INTEGER DEFAULT 1,
  max_pacientes INTEGER DEFAULT 100,
  features_habilitadas JSONB DEFAULT '{
    "whatsapp": false,
    "ia_assistant": false,
    "relatorios_avancados": false,
    "multi_profissionais": false,
    "api_access": false
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assinaturas_clinica ON assinaturas(clinica_id);
CREATE INDEX idx_assinaturas_status ON assinaturas(status);

-- Função para calcular dias restantes de trial
CREATE OR REPLACE FUNCTION trial_dias_restantes(assinatura_id UUID)
RETURNS INTEGER AS $$
DECLARE
  assinatura_record RECORD;
  dias_restantes INTEGER;
BEGIN
  SELECT * INTO assinatura_record FROM assinaturas WHERE id = assinatura_id;
  IF assinatura_record.status != 'trial' THEN
    RETURN 0;
  END IF;
  dias_restantes := assinatura_record.trial_dias_totais - assinatura_record.trial_dias_usados;
  RETURN GREATEST(dias_restantes, 0);
END;
$$ LANGUAGE plpgsql;

-- Trigger para criar assinatura trial ao criar clínica
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO assinaturas (
    clinica_id, plano, status, trial_inicio, trial_fim,
    trial_dias_totais, max_profissionais, max_pacientes
  ) VALUES (
    NEW.id, 'trial', 'trial', CURRENT_DATE,
    CURRENT_DATE + INTERVAL '14 days', 14, 1, 100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_insert_clinica_subscription
  AFTER INSERT ON clinicas
  FOR EACH ROW
  EXECUTE FUNCTION create_trial_subscription();

-- ============================================
-- 5. TABELA: configuracoes_pagamento
-- ============================================

CREATE TABLE configuracoes_pagamento (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE UNIQUE,
  aceita_cartao_credito BOOLEAN DEFAULT true,
  aceita_cartao_debito BOOLEAN DEFAULT true,
  aceita_dinheiro BOOLEAN DEFAULT true,
  aceita_pix BOOLEAN DEFAULT true,
  aceita_transferencia BOOLEAN DEFAULT true,
  aceita_parcelamento BOOLEAN DEFAULT false,
  max_parcelas INTEGER DEFAULT 12,
  aceita_cheque BOOLEAN DEFAULT false,
  aceita_convenio BOOLEAN DEFAULT false,
  taxa_cartao_credito DECIMAL(5,2) DEFAULT 0,
  taxa_cartao_debito DECIMAL(5,2) DEFAULT 0,
  desconto_dinheiro DECIMAL(5,2) DEFAULT 0,
  desconto_pix DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_config_pagamento_clinica ON configuracoes_pagamento(clinica_id);

-- Trigger para criar config padrão ao criar clínica
CREATE OR REPLACE FUNCTION create_default_payment_config()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO configuracoes_pagamento (clinica_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_insert_clinica_payment
  AFTER INSERT ON clinicas
  FOR EACH ROW
  EXECUTE FUNCTION create_default_payment_config();

-- ============================================
-- 6. TABELAS: especialidades
-- ============================================

CREATE TABLE especialidades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT UNIQUE NOT NULL,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO especialidades (nome, descricao) VALUES
  ('Dermatologia', 'Cuidados com a pele'),
  ('Estética', 'Procedimentos estéticos'),
  ('Odontologia', 'Saúde bucal'),
  ('Nutrição', 'Orientação nutricional'),
  ('Fisioterapia', 'Reabilitação física'),
  ('Psicologia', 'Saúde mental'),
  ('Clínica Geral', 'Atendimento geral');

CREATE TABLE clinica_especialidades (
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE,
  especialidade_id UUID REFERENCES especialidades(id) ON DELETE CASCADE,
  PRIMARY KEY (clinica_id, especialidade_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_clinica_espec_clinica ON clinica_especialidades(clinica_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE enderecos_clinica ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinica_especialidades ENABLE ROW LEVEL SECURITY;

-- Políticas profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Políticas clinicas
CREATE POLICY "Users can view own clinic" ON clinicas
  FOR SELECT USING (
    id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can update own clinic" ON clinicas
  FOR UPDATE USING (
    id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Políticas enderecos
CREATE POLICY "Users can view clinic address" ON enderecos_clinica
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage clinic address" ON enderecos_clinica
  FOR ALL USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Políticas assinaturas
CREATE POLICY "Users can view clinic subscription" ON assinaturas
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Políticas configuracoes_pagamento
CREATE POLICY "Users can view payment config" ON configuracoes_pagamento
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage payment config" ON configuracoes_pagamento
  FOR ALL USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- VIEWS ÚTEIS
-- ============================================

CREATE OR REPLACE VIEW v_clinica_completa AS
SELECT 
  c.id, c.codigo_clinica, c.nome_clinica, c.cnpj,
  c.email_clinica, c.telefone, c.timezone,
  e.endereco, e.numero, e.cidade, e.estado, e.cep,
  a.plano, a.status as status_assinatura,
  a.trial_fim, trial_dias_restantes(a.id) as dias_trial_restantes,
  a.max_profissionais, a.max_pacientes,
  (SELECT COUNT(*) FROM profiles WHERE clinica_id = c.id) as total_profissionais
FROM clinicas c
LEFT JOIN enderecos_clinica e ON c.id = e.clinica_id
LEFT JOIN assinaturas a ON c.id = a.clinica_id;

-- ============================================
-- FUNÇÕES AUXILIARES
-- ============================================

CREATE OR REPLACE FUNCTION can_add_professional(p_clinica_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM profiles WHERE clinica_id = p_clinica_id AND status = 'active';
  SELECT max_profissionais INTO max_allowed
  FROM assinaturas WHERE clinica_id = p_clinica_id;
  RETURN current_count < max_allowed;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION is_subscription_active(p_clinica_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  sub_status TEXT;
  trial_end DATE;
BEGIN
  SELECT status, trial_fim INTO sub_status, trial_end
  FROM assinaturas WHERE clinica_id = p_clinica_id;
  IF sub_status = 'active' THEN RETURN TRUE; END IF;
  IF sub_status = 'trial' AND trial_end >= CURRENT_DATE THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FIM DO SCRIPT
-- ============================================


-- ══ crm_schema.sql ══
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


-- ══ whatsapp_schema.sql ══
-- =========================================================
-- WHATSAPP MODULE SCHEMA
-- Tables for Evolution API Integration
-- =========================================================

-- 1. whatsapp_instances
-- Armazena as conexões com a API (Sessões do WhatsApp)
CREATE TABLE whatsapp_instances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, -- Nome amigável (ex: "Suporte", "Vendas")
  instance_id TEXT NOT NULL UNIQUE, -- ID na Evolution API
  status TEXT DEFAULT 'disconnected', -- disconnected, connecting, connected
  qrcode TEXT, -- Base64 do QR Code (opcional, melhor via socket/realtime)
  apikey TEXT, -- API Key da instância (se necessário)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_wa_instances_clinica ON whatsapp_instances(clinica_id);

-- 2. whatsapp_chats
-- Espelho das conversas/contatos
CREATE TABLE whatsapp_chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE NOT NULL,
  remote_jid TEXT NOT NULL, -- Identificador único do contato (numero@s.whatsapp.net)
  name TEXT, -- Nome do contato
  profile_pic_url TEXT,
  unread_count INTEGER DEFAULT 0,
  last_message_content TEXT,
  last_message_time TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'open', -- open, archived
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(instance_id, remote_jid)
);

-- Índices
CREATE INDEX idx_wa_chats_instance ON whatsapp_chats(instance_id);
CREATE INDEX idx_wa_chats_last_msg ON whatsapp_chats(last_message_time DESC);

-- 3. whatsapp_messages
-- Histórico de mensagens
CREATE TABLE whatsapp_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES whatsapp_chats(id) ON DELETE CASCADE NOT NULL,
  content TEXT, -- Conteúdo da mensagem
  media_url TEXT, -- Se for imagem/arquivo
  media_type TEXT, -- image, video, audio, document
  from_me BOOLEAN DEFAULT false, -- True se foi enviada pela clínica
  status TEXT DEFAULT 'sent', -- pending, sent, delivered, read
  external_id TEXT, -- ID da mensagem na API/WhatsApp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_wa_messages_chat ON whatsapp_messages(chat_id);
CREATE INDEX idx_wa_messages_created ON whatsapp_messages(created_at);


-- =========================================================
-- ROW LEVEL SECURITY (RLS)
-- =========================================================

-- Enable RLS
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- 1. Policies for Instances (Permissive for Custom Auth for now, similar to leads)
-- Idealmente, usaríamos auth.uid(), mas mantendo consistência com o fix anterior:

CREATE POLICY "Enable all access for WA instances" ON whatsapp_instances
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Policies for Chats
CREATE POLICY "Enable all access for WA chats" ON whatsapp_chats
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Policies for Messages
CREATE POLICY "Enable all access for WA messages" ON whatsapp_messages
  FOR ALL USING (true) WITH CHECK (true);

-- =========================================================
-- TRIGGER UPDATE_AT
-- =========================================================

-- Função generica se não existir
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_wa_instances_modtime
    BEFORE UPDATE ON whatsapp_instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wa_chats_modtime
    BEFORE UPDATE ON whatsapp_chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

