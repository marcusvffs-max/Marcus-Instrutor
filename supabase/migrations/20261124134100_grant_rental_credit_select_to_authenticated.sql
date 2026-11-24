-- The sale deletion RPC runs as the authenticated caller.
-- Grant read access only; the existing owner-scoped RLS policy remains authoritative.
GRANT SELECT ON TABLE public.student_rental_credits TO authenticated;
