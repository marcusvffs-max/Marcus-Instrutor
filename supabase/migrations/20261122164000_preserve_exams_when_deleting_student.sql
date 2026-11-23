ALTER TABLE public.student_practical_exams
  DROP CONSTRAINT student_practical_exams_student_owner_fk;

ALTER TABLE public.student_practical_exams
  ADD CONSTRAINT student_practical_exams_student_owner_fk
  FOREIGN KEY (student_id,owner_id)
  REFERENCES public.students(id,owner_id)
  ON DELETE RESTRICT;