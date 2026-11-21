-- Restore current financial RPCs for isolated security tests.
-- These functions remain SECURITY INVOKER and enforce role/owner checks.
BEGIN;

ALTER FUNCTION public.undefined(undefined) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.undefined(undefined) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.undefined(undefined) TO authenticated,service_role;
COMMIT;
