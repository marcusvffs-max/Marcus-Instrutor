-- Enforce tenant ownership in relational references as defense in depth.
-- The existing single-column FKs are retained to preserve their original semantics;
-- these composite FKs ensure the referenced row belongs to the same owner_id.
-- PostgreSQL 17 supports column-specific SET NULL for composite foreign keys.

ALTER TABLE public.students
  ADD CONSTRAINT students_id_owner_key UNIQUE (id, owner_id);

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_id_owner_key UNIQUE (id, owner_id);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_id_owner_key UNIQUE (id, owner_id);

ALTER TABLE public.products
  ADD CONSTRAINT products_id_owner_key UNIQUE (id, owner_id);

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_student_owner_fkey
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_vehicle_owner_fkey
  FOREIGN KEY (vehicle_id, owner_id)
  REFERENCES public.vehicles (id, owner_id)
  ON DELETE SET NULL (vehicle_id) NOT VALID;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_student_owner_fkey
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE SET NULL (student_id) NOT VALID;

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_sale_owner_fkey
  FOREIGN KEY (sale_id, owner_id)
  REFERENCES public.sales (id, owner_id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_product_owner_fkey
  FOREIGN KEY (product_id, owner_id)
  REFERENCES public.products (id, owner_id)
  ON DELETE SET NULL (product_id) NOT VALID;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_student_owner_fkey
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE SET NULL (student_id) NOT VALID;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_sale_owner_fkey
  FOREIGN KEY (sale_id, owner_id)
  REFERENCES public.sales (id, owner_id)
  ON DELETE SET NULL (sale_id) NOT VALID;

ALTER TABLE public.lessons VALIDATE CONSTRAINT lessons_student_owner_fkey;
ALTER TABLE public.lessons VALIDATE CONSTRAINT lessons_vehicle_owner_fkey;
ALTER TABLE public.sales VALIDATE CONSTRAINT sales_student_owner_fkey;
ALTER TABLE public.sale_items VALIDATE CONSTRAINT sale_items_sale_owner_fkey;
ALTER TABLE public.sale_items VALIDATE CONSTRAINT sale_items_product_owner_fkey;
ALTER TABLE public.financial_transactions VALIDATE CONSTRAINT financial_student_owner_fkey;
ALTER TABLE public.financial_transactions VALIDATE CONSTRAINT financial_sale_owner_fkey;
