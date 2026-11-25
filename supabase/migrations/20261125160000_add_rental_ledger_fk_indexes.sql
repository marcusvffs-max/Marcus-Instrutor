-- Cobre as três FKs compostas do ledger de aluguel para evitar varreduras
-- nas tabelas filhas durante exclusões/atualizações referenciadas.
CREATE INDEX IF NOT EXISTS student_practical_exams_rental_credit_owner_fk_idx
  ON public.student_practical_exams (rental_credit_id, owner_id);

CREATE INDEX IF NOT EXISTS student_rental_credits_sale_owner_fk_idx
  ON public.student_rental_credits (sale_id, owner_id);

CREATE INDEX IF NOT EXISTS student_rental_credits_student_owner_fk_idx
  ON public.student_rental_credits (student_id, owner_id);
