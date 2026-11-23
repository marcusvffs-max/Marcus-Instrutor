-- Restore backend-only WhatsApp tables in isolated security tests.
-- Deliberately no anon/authenticated grants or RLS policies.
-- No message content, phone numbers, or production records are copied.
BEGIN;
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  nome_contato text,
  status text NOT NULL DEFAULT 'aberta',
  ultima_mensagem_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  quote_state jsonb,
  CONSTRAINT whatsapp_conversations_owner_id_telefone_key UNIQUE(owner_id,telefone),
  CONSTRAINT whatsapp_conversations_status_check CHECK (status=ANY(ARRAY['aberta','aguardando','encerrada','aguardando_escolha','atendimento_ia','atendimento_humano']))
);
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  provider_message_id text UNIQUE,
  direcao text NOT NULL,
  tipo_mensagem text NOT NULL DEFAULT 'texto',
  conteudo text,
  status_provedor text,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_messages_direcao_check CHECK (direcao=ANY(ARRAY['entrada','saida']))
);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_owner_updated_idx ON public.whatsapp_conversations(owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_created_idx ON public.whatsapp_messages(conversation_id,created_at);
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.whatsapp_conversations,public.whatsapp_messages FROM PUBLIC,anon,authenticated;
GRANT ALL PRIVILEGES ON TABLE public.whatsapp_conversations,public.whatsapp_messages TO service_role;
COMMIT;
