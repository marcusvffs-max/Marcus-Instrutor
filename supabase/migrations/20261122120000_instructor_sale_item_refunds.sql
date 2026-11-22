-- Devolução de itens de venda pelo próprio instrutor.
-- A função é SECURITY INVOKER: as políticas RLS continuam sendo aplicadas.
CREATE OR REPLACE FUNCTION public.instructor_refund_sale_item(
  p_sale_item_id uuid,
  p_quantidade numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.sale_items%rowtype;
  v_sale public.sales%rowtype;
  v_student public.students%rowtype;
  v_remaining numeric;
  v_net_value numeric;
  v_unit_net numeric;
  v_refund numeric;
BEGIN
  IF v_uid IS NULL OR private.current_app_role() IS DISTINCT FROM 'instrutor' THEN
    RAISE EXCEPTION 'Acesso permitido somente ao instrutor autenticado com autorização ativa.'
      USING ERRCODE = '42501';
  END IF;

  IF p_sale_item_id IS NULL OR p_quantidade IS NULL
     OR p_quantidade <= 0 OR p_quantidade <> trunc(p_quantidade) THEN
    RAISE EXCEPTION 'Informe um item e uma quantidade inteira válida.'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_sale
  FROM public.sales AS s
  JOIN public.sale_items AS si ON si.sale_id = s.id
  WHERE si.id = p_sale_item_id
    AND s.owner_id = v_uid
  LIMIT 1
  FOR UPDATE OF s;

  IF NOT FOUND OR v_sale.student_id IS NULL THEN
    RAISE EXCEPTION 'Venda não encontrada nesta conta.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_sale.status IS DISTINCT FROM 'confirmada' THEN
    RAISE EXCEPTION 'Somente vendas confirmadas permitem devolução.'
      USING ERRCODE = '22023';
  END IF;

  SELECT si.* INTO v_item
  FROM public.sale_items AS si
  WHERE si.id = p_sale_item_id
    AND si.sale_id = v_sale.id
    AND si.owner_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado nesta venda.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_item.tipo_item = 'produto' THEN
    v_remaining := coalesce(v_item.quantidade, 0) - coalesce(v_item.quantidade_devolvida, 0);
    IF p_quantidade > v_remaining THEN
      RAISE EXCEPTION 'Quantidade maior que os produtos disponíveis para devolução.'
        USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_item.quantidade, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade original do produto inválida.'
        USING ERRCODE = '22023';
    END IF;

    v_net_value := coalesce(v_item.valor_liquido, v_item.subtotal, 0);
    v_unit_net := v_net_value / v_item.quantidade;
    v_refund := least(
      round(v_unit_net * p_quantidade, 2),
      v_net_value - coalesce(v_item.valor_devolvido, 0)
    );

    IF v_refund <= 0 THEN
      RAISE EXCEPTION 'Valor de devolução inválido.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.sale_items
    SET quantidade_devolvida = coalesce(quantidade_devolvida, 0) + p_quantidade,
        valor_devolvido = coalesce(valor_devolvido, 0) + v_refund
    WHERE id = p_sale_item_id
      AND sale_id = v_sale.id
      AND owner_id = v_uid;

    INSERT INTO public.financial_transactions (
      owner_id, student_id, sale_id, tipo, descricao,
      valor, data_movimento, status
    ) VALUES (
      v_uid, v_sale.student_id, v_sale.id, 'saida',
      'Devolução de ' || p_quantidade || ' unidade(s) - ' || v_item.descricao,
      v_refund, current_date, 'confirmado'
    );

    RETURN jsonb_build_object(
      'sale_id', v_sale.id,
      'produto_devolvido', p_quantidade,
      'valor_devolvido', v_refund
    );

  ELSIF v_item.tipo_item = 'servico' THEN
    SELECT * INTO v_student
    FROM public.students
    WHERE id = v_sale.student_id
      AND owner_id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aluno desta venda não encontrado nesta conta.'
        USING ERRCODE = 'P0002';
    END IF;

    v_remaining := coalesce(v_item.aulas_contratadas, 0) - coalesce(v_item.aulas_devolvidas, 0);
    IF p_quantidade > v_remaining THEN
      RAISE EXCEPTION 'Quantidade maior que as aulas disponíveis para devolução.'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_student.aulas_restantes, 0) < p_quantidade THEN
      RAISE EXCEPTION 'Parte dessas aulas já foi utilizada e não pode ser devolvida.'
        USING ERRCODE = '22023';
    END IF;

    v_net_value := coalesce(v_item.valor_liquido, v_item.subtotal, 0);
    v_refund := least(
      round(coalesce(v_item.valor_por_aula, 0) * p_quantidade, 2),
      v_net_value - coalesce(v_item.valor_devolvido, 0)
    );

    IF v_refund <= 0 THEN
      RAISE EXCEPTION 'Valor de devolução inválido.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.sale_items
    SET aulas_devolvidas = coalesce(aulas_devolvidas, 0) + p_quantidade,
        valor_devolvido = coalesce(valor_devolvido, 0) + v_refund
    WHERE id = p_sale_item_id
      AND sale_id = v_sale.id
      AND owner_id = v_uid;

    UPDATE public.students
    SET aulas_compradas = greatest(0, coalesce(aulas_compradas, 0) - p_quantidade),
        aulas_restantes = greatest(0, coalesce(aulas_restantes, 0) - p_quantidade)
    WHERE id = v_sale.student_id
      AND owner_id = v_uid;

    INSERT INTO public.financial_transactions (
      owner_id, student_id, sale_id, tipo, descricao,
      valor, data_movimento, status
    ) VALUES (
      v_uid, v_sale.student_id, v_sale.id, 'saida',
      'Devolução de ' || p_quantidade || ' aula(s) - ' || v_item.descricao,
      v_refund, current_date, 'confirmado'
    );

    RETURN jsonb_build_object(
      'sale_id', v_sale.id,
      'aulas_devolvidas', p_quantidade,
      'valor_devolvido', v_refund
    );
  ELSE
    RAISE EXCEPTION 'Tipo de item não permite devolução.'
      USING ERRCODE = '22023';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.instructor_refund_sale_item(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_refund_sale_item(uuid, numeric) TO authenticated;
