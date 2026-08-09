-- Insert Mock Instance if not exists
INSERT INTO whatsapp_instances (id, clinica_id, name, instance_id, status)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM clinicas LIMIT 1), -- Get first available clinic
  'Mock Instance',
  'clinic_mock',
  'connected'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_instances WHERE instance_id = 'clinic_mock');

-- Insert Mock Chat
INSERT INTO whatsapp_chats (
  instance_id,
  remote_jid,
  name,
  profile_pic_url,
  unread_count,
  last_message_content,
  last_message_time,
  status
)
VALUES (
  (SELECT id FROM whatsapp_instances WHERE instance_id = 'clinic_mock' LIMIT 1),
  '5511999999999@s.whatsapp.net',
  'Paciente Teste',
  'https://github.com/shadcn.png',
  2,
  'Olá, gostaria de agendar uma consulta.',
  NOW(),
  'open'
)
ON CONFLICT (instance_id, remote_jid) DO UPDATE
SET 
  unread_count = 2,
  last_message_content = 'Olá, gostaria de agendar uma consulta. (Updated)',
  last_message_time = NOW();

-- Insert Mock Messages for this chat
INSERT INTO whatsapp_messages (chat_id, content, from_me, created_at)
VALUES 
  ((SELECT id FROM whatsapp_chats WHERE remote_jid = '5511999999999@s.whatsapp.net' LIMIT 1), 'Olá, tudo bem?', false, NOW() - INTERVAL '1 hour'),
  ((SELECT id FROM whatsapp_chats WHERE remote_jid = '5511999999999@s.whatsapp.net' LIMIT 1), 'Gostaria de agendar.', false, NOW() - INTERVAL '30 minutes');
