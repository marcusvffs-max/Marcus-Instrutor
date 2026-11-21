-- Protege os campos usados pelo fluxo de convite/vínculo de conta do aluno.
-- Clientes authenticated podem editar os dados normais do cadastro, mas não
-- podem forjar user_id, invited_at ou invite_attempt_id via PostgREST.
-- O fluxo confiável usa service_role ou funções SECURITY DEFINER owned by postgres.

CREATE OR REPLACE FUNCTION private.guard_student_account_link_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL
       OR NEW.invited_at IS NOT NULL
       OR NEW.invite_attempt_id IS NOT NULL THEN
      RAISE EXCEPTION 'Os campos de vínculo de conta só podem ser definidos pelo fluxo seguro de convite.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.invited_at IS DISTINCT FROM OLD.invited_at
     OR NEW.invite_attempt_id IS DISTINCT FROM OLD.invite_attempt_id THEN
    RAISE EXCEPTION 'Os campos de vínculo de conta só podem ser alterados pelo fluxo seguro de convite.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.guard_student_account_link_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_student_account_link_fields()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_student_account_link_fields ON public.students;

CREATE TRIGGER guard_student_account_link_fields
BEFORE INSERT OR UPDATE OF user_id, invited_at, invite_attempt_id
ON public.students
FOR EACH ROW
EXECUTE FUNCTION private.guard_student_account_link_fields();
