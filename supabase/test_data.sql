?-- ============================================
-- Script de Criação de Usuário de Teste
-- VITTALHUB - Sistema de Gestão de Clínicas
-- ============================================
-- 
-- INSTRUÇÕES:
-- 1. Execute este script no SQL Editor do Supabase
-- 2. Anote o codigo_clinica retornado
-- 3. Crie o usuário no Authentication do Supabase
-- 4. Execute o UPDATE para associar o usuário à clínica
-- ============================================

-- PASSO 1: Criar Clínica de Teste
-- (Os triggers criarão automaticamente: assinatura trial e configurações de pagamento)

INSERT INTO clinicas (
  nome_clinica, 
  cnpj, 
  email_clinica, 
  telefone
)
VALUES (
  'Clínica Teste VITTALHUB',
  '12.345.678/0001-90',
  'contato@clinicateste.com',
  '(11) 98765-4321'
)
RETURNING id, codigo_clinica, nome_clinica;

-- ⚠️ IMPORTANTE: Anote o 'id' e 'codigo_clinica' retornados acima!
-- Exemplo de retorno:
-- id: 550e8400-e29b-41d4-a716-446655440000
-- codigo_clinica: VH-12345
-- nome_clinica: Clínica Teste VITTALHUB

-- ============================================
-- PASSO 2: Criar Usuário no Supabase Auth
-- ============================================
-- 
-- Vá para: Supabase Dashboard → Authentication → Users → Add User
-- 
-- Preencha:
-- - Email: admin@vittalhub.com
-- - Password: teste123456
-- - Auto Confirm User: ✓ (marcar)
-- 
-- Após criar, ANOTE o UUID do usuário (aparece na lista de usuários)
-- ============================================

-- PASSO 3: Associar Usuário à Clínica
-- Substitua os valores abaixo pelos UUIDs reais:

UPDATE profiles
SET 
  clinica_id = 'COLE_AQUI_O_ID_DA_CLINICA',  -- UUID do PASSO 1
  role = 'admin',
  full_name = 'Admin Teste',
  telefone = '(11) 98765-4321',
  status = 'active'
WHERE id = 'COLE_AQUI_O_ID_DO_USUARIO';  -- UUID do PASSO 2

-- ============================================
-- PASSO 4: Verificar se tudo foi criado corretamente
-- ============================================

SELECT 
  c.id as clinica_id,
  c.codigo_clinica,
  c.nome_clinica,
  c.email_clinica,
  p.id as usuario_id,
  p.full_name,
  p.email,
  p.role,
  a.plano,
  a.status as status_assinatura,
  a.trial_inicio,
  a.trial_fim,
  trial_dias_restantes(a.id) as dias_trial_restantes
FROM clinicas c
LEFT JOIN profiles p ON p.clinica_id = c.id
LEFT JOIN assinaturas a ON a.clinica_id = c.id
WHERE c.nome_clinica = 'Clínica Teste VITTALHUB';

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- clinica_id: [UUID da clínica]
-- codigo_clinica: VH-XXXXX
-- nome_clinica: Clínica Teste VITTALHUB
-- email_clinica: contato@clinicateste.com
-- usuario_id: [UUID do usuário]
-- full_name: Admin Teste
-- email: admin@vittalhub.com
-- role: admin
-- plano: trial
-- status_assinatura: trial
-- trial_inicio: [data de hoje]
-- trial_fim: [data de hoje + 14 dias]
-- dias_trial_restantes: 14
-- ============================================

-- ============================================
-- CREDENCIAIS DE LOGIN:
-- ============================================
-- Email: admin@vittalhub.com
-- Senha: teste123456
-- ============================================

-- OPCIONAL: Adicionar endereço à clínica
INSERT INTO enderecos_clinica (
  clinica_id,
  cep,
  endereco,
  numero,
  complemento,
  bairro,
  cidade,
  estado
)
VALUES (
  'COLE_AQUI_O_ID_DA_CLINICA',  -- Mesmo UUID do PASSO 1
  '01310-100',
  'Avenida Paulista',
  '1578',
  'Sala 101',
  'Bela Vista',
  'São Paulo',
  'SP'
);
