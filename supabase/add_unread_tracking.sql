-- =========================================================
-- ADD UNREAD MESSAGE TRACKING
-- Migration to add last_read_at column and unread count function
-- =========================================================

-- Add last_read_at column to track when user last viewed each chat
ALTER TABLE whatsapp_chats 
ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE;

-- Create function to calculate unread messages count
CREATE OR REPLACE FUNCTION get_unread_count(p_chat_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM whatsapp_messages
    WHERE chat_id = p_chat_id
      AND from_me = false
      AND created_at > COALESCE(
        (SELECT last_read_at FROM whatsapp_chats WHERE id = p_chat_id),
        '1970-01-01'::timestamp
      )
  );
END;
$$ LANGUAGE plpgsql;

-- Create index for better performance on unread count queries
CREATE INDEX IF NOT EXISTS idx_wa_messages_chat_from_me_created 
ON whatsapp_messages(chat_id, from_me, created_at);

COMMENT ON COLUMN whatsapp_chats.last_read_at IS 'Timestamp when user last viewed this chat';
COMMENT ON FUNCTION get_unread_count IS 'Calculates number of unread messages in a chat based on last_read_at';
