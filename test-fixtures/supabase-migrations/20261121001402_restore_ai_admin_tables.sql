-- Restore admin-only AI request/settings schema in isolated security tests.
-- No production rows or WhatsApp conversation content is copied.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_runtime_settings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'whatsapp',
  telefone_solicitante text NOT NULL,
  nome_solicitante text,
  tipo_solicitacao text NOT NULL,
  dados_propostos jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  observacao_instrutor text,
  aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  processado_em timestamptz,
  resultado jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  atendimento_status text NOT NULL DEFAULT 'pendente',
  CONSTRAINT ai_requests_canal_check CHECK (canal='whatsapp'),
  CONSTRAINT ai_requests_status_check CHECK (status=ANY(ARRAY['pendente','precisa_informacao','aprovada','recusada','processada','falhou'])),
  CONSTRAINT ai_requests_atendimento_status_check CHECK (atendimento_status=ANY(ARRAY['pendente','em_atendimento','concluido','cancelado']))
);
CREATE INDEX IF NOT EXISTS ai_requests_owner_status_created_idx ON public.ai_requests(owner_id,status,created_at DESC);
ALTER TABLE public.ai_runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ai_runtime_settings,public.ai_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.ai_runtime_settings TO authenticated;
GRANT SELECT ON TABLE public.ai_requests TO authenticated;
DROP POLICY IF EXISTS ai_runtime_settings_admin_select_own ON public.ai_runtime_settings;
DROP POLICY IF EXISTS ai_runtime_settings_admin_update_own ON public.ai_runtime_settings;
CREATE POLICY ai_runtime_settings_admin_select_own ON public.ai_runtime_settings FOR SELECT TO authenticated USING (owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));
CREATE POLICY ai_runtime_settings_admin_update_own ON public.ai_runtime_settings FOR UPDATE TO authenticated USING (owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin')) WITH CHECK (owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));
DROP POLICY IF EXISTS ai_requests_admin_select_own ON public.ai_requests;
DROP POLICY IF EXISTS ai_requests_admin_update_own ON public.ai_requests;
CREATE POLICY ai_requests_admin_select_own ON public.ai_requests FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin'));
CREATE POLICY ai_requests_admin_update_own ON public.ai_requests FOR UPDATE TO authenticated USING (owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin')) WITH CHECK (owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin'));
COMMIT;
