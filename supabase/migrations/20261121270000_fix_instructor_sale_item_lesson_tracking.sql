-- Keep instructor-created sales compatible with lesson refunds and deletion.
-- Each sale item must persist the lesson count and net unit value used by
-- admin_refund_sale_lessons() and delete_my_sale().

BEGIN;

CREATE OR REPLACE FUNCTION public.create_instructor_sale(
  p_sale_id uuid,
  p_student_id uuid,
  p_items jsonb,
  p_payment_method text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_student_name text;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_item_type text;
  v_subtotal numeric;
  v_total numeric := 0;
  v_lessons integer := 0;
  v_item_lessons integer := 0;
  v_item_description text;
  v_description text := '';
  v_inserted_id uuid;
  v_existing_owner uuid;
BEGIN
  IF v_owner_id IS NULL OR private.current_app_role() IS DISTINCT FROM 'instrutor' THEN
    RAISE EXCEPTION 'Apenas instrutores autenticados podem registrar vendas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_sale_id IS NULL OR p_student_id IS NULL
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe aluno e pelo menos um item válido.'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.nome INTO v_student_name
  FROM public.students s
  WHERE s.id = p_student_id AND s.owner_id = v_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado ou não pertence a este instrutor.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sales (
    id, owner_id, student_id, data_venda, total, subtotal_bruto,
    desconto, forma_pagamento, status, observacoes
  )
  VALUES (
    p_sale_id, v_owner_id, p_student_id, current_date, 0, 0,
    0, p_payment_method, 'confirmada', p_notes
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    SELECT s.owner_id INTO v_existing_owner
    FROM public.sales s
    WHERE s.id = p_sale_id;

    IF v_existing_owner = v_owner_id THEN
      RETURN p_sale_id;
    END IF;

    RAISE EXCEPTION 'Identificador de venda já utilizado.'
      USING ERRCODE = '23505';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := nullif(v_item->>'quantidade', '')::numeric;

    IF v_product_id IS NULL OR v_quantity IS NULL
       OR v_quantity <= 0 OR v_quantity <> trunc(v_quantity) THEN
      RAISE EXCEPTION 'Item de venda ou quantidade inválida.'
        USING ERRCODE = '22023';
    END IF;

    SELECT p.* INTO v_product
    FROM public.products p
    WHERE p.id = v_product_id
      AND p.owner_id = v_owner_id
      AND p.ativo = true
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto ou serviço não encontrado, inativo ou de outro instrutor.'
        USING ERRCODE = '42501';
    END IF;

    IF v_product.preco <= 0 THEN
      RAISE EXCEPTION 'O item % não possui preço válido.', v_product.nome
        USING ERRCODE = '22023';
    END IF;

    IF v_product.quantidade_aulas_min IS NOT NULL
       AND v_quantity < v_product.quantidade_aulas_min THEN
      RAISE EXCEPTION 'A quantidade do pacote % está abaixo do mínimo de % aulas.',
        v_product.nome, v_product.quantidade_aulas_min
        USING ERRCODE = '22023';
    END IF;

    IF v_product.quantidade_aulas_max IS NOT NULL
       AND v_quantity > v_product.quantidade_aulas_max THEN
      RAISE EXCEPTION 'A quantidade do pacote % ultrapassa o máximo de % aulas.',
        v_product.nome, v_product.quantidade_aulas_max
        USING ERRCODE = '22023';
    END IF;

    v_item_type := CASE
      WHEN v_product.tipo IN ('servico', 'pacote')
        OR v_product.quantidade_aulas IS NOT NULL
        OR v_product.quantidade_aulas_min IS NOT NULL
        OR v_product.quantidade_aulas_max IS NOT NULL
        OR lower(coalesce(v_product.app_product_id, '')) IN ('bronze', 'prata', 'ouro')
        OR lower(v_product.nome) LIKE 'pacote %'
        OR lower(v_product.nome) LIKE 'aula avulsa%'
      THEN 'servico'
      ELSE 'produto'
    END;

    v_subtotal := round(v_product.preco * v_quantity, 2);
    v_item_lessons := 0;

    IF v_item_type = 'servico' THEN
      IF v_product.quantidade_aulas_min IS NOT NULL
         OR v_product.quantidade_aulas_max IS NOT NULL THEN
        v_item_lessons := v_quantity::integer;
      ELSE
        v_item_lessons := (
          v_quantity * greatest(1, coalesce(v_product.quantidade_aulas, 1))
        )::integer;
      END IF;
    END IF;

    INSERT INTO public.sale_items (
      owner_id, sale_id, product_id, descricao, quantidade,
      valor_unitario, subtotal, tipo_item, aulas_contratadas,
      aulas_devolvidas, valor_por_aula, valor_devolvido, valor_liquido
    )
    VALUES (
      v_owner_id, p_sale_id, v_product.id, v_product.nome, v_quantity,
      v_product.preco, v_subtotal, v_item_type, v_item_lessons,
      0,
      CASE WHEN v_item_lessons > 0
        THEN round(v_subtotal / v_item_lessons, 2)
        ELSE 0
      END,
      0, v_subtotal
    );

    v_lessons := v_lessons + v_item_lessons;
    v_total := v_total + v_subtotal;

    v_item_description := v_product.nome || ' (' ||
      trim(to_char(v_quantity, 'FM999999990')) || ')';
    v_description := concat_ws(', ', nullif(v_description, ''), v_item_description);
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'O total da venda deve ser maior que zero.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.sales
  SET total = v_total,
      subtotal_bruto = v_total,
      desconto = 0
  WHERE id = p_sale_id AND owner_id = v_owner_id;

  INSERT INTO public.financial_transactions (
    owner_id, student_id, sale_id, tipo, descricao,
    valor, data_movimento, status
  )
  VALUES (
    v_owner_id, p_student_id, p_sale_id, 'entrada',
    'Venda para ' || v_student_name || ': ' || v_description,
    v_total, current_date, 'confirmado'
  );

  IF v_lessons > 0 THEN
    UPDATE public.students
    SET aulas_compradas = coalesce(aulas_compradas, 0) + v_lessons,
        aulas_restantes = coalesce(aulas_restantes, 0) + v_lessons
    WHERE id = p_student_id AND owner_id = v_owner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não foi possível atualizar o saldo de aulas do aluno.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN p_sale_id;
END;
$function$;

ALTER FUNCTION public.create_instructor_sale(uuid, uuid, jsonb, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_instructor_sale(uuid, uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_instructor_sale(uuid, uuid, jsonb, text, text) TO authenticated, service_role;

COMMIT;
