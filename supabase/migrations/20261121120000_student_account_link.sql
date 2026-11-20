-- Vínculo exclusivo entre o cadastro do aluno e sua conta autenticada.
-- Não faz backfill automático: contas antigas só serão associadas pelo fluxo seguro
-- de primeiro acesso, quando o e-mail confirmado identificar exatamente um cadastro.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS students_user_id_unique
  ON public.students (user_id)
  WHERE user_id IS NOT NULL;

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
  current_email text;
  matched_student_id uuid;
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

  -- Compatibilidade segura com contas antigas: só associa se o e-mail
  -- estiver confirmado e corresponder a um único cadastro em toda a base.
  IF NOT EXISTS (
    SELECT 1 FROM public.students s WHERE s.user_id = current_user_id
  ) THEN
    SELECT lower(btrim(u.email))
      INTO current_email
    FROM auth.users u
    WHERE u.id = current_user_id
      AND u.email_confirmed_at IS NOT NULL
      AND u.email IS NOT NULL
    LIMIT 1;

    IF COALESCE(current_email, '') <> '' THEN
      SELECT (array_agg(s.id))[1]
        INTO matched_student_id
      FROM public.students s
      WHERE lower(btrim(COALESCE(s.email, ''))) = current_email
      HAVING count(*) = 1;

      IF matched_student_id IS NOT NULL THEN
        UPDATE public.students
        SET user_id = current_user_id
        WHERE id = matched_student_id
          AND user_id IS NULL;
      END IF;
    END IF;
  END IF;

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
SET search_path TO ''
AS $function$
  SELECT *
  FROM private.get_my_scheduled_lessons_internal();
$function$;
