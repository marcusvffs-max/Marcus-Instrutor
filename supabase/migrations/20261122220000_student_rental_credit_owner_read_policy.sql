-- Libera leitura estritamente limitada dos saldos de aluguel da própria conta.
-- A tabela continua sem escrita direta pelo aplicativo.
DROP FUNCTION IF EXISTS public.get_student_rental_credit_availability(uuid);

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
