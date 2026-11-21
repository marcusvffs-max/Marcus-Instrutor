-- Performance indexes for foreign keys and owner-scoped queries.
BEGIN;

create index if not exists ai_requests_aprovado_por_idx
  on public.ai_requests (aprovado_por);

create index if not exists financial_transactions_sale_owner_idx
  on public.financial_transactions (sale_id, owner_id);

create index if not exists financial_transactions_student_owner_idx
  on public.financial_transactions (student_id, owner_id);

create index if not exists lessons_student_owner_idx
  on public.lessons (student_id, owner_id);

create index if not exists lessons_vehicle_owner_idx
  on public.lessons (vehicle_id, owner_id);

create index if not exists sale_items_owner_id_idx
  on public.sale_items (owner_id);

create index if not exists sale_items_product_owner_idx
  on public.sale_items (product_id, owner_id);

create index if not exists sale_items_sale_owner_idx
  on public.sale_items (sale_id, owner_id);

create index if not exists sales_student_owner_idx
  on public.sales (student_id, owner_id);

create index if not exists whatsapp_messages_owner_conversation_created_idx
  on public.whatsapp_messages (owner_id, conversation_id, created_at);

-- Keep the existing admin-only and owner-only rules, evaluating auth.uid() once per statement.
alter policy ai_runtime_settings_admin_select_own
  on public.ai_runtime_settings
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

alter policy ai_runtime_settings_admin_update_own
  on public.ai_runtime_settings
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

COMMIT;
