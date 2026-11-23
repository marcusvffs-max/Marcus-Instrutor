-- Profiles are created by the trusted Auth trigger and maintained by the
-- admin Edge Function. Browser clients only need SELECT and UPDATE(nome).
-- Remove unused direct INSERT/DELETE capabilities from authenticated users.

BEGIN;

REVOKE INSERT ON TABLE public.profiles FROM authenticated;
REVOKE INSERT (id, role, instructor_access_until, nome, created_at)
  ON TABLE public.profiles FROM authenticated;
REVOKE DELETE ON TABLE public.profiles FROM authenticated;

COMMIT;
