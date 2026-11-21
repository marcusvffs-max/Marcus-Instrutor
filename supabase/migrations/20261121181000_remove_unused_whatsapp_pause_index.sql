-- The pause timestamp is checked per conversation, so no dedicated index is needed.
DROP INDEX IF EXISTS public.whatsapp_conversations_ai_paused_until_idx;
