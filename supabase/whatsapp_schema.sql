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
