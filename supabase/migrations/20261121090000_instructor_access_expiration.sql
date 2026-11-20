-- Autorizações temporárias individuais para instrutores
-- Todos os instrutores começam bloqueados (NULL) até liberação explícita do administrador.

-- O schema private não existe no banco atual e precisa ser criado antes da
-- primeira função. Ele não deve ser incluído nos schemas expostos pelo PostgREST.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
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

-- A função é usada pelas políticas RLS; somente usuários autenticados podem
-- executá-la. O proprietário postgres pode consultar profiles apesar do RLS.
ALTER FUNCTION private.current_app_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.current_app_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_app_role() TO authenticated;
