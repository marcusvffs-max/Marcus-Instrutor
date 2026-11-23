-- Prevent authenticated instructors from extending their own access window.
-- The profile update policy is self-scoped; table-level UPDATE would otherwise
-- allow changing instructor_access_until even though role changes are guarded.
BEGIN;

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (nome) ON TABLE public.profiles TO authenticated;

COMMIT;
