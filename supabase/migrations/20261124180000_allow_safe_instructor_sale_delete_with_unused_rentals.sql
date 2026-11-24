CREATE OR REPLACE FUNCTION private.protect_vehicle_rental_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.fixed_item_key = 'aluguel_veiculo' THEN
    IF TG_OP = 'DELETE'
       AND current_setting('app.allow_vehicle_rental_sale_delete', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'A venda de Aluguel de Veículo só pode ser excluída pelo fluxo seguro de exclusão de venda.';
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW IS DISTINCT FROM OLD
       AND current_setting('app.allow_vehicle_rental_refund', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Alterações em vendas de Aluguel de Veículo devem utilizar o fluxo próprio de devolução.';
    END IF;
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := private.current_app_role();
  v_sale public.sales%rowtype;
  v_student public.students%rowtype;
  v_net_lessons integer := 0;
  v_rental_items integer := 0;
  v_rental_ledger_items integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING errcode='42501';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'instrutor' THEN
    RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor com autorização ativa.' USING errcode='42501';
  END IF;

  SELECT * INTO v_sale
    FROM public.sales
   WHERE id=p_sale_id AND owner_id=v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada nesta conta.' USING errcode='P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.partner_commissions c
     WHERE c.sale_id=p_sale_id AND c.owner_id=v_uid
  ) THEN
    RAISE EXCEPTION 'Esta venda possui comissão vinculada a um parceiro e não pode ser excluída. Preserve o histórico e utilize os procedimentos de devolução ou cancelamento permitidos.'
      USING errcode='23503';
  END IF;

  SELECT count(*)::integer INTO v_rental_items
    FROM public.sale_items si
   WHERE si.sale_id=p_sale_id
     AND si.owner_id=v_uid
     AND si.fixed_item_key='aluguel_veiculo';

  IF v_rental_items > 0 THEN
    SELECT count(*)::integer INTO v_rental_ledger_items
      FROM public.sale_items si
      JOIN public.student_rental_credits c
        ON c.sale_item_id=si.id AND c.owner_id=v_uid
     WHERE si.sale_id=p_sale_id
       AND si.owner_id=v_uid
       AND si.fixed_item_key='aluguel_veiculo';

    IF v_rental_ledger_items <> v_rental_items THEN
      RAISE EXCEPTION 'Não foi possível comprovar o saldo dos aluguéis desta venda. A exclusão foi bloqueada para preservar o histórico.';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.sale_items si
        JOIN public.student_rental_credits c
          ON c.sale_item_id=si.id AND c.owner_id=v_uid
       WHERE si.sale_id=p_sale_id
         AND si.owner_id=v_uid
         AND si.fixed_item_key='aluguel_veiculo'
         AND (
           coalesce(c.quantity_consumed,0) > 0
           OR coalesce(c.quantity_refunded,0) > 0
           OR coalesce(c.quantity_purchased,0) <>
              greatest(0,coalesce(si.quantidade,0)-coalesce(si.quantidade_devolvida,0))
         )
    ) THEN
      RAISE EXCEPTION 'Esta venda possui aluguéis utilizados ou devolvidos. Preserve o histórico e utilize o fluxo de devolução.';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.student_practical_exams e
        JOIN public.student_rental_credits c
          ON c.id=e.rental_credit_id AND c.owner_id=v_uid
        JOIN public.sale_items si
          ON si.id=c.sale_item_id AND si.owner_id=v_uid
       WHERE si.sale_id=p_sale_id
    ) THEN
      RAISE EXCEPTION 'Há exame prático vinculado a um aluguel desta venda. A exclusão foi bloqueada para preservar o histórico.';
    END IF;
  END IF;

  IF v_sale.student_id IS NOT NULL THEN
    SELECT * INTO v_student
      FROM public.students
     WHERE id=v_sale.student_id AND owner_id=v_uid
     FOR UPDATE;

    SELECT coalesce(sum(greatest(0,coalesce(si.aulas_contratadas,0)-coalesce(si.aulas_devolvidas,0))),0)::integer
      INTO v_net_lessons
      FROM public.sale_items si
     WHERE si.sale_id=p_sale_id AND si.owner_id=v_uid;

    IF coalesce(v_student.aulas_restantes,0) < v_net_lessons THEN
      RAISE EXCEPTION 'Não é possível excluir: parte das aulas desta venda já foi utilizada.';
    END IF;

    UPDATE public.students
       SET aulas_compradas=greatest(0,coalesce(aulas_compradas,0)-v_net_lessons),
           aulas_restantes=greatest(0,coalesce(aulas_restantes,0)-v_net_lessons)
     WHERE id=v_sale.student_id AND owner_id=v_uid;
  END IF;

  DELETE FROM public.financial_transactions
   WHERE sale_id=p_sale_id AND owner_id=v_uid;

  IF v_rental_items > 0 THEN
    PERFORM pg_catalog.set_config('app.allow_vehicle_rental_sale_delete','true',true);
  END IF;

  DELETE FROM public.sales
   WHERE id=p_sale_id AND owner_id=v_uid;

  RETURN jsonb_build_object('sale_id',p_sale_id,'aulas_removidas',v_net_lessons);
END;
$function$;