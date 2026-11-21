-- Store each authenticated administrator/instructor's contract identity in their own app_settings row.
-- Existing RLS policies on app_settings already restrict access to admin/instrutor and owner_id = auth.uid().
BEGIN;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS contratante_nome text,
  ADD COLUMN IF NOT EXISTS contratante_documento text,
  ADD COLUMN IF NOT EXISTS contratante_nacionalidade text,
  ADD COLUMN IF NOT EXISTS contratante_estado_civil text,
  ADD COLUMN IF NOT EXISTS contratante_profissao text,
  ADD COLUMN IF NOT EXISTS contratante_endereco text;

COMMENT ON COLUMN public.app_settings.contratante_nome IS 'Nome do titular da conta para contratos; dado privado do owner_id.';
COMMENT ON COLUMN public.app_settings.contratante_documento IS 'CPF/CNPJ do titular da conta para contratos; dado privado do owner_id.';
COMMENT ON COLUMN public.app_settings.contratante_nacionalidade IS 'Nacionalidade do titular da conta para contratos.';
COMMENT ON COLUMN public.app_settings.contratante_estado_civil IS 'Estado civil do titular da conta para contratos.';
COMMENT ON COLUMN public.app_settings.contratante_profissao IS 'Profissão do titular da conta para contratos.';
COMMENT ON COLUMN public.app_settings.contratante_endereco IS 'Endereço do titular da conta para contratos; dado privado do owner_id.';

COMMIT;
