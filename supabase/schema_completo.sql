# Schema Completo do Banco de Dados - VITTALHUB

## 📋 Visão Geral

Sistema multi-tenant com código único de clínica, autenticação via Supabase Auth, e sistema de permissões.

---

## 🗄️ Estrutura das Tabelas

### 1. Tabela: `clinicas`

```sql
CREATE TABLE clinicas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_clinica TEXT UNIQUE NOT NULL, -- Código único gerado automaticamente
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

-- Função para gerar código único de clínica (formato: VH-XXXXX)
CREATE OR REPLACE FUNCTION generate_clinic_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Gera código no formato VH-XXXXX (VH = VittalHub)
    new_code := 'VH-' || LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
    
    -- Verifica se código já existe
    SELECT EXISTS(SELECT 1 FROM clinicas WHERE codigo_clinica = new_code) INTO code_exists;
    
    -- Se não existe, retorna o código
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger para gerar código automaticamente ao criar clínica
CREATE OR REPLACE FUNCTION set_clinic_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_clinica IS NULL THEN
    NEW.codigo_clinica := generate_clinic_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_insert_clinica
  BEFORE INSERT ON clinicas
  FOR EACH ROW
  EXECUTE FUNCTION set_clinic_code();

-- Índices
CREATE INDEX idx_clinicas_codigo ON clinicas(codigo_clinica);
CREATE INDEX idx_clinicas_cnpj ON clinicas(cnpj);
```

---

### 2. Tabela: `enderecos_clinica`

```sql
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
```

---

### 3. Tabela: `profiles` (Estende auth.users do Supabase)

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'professional' CHECK (role IN ('admin', 'professional', 'receptionist')),
  telefone TEXT,
  especialidade TEXT,
  registro_profissional TEXT, -- CRM, CRN, etc
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para criar profile automaticamente quando usuário se registra
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

-- Índices
CREATE INDEX idx_profiles_clinica ON profiles(clinica_id);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
```

---

### 4. Tabela: `assinaturas`

```sql
CREATE TABLE assinaturas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE UNIQUE,
  plano TEXT DEFAULT 'trial' CHECK (plano IN ('trial', 'essencial', 'profissional', 'vittalhub_ai')),
  status TEXT DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'cancelled', 'expired', 'suspended')),
  
  -- Controle de Trial
  trial_inicio DATE,
  trial_fim DATE,
  trial_dias_usados INTEGER DEFAULT 0,
  trial_dias_totais INTEGER DEFAULT 14,
  
  -- Assinatura
  data_inicio DATE,
  data_fim DATE,
  valor_mensal DECIMAL(10,2),
  forma_pagamento TEXT,
  
  -- Limites por Plano
  max_profissionais INTEGER DEFAULT 1,
  max_pacientes INTEGER DEFAULT 100,
  
  -- Features habilitadas
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
    clinica_id,
    plano,
    status,
    trial_inicio,
    trial_fim,
    trial_dias_totais,
    max_profissionais,
    max_pacientes
  ) VALUES (
    NEW.id,
    'trial',
    'trial',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '14 days',
    14,
    1,
    100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_insert_clinica
  AFTER INSERT ON clinicas
  FOR EACH ROW
  EXECUTE FUNCTION create_trial_subscription();

CREATE INDEX idx_assinaturas_clinica ON assinaturas(clinica_id);
CREATE INDEX idx_assinaturas_status ON assinaturas(status);
```

---

### 5. Tabela: `configuracoes_pagamento`

```sql
CREATE TABLE configuracoes_pagamento (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE UNIQUE,
  
  -- Formas de pagamento aceitas
  aceita_cartao_credito BOOLEAN DEFAULT true,
  aceita_cartao_debito BOOLEAN DEFAULT true,
  aceita_dinheiro BOOLEAN DEFAULT true,
  aceita_pix BOOLEAN DEFAULT true,
  aceita_transferencia BOOLEAN DEFAULT true,
  aceita_parcelamento BOOLEAN DEFAULT false,
  max_parcelas INTEGER DEFAULT 12,
  aceita_cheque BOOLEAN DEFAULT false,
  aceita_convenio BOOLEAN DEFAULT false,
  
  -- Configurações adicionais
  taxa_cartao_credito DECIMAL(5,2) DEFAULT 0,
  taxa_cartao_debito DECIMAL(5,2) DEFAULT 0,
  desconto_dinheiro DECIMAL(5,2) DEFAULT 0,
  desconto_pix DECIMAL(5,2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para criar configurações padrão ao criar clínica
CREATE OR REPLACE FUNCTION create_default_payment_config()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO configuracoes_pagamento (clinica_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_insert_clinica_payment
  AFTER INSERT ON clinicas
  FOR EACH ROW
  EXECUTE FUNCTION create_default_payment_config();

CREATE INDEX idx_config_pagamento_clinica ON configuracoes_pagamento(clinica_id);
```

---

### 6. Tabela: `especialidades`

```sql
CREATE TABLE especialidades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT UNIQUE NOT NULL,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir especialidades padrão
INSERT INTO especialidades (nome, descricao) VALUES
  ('Dermatologia', 'Cuidados com a pele'),
  ('Estética', 'Procedimentos estéticos'),
  ('Odontologia', 'Saúde bucal'),
  ('Nutrição', 'Orientação nutricional'),
  ('Fisioterapia', 'Reabilitação física'),
  ('Psicologia', 'Saúde mental'),
  ('Clínica Geral', 'Atendimento geral');
```

---

### 7. Tabela: `clinica_especialidades` (Relacionamento N:N)

```sql
CREATE TABLE clinica_especialidades (
  clinica_id UUID REFERENCES clinicas(id) ON DELETE CASCADE,
  especialidade_id UUID REFERENCES especialidades(id) ON DELETE CASCADE,
  PRIMARY KEY (clinica_id, especialidade_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_clinica_espec_clinica ON clinica_especialidades(clinica_id);
CREATE INDEX idx_clinica_espec_especialidade ON clinica_especialidades(especialidade_id);
```

---

## 🔒 Row Level Security (RLS)

```sql
-- Ativar RLS em todas as tabelas
ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE enderecos_clinica ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinica_especialidades ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Políticas para clinicas (usuário vê apenas sua clínica)
CREATE POLICY "Users can view own clinic" ON clinicas
  FOR SELECT USING (
    id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can update own clinic" ON clinicas
  FOR UPDATE USING (
    id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Políticas para enderecos_clinica
CREATE POLICY "Users can view clinic address" ON enderecos_clinica
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage clinic address" ON enderecos_clinica
  FOR ALL USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Políticas para assinaturas
CREATE POLICY "Users can view clinic subscription" ON assinaturas
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

-- Políticas para configuracoes_pagamento
CREATE POLICY "Users can view payment config" ON configuracoes_pagamento
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage payment config" ON configuracoes_pagamento
  FOR ALL USING (
    clinica_id IN (
      SELECT clinica_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

## 📊 Views Úteis

```sql
-- View: Informações completas da clínica
CREATE OR REPLACE VIEW v_clinica_completa AS
SELECT 
  c.id,
  c.codigo_clinica,
  c.nome_clinica,
  c.cnpj,
  c.email_clinica,
  c.telefone,
  c.timezone,
  c.horario_funcionamento,
  e.endereco,
  e.numero,
  e.complemento,
  e.bairro,
  e.cidade,
  e.estado,
  e.cep,
  a.plano,
  a.status as status_assinatura,
  a.trial_fim,
  trial_dias_restantes(a.id) as dias_trial_restantes,
  a.max_profissionais,
  a.max_pacientes,
  (SELECT COUNT(*) FROM profiles WHERE clinica_id = c.id) as total_profissionais,
  cp.aceita_pix,
  cp.aceita_cartao_credito,
  cp.aceita_dinheiro
FROM clinicas c
LEFT JOIN enderecos_clinica e ON c.id = e.clinica_id
LEFT JOIN assinaturas a ON c.id = a.clinica_id
LEFT JOIN configuracoes_pagamento cp ON c.id = cp.clinica_id;

-- View: Profissionais por clínica
CREATE OR REPLACE VIEW v_profissionais_clinica AS
SELECT 
  p.id,
  p.clinica_id,
  c.codigo_clinica,
  p.full_name,
  p.email,
  p.role,
  p.especialidade,
  p.registro_profissional,
  p.status,
  p.created_at
FROM profiles p
JOIN clinicas c ON p.clinica_id = c.id
WHERE p.status = 'active';
```

---

## 🚀 Funções Auxiliares

```sql
-- Função: Verificar se clínica pode adicionar mais profissionais
CREATE OR REPLACE FUNCTION can_add_professional(p_clinica_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM profiles
  WHERE clinica_id = p_clinica_id AND status = 'active';
  
  SELECT max_profissionais INTO max_allowed
  FROM assinaturas
  WHERE clinica_id = p_clinica_id;
  
  RETURN current_count < max_allowed;
END;
$$ LANGUAGE plpgsql;

-- Função: Verificar se assinatura está ativa
CREATE OR REPLACE FUNCTION is_subscription_active(p_clinica_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  sub_status TEXT;
  trial_end DATE;
BEGIN
  SELECT status, trial_fim INTO sub_status, trial_end
  FROM assinaturas
  WHERE clinica_id = p_clinica_id;
  
  IF sub_status = 'active' THEN
    RETURN TRUE;
  END IF;
  
  IF sub_status = 'trial' AND trial_end >= CURRENT_DATE THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
```

---

## 📝 Exemplo de Uso

### Cadastro de Nova Clínica:

```sql
-- 1. Criar clínica (código gerado automaticamente)
INSERT INTO clinicas (nome_clinica, cnpj, email_clinica, telefone)
VALUES ('Clínica Exemplo', '12.345.678/0001-90', 'contato@exemplo.com', '(11) 99999-9999')
RETURNING id, codigo_clinica;

-- Resultado: id = uuid, codigo_clinica = 'VH-12345'

-- 2. Adicionar endereço
INSERT INTO enderecos_clinica (clinica_id, cep, endereco, numero, cidade, estado)
VALUES ('uuid-da-clinica', '01234-567', 'Rua Exemplo', '123', 'São Paulo', 'SP');

-- 3. Usuário admin se registra via Supabase Auth
-- (Trigger cria profile automaticamente)

-- 4. Associar usuário à clínica como admin
UPDATE profiles
SET clinica_id = 'uuid-da-clinica', role = 'admin'
WHERE id = 'uuid-do-usuario';

-- 5. Assinatura trial e config de pagamento criadas automaticamente via triggers!
```

---

## 🎯 Próximos Passos

1. Executar este script no SQL Editor do Supabase
2. Configurar variáveis de ambiente no `.env`
3. Criar tela de cadastro no frontend
4. Implementar fluxo de login com busca por `codigo_clinica`
