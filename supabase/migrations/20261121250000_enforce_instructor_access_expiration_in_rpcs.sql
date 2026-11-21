-- Enforce instructor authorization expiration in every instructor-facing RPC.
-- Reuse the canonical role resolver so expired instructors are treated as unauthorized.

BEGIN;

CREATE OR REPLACE FUNCTION public.remove_student_app_access(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  current_role text := private.current_app_role();
  linked_user_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;

  IF current_role IS DISTINCT FROM 'instrutor' THEN
    RAISE EXCEPTION 'Ação permitida somente ao instrutor com autorização ativa.'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.user_id
    INTO linked_user_id
  FROM public.students s
  WHERE s.id = p_student_id
    AND s.owner_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND OR linked_user_id IS NULL THEN
    RAISE EXCEPTION 'Aluno sem acesso vinculado nesta conta.' USING ERRCODE = 'P0002';
  END IF;

  -- Delete only the Auth identity. The existing BEFORE DELETE trigger clears
  -- students.user_id/invite metadata; the student row and its history remain.
  DELETE FROM auth.users u
  WHERE u.id = linked_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A conta de acesso não foi encontrada.' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

ALTER FUNCTION public.remove_student_app_access(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_student_app_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_student_app_access(uuid) TO authenticated;

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'instrutor' THEN
    RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor com autorização ativa.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND owner_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada nesta conta.' USING ERRCODE = 'P0002';
  END IF;

  IF v_sale.student_id IS NOT NULL THEN
    SELECT * INTO v_student
    FROM public.students
    WHERE id = v_sale.student_id AND owner_id = v_uid
    FOR UPDATE;

    SELECT coalesce(sum(greatest(0, coalesce(si.aulas_contratadas, 0) - coalesce(si.aulas_devolvidas, 0))), 0)::integer
      INTO v_net_lessons
    FROM public.sale_items si
    WHERE si.sale_id = p_sale_id AND si.owner_id = v_uid;

    IF coalesce(v_student.aulas_restantes, 0) < v_net_lessons THEN
      RAISE EXCEPTION 'Não é possível excluir: parte das aulas desta venda já foi utilizada.';
    END IF;

    UPDATE public.students
    SET aulas_compradas = greatest(0, coalesce(aulas_compradas, 0) - v_net_lessons),
        aulas_restantes = greatest(0, coalesce(aulas_restantes, 0) - v_net_lessons)
    WHERE id = v_sale.student_id AND owner_id = v_uid;
  END IF;

  DELETE FROM public.financial_transactions
  WHERE sale_id = p_sale_id AND owner_id = v_uid;

  DELETE FROM public.sales
  WHERE id = p_sale_id AND owner_id = v_uid;

  RETURN jsonb_build_object('sale_id', p_sale_id, 'aulas_removidas', v_net_lessons);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_my_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_sale(uuid) TO authenticated;

COMMIT;
