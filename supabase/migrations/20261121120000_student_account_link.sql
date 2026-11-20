-- Vínculo exclusivo entre o cadastro do aluno e sua conta autenticada.
-- Contas novas são vinculadas somente pelo convite validado no trigger abaixo.
-- Contas antigas nunca são associadas automaticamente apenas por correspondência de e-mail.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_attempt_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS students_user_id_unique
  ON public.students (user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS students_invite_attempt_id_unique
  ON public.students (invite_attempt_id)
  WHERE invite_attempt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.get_my_scheduled_lessons_internal()
RETURNS TABLE(
  lesson_id uuid,
  student_name text,
  lesson_date date,
  lesson_time time without time zone,
  vehicle_name text,
  vehicle_plate text,
  lesson_status text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_user_id
      AND p.role = 'usuario'
  ) THEN
    RAISE EXCEPTION 'Acesso permitido somente ao perfil Usuário.'
      USING ERRCODE = '42501';
  END IF;

  -- Não existe fallback por e-mail: somente o trigger de convite validado
  -- pode criar o vínculo. Contas antigas sem user_id não recebem aulas.

  -- A primeira consulta autenticada confirma que o aluno concluiu o acesso.
  UPDATE public.students
  SET invited_at = NULL,
      invite_attempt_id = NULL
  WHERE user_id = current_user_id
    AND invited_at IS NOT NULL;

  RETURN QUERY
  SELECT
    l.id,
    s.nome,
    l.data_aula,
    l.horario,
    COALESCE(v.nome, v.tipo, 'Não informado'),
    v.placa,
    l.status
  FROM public.students s
  JOIN public.lessons l
    ON l.student_id = s.id
   AND l.owner_id = s.owner_id
  LEFT JOIN public.vehicles v
    ON v.id = l.vehicle_id
   AND v.owner_id = l.owner_id
  WHERE s.user_id = current_user_id
    AND lower(btrim(COALESCE(l.status, ''))) = 'agendada'
  ORDER BY l.data_aula, l.horario;
END;
$function$;

-- Ao excluir uma conta Auth, libera também o cadastro do aluno para novo convite.
-- O BEFORE DELETE limpa os dois campos antes da ação automática da FK.
CREATE OR REPLACE FUNCTION private.clear_student_account_link_on_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.students
  SET user_id = NULL,
      invited_at = NULL,
      invite_attempt_id = NULL
  WHERE user_id = OLD.id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS clear_student_account_link_on_user_delete ON auth.users;

CREATE TRIGGER clear_student_account_link_on_user_delete
BEFORE DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.clear_student_account_link_on_user_delete();

CREATE OR REPLACE FUNCTION public.get_my_scheduled_lessons()
RETURNS TABLE(
  lesson_id uuid,
  student_name text,
  lesson_date date,
  lesson_time time without time zone,
  vehicle_name text,
  vehicle_plate text,
  lesson_status text
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT *
  FROM private.get_my_scheduled_lessons_internal();
$function$;

-- A RPC pública não deve herdar EXECUTE de PUBLIC/anon.
-- O wrapper valida a sessão e o perfil dentro da função interna.
REVOKE ALL ON FUNCTION public.get_my_scheduled_lessons() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_scheduled_lessons() TO authenticated;

-- A função interna privilegiada só pode ser alcançada pelo wrapper/owner.
REVOKE ALL ON FUNCTION private.get_my_scheduled_lessons_internal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.clear_student_account_link_on_user_delete() FROM PUBLIC, anon, authenticated;


-- Vincula a conta no próprio INSERT do Auth, usando um token aleatório
-- reservado previamente no cadastro. O trigger captura o valor no instante
-- da criação, antes que o usuário possa editar user_metadata.
CREATE OR REPLACE FUNCTION private.link_student_account_from_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  attempt_id_text text;
  student_id_text text;
  instructor_id_text text;
BEGIN
  attempt_id_text := NEW.raw_user_meta_data ->> 'invite_attempt_id';
  student_id_text := NEW.raw_user_meta_data ->> 'student_id';
  instructor_id_text := NEW.raw_user_meta_data ->> 'instructor_id';

  IF attempt_id_text IS NULL OR student_id_text IS NULL OR instructor_id_text IS NULL
     OR attempt_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR student_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR instructor_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;

  UPDATE public.students
  SET user_id = NEW.id
  WHERE id = student_id_text::uuid
    AND owner_id = instructor_id_text::uuid
    AND invite_attempt_id = attempt_id_text::uuid
    AND invited_at IS NOT NULL
    AND user_id IS NULL
    AND lower(btrim(COALESCE(email, ''))) = lower(btrim(COALESCE(NEW.email, '')));

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.link_student_account_from_invite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS link_student_account_from_invite ON auth.users;

CREATE TRIGGER link_student_account_from_invite
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.link_student_account_from_invite();
