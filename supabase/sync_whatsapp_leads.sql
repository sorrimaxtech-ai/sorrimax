-- =========================================================
-- SYNC WHATSAPP TO LEADS (Updated Strategy)
-- Syncs directly from whatsapp_chats to leads
-- =========================================================

-- 1. Add columns to leads table (IDEM)
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS unread_messages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE;

-- 2. Function to handle chat updates
CREATE OR REPLACE FUNCTION handle_whatsapp_chat_update()
RETURNS TRIGGER AS $$
DECLARE
  v_phone TEXT;
  v_clinica_id UUID;
  v_lead_id UUID;
  v_first_stage_id UUID;
BEGIN
  -- Get clinic_id from instance (if not available in NEW, query it)
  -- NEW.instance_id is available.
  SELECT clinica_id INTO v_clinica_id
  FROM whatsapp_instances
  WHERE id = NEW.instance_id;

  -- Clean phone number
  v_phone := SPLIT_PART(NEW.remote_jid, '@', 1);

  -- 1. Try to find existing lead
  SELECT id INTO v_lead_id
  FROM leads
  WHERE telefone = v_phone AND clinica_id = v_clinica_id
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    -- Update existing lead
    -- Sync unread count and last message time
    UPDATE leads
    SET 
      unread_messages = NEW.unread_count,
      last_message_at = NEW.last_message_time,
      updated_at = NOW()
    WHERE id = v_lead_id;
  ELSE
    -- If there are unread messages, CREATE NEW LEAD
    -- We don't want to create leads for every old chat, 
    -- only if it has activity (unread > 0) OR if it's explicitly new.
    -- User wanted "new people... in New Lead".
    
    IF NEW.unread_count > 0 THEN
        -- Get first stage
        SELECT id INTO v_first_stage_id
        FROM pipeline_stages
        WHERE clinica_id = v_clinica_id
        ORDER BY ordem ASC
        LIMIT 1;

        INSERT INTO leads (
          clinica_id,
          stage_id,
          nome,
          telefone,
          origem,
          status,
          unread_messages,
          last_message_at,
          created_at
        ) VALUES (
          v_clinica_id,
          v_first_stage_id,
          NEW.name, -- Use name from chat
          v_phone,
          'WhatsApp',
          'open',
          NEW.unread_count,
          NEW.last_message_time,
          NOW()
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger on whatsapp_chats
DROP TRIGGER IF EXISTS trigger_handle_chat_update ON whatsapp_chats;

CREATE TRIGGER trigger_handle_chat_update
  AFTER INSERT OR UPDATE ON whatsapp_chats
  FOR EACH ROW
  EXECUTE FUNCTION handle_whatsapp_chat_update();
