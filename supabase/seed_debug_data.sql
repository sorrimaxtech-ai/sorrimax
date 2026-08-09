-- =========================================================
-- SEED MOCK CHAT FOR DEBUG USER
-- Targets the clinic of 'debug@crm.com'
-- =========================================================

DO $$
DECLARE
  v_clinica_id UUID;
  v_instance_id UUID;
  v_chat_id UUID;
BEGIN
  -- 1. Get Clinic ID for the debug user
  SELECT clinica_id INTO v_clinica_id
  FROM profiles
  WHERE email = 'debug@crm.com';

  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'User debug@crm.com not found. Please register first.';
  END IF;

  -- 2. Create/Get Mock Instance
  INSERT INTO whatsapp_instances (id, clinica_id, name, instance_id, status)
  VALUES (gen_random_uuid(), v_clinica_id, 'Debug Instance', 'debug_instance', 'connected')
  ON CONFLICT DO NOTHING; -- Assuming instance_id unicity or just ignore for now if dupes allowed

  SELECT id INTO v_instance_id FROM whatsapp_instances WHERE clinica_id = v_clinica_id LIMIT 1;

  -- 3. Create Mock Chat
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
    v_instance_id,
    '5511888888888@s.whatsapp.net',
    'Debug Patient',
    'https://github.com/shadcn.png',
    1,
    'Debug message link checks',
    NOW(),
    'open'
  )
  RETURNING id INTO v_chat_id;

  -- 4. Create Messages
  INSERT INTO whatsapp_messages (chat_id, content, from_me, created_at)
  VALUES 
    (v_chat_id, 'Hello world', false, NOW());

END $$;
