-- Restore core business schema in the isolated security-test project.
-- No production records, credentials, or personal data are included.
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  owner_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id),
  nome_empresa text DEFAULT 'Marcus Instrutor',
  telefone text, logo_url text,
  cor_principal text DEFAULT '#2563EB',
  cor_secundaria text DEFAULT '#64748B'
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL, tipo text NOT NULL DEFAULT 'servico', descricao text,
  preco numeric(12,2) NOT NULL DEFAULT 0, quantidade_aulas integer,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  app_product_id text, quantidade_aulas_min integer, quantidade_aulas_max integer,
  forma_cobranca text, obrigatorio_conclusao boolean NOT NULL DEFAULT false,
  CONSTRAINT products_tipo_check CHECK (tipo = ANY (ARRAY['produto','servico','pacote'])),
  CONSTRAINT products_preco_check CHECK (preco >= 0),
  CONSTRAINT products_quantidade_aulas_check CHECK (quantidade_aulas IS NULL OR quantidade_aulas >= 0)
);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  data_venda date NOT NULL DEFAULT CURRENT_DATE,
  total numeric(12,2) NOT NULL DEFAULT 0, forma_pagamento text,
  status text NOT NULL DEFAULT 'confirmada', observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  subtotal_bruto numeric NOT NULL DEFAULT 0,
  desconto_tipo text NOT NULL DEFAULT 'valor',
  desconto_valor numeric NOT NULL DEFAULT 0, desconto numeric NOT NULL DEFAULT 0,
  CONSTRAINT sales_status_check CHECK (status = ANY (ARRAY['confirmada','cancelada'])),
  CONSTRAINT sales_total_check CHECK (total >= 0),
  CONSTRAINT sales_desconto_tipo_check CHECK (desconto_tipo = ANY (ARRAY['valor','percentual'])),
  CONSTRAINT sales_desconto_valores_check CHECK (subtotal_bruto >= 0 AND desconto_valor >= 0 AND desconto >= 0 AND desconto <= subtotal_bruto)
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  descricao text NOT NULL, quantidade numeric(10,2) NOT NULL DEFAULT 1,
  valor_unitario numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  tipo_item text, aulas_contratadas integer NOT NULL DEFAULT 0,
  aulas_devolvidas integer NOT NULL DEFAULT 0, valor_por_aula numeric NOT NULL DEFAULT 0,
  valor_devolvido numeric NOT NULL DEFAULT 0, valor_liquido numeric NOT NULL DEFAULT 0,
  quantidade_devolvida numeric NOT NULL DEFAULT 0,
  CONSTRAINT sale_items_quantidade_check CHECK (quantidade > 0),
  CONSTRAINT sale_items_valor_unitario_check CHECK (valor_unitario >= 0),
  CONSTRAINT sale_items_subtotal_check CHECK (subtotal >= 0),
  CONSTRAINT sale_items_tipo_item_check CHECK (tipo_item IS NULL OR tipo_item = ANY (ARRAY['produto','servico'])),
  CONSTRAINT sale_items_aulas_contratadas_check CHECK (aulas_contratadas >= 0),
  CONSTRAINT sale_items_aulas_devolvidas_check CHECK (aulas_devolvidas >= 0 AND aulas_devolvidas <= aulas_contratadas),
  CONSTRAINT sale_items_valores_devolucao_check CHECK (valor_por_aula >= 0 AND valor_devolvido >= 0 AND valor_devolvido <= subtotal),
  CONSTRAINT sale_items_quantidade_devolvida_check CHECK (quantidade_devolvida >= 0 AND quantidade_devolvida <= quantidade),
  CONSTRAINT sale_items_valor_liquido_check CHECK (valor_liquido >= 0 AND valor_liquido <= subtotal)
);

CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  tipo text NOT NULL, descricao text NOT NULL, valor numeric(12,2) NOT NULL,
  data_movimento date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'confirmado',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_transactions_tipo_check CHECK (tipo = ANY (ARRAY['entrada','saida'])),
  CONSTRAINT financial_transactions_valor_check CHECK (valor > 0),
  CONSTRAINT financial_transactions_status_check CHECK (status = ANY (ARRAY['pendente','confirmado','cancelado']))
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text DEFAULT 'em_aberto';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS aulas_compradas integer DEFAULT 0;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS aulas_restantes integer DEFAULT 0;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS numero_aula integer;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS assinatura text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS products_owner_id_idx ON public.products(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_owner_app_product_id_uidx ON public.products(owner_id, app_product_id);
CREATE INDEX IF NOT EXISTS sales_owner_date_idx ON public.sales(owner_id, data_venda DESC);
CREATE INDEX IF NOT EXISTS sales_student_id_idx ON public.sales(student_id);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS financial_transactions_owner_date_idx ON public.financial_transactions(owner_id, data_movimento DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_sale_id_idx ON public.financial_transactions(sale_id) WHERE sale_id IS NOT NULL;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.app_settings,public.products,public.sales,public.sale_items,public.financial_transactions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.app_settings,public.products,public.sales,public.sale_items,public.financial_transactions TO authenticated;

DROP POLICY IF EXISTS app_settings_delete_by_role ON public.app_settings;
DROP POLICY IF EXISTS app_settings_insert_by_role ON public.app_settings;
DROP POLICY IF EXISTS app_settings_select_by_role ON public.app_settings;
DROP POLICY IF EXISTS app_settings_update_by_role ON public.app_settings;
CREATE POLICY app_settings_delete_by_role ON public.app_settings FOR DELETE TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY app_settings_insert_by_role ON public.app_settings FOR INSERT TO authenticated WITH CHECK (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY app_settings_select_by_role ON public.app_settings FOR SELECT TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY app_settings_update_by_role ON public.app_settings FOR UPDATE TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS products_admin_delete_own ON public.products;
DROP POLICY IF EXISTS products_admin_insert_own ON public.products;
DROP POLICY IF EXISTS products_admin_select_own ON public.products;
DROP POLICY IF EXISTS products_admin_update_own ON public.products;
DROP POLICY IF EXISTS products_instructor_delete_own ON public.products;
DROP POLICY IF EXISTS products_instructor_insert_own ON public.products;
DROP POLICY IF EXISTS products_instructor_select_own ON public.products;
DROP POLICY IF EXISTS products_instructor_update_own ON public.products;
CREATE POLICY products_admin_delete_own ON public.products FOR DELETE TO authenticated USING (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid()));
CREATE POLICY products_admin_insert_own ON public.products FOR INSERT TO authenticated WITH CHECK (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid()));
CREATE POLICY products_admin_select_own ON public.products FOR SELECT TO authenticated USING (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid()));
CREATE POLICY products_admin_update_own ON public.products FOR UPDATE TO authenticated USING (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid()));
CREATE POLICY products_instructor_delete_own ON public.products FOR DELETE TO authenticated USING (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid()));
CREATE POLICY products_instructor_insert_own ON public.products FOR INSERT TO authenticated WITH CHECK (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid()));
CREATE POLICY products_instructor_select_own ON public.products FOR SELECT TO authenticated USING (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid()));
CREATE POLICY products_instructor_update_own ON public.products FOR UPDATE TO authenticated USING (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS sales_admin_write ON public.sales;
DROP POLICY IF EXISTS sales_instructor_manage_own ON public.sales;
DROP POLICY IF EXISTS sales_select_by_role ON public.sales;
CREATE POLICY sales_admin_write ON public.sales FOR ALL TO authenticated USING (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid()) AND (student_id IS NULL OR EXISTS(SELECT 1 FROM public.students s WHERE s.id=sales.student_id AND s.owner_id=(SELECT auth.uid()))));
CREATE POLICY sales_instructor_manage_own ON public.sales FOR ALL TO authenticated USING (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid()) AND (student_id IS NULL OR EXISTS(SELECT 1 FROM public.students s WHERE s.id=sales.student_id AND s.owner_id=(SELECT auth.uid()))));
CREATE POLICY sales_select_by_role ON public.sales FOR SELECT TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS sale_items_admin_write ON public.sale_items;
DROP POLICY IF EXISTS sale_items_instructor_manage_own ON public.sale_items;
DROP POLICY IF EXISTS sale_items_select_by_role ON public.sale_items;
CREATE POLICY sale_items_admin_write ON public.sale_items FOR ALL TO authenticated USING (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.sales s WHERE s.id=sale_items.sale_id AND s.owner_id=(SELECT auth.uid())) AND (product_id IS NULL OR EXISTS(SELECT 1 FROM public.products p WHERE p.id=sale_items.product_id AND p.owner_id=(SELECT auth.uid()))));
CREATE POLICY sale_items_instructor_manage_own ON public.sale_items FOR ALL TO authenticated USING (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.sales s WHERE s.id=sale_items.sale_id AND s.owner_id=(SELECT auth.uid())) AND (product_id IS NULL OR EXISTS(SELECT 1 FROM public.products p WHERE p.id=sale_items.product_id AND p.owner_id=(SELECT auth.uid()))));
CREATE POLICY sale_items_select_by_role ON public.sale_items FOR SELECT TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS financial_transactions_admin_write ON public.financial_transactions;
DROP POLICY IF EXISTS financial_transactions_instructor_manage_own ON public.financial_transactions;
DROP POLICY IF EXISTS financial_transactions_select_by_role ON public.financial_transactions;
CREATE POLICY financial_transactions_admin_write ON public.financial_transactions FOR ALL TO authenticated USING (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()='admin' AND owner_id=(SELECT auth.uid()) AND (student_id IS NULL OR EXISTS(SELECT 1 FROM public.students s WHERE s.id=financial_transactions.student_id AND s.owner_id=(SELECT auth.uid()))) AND (sale_id IS NULL OR EXISTS(SELECT 1 FROM public.sales s WHERE s.id=financial_transactions.sale_id AND s.owner_id=(SELECT auth.uid()))));
CREATE POLICY financial_transactions_instructor_manage_own ON public.financial_transactions FOR ALL TO authenticated USING (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()='instrutor' AND owner_id=(SELECT auth.uid()) AND (student_id IS NULL OR EXISTS(SELECT 1 FROM public.students s WHERE s.id=financial_transactions.student_id AND s.owner_id=(SELECT auth.uid()))) AND (sale_id IS NULL OR EXISTS(SELECT 1 FROM public.sales s WHERE s.id=financial_transactions.sale_id AND s.owner_id=(SELECT auth.uid()))));
CREATE POLICY financial_transactions_select_by_role ON public.financial_transactions FOR SELECT TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));

COMMIT;
