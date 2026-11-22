-- Prevent concurrent or alternate-client bookings in the same instructor time slot.
-- Cancelled lessons do not reserve the slot; all other statuses do.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS lessons_owner_active_schedule_uidx
ON public.lessons (owner_id, data_aula, horario)
WHERE lower(coalesce(status, '')) <> 'cancelada';
COMMENT ON INDEX public.lessons_owner_active_schedule_uidx IS
  'Prevents more than one non-cancelled lesson per instructor, date and time.';
COMMIT;
