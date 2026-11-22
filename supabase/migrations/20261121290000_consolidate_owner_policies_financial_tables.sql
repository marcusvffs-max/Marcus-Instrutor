-- Consolidate equivalent admin/instructor owner-scoped policies.
-- Preserve owner and relationship checks; do not grant cross-account access.
-- Validated transactionally in the isolated Supabase project before this migration.
BEGIN;

-- PRODUCTS: both roles manage only their own catalog rows.
DROP POLICY IF EXISTS products_admin_delete_own ON public.products;
DROP POLICY IF EXISTS products_admin_insert_own ON public.products;
DROP POLICY IF EXISTS products_admin_select_own ON public.products;
DROP POLICY IF EXISTS products_admin_update_own ON public.products;
DROP POLICY IF EXISTS products_instructor_delete_own ON public.products;
DROP POLICY IF EXISTS products_instructor_insert_own ON public.products;
DROP POLICY IF EXISTS products_instructor_select_own ON public.products;
DROP POLICY IF EXISTS products_instructor_update_own ON public.products;

CREATE POLICY products_owner_access
ON public.products
FOR ALL
TO authenticated
USING (
  private.current_app_role() IN ('admin', 'instrutor')
  AND owner_id = (SELECT auth.uid())
)
WITH CHECK (
  private.current_app_role() IN ('admin', 'instrutor')
  AND owner_id = (SELECT auth.uid())
);

-- SALES: keep the student relationship constrained to the same owner.
DROP POLICY IF EXISTS sales_admin_write ON public.sales;
DROP POLICY IF EXISTS sales_instructor_manage_own ON public.sales;
DROP POLICY IF EXISTS sales_select_by_role ON public.sales;

CREATE POLICY sales_owner_access
ON public.sales
FOR ALL
TO authenticated
USING (
  private.current_app_role() IN ('admin', 'instrutor')
  AND owner_id = (SELECT auth.uid())
)
WITH CHECK (
  private.current_app_role() IN ('admin', 'instrutor')
  AND owner_id = (SELECT auth.uid())
  AND (
    student_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = sales.student_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
);

-- SALE ITEMS: both the parent sale and optional product must share the owner.
DROP POLICY IF EXISTS sale_items_admin_write ON public.sale_items;
DROP POLICY IF EXISTS sale_items_instructor_manage_own ON public.sale_items;
DROP POLICY IF EXISTS sale_items_select_by_role ON public.sale_items;

CREATE POLICY sale_items_owner_access
ON public.sale_items
FOR ALL
TO authenticated
USING (
  private.current_app_role() IN ('admin', 'instrutor')
  AND owner_id = (SELECT auth.uid())
)
WITH CHECK (
  private.current_app_role() IN ('admin', 'instrutor')
  AND owner_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.sales s
    WHERE s.id = sale_items.sale_id
      AND s.owner_id = (SELECT auth.uid())
  )
  AND (
    product_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = sale_items.product_id
        AND p.owner_id = (SELECT auth.uid())
    )
  )
);

-- FINANCIAL TRANSACTIONS: preserve same-owner student and sale references.
DROP POLICY IF EXISTS financial_transactions_admin_write ON public.financial_transactions;
DROP POLICY IF EXISTS financial_transactions_instructor_manage_own ON public.financial_transactions;
DROP POLICY IF EXISTS financial_transactions_select_by_role ON public.financial_transactions;

CREATE POLICY financial_transactions_owner_access
ON public.financial_transactions
FOR ALL
TO authenticated
USING (
  private.current_app_role() IN ('admin', 'instrutor')
  AND owner_id = (SELECT auth.uid())
)
WITH CHECK (
  private.current_app_role() IN ('admin', 'instrutor')
  AND owner_id = (SELECT auth.uid())
  AND (
    student_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = financial_transactions.student_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
  AND (
    sale_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = financial_transactions.sale_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
);

COMMIT;
