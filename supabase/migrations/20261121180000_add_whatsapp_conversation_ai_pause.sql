-- Add an explicit, server-enforced 48-hour pause for WhatsApp conversations.
-- Apply only to the isolated test project until separately reviewed and approved.
BEGIN;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS ai_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS ai_pause_reason text;
ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_ai_pause_reason_check;
ALTER TABLE public.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_ai_pause_reason_check
  CHECK (
    ai_pause_reason IS NULL OR
    ai_pause_reason = ANY (ARRAY[
      'cliente_encerramento',
      'instrutor_encerramento',
      'instrutor_mensagem_manual'
    ])
  );
COMMENT ON COLUMN public.whatsapp_conversations.ai_paused_until IS
  'Fim da pausa da Assistente Virtual; a conversa só volta a aceitar IA após este instante, salvo reativação explícita do cliente.';
COMMENT ON COLUMN public.whatsapp_conversations.ai_pause_reason IS
  'Origem do encerramento que iniciou a pausa de 48 horas.';
COMMIT;
