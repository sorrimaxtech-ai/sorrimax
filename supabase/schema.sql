-- ============================================
-- VITTALHUB - Script de Criação do Banco de Dados
-- Execute este script no SQL Editor do Supabase
-- ============================================

-- 1. TABELA: clinics
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

-- 2. TABELA: profiles
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

-- 3. TABELA: professionals
CREATE TABLE professionals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  registration TEXT,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_professionals_clinic ON professionals(clinic_id);
CREATE INDEX idx_professionals_status ON professionals(status);

-- 4. TABELA: patients
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
  health_plan TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_name ON patients(name);

-- 5. TABELA: appointments
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

-- 6. TABELA: pipeline_stages
CREATE TABLE pipeline_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. TABELA: pipeline_cards
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

-- 8. TABELA: transactions
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

-- 9. TABELA: notes
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

-- 10. TABELA: documents
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

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

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

-- Políticas para profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Políticas para patients
CREATE POLICY "Users can view clinic patients" ON patients
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert clinic patients" ON patients
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update clinic patients" ON patients
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Políticas para appointments
CREATE POLICY "Users can view clinic appointments" ON appointments
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert clinic appointments" ON appointments
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update clinic appointments" ON appointments
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Políticas para professionals
CREATE POLICY "Users can view clinic professionals" ON professionals
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert clinic professionals" ON professionals
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Políticas para transactions
CREATE POLICY "Users can view clinic transactions" ON transactions
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert clinic transactions" ON transactions
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Políticas para notes
CREATE POLICY "Users can view clinic notes" ON notes
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert clinic notes" ON notes
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own notes" ON notes
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================
-- DADOS INICIAIS (OPCIONAL)
-- ============================================

-- Inserir estágios padrão do pipeline
-- Nota: Execute isso DEPOIS de criar sua primeira clínica
-- Substitua 'YOUR_CLINIC_ID' pelo ID real da clínica

/*
INSERT INTO pipeline_stages (clinic_id, name, color, order_index) VALUES
  ('YOUR_CLINIC_ID', 'Novos Contatos', 'gray', 1),
  ('YOUR_CLINIC_ID', 'Agendados', 'blue', 2),
  ('YOUR_CLINIC_ID', 'Aguardando Confirmação', 'yellow', 3),
  ('YOUR_CLINIC_ID', 'Confirmados', 'green', 4);
*/

-- ============================================
-- VIEW: Dashboard Metrics
-- ============================================

CREATE OR REPLACE VIEW dashboard_metrics AS
SELECT 
  p.clinic_id,
  COUNT(DISTINCT p.id) as total_patients,
  COUNT(DISTINCT CASE 
    WHEN a.appointment_date = CURRENT_DATE 
    THEN a.id 
  END) as appointments_today,
  ROUND(
    COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END)::NUMERIC / 
    NULLIF(COUNT(DISTINCT a.id), 0) * 100, 
    2
  ) as conversion_rate
FROM patients p
LEFT JOIN appointments a ON p.id = a.patient_id
GROUP BY p.clinic_id;

-- ============================================
-- FIM DO SCRIPT
-- ============================================
