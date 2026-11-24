-- A conciliação dos registros anteriores à ativação é feita pela migration
-- 20261124090000_backfill_student_rental_credit_ledger.sql, após a criação da tabela.
CREATE TABLE public.student_rental_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NULL,
  sale_id uuid NOT NULL,
  sale_item_id uuid NOT NULL UNIQUE,
  quantity_purchased integer NOT NULL CHECK (quantity_purchased > 0),
  quantity_refunded integer NOT NULL DEFAULT 0 CHECK (quantity_refunded >= 0),
  quantity_consumed integer NOT NULL DEFAULT 0 CHECK (quantity_consumed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_rental_credits_balance_check
    CHECK (quantity_refunded + quantity_consumed <= quantity_purchased),
  CONSTRAINT student_rental_credits_id_owner_key UNIQUE (id, owner_id),
  CONSTRAINT student_rental_credits_student_owner_fk
    FOREIGN KEY (student_id, owner_id)
    REFERENCES public.students(id, owner_id)
    ON DELETE SET NULL (student_id),
  CONSTRAINT student_rental_credits_sale_owner_fk
    FOREIGN KEY (sale_id, owner_id)
    REFERENCES public.sales(id, owner_id)
    ON DELETE CASCADE,
  CONSTRAINT student_rental_credits_sale_item_fk
    FOREIGN KEY (sale_item_id)
    REFERENCES public.sale_items(id)
    ON DELETE CASCADE
);

CREATE INDEX student_rental_credits_owner_student_fifo_idx
  ON public.student_rental_credits(owner_id, student_id, created_at, id);

ALTER TABLE public.student_rental_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_rental_credits FROM PUBLIC, anon, authenticated;

ALTER TABLE public.student_practical_exams
  ADD COLUMN rental_credit_id uuid NULL,
  ADD CONSTRAINT student_practical_exams_rental_credit_owner_fk
    FOREIGN KEY (rental_credit_id, owner_id)
    REFERENCES public.student_rental_credits(id, owner_id)
    ON DELETE SET NULL (rental_credit_id);

CREATE INDEX student_practical_exams_rental_credit_idx
  ON public.student_practical_exams(rental_credit_id)
  WHERE rental_credit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.sync_student_rental_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_student_id uuid;
  v_sale_status text;
  v_delta integer;
  v_credit_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.fixed_item_key = 'aluguel_veiculo' THEN
      SELECT s.student_id, s.status
        INTO v_student_id, v_sale_status
      FROM public.sales s
      WHERE s.id = NEW.sale_id
        AND s.owner_id = NEW.owner_id
      FOR UPDATE;

      IF NOT FOUND OR v_student_id IS NULL OR v_sale_status IS DISTINCT FROM 'confirmada' THEN
        RAISE EXCEPTION 'Não foi possível vincular o aluguel a uma venda confirmada e a um aluno desta conta.';
      END IF;

      INSERT INTO public.student_rental_credits (
        owner_id, student_id, sale_id, sale_item_id, quantity_purchased
      )
      VALUES (
        NEW.owner_id, v_student_id, NEW.sale_id, NEW.id, NEW.quantidade::integer
      );
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.fixed_item_key = 'aluguel_veiculo'
       AND OLD.fixed_item_key IS DISTINCT FROM NEW.fixed_item_key THEN
      SELECT s.student_id, s.status
        INTO v_student_id, v_sale_status
      FROM public.sales s
      WHERE s.id = NEW.sale_id
        AND s.owner_id = NEW.owner_id
      FOR UPDATE;

      IF NOT FOUND OR v_student_id IS NULL OR v_sale_status IS DISTINCT FROM 'confirmada' THEN
        RAISE EXCEPTION 'Não foi possível vincular o aluguel a uma venda confirmada e a um aluno desta conta.';
      END IF;

      INSERT INTO public.student_rental_credits (
        owner_id, student_id, sale_id, sale_item_id, quantity_purchased
      )
      VALUES (
        NEW.owner_id, v_student_id, NEW.sale_id, NEW.id, NEW.quantidade::integer
      )
      ON CONFLICT (sale_item_id) DO NOTHING;
    END IF;

    IF OLD.fixed_item_key = 'aluguel_veiculo'
       AND NEW.fixed_item_key = 'aluguel_veiculo'
       AND NEW.quantidade_devolvida > OLD.quantidade_devolvida THEN
      v_delta := (NEW.quantidade_devolvida - OLD.quantidade_devolvida)::integer;

      UPDATE public.student_rental_credits
      SET quantity_refunded = quantity_refunded + v_delta
      WHERE sale_item_id = NEW.id
        AND owner_id = NEW.owner_id
        AND quantity_purchased - quantity_refunded - quantity_consumed >= v_delta
      RETURNING id INTO v_credit_id;

      IF v_credit_id IS NULL THEN
        RAISE EXCEPTION 'A devolução excede os aluguéis não utilizados desta compra.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_student_rental_credit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_student_rental_credit ON public.sale_items;
CREATE TRIGGER sync_student_rental_credit
AFTER INSERT OR UPDATE OF fixed_item_key, quantidade_devolvida
ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION private.sync_student_rental_credit();

CREATE OR REPLACE FUNCTION public.record_student_practical_exam_result(
  p_exam_id uuid,
  p_resultado text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_exam public.student_practical_exams%rowtype;
  v_student public.students%rowtype;
  v_credit public.student_rental_credits%rowtype;
BEGIN
  IF v_uid IS NULL OR private.current_app_role() NOT IN ('admin', 'instrutor') THEN
    RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor.';
  END IF;

  IF p_resultado NOT IN ('aprovado', 'reprovado') THEN
    RAISE EXCEPTION 'Resultado de exame inválido.';
  END IF;

  SELECT * INTO v_exam
  FROM public.student_practical_exams
  WHERE id = p_exam_id AND owner_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado nesta conta.';
  END IF;
  IF v_exam.status <> 'agendado' THEN
    RAISE EXCEPTION 'Este exame já foi finalizado ou cancelado.';
  END IF;
  IF v_exam.scheduled_at > now() THEN
    RAISE EXCEPTION 'O horário agendado para este exame ainda não chegou.';
  END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE id = v_exam.student_id AND owner_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado nesta conta.';
  END IF;
  IF coalesce(v_student.alugueis_disponiveis, 0) < 1 THEN
    RAISE EXCEPTION 'O aluno não possui Aluguel de Veículo disponível.';
  END IF;

  SELECT * INTO v_credit
  FROM public.student_rental_credits
  WHERE owner_id = v_uid
    AND student_id = v_student.id
    AND quantity_purchased - quantity_refunded - quantity_consumed > 0
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi encontrado crédito de aluguel não utilizado vinculado a uma compra deste aluno. Confira o saldo antes de finalizar o exame.';
  END IF;

  UPDATE public.student_rental_credits
  SET quantity_consumed = quantity_consumed + 1
  WHERE id = v_credit.id AND owner_id = v_uid;

  UPDATE public.students
  SET alugueis_disponiveis = alugueis_disponiveis - 1
  WHERE id = v_student.id AND owner_id = v_uid;

  UPDATE public.student_practical_exams
  SET status = 'realizado',
      resultado = p_resultado,
      aluguel_consumido = true,
      rental_credit_id = v_credit.id,
      updated_at = now()
  WHERE id = v_exam.id AND owner_id = v_uid;

  RETURN jsonb_build_object(
    'exam_id', v_exam.id,
    'student_id', v_student.id,
    'resultado', p_resultado,
    'rental_credit_id', v_credit.id,
    'alugueis_disponiveis', v_student.alugueis_disponiveis - 1
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_student_practical_exam_result(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_student_practical_exam_result(uuid, text) TO authenticated;
