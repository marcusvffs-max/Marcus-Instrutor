-- Allow an instructor to revoke a student's app account without deleting
-- the instructor-owned student record or any operational history.
CREATE OR REPLACE FUNCTION public.remove_student_app_access(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  linked_user_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_user_id
      AND p.role = 'instrutor'
  ) THEN
    RAISE EXCEPTION 'Ação permitida somente ao instrutor responsável.'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.user_id
    INTO linked_user_id
  FROM public.students s
  WHERE s.id = p_student_id
    AND s.owner_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND OR linked_user_id IS NULL THEN
    RAISE EXCEPTION 'Aluno sem acesso vinculado nesta conta.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Delete only the Auth identity. The existing BEFORE DELETE trigger clears
  -- students.user_id/invite metadata; the student row and its history remain.
  DELETE FROM auth.users u
  WHERE u.id = linked_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A conta de acesso não foi encontrada.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

ALTER FUNCTION public.remove_student_app_access(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_student_app_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_student_app_access(uuid) TO authenticated;
