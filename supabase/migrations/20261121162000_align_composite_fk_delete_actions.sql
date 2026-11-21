-- Align composite FK actions with the original schema and remove redundant
-- single-column FKs. This migration also corrects the already-applied test
-- migration 20261121160000 without touching the production project.

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_student_owner_fkey;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_student_owner_fkey
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_vehicle_owner_fkey;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_vehicle_owner_fkey
  FOREIGN KEY (vehicle_id, owner_id)
  REFERENCES public.vehicles (id, owner_id)
  ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.lessons VALIDATE CONSTRAINT lessons_student_owner_fkey;
ALTER TABLE public.lessons VALIDATE CONSTRAINT lessons_vehicle_owner_fkey;

-- The composite constraints now enforce same-owner references and preserve
-- the original referential actions. Remove the equivalent simple constraints.
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_student_id_fkey;
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_vehicle_id_fkey;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_student_id_fkey;
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey;
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;
ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_student_id_fkey;
ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_sale_id_fkey;
