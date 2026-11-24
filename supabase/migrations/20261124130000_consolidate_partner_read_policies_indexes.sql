-- Consolida a leitura da tabela partners em uma única política e remove
-- índices redundantes deixados pela estrutura anterior do módulo.
DROP POLICY IF EXISTS partners_owner_or_self_select ON public.partners;
DROP POLICY IF EXISTS partners_owner_select ON public.partners;
CREATE POLICY partners_owner_or_self_select ON public.partners
  FOR SELECT TO authenticated
  USING (
    (owner_id = (SELECT auth.uid()) AND private.current_app_role() IN ('admin','instrutor'))
    OR user_id = (SELECT auth.uid())
  );

DROP INDEX IF EXISTS public.partners_owner_status_idx;
DROP INDEX IF EXISTS public.partner_commission_lessons_commission_idx;
DROP INDEX IF EXISTS public.partner_message_recipients_partner_idx;
