-- Cover the owner_id foreign key so account deletion/cascade checks do not
-- require scanning the entire students table.
CREATE INDEX IF NOT EXISTS students_owner_id_idx
  ON public.students (owner_id);
