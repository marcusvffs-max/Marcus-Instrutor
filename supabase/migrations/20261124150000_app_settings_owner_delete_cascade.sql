-- Permite excluir contas de qualquer perfil sem deixar configurações órfãs.
-- As configurações pertencem exclusivamente à conta e não são histórico financeiro.
ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_owner_id_fkey;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
