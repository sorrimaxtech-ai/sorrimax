-- ============================================================
-- 0000 · Bootstrap da base Sorrimax (estrutura, sem RLS)
-- Gerado dos schemas do repo. RLS fica no 0001.
-- ============================================================

-- enderecos_clinica
CREATE TABLE IF NOT EXISTS enderecos_clinica (
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

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
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

-- assinaturas
CREATE TABLE IF NOT EXISTS assinaturas (
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

-- configuracoes_pagamento
CREATE TABLE IF NOT EXISTS configuracoes_pagamento (
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

-- especialidades
CREATE TABLE IF NOT EXISTS especialidades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT UNIQUE NOT NULL,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- clinica_especialidades
CREATE TABLE IF NOT EXISTS clinica_especialidades (
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE,
  especialidade_id UUID REFERENCES especialidades(id) ON DELETE CASCADE,
  PRIMARY KEY (clinica_id, especialidade_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enderecos_clinica ON enderecos_clinica(clinica_id);
CREATE INDEX IF NOT EXISTS idx_profiles_clinica ON profiles(clinica_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_assinaturas_clinica ON assinaturas(clinica_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status ON assinaturas(status);
CREATE INDEX IF NOT EXISTS idx_config_pagamento_clinica ON configuracoes_pagamento(clinica_id);
CREATE INDEX IF NOT EXISTS idx_clinica_espec_clinica ON clinica_especialidades(clinica_id);
-- pipeline_stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  cor TEXT DEFAULT '#E2E8F0', -- Cor da coluna no kanban
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- leads
CREATE TABLE IF NOT EXISTS leads (
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

CREATE INDEX IF NOT EXISTS idx_pipeline_clinica ON pipeline_stages(clinica_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_ordem ON pipeline_stages(ordem);
CREATE INDEX IF NOT EXISTS idx_leads_clinica ON leads(clinica_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads(telefone);
-- whatsapp_instances
CREATE TABLE IF NOT EXISTS whatsapp_instances (
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

-- whatsapp_chats
CREATE TABLE IF NOT EXISTS whatsapp_chats (
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

-- whatsapp_messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
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

CREATE INDEX IF NOT EXISTS idx_wa_instances_clinica ON whatsapp_instances(clinica_id);
CREATE INDEX IF NOT EXISTS idx_wa_chats_instance ON whatsapp_chats(instance_id);
CREATE INDEX IF NOT EXISTS idx_wa_chats_last_msg ON whatsapp_chats(last_message_time DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_chat ON whatsapp_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created ON whatsapp_messages(created_at);
