-- Índices de suporte às FKs das tabelas de indicação e orçamento de parceiros.
CREATE INDEX IF NOT EXISTS partner_students_partner_owner_fk_idx
  ON public.partner_students(partner_id, owner_id);
CREATE INDEX IF NOT EXISTS partner_students_student_owner_fk_idx
  ON public.partner_students(student_id, owner_id);
CREATE INDEX IF NOT EXISTS partner_students_reviewed_by_idx
  ON public.partner_students(reviewed_by);
CREATE INDEX IF NOT EXISTS partner_quotes_partner_owner_fk_idx
  ON public.partner_quotes(partner_id, owner_id);
CREATE INDEX IF NOT EXISTS partner_quotes_student_owner_fk_idx
  ON public.partner_quotes(partner_student_id, owner_id);
CREATE INDEX IF NOT EXISTS partner_quotes_reviewed_by_idx
  ON public.partner_quotes(reviewed_by);
CREATE INDEX IF NOT EXISTS partner_quotes_sale_id_idx
  ON public.partner_quotes(sale_id);
CREATE INDEX IF NOT EXISTS partner_quote_items_quote_owner_fk_idx
  ON public.partner_quote_items(quote_id, owner_id);
CREATE INDEX IF NOT EXISTS partner_quote_items_product_id_idx
  ON public.partner_quote_items(product_id);
