-- Indexa as chaves estrangeiras do ledger para manter exclusões/atualizações eficientes.
CREATE INDEX IF NOT EXISTS student_rental_credits_sale_owner_idx
  ON public.student_rental_credits(sale_id, owner_id);

CREATE INDEX IF NOT EXISTS student_rental_credits_student_owner_idx
  ON public.student_rental_credits(student_id, owner_id);

CREATE INDEX IF NOT EXISTS student_practical_exams_rental_credit_owner_idx
  ON public.student_practical_exams(rental_credit_id, owner_id)
  WHERE rental_credit_id IS NOT NULL;

DROP INDEX IF EXISTS public.student_practical_exams_rental_credit_idx;
