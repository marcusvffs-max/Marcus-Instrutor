-- Autorizações temporárias individuais para instrutores
-- Todos os instrutores começam bloqueados (NULL) até liberação explícita do administrador.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instructor_access_until timestamptz;

CREATE OR REPLACE FUNCTION private.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p.role = 'instrutor'
      AND p.instructor_access_until IS NOT NULL
      AND p.instructor_access_until > statement_timestamp()
      THEN 'instrutor'
    WHEN p.role = 'instrutor' THEN NULL
    ELSE p.role
  END
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1;
$function$;
