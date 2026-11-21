-- Restrict direct EXECUTE on the trigger-only profile role guard.
-- PostgreSQL invokes trigger functions through their attached triggers; callers
-- do not need EXECUTE privilege at row-operation time.
REVOKE ALL ON FUNCTION private.protect_profile_role()
FROM PUBLIC, anon, authenticated, service_role;
