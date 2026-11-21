-- Secure-by-default function execution for application functions created by postgres.
-- Existing function ACLs are not changed; this affects only future functions.
-- New public RPCs must explicitly GRANT EXECUTE to the intended roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
