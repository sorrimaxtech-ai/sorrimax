# Guia de Configuração do Banco de Dados Supabase - VITTALHUB

## 📋 Passo a Passo Inicial

1. **Criar conta no Supabase**: https://supabase.com
2. **Criar novo projeto**:
   - Nome: `vittalhub`
   - Senha do banco: Anote em local seguro!
   - Região: South America (São Paulo)

---

## 🗄️ Estrutura do Banco de Dados

### 1. Tabela: `profiles` (Perfis de Usuários)

**Propósito**: Estender dados do usuário autenticado

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'professional')),
  clinic_id UUID REFERENCES clinics(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para criar profile automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### 2. Tabela: `clinics` (Clínicas)

**Propósito**: Dados da clínica (multi-tenant)

```sql
CREATE TABLE clinics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 3. Tabela: `professionals` (Profissionais)

**Propósito**: Médicos, enfermeiros, esteticistas, etc.

```sql
CREATE TABLE professionals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  registration TEXT, -- CRM, CRN, etc
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_professionals_clinic ON professionals(clinic_id);
CREATE INDEX idx_professionals_status ON professionals(status);
```

---

### 4. Tabela: `patients` (Pacientes/Contatos)

**Propósito**: Cadastro de pacientes

```sql
CREATE TABLE patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  phone TEXT NOT NULL,
  birth_date DATE,
  gender TEXT CHECK (gender IN ('M', 'F', 'other')),
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  health_plan TEXT, -- Particular, Unimed, etc
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_name ON patients(name);
```

---

### 5. Tabela: `appointments` (Agendamentos)

**Propósito**: Consultas e procedimentos agendados

```sql
CREATE TABLE appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES professionals(id),
  service TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'in_progress', 'completed',
    'cancelled', 'no_show'
  )),
  value DECIMAL(10,2),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'paid', 'partial', 'cancelled'
  )),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
```

---

### 6. Tabela: `pipeline_stages` (Estágios do Pipeline)

**Propósito**: Colunas do Kanban (Novos Contatos, Agendados, etc)

```sql
CREATE TABLE pipeline_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir estágios padrão
INSERT INTO pipeline_stages (clinic_id, name, color, order_index) VALUES
  (NULL, 'Novos Contatos', 'gray', 1),
  (NULL, 'Agendados', 'blue', 2),
  (NULL, 'Aguardando Confirmação', 'yellow', 3),
  (NULL, 'Confirmados', 'green', 4);
```

---

### 7. Tabela: `pipeline_cards` (Cards do Pipeline)

**Propósito**: Posição dos pacientes no Kanban

```sql
CREATE TABLE pipeline_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES pipeline_stages(id),
  appointment_id UUID REFERENCES appointments(id),
  order_index INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pipeline_cards_clinic ON pipeline_cards(clinic_id);
CREATE INDEX idx_pipeline_cards_stage ON pipeline_cards(stage_id);
```

---

### 8. Tabela: `transactions` (Transações Financeiras)

**Propósito**: Receitas e despesas

```sql
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  transaction_date DATE NOT NULL,
  payment_method TEXT,
  patient_id UUID REFERENCES patients(id),
  appointment_id UUID REFERENCES appointments(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transactions_clinic ON transactions(clinic_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_type ON transactions(type);
```

---

### 9. Tabela: `notes` (Anotações)

**Propósito**: Bloco de notas da clínica

```sql
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  content TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notes_clinic ON notes(clinic_id);
CREATE INDEX idx_notes_user ON notes(user_id);
```

---

### 10. Tabela: `documents` (Documentos Anexados)

**Propósito**: Arquivos da clínica

```sql
CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_clinic ON documents(clinic_id);
```

---

## 🔒 Row Level Security (RLS)

### Ativar RLS em todas as tabelas:

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
```

### Políticas de Segurança:

```sql
-- Profiles: Usuário pode ver e editar seu próprio perfil
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Pacientes: Acesso baseado na clínica do usuário
CREATE POLICY "Users can view clinic patients" ON patients
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert clinic patients" ON patients
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Repetir padrão similar para outras tabelas
```

---

## 📊 Views Úteis

### View: Métricas do Dashboard

```sql
CREATE OR REPLACE VIEW dashboard_metrics AS
SELECT
  clinic_id,
  COUNT(DISTINCT patients.id) as total_patients,
  COUNT(DISTINCT CASE
    WHEN appointments.appointment_date = CURRENT_DATE
    THEN appointments.id
  END) as appointments_today,
  ROUND(
    COUNT(DISTINCT CASE WHEN appointments.status = 'completed' THEN appointments.id END)::NUMERIC /
    NULLIF(COUNT(DISTINCT appointments.id), 0) * 100,
    2
  ) as conversion_rate
FROM patients
LEFT JOIN appointments ON patients.id = appointments.patient_id
GROUP BY clinic_id;
```

---

## 🚀 Próximos Passos

1. **Copiar e executar** cada bloco SQL no SQL Editor do Supabase
2. **Anotar** as credenciais:
   - Project URL
   - Anon/Public Key
   - Service Role Key (para admin)
3. **Atualizar** arquivo `.env` do projeto com as credenciais
4. **Testar** conexão com Supabase

Quer que eu crie os scripts SQL prontos para copiar e colar?
