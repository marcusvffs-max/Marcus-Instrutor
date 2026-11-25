# Recovered production migration SQL archive

This is an archival text export from the production Supabase migration history. It is deliberately outside `supabase/migrations`; do not execute or feed this file to the Supabase CLI. Some historical statements include data updates, policy changes, or one-time cleanup. Reconcile each statement against the current live schema and QA history before creating any new executable migration.

## 20261119015046 — create_whatsapp_ai_complementary_tables

```sql

-- Estrutura complementar para a integração IA + WhatsApp.
-- Estas tabelas não substituem alunos, veículos, aulas ou configurações existentes.
-- Acesso exclusivo do backend; operações do aluno ficam pendentes até aprovação do instrutor.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null default 'servico'
    check (tipo in ('produto', 'servico', 'pacote')),
  descricao text,
  preco numeric(12,2) not null default 0 check (preco >= 0),
  quantidade_aulas integer check (quantidade_aulas is null or quantidade_aulas >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  data_venda date not null default current_date,
  total numeric(12,2) not null default 0 check (total >= 0),
  forma_pagamento text,
  status text not null default 'confirmada'
    check (status in ('confirmada', 'cancelada')),
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  descricao text not null,
  quantidade numeric(10,2) not null default 1 check (quantidade > 0),
  valor_unitario numeric(12,2) not null default 0 check (valor_unitario >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null,
  valor numeric(12,2) not null check (valor > 0),
  data_movimento date not null default current_date,
  status text not null default 'confirmado'
    check (status in ('pendente', 'confirmado', 'cancelado')),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  canal text not null default 'whatsapp' check (canal in ('whatsapp')),
  telefone_solicitante text not null,
  nome_solicitante text,
  tipo_solicitacao text not null,
  dados_propostos jsonb not null default '{}'::jsonb,
  status text not null default 'pendente'
    check (status in ('pendente', 'precisa_informacao', 'aprovada', 'recusada', 'processada', 'falhou')),
  observacao_instrutor text,
  aprovado_por uuid references auth.users(id) on delete set null,
  aprovado_em timestamptz,
  processado_em timestamptz,
  resultado jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  telefone text not null,
  nome_contato text,
  status text not null default 'aberta' check (status in ('aberta', 'aguardando', 'encerrada')),
  ultima_mensagem_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, telefone)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  provider_message_id text unique,
  direcao text not null check (direcao in ('entrada', 'saida')),
  tipo_mensagem text not null default 'texto',
  conteudo text,
  status_provedor text,
  metadados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Índices para consultas frequentes do painel e isolamento por instrutor.
create index if not exists products_owner_id_idx on public.products(owner_id);
create index if not exists sales_owner_date_idx on public.sales(owner_id, data_venda desc);
create index if not exists sales_student_id_idx on public.sales(student_id);
create index if not exists sale_items_sale_id_idx on public.sale_items(sale_id);
create index if not exists financial_transactions_owner_date_idx on public.financial_transactions(owner_id, data_movimento desc);
create index if not exists ai_requests_owner_status_created_idx on public.ai_requests(owner_id, status, created_at desc);
create index if not exists whatsapp_conversations_owner_updated_idx on public.whatsapp_conversations(owner_id, updated_at desc);
create index if not exists whatsapp_messages_conversation_created_idx on public.whatsapp_messages(conversation_id, created_at);

-- Backend-only: RLS ligado e nenhum acesso direto de anon/authenticated.
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.ai_requests enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

revoke all on table public.products, public.sales, public.sale_items,
  public.financial_transactions, public.ai_requests,
  public.whatsapp_conversations, public.whatsapp_messages
from public, anon, authenticated;

grant select, insert, update, delete on table public.products, public.sales,
  public.sale_items, public.financial_transactions, public.ai_requests,
  public.whatsapp_conversations, public.whatsapp_messages
to service_role;

```

## 20261119145917 — allow_whatsapp_service_statuses

```sql
ALTER TABLE public.whatsapp_conversations DROP CONSTRAINT whatsapp_conversations_status_check;
ALTER TABLE public.whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_status_check CHECK (status = ANY (ARRAY['aberta'::text, 'aguardando'::text, 'encerrada'::text, 'aguardando_escolha'::text, 'atendimento_ia'::text, 'atendimento_humano'::text]));
```

## 20261119231852 — add_manual_human_service_status

```sql
alter table public.ai_requests add column if not exists atendimento_status text not null default 'pendente';

alter table public.ai_requests drop constraint if exists ai_requests_atendimento_status_check;
alter table public.ai_requests add constraint ai_requests_atendimento_status_check check (atendimento_status = any (array['pendente'::text, 'em_atendimento'::text, 'concluido'::text, 'cancelado'::text]));

 drop policy if exists ai_requests_admin_update_own on public.ai_requests;
create policy ai_requests_admin_update_own on public.ai_requests
for update to authenticated
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
```

## 20261119232301 — grant_admin_update_human_service_status

```sql
grant update (atendimento_status) on table public.ai_requests to authenticated;
```

## 20261120000802 — add_admin_ai_runtime_toggle

```sql
create table if not exists public.ai_runtime_settings (
   owner_id uuid primary key references auth.users(id) on delete cascade,
   enabled boolean not null default false,
   updated_at timestamptz not null default now()
 );

 alter table public.ai_runtime_settings enable row level security;

 grant select, update on public.ai_runtime_settings to authenticated;

 drop policy if exists ai_runtime_settings_admin_select_own on public.ai_runtime_settings;
 create policy ai_runtime_settings_admin_select_own
 on public.ai_runtime_settings
 for select
 to authenticated
 using (
   owner_id = auth.uid()
   and exists (
     select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin'
   )
 );

 drop policy if exists ai_runtime_settings_admin_update_own on public.ai_runtime_settings;
 create policy ai_runtime_settings_admin_update_own
 on public.ai_runtime_settings
 for update
 to authenticated
 using (
   owner_id = auth.uid()
   and exists (
     select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin'
   )
 )
 with check (
   owner_id = auth.uid()
   and exists (
     select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin'
   )
 );

 insert into public.ai_runtime_settings (owner_id, enabled)
 values ('8da26777-dad7-46dd-a332-4b5b80b027c7', false)
 on conflict (owner_id) do nothing;
```

## 20261120005313 — sync_whatsapp_catalog_products

```sql

alter table public.products
  add column if not exists app_product_id text;

create unique index if not exists products_owner_app_product_id_uidx
  on public.products (owner_id, app_product_id)
  where app_product_id is not null;

drop policy if exists products_admin_select_own on public.products;
create policy products_admin_select_own
  on public.products for select to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists products_admin_insert_own on public.products;
create policy products_admin_insert_own
  on public.products for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists products_admin_update_own on public.products;
create policy products_admin_update_own
  on public.products for update to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists products_admin_delete_own on public.products;
create policy products_admin_delete_own
  on public.products for delete to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

```

## 20261120005346 — fix_products_sync_upsert_conflict_target

```sql

drop index if exists public.products_owner_app_product_id_uidx;
create unique index products_owner_app_product_id_uidx
  on public.products (owner_id, app_product_id);

```

## 20261120005724 — add_products_owner_app_product_unique_index

```sql
create unique index if not exists products_owner_app_product_id_uidx on public.products (owner_id, app_product_id) where app_product_id is not null;
```

## 20261120005832 — fix_products_app_product_upsert_conflict_target

```sql
drop index if exists public.products_owner_app_product_id_uidx; create unique index if not exists products_owner_app_product_id_uidx on public.products (owner_id, app_product_id);
```

## 20261120005935 — products_owner_access_policies

```sql
create policy "products_select_own" on public.products for select to authenticated using (owner_id = auth.uid());
create policy "products_insert_own" on public.products for insert to authenticated with check (owner_id = auth.uid());
create policy "products_update_own" on public.products for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```

## 20261120005941 — restrict_products_policies_to_admin

```sql
drop policy if exists "products_select_own" on public.products;
drop policy if exists "products_insert_own" on public.products;
drop policy if exists "products_update_own" on public.products;
```

## 20261120010134 — grant_authenticated_products_access

```sql
grant select, insert, update on table public.products to authenticated;
```

## 20261120010732 — add_package_lesson_quantity_ranges

```sql
alter table public.products add column if not exists quantidade_aulas_min integer, add column if not exists quantidade_aulas_max integer;

update public.products
set quantidade_aulas_min = case app_product_id when 'bronze' then 1 when 'prata' then 6 when 'ouro' then 11 else quantidade_aulas_min end,
    quantidade_aulas_max = case app_product_id when 'bronze' then 5 when 'prata' then 10 when 'ouro' then null else quantidade_aulas_max end,
    updated_at = now()
where owner_id = '8da26777-dad7-46dd-a332-4b5b80b027c7'
  and app_product_id in ('bronze','prata','ouro');
```

## 20261120011058 — add_required_process_items_billing_rules

```sql
alter table public.products add column if not exists forma_cobranca text, add column if not exists obrigatorio_conclusao boolean not null default false;

insert into public.products (owner_id, nome, tipo, descricao, preco, ativo, app_product_id, forma_cobranca, obrigatorio_conclusao)
values
  ('8da26777-dad7-46dd-a332-4b5b80b027c7', 'Aluguel do veículo', 'produto', 'Cobrança única por exame. Item obrigatório para a conclusão do processo de habilitação.', 150.00, true, 'aluguel-veiculo-exame', 'por_exame', true),
  ('8da26777-dad7-46dd-a332-4b5b80b027c7', 'Cartão Moto Pista (30 dias)', 'produto', 'Válido por 30 dias. Item obrigatório para a conclusão do processo de habilitação.', 120.00, true, 'cartao-moto-pista-30-dias', 'por_periodo_30_dias', true)
on conflict (owner_id, app_product_id) do update set
  nome = excluded.nome,
  tipo = excluded.tipo,
  descricao = excluded.descricao,
  preco = excluded.preco,
  ativo = excluded.ativo,
  forma_cobranca = excluded.forma_cobranca,
  obrigatorio_conclusao = excluded.obrigatorio_conclusao,
  updated_at = now();
```

## 20261120151139 — secure_admin_instructor_user_roles

```sql

-- Segurança dos três perfis: administrador, instrutor e usuário.
-- Migração incremental: não altera registros existentes nem tabelas de WhatsApp/IA.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'instrutor'::text, 'usuario'::text]));

CREATE OR REPLACE FUNCTION private.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_app_role() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_app_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Alteração de perfil não permitida.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_trigger ON public.profiles;
CREATE TRIGGER protect_profile_role_trigger
BEFORE INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.protect_profile_role();

-- Perfis: leitura do próprio perfil; administrador pode consultar todos.
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin
ON public.profiles FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR private.current_app_role() = 'admin');

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.profiles FROM authenticated;
REVOKE INSERT (id, nome), UPDATE (nome, role)
ON TABLE public.profiles FROM authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Alunos: administrador global; instrutor somente seus próprios alunos.
DROP POLICY IF EXISTS students_select_own ON public.students;
DROP POLICY IF EXISTS students_insert_own ON public.students;
DROP POLICY IF EXISTS students_update_own ON public.students;
DROP POLICY IF EXISTS students_delete_own ON public.students;
CREATE POLICY students_select_by_role ON public.students
FOR SELECT TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY students_insert_by_role ON public.students
FOR INSERT TO authenticated
WITH CHECK (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY students_update_by_role ON public.students
FOR UPDATE TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
)
WITH CHECK (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY students_delete_by_role ON public.students
FOR DELETE TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);

-- Veículos: preserva o cadastro próprio do instrutor; administrador global.
DROP POLICY IF EXISTS vehicles_select_own ON public.vehicles;
DROP POLICY IF EXISTS vehicles_insert_own ON public.vehicles;
DROP POLICY IF EXISTS vehicles_update_own ON public.vehicles;
DROP POLICY IF EXISTS vehicles_delete_own ON public.vehicles;
CREATE POLICY vehicles_select_by_role ON public.vehicles
FOR SELECT TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY vehicles_insert_by_role ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY vehicles_update_by_role ON public.vehicles
FOR UPDATE TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
)
WITH CHECK (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY vehicles_delete_by_role ON public.vehicles
FOR DELETE TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);

-- Aulas: instrutor administra somente as próprias; aluno e veículo precisam
-- pertencer ao mesmo instrutor. Administrador tem acesso global.
DROP POLICY IF EXISTS lessons_select_own ON public.lessons;
DROP POLICY IF EXISTS lessons_insert_own ON public.lessons;
DROP POLICY IF EXISTS lessons_update_own ON public.lessons;
DROP POLICY IF EXISTS lessons_delete_own ON public.lessons;
CREATE POLICY lessons_select_by_role ON public.lessons
FOR SELECT TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY lessons_insert_by_role ON public.lessons
FOR INSERT TO authenticated
WITH CHECK (
  private.current_app_role() = 'admin'
  OR (
    private.current_app_role() = 'instrutor'
    AND owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.owner_id = (SELECT auth.uid())
    )
    AND (
      vehicle_id IS NULL OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id = vehicle_id AND v.owner_id = (SELECT auth.uid())
      )
    )
  )
);
CREATE POLICY lessons_update_by_role ON public.lessons
FOR UPDATE TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
)
WITH CHECK (
  private.current_app_role() = 'admin'
  OR (
    private.current_app_role() = 'instrutor'
    AND owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.owner_id = (SELECT auth.uid())
    )
    AND (
      vehicle_id IS NULL OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id = vehicle_id AND v.owner_id = (SELECT auth.uid())
      )
    )
  )
);
CREATE POLICY lessons_delete_by_role ON public.lessons
FOR DELETE TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);

-- Configurações: somente administrador/instrutor, cada um no próprio registro.
DROP POLICY IF EXISTS app_settings_select_own ON public.app_settings;
DROP POLICY IF EXISTS app_settings_insert_own ON public.app_settings;
DROP POLICY IF EXISTS app_settings_update_own ON public.app_settings;
DROP POLICY IF EXISTS app_settings_delete_own ON public.app_settings;
CREATE POLICY app_settings_select_by_role ON public.app_settings
FOR SELECT TO authenticated
USING (
  private.current_app_role() IN ('admin','instrutor')
  AND owner_id = (SELECT auth.uid())
);
CREATE POLICY app_settings_insert_by_role ON public.app_settings
FOR INSERT TO authenticated
WITH CHECK (
  private.current_app_role() IN ('admin','instrutor')
  AND owner_id = (SELECT auth.uid())
);
CREATE POLICY app_settings_update_by_role ON public.app_settings
FOR UPDATE TO authenticated
USING (
  private.current_app_role() IN ('admin','instrutor')
  AND owner_id = (SELECT auth.uid())
)
WITH CHECK (
  private.current_app_role() IN ('admin','instrutor')
  AND owner_id = (SELECT auth.uid())
);
CREATE POLICY app_settings_delete_by_role ON public.app_settings
FOR DELETE TO authenticated
USING (
  private.current_app_role() IN ('admin','instrutor')
  AND owner_id = (SELECT auth.uid())
);

-- Produtos: somente administrador, preservando o vínculo atual do proprietário.
DROP POLICY IF EXISTS products_admin_select_own ON public.products;
DROP POLICY IF EXISTS products_admin_insert_own ON public.products;
DROP POLICY IF EXISTS products_admin_update_own ON public.products;
DROP POLICY IF EXISTS products_admin_delete_own ON public.products;
CREATE POLICY products_admin_select_own ON public.products
FOR SELECT TO authenticated
USING (private.current_app_role() = 'admin' AND owner_id = (SELECT auth.uid()));
CREATE POLICY products_admin_insert_own ON public.products
FOR INSERT TO authenticated
WITH CHECK (private.current_app_role() = 'admin' AND owner_id = (SELECT auth.uid()));
CREATE POLICY products_admin_update_own ON public.products
FOR UPDATE TO authenticated
USING (private.current_app_role() = 'admin' AND owner_id = (SELECT auth.uid()))
WITH CHECK (private.current_app_role() = 'admin' AND owner_id = (SELECT auth.uid()));
CREATE POLICY products_admin_delete_own ON public.products
FOR DELETE TO authenticated
USING (private.current_app_role() = 'admin' AND owner_id = (SELECT auth.uid()));

-- Relatórios financeiros: instrutor lê somente os próprios; administrador gerencia.
CREATE POLICY sales_select_by_role ON public.sales
FOR SELECT TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY sales_admin_write ON public.sales
FOR ALL TO authenticated
USING (private.current_app_role() = 'admin')
WITH CHECK (private.current_app_role() = 'admin');

CREATE POLICY sale_items_select_by_role ON public.sale_items
FOR SELECT TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY sale_items_admin_write ON public.sale_items
FOR ALL TO authenticated
USING (private.current_app_role() = 'admin')
WITH CHECK (private.current_app_role() = 'admin');

CREATE POLICY financial_transactions_select_by_role ON public.financial_transactions
FOR SELECT TO authenticated
USING (
  private.current_app_role() = 'admin'
  OR (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
);
CREATE POLICY financial_transactions_admin_write ON public.financial_transactions
FOR ALL TO authenticated
USING (private.current_app_role() = 'admin')
WITH CHECK (private.current_app_role() = 'admin');

-- Privilégios SQL mínimos necessários; RLS continua sendo a barreira por perfil.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.students, public.vehicles, public.lessons, public.app_settings
FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.students, public.vehicles, public.lessons, public.app_settings
TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.sales, public.sale_items, public.financial_transactions
TO authenticated;

-- Usuário: única consulta permitida é a lista de aulas agendadas dele.
CREATE OR REPLACE FUNCTION public.get_my_scheduled_lessons()
RETURNS TABLE (
  lesson_id uuid,
  student_name text,
  lesson_date date,
  lesson_time time without time zone,
  vehicle_name text,
  vehicle_plate text,
  lesson_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'usuario'
  ) THEN
    RAISE EXCEPTION 'Acesso permitido somente ao perfil Usuário.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    s.nome,
    l.data_aula,
    l.horario,
    COALESCE(v.nome, v.tipo, 'Não informado'),
    v.placa,
    l.status
  FROM public.lessons l
  JOIN public.students s
    ON s.id = l.student_id AND s.owner_id = l.owner_id
  LEFT JOIN public.vehicles v
    ON v.id = l.vehicle_id AND v.owner_id = l.owner_id
  WHERE l.owner_id = auth.uid()
    AND l.status = 'agendada'
  ORDER BY l.data_aula, l.horario;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_scheduled_lessons() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_scheduled_lessons() TO authenticated;

```

## 20261120154116 — student_email_and_user_scheduled_lessons_by_email

```sql

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS students_email_normalized_idx
  ON public.students (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE OR REPLACE FUNCTION public.get_my_scheduled_lessons()
RETURNS TABLE(
  lesson_id uuid,
  student_name text,
  lesson_date date,
  lesson_time time without time zone,
  vehicle_name text,
  vehicle_plate text,
  lesson_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'usuario'
  ) THEN
    RAISE EXCEPTION 'Acesso permitido somente ao perfil Usuário.'
      USING ERRCODE = '42501';
  END IF;

  current_email := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));

  IF current_email = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    s.nome,
    l.data_aula,
    l.horario,
    COALESCE(v.nome, v.tipo, 'Não informado'),
    v.placa,
    l.status
  FROM public.students s
  JOIN public.lessons l
    ON l.student_id = s.id
   AND l.owner_id = s.owner_id
  LEFT JOIN public.vehicles v
    ON v.id = l.vehicle_id
   AND v.owner_id = l.owner_id
  WHERE lower(btrim(COALESCE(s.email, ''))) = current_email
    AND lower(btrim(COALESCE(l.status, ''))) = 'agendada'
  ORDER BY l.data_aula, l.horario;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_scheduled_lessons() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_scheduled_lessons() TO authenticated;

```

## 20261120160710 — sync_lesson_student_balance

```sql

CREATE OR REPLACE FUNCTION public.sync_lesson_student_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  old_completed boolean := false;
  new_completed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_completed := lower(btrim(coalesce(OLD.status, ''))) = 'realizada';

    IF old_completed THEN
      UPDATE public.students
      SET aulas_restantes = LEAST(
        COALESCE(aulas_compradas, COALESCE(aulas_restantes, 0) + 1),
        COALESCE(aulas_restantes, 0) + 1
      )
      WHERE id = OLD.student_id
        AND owner_id = OLD.owner_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Não foi possível devolver a aula ao saldo do aluno.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  new_completed := lower(btrim(coalesce(NEW.status, ''))) = 'realizada';

  IF TG_OP = 'UPDATE' THEN
    old_completed := lower(btrim(coalesce(OLD.status, ''))) = 'realizada';

    IF old_completed AND (
      NOT new_completed
      OR OLD.student_id IS DISTINCT FROM NEW.student_id
      OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
    ) THEN
      UPDATE public.students
      SET aulas_restantes = LEAST(
        COALESCE(aulas_compradas, COALESCE(aulas_restantes, 0) + 1),
        COALESCE(aulas_restantes, 0) + 1
      )
      WHERE id = OLD.student_id
        AND owner_id = OLD.owner_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Não foi possível devolver a aula ao saldo do aluno anterior.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF new_completed AND (
    TG_OP = 'INSERT'
    OR NOT old_completed
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
    OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
  ) THEN
    UPDATE public.students
    SET aulas_restantes = COALESCE(aulas_restantes, 0) - 1
    WHERE id = NEW.student_id
      AND owner_id = NEW.owner_id
      AND COALESCE(aulas_restantes, 0) > 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALDO_AULAS_INSUFICIENTE: O aluno não possui aulas restantes para confirmar esta aula.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_lesson_student_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lessons_sync_student_balance ON public.lessons;
CREATE TRIGGER lessons_sync_student_balance
BEFORE INSERT OR UPDATE OR DELETE ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.sync_lesson_student_balance();

```

## 20261120160718 — fix_lesson_balance_trigger_insert_handling

```sql

CREATE OR REPLACE FUNCTION public.sync_lesson_student_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  old_completed boolean := false;
  new_completed boolean := false;
  student_changed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_completed := lower(btrim(coalesce(OLD.status, ''))) = 'realizada';

    IF old_completed THEN
      UPDATE public.students
      SET aulas_restantes = LEAST(
        COALESCE(aulas_compradas, COALESCE(aulas_restantes, 0) + 1),
        COALESCE(aulas_restantes, 0) + 1
      )
      WHERE id = OLD.student_id AND owner_id = OLD.owner_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Não foi possível devolver a aula ao saldo do aluno.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  new_completed := lower(btrim(coalesce(NEW.status, ''))) = 'realizada';

  IF TG_OP = 'UPDATE' THEN
    old_completed := lower(btrim(coalesce(OLD.status, ''))) = 'realizada';
    student_changed := OLD.student_id IS DISTINCT FROM NEW.student_id
      OR OLD.owner_id IS DISTINCT FROM NEW.owner_id;

    IF old_completed AND (NOT new_completed OR student_changed) THEN
      UPDATE public.students
      SET aulas_restantes = LEAST(
        COALESCE(aulas_compradas, COALESCE(aulas_restantes, 0) + 1),
        COALESCE(aulas_restantes, 0) + 1
      )
      WHERE id = OLD.student_id AND owner_id = OLD.owner_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Não foi possível devolver a aula ao saldo do aluno anterior.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF new_completed AND (TG_OP = 'INSERT' OR NOT old_completed OR student_changed) THEN
    UPDATE public.students
    SET aulas_restantes = COALESCE(aulas_restantes, 0) - 1
    WHERE id = NEW.student_id
      AND owner_id = NEW.owner_id
      AND COALESCE(aulas_restantes, 0) > 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALDO_AULAS_INSUFICIENTE: O aluno não possui aulas restantes para confirmar esta aula.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

```

## 20261120161746 — enable_instructor_products_sales_finance

```sql

-- Permite que cada instrutor gerencie seus próprios produtos/serviços,
-- vendas, itens de venda e lançamentos financeiros.
-- O acesso administrativo existente permanece inalterado.

DROP POLICY IF EXISTS products_instructor_select_own ON public.products;
DROP POLICY IF EXISTS products_instructor_insert_own ON public.products;
DROP POLICY IF EXISTS products_instructor_update_own ON public.products;
DROP POLICY IF EXISTS products_instructor_delete_own ON public.products;

CREATE POLICY products_instructor_select_own
ON public.products FOR SELECT TO authenticated
USING (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()));

CREATE POLICY products_instructor_insert_own
ON public.products FOR INSERT TO authenticated
WITH CHECK (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()));

CREATE POLICY products_instructor_update_own
ON public.products FOR UPDATE TO authenticated
USING (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
WITH CHECK (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()));

CREATE POLICY products_instructor_delete_own
ON public.products FOR DELETE TO authenticated
USING (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sales_instructor_manage_own ON public.sales;
CREATE POLICY sales_instructor_manage_own
ON public.sales FOR ALL TO authenticated
USING (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
WITH CHECK (
  private.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
  AND (
    student_id IS NULL OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = sales.student_id AND s.owner_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS sale_items_instructor_manage_own ON public.sale_items;
CREATE POLICY sale_items_instructor_manage_own
ON public.sale_items FOR ALL TO authenticated
USING (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
WITH CHECK (
  private.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = sale_items.sale_id AND s.owner_id = (SELECT auth.uid())
  )
  AND (
    product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = sale_items.product_id AND p.owner_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS financial_transactions_instructor_manage_own ON public.financial_transactions;
CREATE POLICY financial_transactions_instructor_manage_own
ON public.financial_transactions FOR ALL TO authenticated
USING (private.current_app_role() = 'instrutor' AND owner_id = (SELECT auth.uid()))
WITH CHECK (
  private.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
  AND (
    student_id IS NULL OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = financial_transactions.student_id AND s.owner_id = (SELECT auth.uid())
    )
  )
  AND (
    sale_id IS NULL OR EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = financial_transactions.sale_id AND s.owner_id = (SELECT auth.uid())
    )
  )
);

```

## 20261120182834 — isolate_admin_operational_data_by_owner

```sql

-- Administradores também operam somente seus próprios registros.
-- O gerenciamento de contas/perfis permanece separado e global via Edge Function admin-manage-instructors.

-- STUDENTS
drop policy if exists students_select_by_role on public.students;
create policy students_select_by_role on public.students
for select to authenticated
using (
  (private.current_app_role() = 'admin' and owner_id = (select auth.uid()))
  or
  (private.current_app_role() = 'instrutor' and owner_id = (select auth.uid()))
);

drop policy if exists students_insert_by_role on public.students;
create policy students_insert_by_role on public.students
for insert to authenticated
with check (
  (private.current_app_role() = 'admin' and owner_id = (select auth.uid()))
  or
  (private.current_app_role() = 'instrutor' and owner_id = (select auth.uid()))
);

drop policy if exists students_update_by_role on public.students;
create policy students_update_by_role on public.students
for update to authenticated
using (
  (private.current_app_role() = 'admin' and owner_id = (select auth.uid()))
  or
  (private.current_app_role() = 'instrutor' and owner_id = (select auth.uid()))
)
with check (
  (private.current_app_role() = 'admin' and owner_id = (select auth.uid()))
  or
  (private.current_app_role() = 'instrutor' and owner_id = (select auth.uid()))
);

drop policy if exists students_delete_by_role on public.students;
create policy students_delete_by_role on public.students
for delete to authenticated
using (
  (private.current_app_role() in ('admin','instrutor'))
  and owner_id = (select auth.uid())
);

-- VEHICLES
drop policy if exists vehicles_select_by_role on public.vehicles;
create policy vehicles_select_by_role on public.vehicles
for select to authenticated
using (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
);

drop policy if exists vehicles_insert_by_role on public.vehicles;
create policy vehicles_insert_by_role on public.vehicles
for insert to authenticated
with check (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
);

drop policy if exists vehicles_update_by_role on public.vehicles;
create policy vehicles_update_by_role on public.vehicles
for update to authenticated
using (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
)
with check (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
);

drop policy if exists vehicles_delete_by_role on public.vehicles;
create policy vehicles_delete_by_role on public.vehicles
for delete to authenticated
using (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
);

-- LESSONS
drop policy if exists lessons_select_by_role on public.lessons;
create policy lessons_select_by_role on public.lessons
for select to authenticated
using (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
);

drop policy if exists lessons_insert_by_role on public.lessons;
create policy lessons_insert_by_role on public.lessons
for insert to authenticated
with check (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
  and exists (
    select 1 from public.students s
    where s.id = lessons.student_id and s.owner_id = (select auth.uid())
  )
  and (
    vehicle_id is null or exists (
      select 1 from public.vehicles v
      where v.id = lessons.vehicle_id and v.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists lessons_update_by_role on public.lessons;
create policy lessons_update_by_role on public.lessons
for update to authenticated
using (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
)
with check (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
  and exists (
    select 1 from public.students s
    where s.id = lessons.student_id and s.owner_id = (select auth.uid())
  )
  and (
    vehicle_id is null or exists (
      select 1 from public.vehicles v
      where v.id = lessons.vehicle_id and v.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists lessons_delete_by_role on public.lessons;
create policy lessons_delete_by_role on public.lessons
for delete to authenticated
using (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
);

-- SALES
drop policy if exists sales_select_by_role on public.sales;
create policy sales_select_by_role on public.sales
for select to authenticated
using (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
);

drop policy if exists sales_admin_write on public.sales;
create policy sales_admin_write on public.sales
for all to authenticated
using (
  private.current_app_role() = 'admin'
  and owner_id = (select auth.uid())
)
with check (
  private.current_app_role() = 'admin'
  and owner_id = (select auth.uid())
  and (
    student_id is null or exists (
      select 1 from public.students s
      where s.id = sales.student_id and s.owner_id = (select auth.uid())
    )
  )
);

-- SALE ITEMS. product_id may reference the centrally administered catalog;
-- ownership is enforced through the sale, not through products.owner_id.
drop policy if exists sale_items_select_by_role on public.sale_items;
create policy sale_items_select_by_role on public.sale_items
for select to authenticated
using (
  private.current_app_role() in ('admin','instrutor')
  and owner_id = (select auth.uid())
);

drop policy if exists sale_items_admin_write on public.sale_items;
create policy sale_items_admin_write on public.sale_items
for all to authenticated
using (
  private.current_app_role() = 'admin'
  and owner_id = (select auth.uid())
)
with check (
  private.current_app_role() = 'admin'
  and owner_id = (select auth.uid())
  and exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id and s.owner_id = (select auth.uid())
  )
);

-- FINANCIAL TRANSACTIONS
drop policy if exists financial_transactions_select_by_role on public.financial_transactions;
create policy financial_transactions_select_by_role on public.financial_transactions
for select to authenticated
using (
  (private.current_app_role() = 'admin' and owner_id = (select auth.uid()))
  or
  (private.current_app_role() = 'instrutor' and owner_id = (select auth.uid()))
);

drop policy if exists financial_transactions_admin_write on public.financial_transactions;
create policy financial_transactions_admin_write on public.financial_transactions
for all to authenticated
using (
  private.current_app_role() = 'admin'
  and owner_id = (select auth.uid())
)
with check (
  private.current_app_role() = 'admin'
  and owner_id = (select auth.uid())
  and (
    student_id is null or exists (
      select 1 from public.students s
      where s.id = financial_transactions.student_id and s.owner_id = (select auth.uid())
    )
  )
  and (
    sale_id is null or exists (
      select 1 from public.sales s
      where s.id = financial_transactions.sale_id and s.owner_id = (select auth.uid())
    )
  )
);

```

## 20261120191311 — admin_sales_transactional_workflow

```sql

alter table public.sale_items
  add column if not exists tipo_item text,
  add column if not exists aulas_contratadas integer not null default 0,
  add column if not exists aulas_devolvidas integer not null default 0,
  add column if not exists valor_por_aula numeric not null default 0,
  add column if not exists valor_devolvido numeric not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sale_items_tipo_item_check') then
    alter table public.sale_items add constraint sale_items_tipo_item_check
      check (tipo_item is null or tipo_item in ('produto','servico'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sale_items_aulas_contratadas_check') then
    alter table public.sale_items add constraint sale_items_aulas_contratadas_check
      check (aulas_contratadas >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sale_items_aulas_devolvidas_check') then
    alter table public.sale_items add constraint sale_items_aulas_devolvidas_check
      check (aulas_devolvidas >= 0 and aulas_devolvidas <= aulas_contratadas);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sale_items_valores_devolucao_check') then
    alter table public.sale_items add constraint sale_items_valores_devolucao_check
      check (valor_por_aula >= 0 and valor_devolvido >= 0 and valor_devolvido <= subtotal);
  end if;
end $$;

drop policy if exists sale_items_admin_write on public.sale_items;
create policy sale_items_admin_write on public.sale_items
  for all to authenticated
  using (
    private.current_app_role() = 'admin'
    and owner_id = (select auth.uid())
  )
  with check (
    private.current_app_role() = 'admin'
    and owner_id = (select auth.uid())
    and exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and s.owner_id = (select auth.uid())
    )
    and (
      product_id is null
      or exists (
        select 1 from public.products p
        where p.id = sale_items.product_id
          and p.owner_id = (select auth.uid())
      )
    )
  );

create or replace function public.admin_create_sale(
  p_student_id uuid,
  p_forma_pagamento text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sale_id uuid;
  v_student public.students%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_item_type text;
  v_subtotal numeric;
  v_total numeric := 0;
  v_classes integer := 0;
  v_item_classes integer;
  v_classes_per_unit integer;
  v_value_per_class numeric;
  v_name text;
begin
  if v_uid is null or private.current_app_role() <> 'admin' then
    raise exception 'Acesso administrativo obrigatório.';
  end if;

  if p_forma_pagamento not in (
    'Pix','Dinheiro','Cartão de débito','Cartão de crédito',
    'Transferência bancária','Outro'
  ) then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um item à venda.';
  end if;

  select * into v_student
  from public.students
  where id = p_student_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Aluno não encontrado nesta conta.';
  end if;

  insert into public.sales (
    owner_id, student_id, data_venda, total, forma_pagamento,
    status, observacoes
  ) values (
    v_uid, p_student_id, current_date, 0, p_forma_pagamento,
    'confirmada', null
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_quantity := nullif(v_item->>'quantidade','')::numeric;

    if v_product_id is null or v_quantity is null
       or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'Produto ou quantidade inválida.';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and owner_id = v_uid and ativo = true
    for share;

    if not found then
      raise exception 'Produto não encontrado, inativo ou de outra conta.';
    end if;

    if v_product.preco <= 0 then
      raise exception 'O item % não possui preço válido.', v_product.nome;
    end if;

    if v_product.quantidade_aulas_min is not null
       or v_product.quantidade_aulas_max is not null then
      if v_product.quantidade_aulas_min is not null
         and v_quantity < v_product.quantidade_aulas_min then
        raise exception 'A quantidade do pacote % está abaixo do mínimo de % aulas.',
          v_product.nome, v_product.quantidade_aulas_min;
      end if;
      if v_product.quantidade_aulas_max is not null
         and v_quantity > v_product.quantidade_aulas_max then
        raise exception 'A quantidade do pacote % ultrapassa o máximo de % aulas.',
          v_product.nome, v_product.quantidade_aulas_max;
      end if;
    end if;

    v_item_type := case
      when v_product.tipo in ('servico','pacote')
        or v_product.quantidade_aulas is not null
        or v_product.quantidade_aulas_min is not null
        or v_product.quantidade_aulas_max is not null
        or lower(coalesce(v_product.app_product_id,'')) in ('bronze','prata','ouro')
        or lower(v_product.nome) like 'pacote %'
        or lower(v_product.nome) like 'aula avulsa%'
      then 'servico'
      else 'produto'
    end;

    v_subtotal := round(v_product.preco * v_quantity, 2);
    v_item_classes := 0;
    v_value_per_class := 0;

    if v_item_type = 'servico' then
      if v_product.quantidade_aulas_min is not null
         or v_product.quantidade_aulas_max is not null then
        v_item_classes := v_quantity::integer;
      else
        v_classes_per_unit := greatest(1, coalesce(v_product.quantidade_aulas, 1));
        v_item_classes := (v_quantity * v_classes_per_unit)::integer;
      end if;

      if v_item_classes > 0 then
        v_value_per_class := round(v_subtotal / v_item_classes, 2);
      end if;
      v_classes := v_classes + v_item_classes;
    end if;

    insert into public.sale_items (
      owner_id, sale_id, product_id, descricao, quantidade,
      valor_unitario, subtotal, tipo_item, aulas_contratadas,
      aulas_devolvidas, valor_por_aula, valor_devolvido
    ) values (
      v_uid, v_sale_id, v_product.id, v_product.nome, v_quantity,
      v_product.preco, v_subtotal, v_item_type, v_item_classes,
      0, v_value_per_class, 0
    );

    v_total := v_total + v_subtotal;
  end loop;

  if v_total <= 0 then
    raise exception 'O total da venda deve ser maior que zero.';
  end if;

  update public.students
  set aulas_compradas = coalesce(aulas_compradas,0) + v_classes,
      aulas_restantes = coalesce(aulas_restantes,0) + v_classes
  where id = p_student_id and owner_id = v_uid;

  update public.sales set total = v_total where id = v_sale_id;

  insert into public.financial_transactions (
    owner_id, student_id, sale_id, tipo, descricao, valor,
    data_movimento, status
  ) values (
    v_uid, p_student_id, v_sale_id, 'entrada',
    'Venda para ' || v_student.nome, v_total, current_date, 'confirmado'
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total', v_total,
    'aulas_adicionadas', v_classes
  );
end;
$$;

create or replace function public.admin_refund_sale_lessons(
  p_sale_item_id uuid,
  p_quantidade integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.sale_items%rowtype;
  v_sale public.sales%rowtype;
  v_student public.students%rowtype;
  v_refund numeric;
begin
  if v_uid is null or private.current_app_role() <> 'admin' then
    raise exception 'Acesso administrativo obrigatório.';
  end if;
  if p_quantidade is null or p_quantidade < 1 then
    raise exception 'Quantidade para devolução inválida.';
  end if;

  select s.* into v_sale
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where si.id = p_sale_item_id and s.owner_id = v_uid
  limit 1;

  if not found or v_sale.student_id is null then
    raise exception 'Venda ou aluno não encontrado.';
  end if;

  select * into v_student
  from public.students
  where id = v_sale.student_id and owner_id = v_uid
  for update;

  select * into v_item
  from public.sale_items
  where id = p_sale_item_id and sale_id = v_sale.id and owner_id = v_uid
  for update;

  if not found or v_item.tipo_item <> 'servico' then
    raise exception 'Item de serviço não encontrado.';
  end if;
  if p_quantidade > v_item.aulas_contratadas - v_item.aulas_devolvidas then
    raise exception 'Quantidade maior que as aulas disponíveis para devolução.';
  end if;
  if coalesce(v_student.aulas_restantes,0) < p_quantidade then
    raise exception 'Parte dessas aulas já foi utilizada e não pode ser devolvida.';
  end if;

  v_refund := least(
    round(v_item.valor_por_aula * p_quantidade, 2),
    v_item.subtotal - v_item.valor_devolvido
  );

  if v_refund <= 0 then
    raise exception 'Valor de devolução inválido.';
  end if;

  update public.sale_items
  set aulas_devolvidas = aulas_devolvidas + p_quantidade,
      valor_devolvido = valor_devolvido + v_refund
  where id = p_sale_item_id and owner_id = v_uid;

  update public.students
  set aulas_compradas = greatest(0, coalesce(aulas_compradas,0) - p_quantidade),
      aulas_restantes = greatest(0, coalesce(aulas_restantes,0) - p_quantidade)
  where id = v_sale.student_id and owner_id = v_uid;

  insert into public.financial_transactions (
    owner_id, student_id, sale_id, tipo, descricao, valor,
    data_movimento, status
  ) values (
    v_uid, v_sale.student_id, v_sale.id, 'saida',
    'Devolução de ' || p_quantidade || ' aula(s) - ' || v_item.descricao,
    v_refund, current_date, 'confirmado'
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'aulas_devolvidas', p_quantidade,
    'valor_devolvido', v_refund
  );
end;
$$;

create or replace function public.admin_delete_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_student public.students%rowtype;
  v_net_lessons integer := 0;
begin
  if v_uid is null or private.current_app_role() <> 'admin' then
    raise exception 'Acesso administrativo obrigatório.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Venda não encontrada nesta conta.';
  end if;

  if v_sale.student_id is not null then
    select * into v_student
    from public.students
    where id = v_sale.student_id and owner_id = v_uid
    for update;

    select coalesce(sum(greatest(0, aulas_contratadas - aulas_devolvidas)),0)::integer
    into v_net_lessons
    from public.sale_items
    where sale_id = p_sale_id and owner_id = v_uid;

    if coalesce(v_student.aulas_restantes,0) < v_net_lessons then
      raise exception 'Não é possível excluir: parte das aulas já foi utilizada.';
    end if;

    update public.students
    set aulas_compradas = greatest(0, coalesce(aulas_compradas,0) - v_net_lessons),
        aulas_restantes = greatest(0, coalesce(aulas_restantes,0) - v_net_lessons)
    where id = v_sale.student_id and owner_id = v_uid;
  end if;

  delete from public.financial_transactions
  where sale_id = p_sale_id and owner_id = v_uid;

  delete from public.sales
  where id = p_sale_id and owner_id = v_uid;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'aulas_removidas', v_net_lessons
  );
end;
$$;

revoke all on function public.admin_create_sale(uuid,text,jsonb) from public, anon;
revoke all on function public.admin_refund_sale_lessons(uuid,integer) from public, anon;
revoke all on function public.admin_delete_sale(uuid) from public, anon;
grant execute on function public.admin_create_sale(uuid,text,jsonb) to authenticated;
grant execute on function public.admin_refund_sale_lessons(uuid,integer) to authenticated;
grant execute on function public.admin_delete_sale(uuid) to authenticated;

```

## 20261120191517 — require_payment_method_and_detail_sale_entry

```sql

create or replace function public.admin_create_sale(
  p_student_id uuid,
  p_forma_pagamento text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sale_id uuid;
  v_student public.students%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_item_type text;
  v_subtotal numeric;
  v_total numeric := 0;
  v_classes integer := 0;
  v_item_classes integer;
  v_classes_per_unit integer;
  v_value_per_class numeric;
  v_descricao_itens text := '';
begin
  if v_uid is null or private.current_app_role() <> 'admin' then
    raise exception 'Acesso administrativo obrigatório.';
  end if;

  if p_forma_pagamento is null or p_forma_pagamento not in (
    'Pix','Dinheiro','Cartão de débito','Cartão de crédito',
    'Transferência bancária','Outro'
  ) then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um item à venda.';
  end if;

  select * into v_student
  from public.students
  where id = p_student_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Aluno não encontrado nesta conta.';
  end if;

  insert into public.sales (
    owner_id, student_id, data_venda, total, forma_pagamento,
    status, observacoes
  ) values (
    v_uid, p_student_id, current_date, 0, p_forma_pagamento,
    'confirmada', null
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_quantity := nullif(v_item->>'quantidade','')::numeric;

    if v_product_id is null or v_quantity is null
       or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'Produto ou quantidade inválida.';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and owner_id = v_uid and ativo = true
    for share;

    if not found then
      raise exception 'Produto não encontrado, inativo ou de outra conta.';
    end if;

    if v_product.preco <= 0 then
      raise exception 'O item % não possui preço válido.', v_product.nome;
    end if;

    if v_product.quantidade_aulas_min is not null
       or v_product.quantidade_aulas_max is not null then
      if v_product.quantidade_aulas_min is not null
         and v_quantity < v_product.quantidade_aulas_min then
        raise exception 'A quantidade do pacote % está abaixo do mínimo de % aulas.',
          v_product.nome, v_product.quantidade_aulas_min;
      end if;
      if v_product.quantidade_aulas_max is not null
         and v_quantity > v_product.quantidade_aulas_max then
        raise exception 'A quantidade do pacote % ultrapassa o máximo de % aulas.',
          v_product.nome, v_product.quantidade_aulas_max;
      end if;
    end if;

    v_item_type := case
      when v_product.tipo in ('servico','pacote')
        or v_product.quantidade_aulas is not null
        or v_product.quantidade_aulas_min is not null
        or v_product.quantidade_aulas_max is not null
        or lower(coalesce(v_product.app_product_id,'')) in ('bronze','prata','ouro')
        or lower(v_product.nome) like 'pacote %'
        or lower(v_product.nome) like 'aula avulsa%'
      then 'servico'
      else 'produto'
    end;

    v_subtotal := round(v_product.preco * v_quantity, 2);
    v_item_classes := 0;
    v_value_per_class := 0;

    if v_item_type = 'servico' then
      if v_product.quantidade_aulas_min is not null
         or v_product.quantidade_aulas_max is not null then
        v_item_classes := v_quantity::integer;
      else
        v_classes_per_unit := greatest(1, coalesce(v_product.quantidade_aulas, 1));
        v_item_classes := (v_quantity * v_classes_per_unit)::integer;
      end if;

      if v_item_classes > 0 then
        v_value_per_class := round(v_subtotal / v_item_classes, 2);
      end if;
      v_classes := v_classes + v_item_classes;
    end if;

    insert into public.sale_items (
      owner_id, sale_id, product_id, descricao, quantidade,
      valor_unitario, subtotal, tipo_item, aulas_contratadas,
      aulas_devolvidas, valor_por_aula, valor_devolvido
    ) values (
      v_uid, v_sale_id, v_product.id, v_product.nome, v_quantity,
      v_product.preco, v_subtotal, v_item_type, v_item_classes,
      0, v_value_per_class, 0
    );

    v_total := v_total + v_subtotal;
    v_descricao_itens := concat_ws(
      ', ',
      nullif(v_descricao_itens,''),
      v_product.nome || ' (' || v_quantity::text || ')'
    );
  end loop;

  if v_total <= 0 then
    raise exception 'O total da venda deve ser maior que zero.';
  end if;

  update public.students
  set aulas_compradas = coalesce(aulas_compradas,0) + v_classes,
      aulas_restantes = coalesce(aulas_restantes,0) + v_classes
  where id = p_student_id and owner_id = v_uid;

  update public.sales set total = v_total where id = v_sale_id;

  insert into public.financial_transactions (
    owner_id, student_id, sale_id, tipo, descricao, valor,
    data_movimento, status
  ) values (
    v_uid, p_student_id, v_sale_id, 'entrada',
    'Venda para ' || v_student.nome || ': ' || v_descricao_itens,
    v_total, current_date, 'confirmado'
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total', v_total,
    'aulas_adicionadas', v_classes
  );
end;
$$;

```

## 20261120191916 — add_admin_sale_discounts

```sql

alter table public.sales
 add column if not exists subtotal_bruto numeric not null default 0,
 add column if not exists desconto_tipo text not null default 'valor',
 add column if not exists desconto_valor numeric not null default 0,
 add column if not exists desconto numeric not null default 0;
alter table public.sale_items add column if not exists valor_liquido numeric not null default 0;
update public.sales set subtotal_bruto=total where subtotal_bruto=0 and total>0;
update public.sale_items set valor_liquido=subtotal where valor_liquido=0 and subtotal>0;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='sales_desconto_tipo_check') then
  alter table public.sales add constraint sales_desconto_tipo_check check(desconto_tipo in ('valor','percentual'));
 end if;
 if not exists(select 1 from pg_constraint where conname='sales_desconto_valores_check') then
  alter table public.sales add constraint sales_desconto_valores_check check(subtotal_bruto>=0 and desconto_valor>=0 and desconto>=0 and desconto<=subtotal_bruto);
 end if;
 if not exists(select 1 from pg_constraint where conname='sale_items_valor_liquido_check') then
  alter table public.sale_items add constraint sale_items_valor_liquido_check check(valor_liquido>=0 and valor_liquido<=subtotal);
 end if;
end $$;
drop function if exists public.admin_create_sale(uuid,text,jsonb);
create function public.admin_create_sale(
 p_student_id uuid,p_forma_pagamento text,p_items jsonb,
 p_desconto_tipo text default 'valor',p_desconto_valor numeric default 0
) returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
 v_uid uuid:=auth.uid(); v_sale_id uuid; v_student public.students%rowtype;
 v_product public.products%rowtype; v_sale_item public.sale_items%rowtype;
 v_item jsonb; v_product_id uuid; v_quantity numeric; v_item_type text;
 v_subtotal numeric; v_total_bruto numeric:=0; v_discount numeric:=0;
 v_discount_allocated numeric:=0; v_discount_item numeric:=0; v_total numeric:=0;
 v_classes integer:=0; v_item_classes integer; v_classes_per_unit integer;
 v_descricao_itens text:=''; v_item_count integer:=0; v_item_index integer:=0;
begin
 if v_uid is null or private.current_app_role()<>'admin' then raise exception 'Acesso administrativo obrigatório.'; end if;
 if p_forma_pagamento is null or p_forma_pagamento not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência bancária','Outro') then
  raise exception 'Forma de pagamento inválida.';
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
  raise exception 'Adicione ao menos um item à venda.';
 end if;
 if p_desconto_tipo not in ('valor','percentual') or p_desconto_valor is null or p_desconto_valor<0 then
  raise exception 'Desconto inválido.';
 end if;
 if p_desconto_tipo='percentual' and p_desconto_valor>100 then
  raise exception 'O desconto percentual não pode ultrapassar 100%%.';
 end if;
 select * into v_student from public.students where id=p_student_id and owner_id=v_uid for update;
 if not found then raise exception 'Aluno não encontrado nesta conta.'; end if;
 insert into public.sales(owner_id,student_id,data_venda,total,subtotal_bruto,desconto_tipo,desconto_valor,desconto,forma_pagamento,status,observacoes)
 values(v_uid,p_student_id,current_date,0,0,p_desconto_tipo,p_desconto_valor,0,p_forma_pagamento,'confirmada',null)
 returning id into v_sale_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_product_id:=nullif(v_item->>'product_id','')::uuid;
  v_quantity:=nullif(v_item->>'quantidade','')::numeric;
  if v_product_id is null or v_quantity is null or v_quantity<=0 or v_quantity<>trunc(v_quantity) then
   raise exception 'Produto ou quantidade inválida.';
  end if;
  select * into v_product from public.products where id=v_product_id and owner_id=v_uid and ativo=true for share;
  if not found then raise exception 'Produto não encontrado, inativo ou de outra conta.'; end if;
  if v_product.preco<=0 then raise exception 'O item % não possui preço válido.',v_product.nome; end if;
  if v_product.quantidade_aulas_min is not null and v_quantity<v_product.quantidade_aulas_min then
   raise exception 'A quantidade do pacote % está abaixo do mínimo de % aulas.',v_product.nome,v_product.quantidade_aulas_min;
  end if;
  if v_product.quantidade_aulas_max is not null and v_quantity>v_product.quantidade_aulas_max then
   raise exception 'A quantidade do pacote % ultrapassa o máximo de % aulas.',v_product.nome,v_product.quantidade_aulas_max;
  end if;
  v_item_type:=case
   when v_product.tipo in ('servico','pacote') or v_product.quantidade_aulas is not null
    or v_product.quantidade_aulas_min is not null or v_product.quantidade_aulas_max is not null
    or lower(coalesce(v_product.app_product_id,'')) in ('bronze','prata','ouro')
    or lower(v_product.nome) like 'pacote %' or lower(v_product.nome) like 'aula avulsa%'
   then 'servico' else 'produto' end;
  v_subtotal:=round(v_product.preco*v_quantity,2); v_item_classes:=0;
  if v_item_type='servico' then
   if v_product.quantidade_aulas_min is not null or v_product.quantidade_aulas_max is not null then
    v_item_classes:=v_quantity::integer;
   else
    v_item_classes:=(v_quantity*greatest(1,coalesce(v_product.quantidade_aulas,1)))::integer;
   end if;
   v_classes:=v_classes+v_item_classes;
  end if;
  insert into public.sale_items(owner_id,sale_id,product_id,descricao,quantidade,valor_unitario,subtotal,tipo_item,aulas_contratadas,aulas_devolvidas,valor_por_aula,valor_devolvido,valor_liquido)
  values(v_uid,v_sale_id,v_product.id,v_product.nome,v_quantity,v_product.preco,v_subtotal,v_item_type,v_item_classes,0,0,0,v_subtotal);
  v_total_bruto:=v_total_bruto+v_subtotal;
  v_descricao_itens:=concat_ws(', ',nullif(v_descricao_itens,''),v_product.nome||' ('||v_quantity::text||')');
 end loop;
 if v_total_bruto<=0 then raise exception 'O subtotal da venda deve ser maior que zero.'; end if;
 if p_desconto_tipo='percentual' then v_discount:=round(v_total_bruto*p_desconto_valor/100,2);
 else v_discount:=round(p_desconto_valor,2); end if;
 if v_discount<0 or v_discount>=v_total_bruto then raise exception 'O desconto deve ser menor que o subtotal da venda.'; end if;
 select count(*) into v_item_count from public.sale_items where sale_id=v_sale_id and owner_id=v_uid;
 for v_sale_item in select * from public.sale_items where sale_id=v_sale_id and owner_id=v_uid order by id loop
  v_item_index:=v_item_index+1;
  if v_item_index=v_item_count then v_discount_item:=v_discount-v_discount_allocated;
  else v_discount_item:=round(v_sale_item.subtotal*v_discount/v_total_bruto,2); end if;
  v_discount_allocated:=v_discount_allocated+v_discount_item;
  update public.sale_items set
   valor_liquido=greatest(0,v_sale_item.subtotal-v_discount_item),
   valor_por_aula=case when v_sale_item.tipo_item='servico' and v_sale_item.aulas_contratadas>0
    then round(greatest(0,v_sale_item.subtotal-v_discount_item)/v_sale_item.aulas_contratadas,2) else 0 end
  where id=v_sale_item.id and owner_id=v_uid;
 end loop;
 v_total:=round(v_total_bruto-v_discount,2);
 update public.students set aulas_compradas=coalesce(aulas_compradas,0)+v_classes,
  aulas_restantes=coalesce(aulas_restantes,0)+v_classes where id=p_student_id and owner_id=v_uid;
 update public.sales set subtotal_bruto=v_total_bruto,desconto=v_discount,total=v_total where id=v_sale_id and owner_id=v_uid;
 insert into public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
 values(v_uid,p_student_id,v_sale_id,'entrada',
  'Venda para '||v_student.nome||': '||v_descricao_itens||
   case when v_discount>0 then ' (desconto '||v_discount::text||')' else '' end,
  v_total,current_date,'confirmado');
 return jsonb_build_object('sale_id',v_sale_id,'subtotal_bruto',v_total_bruto,'desconto',v_discount,'total',v_total,'aulas_adicionadas',v_classes);
end;
$function$;
revoke execute on function public.admin_create_sale(uuid,text,jsonb,text,numeric) from public,anon;
grant execute on function public.admin_create_sale(uuid,text,jsonb,text,numeric) to authenticated;
create or replace function public.admin_refund_sale_lessons(p_sale_item_id uuid,p_quantidade integer)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
 v_uid uuid:=auth.uid(); v_item public.sale_items%rowtype; v_sale public.sales%rowtype;
 v_student public.students%rowtype; v_refund numeric;
begin
 if v_uid is null or private.current_app_role()<>'admin' then raise exception 'Acesso administrativo obrigatório.'; end if;
 if p_quantidade is null or p_quantidade<1 then raise exception 'Quantidade para devolução inválida.'; end if;
 select s.* into v_sale from public.sales s join public.sale_items si on si.sale_id=s.id
 where si.id=p_sale_item_id and s.owner_id=v_uid limit 1;
 if not found or v_sale.student_id is null then raise exception 'Venda ou aluno não encontrado.'; end if;
 select * into v_student from public.students where id=v_sale.student_id and owner_id=v_uid for update;
 select * into v_item from public.sale_items where id=p_sale_item_id and sale_id=v_sale.id and owner_id=v_uid for update;
 if not found or v_item.tipo_item<>'servico' then raise exception 'Item de serviço não encontrado.'; end if;
 if p_quantidade>v_item.aulas_contratadas-v_item.aulas_devolvidas then raise exception 'Quantidade maior que as aulas disponíveis para devolução.'; end if;
 if coalesce(v_student.aulas_restantes,0)<p_quantidade then raise exception 'Parte dessas aulas já foi utilizada e não pode ser devolvida.'; end if;
 v_refund:=least(round(v_item.valor_por_aula*p_quantidade,2),v_item.valor_liquido-v_item.valor_devolvido);
 if v_refund<=0 then raise exception 'Valor de devolução inválido.'; end if;
 update public.sale_items set aulas_devolvidas=aulas_devolvidas+p_quantidade,valor_devolvido=valor_devolvido+v_refund
 where id=p_sale_item_id and owner_id=v_uid;
 update public.students set aulas_compradas=greatest(0,coalesce(aulas_compradas,0)-p_quantidade),
  aulas_restantes=greatest(0,coalesce(aulas_restantes,0)-p_quantidade)
 where id=v_sale.student_id and owner_id=v_uid;
 insert into public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
 values(v_uid,v_sale.student_id,v_sale.id,'saida','Devolução de '||p_quantidade||' aula(s) - '||v_item.descricao,v_refund,current_date,'confirmado');
 return jsonb_build_object('sale_id',v_sale.id,'aulas_devolvidas',p_quantidade,'valor_devolvido',v_refund);
end;
$function$;
revoke execute on function public.admin_refund_sale_lessons(uuid,integer) from public,anon;
grant execute on function public.admin_refund_sale_lessons(uuid,integer) to authenticated;

```

## 20261120192119 — restrict_sale_discounts_to_services

```sql

create or replace function public.admin_create_sale(
  p_student_id uuid,
  p_forma_pagamento text,
  p_items jsonb,
  p_desconto_tipo text default 'valor',
  p_desconto_valor numeric default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_sale_id uuid;
  v_student public.students%rowtype;
  v_product public.products%rowtype;
  v_sale_item public.sale_items%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_item_type text;
  v_subtotal numeric;
  v_total_bruto numeric := 0;
  v_subtotal_servicos numeric := 0;
  v_discount numeric := 0;
  v_discount_allocated numeric := 0;
  v_discount_item numeric := 0;
  v_total numeric := 0;
  v_classes integer := 0;
  v_item_classes integer;
  v_descricao_itens text := '';
  v_item_count integer := 0;
  v_item_index integer := 0;
begin
  if v_uid is null or private.current_app_role() <> 'admin' then
    raise exception 'Acesso administrativo obrigatório.';
  end if;

  if p_forma_pagamento is null or p_forma_pagamento not in (
    'Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência bancária','Outro'
  ) then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um item à venda.';
  end if;

  if p_desconto_tipo not in ('valor','percentual') or p_desconto_valor is null or p_desconto_valor < 0 then
    raise exception 'Desconto inválido.';
  end if;

  select * into v_student
  from public.students
  where id = p_student_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Aluno não encontrado nesta conta.';
  end if;

  insert into public.sales(
    owner_id,student_id,data_venda,total,subtotal_bruto,desconto_tipo,
    desconto_valor,desconto,forma_pagamento,status,observacoes
  )
  values(v_uid,p_student_id,current_date,0,0,p_desconto_tipo,p_desconto_valor,0,p_forma_pagamento,'confirmada',null)
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_quantity := nullif(v_item->>'quantidade','')::numeric;

    if v_product_id is null or v_quantity is null or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'Produto ou quantidade inválida.';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and owner_id = v_uid and ativo = true
    for share;

    if not found then
      raise exception 'Produto não encontrado, inativo ou de outra conta.';
    end if;

    if v_product.preco <= 0 then
      raise exception 'O item % não possui preço válido.',v_product.nome;
    end if;

    if v_product.quantidade_aulas_min is not null and v_quantity < v_product.quantidade_aulas_min then
      raise exception 'A quantidade do pacote % está abaixo do mínimo de % aulas.',v_product.nome,v_product.quantidade_aulas_min;
    end if;

    if v_product.quantidade_aulas_max is not null and v_quantity > v_product.quantidade_aulas_max then
      raise exception 'A quantidade do pacote % ultrapassa o máximo de % aulas.',v_product.nome,v_product.quantidade_aulas_max;
    end if;

    v_item_type := case
      when v_product.tipo in ('servico','pacote')
        or v_product.quantidade_aulas is not null
        or v_product.quantidade_aulas_min is not null
        or v_product.quantidade_aulas_max is not null
        or lower(coalesce(v_product.app_product_id,'')) in ('bronze','prata','ouro')
        or lower(v_product.nome) like 'pacote %'
        or lower(v_product.nome) like 'aula avulsa%'
      then 'servico' else 'produto'
    end;

    v_subtotal := round(v_product.preco * v_quantity,2);
    v_item_classes := 0;

    if v_item_type = 'servico' then
      if v_product.quantidade_aulas_min is not null or v_product.quantidade_aulas_max is not null then
        v_item_classes := v_quantity::integer;
      else
        v_item_classes := (v_quantity * greatest(1,coalesce(v_product.quantidade_aulas,1)))::integer;
      end if;
      v_classes := v_classes + v_item_classes;
      v_subtotal_servicos := v_subtotal_servicos + v_subtotal;
    end if;

    insert into public.sale_items(
      owner_id,sale_id,product_id,descricao,quantidade,valor_unitario,subtotal,
      tipo_item,aulas_contratadas,aulas_devolvidas,valor_por_aula,valor_devolvido,valor_liquido
    )
    values(
      v_uid,v_sale_id,v_product.id,v_product.nome,v_quantity,v_product.preco,v_subtotal,
      v_item_type,v_item_classes,0,0,0,v_subtotal
    );

    v_total_bruto := v_total_bruto + v_subtotal;
    v_descricao_itens := concat_ws(', ',nullif(v_descricao_itens,''),v_product.nome||' ('||v_quantity::text||')');
  end loop;

  if v_total_bruto <= 0 then
    raise exception 'O subtotal da venda deve ser maior que zero.';
  end if;

  if p_desconto_valor > 0 and v_subtotal_servicos <= 0 then
    raise exception 'Desconto permitido somente para serviços.';
  end if;

  if p_desconto_tipo = 'percentual' then
    if p_desconto_valor >= 100 then
      raise exception 'O desconto percentual deve ser inferior a 100%%.';
    end if;
    v_discount := round(v_subtotal_servicos * p_desconto_valor / 100,2);
  else
    v_discount := round(p_desconto_valor,2);
  end if;

  if v_discount < 0 or v_discount >= v_subtotal_servicos and v_discount > 0 then
    raise exception 'O desconto deve ser menor que o subtotal dos serviços.';
  end if;

  select count(*) into v_item_count
  from public.sale_items
  where sale_id = v_sale_id and owner_id = v_uid and tipo_item = 'servico';

  for v_sale_item in
    select * from public.sale_items
    where sale_id = v_sale_id and owner_id = v_uid and tipo_item = 'servico'
    order by id
  loop
    v_item_index := v_item_index + 1;

    if v_item_index = v_item_count then
      v_discount_item := v_discount - v_discount_allocated;
    else
      v_discount_item := round(v_sale_item.subtotal * v_discount / v_subtotal_servicos,2);
    end if;

    v_discount_allocated := v_discount_allocated + v_discount_item;

    update public.sale_items
    set valor_liquido = greatest(0,v_sale_item.subtotal-v_discount_item),
        valor_por_aula = case
          when v_sale_item.aulas_contratadas > 0
          then round(greatest(0,v_sale_item.subtotal-v_discount_item)/v_sale_item.aulas_contratadas,2)
          else 0
        end
    where id = v_sale_item.id and owner_id = v_uid;
  end loop;

  v_total := round(v_total_bruto-v_discount,2);

  update public.students
  set aulas_compradas = coalesce(aulas_compradas,0)+v_classes,
      aulas_restantes = coalesce(aulas_restantes,0)+v_classes
  where id = p_student_id and owner_id = v_uid;

  update public.sales
  set subtotal_bruto = v_total_bruto,desconto = v_discount,total = v_total
  where id = v_sale_id and owner_id = v_uid;

  insert into public.financial_transactions(
    owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status
  )
  values(
    v_uid,p_student_id,v_sale_id,'entrada',
    'Venda para '||v_student.nome||': '||v_descricao_itens||
      case when v_discount > 0 then ' (desconto somente em serviços: '||v_discount::text||')' else '' end,
    v_total,current_date,'confirmado'
  );

  return jsonb_build_object(
    'sale_id',v_sale_id,
    'subtotal_bruto',v_total_bruto,
    'subtotal_servicos',v_subtotal_servicos,
    'desconto',v_discount,
    'total',v_total,
    'aulas_adicionadas',v_classes
  );
end;
$function$;

revoke execute on function public.admin_create_sale(uuid,text,jsonb,text,numeric) from public, anon;
grant execute on function public.admin_create_sale(uuid,text,jsonb,text,numeric) to authenticated;

```

## 20261120193615 — add_product_sale_item_refunds

```sql

alter table public.sale_items
  add column if not exists quantidade_devolvida numeric not null default 0;

alter table public.sale_items
  drop constraint if exists sale_items_quantidade_devolvida_check;

alter table public.sale_items
  add constraint sale_items_quantidade_devolvida_check
  check (
    quantidade_devolvida >= 0
    and quantidade_devolvida <= quantidade
  );

create or replace function public.admin_refund_sale_product(
  p_sale_item_id uuid,
  p_quantidade numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_item public.sale_items%rowtype;
  v_sale public.sales%rowtype;
  v_refund numeric;
  v_remaining numeric;
  v_unit_net numeric;
begin
  if v_uid is null or private.current_app_role() <> 'admin' then
    raise exception 'Acesso administrativo obrigatório.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 or p_quantidade <> trunc(p_quantidade) then
    raise exception 'Quantidade de produtos para devolução inválida.';
  end if;

  select s.* into v_sale
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where si.id = p_sale_item_id
    and s.owner_id = v_uid
  limit 1
  for update of s;

  if not found then
    raise exception 'Venda não encontrada.';
  end if;

  select si.* into v_item
  from public.sale_items si
  where si.id = p_sale_item_id
    and si.sale_id = v_sale.id
    and si.owner_id = v_uid
  for update;

  if not found or v_item.tipo_item <> 'produto' then
    raise exception 'Item de produto não encontrado.';
  end if;

  v_remaining := v_item.quantidade - v_item.quantidade_devolvida;
  if p_quantidade > v_remaining then
    raise exception 'Quantidade maior que os produtos disponíveis para devolução.';
  end if;

  if v_item.quantidade <= 0 then
    raise exception 'Quantidade original do produto inválida.';
  end if;

  v_unit_net := v_item.valor_liquido / v_item.quantidade;
  v_refund := least(
    round(v_unit_net * p_quantidade, 2),
    v_item.valor_liquido - v_item.valor_devolvido
  );

  if v_refund <= 0 then
    raise exception 'Valor de devolução inválido.';
  end if;

  update public.sale_items
  set quantidade_devolvida = quantidade_devolvida + p_quantidade,
      valor_devolvido = valor_devolvido + v_refund
  where id = p_sale_item_id
    and owner_id = v_uid;

  insert into public.financial_transactions(
    owner_id, student_id, sale_id, tipo, descricao,
    valor, data_movimento, status
  )
  values (
    v_uid, v_sale.student_id, v_sale.id, 'saida',
    'Devolução de ' || p_quantidade || ' unidade(s) - ' || v_item.descricao,
    v_refund, current_date, 'confirmado'
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'produto_devolvido', p_quantidade,
    'valor_devolvido', v_refund
  );
end;
$function$;

revoke all on function public.admin_refund_sale_product(uuid,numeric) from public, anon;
grant execute on function public.admin_refund_sale_product(uuid,numeric) to authenticated;

```

## 20261121180741 — student_whatsapp_assistant_button_access

```sql

create or replace function private.is_marcus_linked_student()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  current_email text;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'usuario'
  ) then
    return false;
  end if;

  current_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if current_email = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.students s
    where s.owner_id = '8da26777-dad7-46dd-a332-4b5b80b027c7'::uuid
      and lower(btrim(coalesce(s.email, ''))) = current_email
  );
end;
$function$;

revoke all on function private.is_marcus_linked_student() from public;
revoke all on function private.is_marcus_linked_student() from anon;
grant usage on schema private to authenticated;
grant execute on function private.is_marcus_linked_student() to authenticated;

create or replace function public.can_show_marcus_whatsapp_assistant()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.is_marcus_linked_student();
$function$;

revoke all on function public.can_show_marcus_whatsapp_assistant() from public;
revoke all on function public.can_show_marcus_whatsapp_assistant() from anon;
grant execute on function public.can_show_marcus_whatsapp_assistant() to authenticated;

```

## 20261122035834 — prevent_duplicate_active_lesson_slots

```sql
CREATE UNIQUE INDEX IF NOT EXISTS lessons_owner_active_schedule_uidx
ON public.lessons (owner_id, data_aula, horario)
WHERE lower(COALESCE(status, '')) <> 'cancelada';
```

## 20261122035915 — add_marcus_student_whatsapp_visibility

```sql
CREATE OR REPLACE FUNCTION private.can_show_marcus_whatsapp_assistant_internal()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.students s ON s.user_id = p.id
      WHERE p.id = auth.uid()
        AND p.role = 'usuario'
        AND s.owner_id = '8da26777-dad7-46dd-a332-4b5b80b027c7'::uuid
    );
$function$;

REVOKE ALL ON FUNCTION private.can_show_marcus_whatsapp_assistant_internal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_show_marcus_whatsapp_assistant_internal() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_show_marcus_whatsapp_assistant()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT private.can_show_marcus_whatsapp_assistant_internal();
$function$;

REVOKE ALL ON FUNCTION public.can_show_marcus_whatsapp_assistant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_show_marcus_whatsapp_assistant() TO authenticated;
```

## 20261122222717 — whatsapp_conversation_cycles_and_history

```sql
-- Allow multiple archived WhatsApp conversation cycles per contact.
alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_owner_id_telefone_key;
create index if not exists whatsapp_conversations_owner_phone_created_idx
  on public.whatsapp_conversations (owner_id, telefone, created_at desc);
create index if not exists whatsapp_messages_conversation_created_idx
  on public.whatsapp_messages (conversation_id, created_at desc);
create unique index if not exists whatsapp_conversations_one_active_cycle_idx
  on public.whatsapp_conversations (owner_id, telefone)
  where status not in ('atendimento_humano', 'encerrada');
```

## 20261122222723 — close_whatsapp_cycle_when_ai_disabled

```sql
alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_ai_pause_reason_check;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_ai_pause_reason_check
  check (
    ai_pause_reason is null
    or ai_pause_reason in (
      'cliente_encerramento',
      'instrutor_encerramento',
      'instrutor_mensagem_manual',
      'instrutor_assumiu_atendimento',
      'ia_desativada_global',
      'instrutor_reativou_ia',
      'cliente_solicitou_atendimento_humano'
    )
  );
create or replace function public.close_whatsapp_cycles_when_ai_disabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.enabled is distinct from new.enabled and new.enabled = false then
    update public.whatsapp_conversations
       set status = 'encerrada',
           ai_paused_until = null,
           ai_pause_reason = 'ia_desativada_global',
           quote_state = null,
           updated_at = now()
     where owner_id = new.owner_id
       and status <> 'encerrada';
  end if;
  return new;
end;
$$;
revoke all on function public.close_whatsapp_cycles_when_ai_disabled() from public, anon, authenticated;
drop trigger if exists trg_close_whatsapp_cycles_when_ai_disabled on public.ai_runtime_settings;
create trigger trg_close_whatsapp_cycles_when_ai_disabled
after update of enabled on public.ai_runtime_settings
for each row
execute function public.close_whatsapp_cycles_when_ai_disabled();
```

## 20261123223159 — remove_orphaned_test_sale_items

```sql
ALTER TABLE public.sale_items DISABLE TRIGGER protect_vehicle_rental_sale_item;
DELETE FROM public.sale_items
WHERE id IN (
  'b47a0ec7-779c-4f76-ba6f-cb4a96ad362b',
  '6baa3dd9-77e0-4fa4-b9b1-316ece027498',
  '820f6ddc-3343-4173-beb6-2321450de8bb',
  '2494b576-dc6c-4f95-822e-82e6a1f9cb57',
  '872641cf-8116-4ebb-a3ec-608c60fb0fcc',
  '91a947b6-bd18-48c9-8a04-2a09c8ed9acb',
  '9bb5382c-3643-493c-9e90-62f5258fcc39',
  'a75f69b4-90c9-4fa6-959a-6cf52963d0ff'
);
ALTER TABLE public.sale_items ENABLE TRIGGER protect_vehicle_rental_sale_item;
```

## 20261123224715 — mark_all_whatsapp_cycles_on_global_ai_disable

```sql

CREATE OR REPLACE FUNCTION public.close_whatsapp_cycles_when_ai_disabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.enabled IS DISTINCT FROM NEW.enabled AND NEW.enabled = false THEN
    UPDATE public.whatsapp_conversations
       SET status = 'encerrada',
           ai_paused_until = NULL,
           ai_pause_reason = 'ia_desativada_global',
           quote_state = NULL,
           updated_at = now()
     WHERE owner_id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$function$;

```
