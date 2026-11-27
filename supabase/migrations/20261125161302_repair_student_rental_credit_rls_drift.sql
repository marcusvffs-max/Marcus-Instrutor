-- Repair schema drift: the original owner-read migration is recorded in the
-- production migration history, but the policy and authenticated column grants
-- are absent from the live production schema.
--
-- Safe to run after migration-history reconciliation. This does not alter data
-- and keeps reads restricted to the authenticated owner with an active app role.

DROP POLICY IF EXISTS student_rental_credits_owner_select
  ON public.student_rental_credits;

CREATE POLICY student_rental_credits_owner_select
  ON public.student_rental_credits
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND private.current_app_role() IN ('admin', 'instrutor')
  );

REVOKE ALL ON TABLE public.student_rental_credits
  FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  sale_item_id,
  quantity_purchased,
  quantity_refunded,
  quantity_consumed
)
ON TABLE public.student_rental_credits
TO authenticated;
