-- Reconcilia compras e exames de aluguel anteriores à criação do ledger.
-- A atribuição de consumo usa FIFO por data de criação da compra.
DO $$
DECLARE
  v_exam record;
  v_credit_id uuid;
  v_available integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id AND s.owner_id = si.owner_id
    WHERE si.fixed_item_key = 'aluguel_veiculo'
      AND s.status = 'confirmada'
      AND (
        s.student_id IS NULL
        OR si.quantidade <= 0
        OR si.quantidade <> trunc(si.quantidade)
        OR si.quantidade_devolvida < 0
        OR si.quantidade_devolvida > si.quantidade
        OR si.quantidade_devolvida <> trunc(si.quantidade_devolvida)
      )
  ) THEN
    RAISE EXCEPTION 'Há vendas de aluguel com aluno ou quantidades inválidas. Corrija os registros antes do backfill.';
  END IF;

  INSERT INTO public.student_rental_credits (
    owner_id,
    student_id,
    sale_id,
    sale_item_id,
    quantity_purchased,
    quantity_refunded,
    quantity_consumed,
    created_at
  )
  SELECT
    si.owner_id,
    s.student_id,
    s.id,
    si.id,
    si.quantidade::integer,
    si.quantidade_devolvida::integer,
    0,
    least(si.created_at, s.created_at)
  FROM public.sale_items si
  JOIN public.sales s
    ON s.id = si.sale_id
   AND s.owner_id = si.owner_id
  WHERE si.fixed_item_key = 'aluguel_veiculo'
    AND s.status = 'confirmada'
    AND s.student_id IS NOT NULL
  ON CONFLICT (sale_item_id) DO NOTHING;

  -- Exames antigos já realizados consumiram o saldo agregado do aluno.
  -- Vincula cada consumo à compra elegível mais antiga, sem alterar o saldo
  -- agregado novamente, pois ele já foi decrementado no fluxo histórico.
  FOR v_exam IN
    SELECT e.id, e.owner_id, e.student_id
    FROM public.student_practical_exams e
    WHERE e.aluguel_consumido = true
      AND e.rental_credit_id IS NULL
    ORDER BY e.scheduled_at, e.created_at, e.id
    FOR UPDATE
  LOOP
    v_credit_id := NULL;

    SELECT c.id
      INTO v_credit_id
    FROM public.student_rental_credits c
    WHERE c.owner_id = v_exam.owner_id
      AND c.student_id = v_exam.student_id
      AND c.quantity_purchased - c.quantity_refunded - c.quantity_consumed > 0
    ORDER BY c.created_at, c.id
    LIMIT 1
    FOR UPDATE;

    IF v_credit_id IS NULL THEN
      RAISE EXCEPTION 'Não há compra de aluguel com saldo para vincular o exame histórico %. Concilie este aluno antes de continuar.', v_exam.id;
    END IF;

    UPDATE public.student_rental_credits
    SET quantity_consumed = quantity_consumed + 1
    WHERE id = v_credit_id
      AND quantity_purchased - quantity_refunded - quantity_consumed > 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'O crédito de aluguel selecionado para o exame histórico % não possui saldo.', v_exam.id;
    END IF;

    UPDATE public.student_practical_exams
    SET rental_credit_id = v_credit_id
    WHERE id = v_exam.id
      AND owner_id = v_exam.owner_id
      AND rental_credit_id IS NULL;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.student_practical_exams e
    WHERE e.aluguel_consumido = true
      AND e.rental_credit_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Há exames realizados sem vínculo com uma compra de aluguel.';
  END IF;

  -- Não altera o saldo dos alunos: apenas confirma que o ledger reproduz
  -- exatamente o saldo operacional já existente em students.
  IF EXISTS (
    SELECT 1
    FROM public.students s
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(c.quantity_purchased - c.quantity_refunded - c.quantity_consumed), 0)::integer AS available
      FROM public.student_rental_credits c
      WHERE c.owner_id = s.owner_id
        AND c.student_id = s.id
    ) ledger ON true
    WHERE coalesce(s.alugueis_disponiveis, 0) <> ledger.available
  ) THEN
    RAISE EXCEPTION 'O saldo individual de aluguel não confere com students.alugueis_disponiveis. A migration foi revertida; concilie os registros antes de tentar novamente.';
  END IF;
END;
$$;
