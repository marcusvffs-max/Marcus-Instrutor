-- Expõe somente a quantidade não consumida de cada compra de aluguel ao próprio responsável.
CREATE OR REPLACE FUNCTION public.get_student_rental_credit_availability(
  p_sale_id uuid DEFAULT NULL
)
RETURNS TABLE (
  sale_item_id uuid,
  quantity_available integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR private.current_app_role() NOT IN ('admin', 'instrutor') THEN
    RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor.';
  END IF;

  RETURN QUERY
  SELECT
    credit.sale_item_id,
    (credit.quantity_purchased - credit.quantity_refunded - credit.quantity_consumed)::integer
  FROM public.student_rental_credits AS credit
  JOIN public.sales AS sale
    ON sale.id = credit.sale_id
   AND sale.owner_id = credit.owner_id
  WHERE credit.owner_id = v_uid
    AND (p_sale_id IS NULL OR credit.sale_id = p_sale_id)
  ORDER BY credit.created_at, credit.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_rental_credit_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_rental_credit_availability(uuid) TO authenticated;
