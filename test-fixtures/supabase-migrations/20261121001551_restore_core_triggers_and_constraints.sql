-- Restore production trigger behavior for core test fixtures.
-- Test-only data normalization is limited to missing placeholder fields.
BEGIN;
UPDATE public.profiles SET nome='Perfil de teste' WHERE nome IS NULL;
ALTER TABLE public.profiles ALTER COLUMN nome SET NOT NULL;
ALTER TABLE public.students ALTER COLUMN nome SET NOT NULL;
UPDATE public.vehicles SET tipo='carro' WHERE tipo IS NULL;
UPDATE public.vehicles SET categoria='B' WHERE categoria IS NULL;
ALTER TABLE public.vehicles ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE public.vehicles ALTER COLUMN categoria SET NOT NULL;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_role_check') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role=ANY(ARRAY['admin','instrutor','usuario']));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS lessons_owner_id_idx ON public.lessons(owner_id);
CREATE INDEX IF NOT EXISTS lessons_student_id_idx ON public.lessons(student_id);
CREATE INDEX IF NOT EXISTS lessons_vehicle_id_idx ON public.lessons(vehicle_id);
CREATE INDEX IF NOT EXISTS vehicles_owner_id_idx ON public.vehicles(owner_id);

CREATE OR REPLACE FUNCTION private.handle_new_auth_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO public.profiles(id,nome,role)
 VALUES(NEW.id,COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'),''),NULLIF(TRIM(NEW.raw_user_meta_data->>'name'),''),NULLIF(SPLIT_PART(COALESCE(NEW.email,''),'@',1),''),'Instrutor'),'instrutor')
 ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.prevent_last_admin_removal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE admin_count bigint;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261120,1);
 SELECT count(*) INTO admin_count FROM public.profiles WHERE role='admin';
 IF admin_count<=1 THEN
  RAISE EXCEPTION 'Não é permitido remover ou rebaixar o último administrador do sistema.' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.protect_profile_role()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
 IF current_user IN ('postgres','supabase_admin','service_role') OR COALESCE(auth.role(),'')='service_role' THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Alteração de perfil não permitida.' USING ERRCODE='42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_lesson_student_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE old_completed boolean:=false; new_completed boolean:=false; student_changed boolean:=false;
BEGIN
 IF TG_OP='DELETE' THEN
  old_completed:=lower(btrim(coalesce(OLD.status,'')))='realizada';
  IF old_completed THEN
   UPDATE public.students SET aulas_restantes=LEAST(COALESCE(aulas_compradas,COALESCE(aulas_restantes,0)+1),COALESCE(aulas_restantes,0)+1)
   WHERE id=OLD.student_id AND owner_id=OLD.owner_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível devolver a aula ao saldo do aluno.' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN OLD;
 END IF;
 new_completed:=lower(btrim(coalesce(NEW.status,'')))='realizada';
 IF TG_OP='UPDATE' THEN
  old_completed:=lower(btrim(coalesce(OLD.status,'')))='realizada';
  student_changed:=OLD.student_id IS DISTINCT FROM NEW.student_id OR OLD.owner_id IS DISTINCT FROM NEW.owner_id;
  IF old_completed AND (NOT new_completed OR student_changed) THEN
   UPDATE public.students SET aulas_restantes=LEAST(COALESCE(aulas_compradas,COALESCE(aulas_restantes,0)+1),COALESCE(aulas_restantes,0)+1)
   WHERE id=OLD.student_id AND owner_id=OLD.owner_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível devolver a aula ao saldo do aluno anterior.' USING ERRCODE='P0001'; END IF;
  END IF;
 END IF;
 IF new_completed AND (TG_OP='INSERT' OR NOT old_completed OR student_changed) THEN
  UPDATE public.students SET aulas_restantes=COALESCE(aulas_restantes,0)-1
  WHERE id=NEW.student_id AND owner_id=NEW.owner_id AND COALESCE(aulas_restantes,0)>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALDO_AULAS_INSUFICIENTE: O aluno não possui aulas restantes para confirmar esta aula.' USING ERRCODE='P0001'; END IF;
 END IF;
 RETURN NEW;
END;
$function$;

ALTER FUNCTION private.handle_new_auth_user_profile() OWNER TO postgres;
ALTER FUNCTION private.prevent_last_admin_removal() OWNER TO postgres;
ALTER FUNCTION private.protect_profile_role() OWNER TO postgres;
ALTER FUNCTION public.sync_lesson_student_balance() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.handle_new_auth_user_profile() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.handle_new_auth_user_profile() TO supabase_auth_admin;
REVOKE ALL ON FUNCTION private.prevent_last_admin_removal() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_lesson_student_balance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lesson_student_balance() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.handle_new_auth_user_profile();
DROP TRIGGER IF EXISTS lessons_sync_student_balance ON public.lessons;
CREATE TRIGGER lessons_sync_student_balance BEFORE INSERT OR DELETE OR UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.sync_lesson_student_balance();
DROP TRIGGER IF EXISTS prevent_last_admin_deletion_trigger ON public.profiles;
CREATE TRIGGER prevent_last_admin_deletion_trigger BEFORE DELETE ON public.profiles FOR EACH ROW WHEN (OLD.role='admin') EXECUTE FUNCTION private.prevent_last_admin_removal();
DROP TRIGGER IF EXISTS prevent_last_admin_demotion_trigger ON public.profiles;
CREATE TRIGGER prevent_last_admin_demotion_trigger BEFORE UPDATE OF role ON public.profiles FOR EACH ROW WHEN (OLD.role='admin' AND NEW.role IS DISTINCT FROM 'admin') EXECUTE FUNCTION private.prevent_last_admin_removal();
DROP TRIGGER IF EXISTS protect_profile_role_trigger ON public.profiles;
CREATE TRIGGER protect_profile_role_trigger BEFORE INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.protect_profile_role();
COMMIT;
