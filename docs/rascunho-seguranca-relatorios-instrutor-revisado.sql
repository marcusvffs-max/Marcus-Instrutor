-- RASCUNHO REVISADO DE SEGURANCA E RLS
-- Projeto Marcus Instrutor
-- Branch: feature/relatorios-instrutor-app
--
-- STATUS: DOCUMENTO DE REVISAO. NAO EXECUTAR NO PROJETO ATUAL.
--
-- Modelo pretendido:
--   admin (Marcus): acesso global aos dados e leitura de todos os perfis;
--   instrutor: somente SELECT dos proprios dados e relatorios;
--   cadastro/alteracao de contas e papeis: somente backend confiavel com
--   service_role, nunca diretamente pelo navegador.
--
-- Este script substitui o rascunho da PR #4. Foi escrito com base no
-- catalogo pg_policies e nas FKs consultadas em 20/11/2026.
-- Antes de qualquer aplicacao, revisar em projeto de teste e testar RLS
-- com duas contas de instrutor e uma conta admin.

begin;

-- ---------------------------------------------------------------------------
-- 0. Privilegios SQL: RLS nao protege TRUNCATE.
-- A auditoria de 20/11/2026 encontrou TRUNCATE concedido a authenticated
-- em profiles, students, lessons, vehicles e app_settings. Tambem faltavam
-- grants CRUD para authenticated em sales, sale_items e financial_transactions.
-- Remover todos os privilegios diretos de PUBLIC/anon/authenticated e conceder
-- somente o necessario. RLS continua decidindo quais linhas cada papel acessa.
-- ---------------------------------------------------------------------------

revoke all privileges on table
  public.profiles,
  public.students,
  public.lessons,
  public.vehicles,
  public.app_settings,
  public.products,
  public.sales,
  public.sale_items,
  public.financial_transactions
from public, anon, authenticated;

-- REVOKE no nivel da tabela nao remove grants concedidos diretamente
-- a colunas. A auditoria de 20/11/2026 encontrou grants por coluna para
-- authenticated; remover explicitamente esses grants nas tabelas cobertas.
-- Preservar os privilegios de service_role para o backend.
do $block$
declare
  item record;
begin
  for item in
    select distinct table_schema, table_name, column_name
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name in (
        'profiles', 'students', 'lessons', 'vehicles', 'app_settings',
        'products', 'sales', 'sale_items', 'financial_transactions'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  loop
    execute format(
      'revoke all privileges (%I) on table %I.%I from PUBLIC, anon, authenticated',
      item.column_name, item.table_schema, item.table_name
    );
  end loop;
end
$block$;

-- Perfil: somente leitura pelo cliente. INSERT/UPDATE/DELETE ficam no backend.
grant select on table public.profiles to authenticated;

-- CRUD via API para authenticated; as policies abaixo restringem admin/instrutor.
-- TRUNCATE, REFERENCES e TRIGGER nao sao concedidos.
grant select, insert, update, delete on table
  public.students,
  public.lessons,
  public.vehicles,
  public.app_settings,
  public.products,
  public.sales,
  public.sale_items,
  public.financial_transactions
to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Funcao interna para obter o papel sem recursao de RLS em profiles.
-- O schema private nao deve ser incluido nos schemas expostos pelo PostgREST.
-- SECURITY DEFINER e restrito: search_path vazio, auth.uid obrigatorio,
-- EXECUTE apenas para authenticated.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
    and (select auth.uid()) is not null
  limit 1;
$function$;

-- O dono precisa poder consultar profiles mesmo com RLS habilitado.
-- postgres tem BYPASSRLS no projeto (confirmado na auditoria read-only).
alter function private.current_app_role() owner to postgres;

revoke all on function private.current_app_role() from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Criacao transacional de perfil e protecao de role.
--
-- O trigger em auth.users cria o perfil na mesma transacao do usuario Auth.
-- Qualquer novo usuario recebe role instrutor, sem confiar em metadata.
-- A falha no profile deve abortar a criacao do usuario.
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Instrutor'
  );

  insert into public.profiles (id, nome, role)
  values (new.id, profile_name, 'instrutor');

  return new;
end;
$function$;

alter function private.handle_new_auth_user_profile() owner to postgres;

revoke all on function private.handle_new_auth_user_profile()
from public, anon, authenticated;

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Backend confiavel pode gravar o papel explicitamente. Esta chave
  -- permanece somente no servidor e nunca e encaminhada pelo navegador.
  if (select auth.jwt() ->> 'role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- O trigger interno de auth.users pode nao ter auth.uid().
    -- Por isso, todo INSERT que nao venha de service_role recebe
    -- obrigatoriamente o papel instrutor, sem rejeitar uid NULL.
    new.role := 'instrutor';
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'O papel do perfil so pode ser alterado pelo backend administrativo.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

alter function private.protect_profile_role() owner to postgres;

revoke all on function private.protect_profile_role()
from public, anon, authenticated;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
before insert or update of role on public.profiles
for each row
execute function private.protect_profile_role();

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function private.handle_new_auth_user_profile();

-- ---------------------------------------------------------------------------
-- 3. Remover policies antigas. Os nomes abaixo foram conferidos em pg_policies.
-- ---------------------------------------------------------------------------

drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_admin_select_all on public.profiles;

drop policy if exists students_select_own on public.students;
drop policy if exists students_insert_own on public.students;
drop policy if exists students_update_own on public.students;
drop policy if exists students_delete_own on public.students;

drop policy if exists lessons_select_own on public.lessons;
drop policy if exists lessons_insert_own on public.lessons;
drop policy if exists lessons_update_own on public.lessons;
drop policy if exists lessons_delete_own on public.lessons;

drop policy if exists vehicles_select_own on public.vehicles;
drop policy if exists vehicles_insert_own on public.vehicles;
drop policy if exists vehicles_update_own on public.vehicles;
drop policy if exists vehicles_delete_own on public.vehicles;

drop policy if exists app_settings_select_own on public.app_settings;
drop policy if exists app_settings_insert_own on public.app_settings;
drop policy if exists app_settings_update_own on public.app_settings;
drop policy if exists app_settings_delete_own on public.app_settings;

drop policy if exists products_admin_select_own on public.products;
drop policy if exists products_admin_insert_own on public.products;
drop policy if exists products_admin_update_own on public.products;
drop policy if exists products_admin_delete_own on public.products;

drop policy if exists students_admin_full_access on public.students;
drop policy if exists lessons_admin_full_access on public.lessons;
drop policy if exists vehicles_admin_full_access on public.vehicles;
drop policy if exists app_settings_admin_full_access on public.app_settings;
drop policy if exists products_admin_full_access on public.products;
drop policy if exists sales_admin_full_access on public.sales;
drop policy if exists sale_items_admin_full_access on public.sale_items;
drop policy if exists financial_transactions_admin_full_access on public.financial_transactions;

drop policy if exists students_instrutor_read_own on public.students;
drop policy if exists lessons_instrutor_read_own on public.lessons;
drop policy if exists vehicles_instrutor_read_own on public.vehicles;
drop policy if exists products_instrutor_read_own on public.products;
drop policy if exists sales_instrutor_read_own on public.sales;
drop policy if exists sale_items_instrutor_read_own on public.sale_items;
drop policy if exists financial_transactions_instrutor_read_own on public.financial_transactions;

-- Garantir RLS habilitado em todas as tabelas cobertas.
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.lessons enable row level security;
alter table public.vehicles enable row level security;
alter table public.app_settings enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.financial_transactions enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Perfis: cada usuario ve o proprio perfil; admin ve todos.
-- Nenhum INSERT/UPDATE/DELETE via cliente. Gerenciamento fica no backend.
-- ---------------------------------------------------------------------------

create policy profiles_select_own
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_admin_select_all
on public.profiles for select
to authenticated
using ((select private.current_app_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- 5. Admin: controle global. Owner_id continua preservando a autoria.
-- ---------------------------------------------------------------------------

create policy students_admin_full_access
on public.students for all to authenticated
using ((select private.current_app_role()) = 'admin')
with check ((select private.current_app_role()) = 'admin');

create policy lessons_admin_full_access
on public.lessons for all to authenticated
using ((select private.current_app_role()) = 'admin')
with check ((select private.current_app_role()) = 'admin');

create policy vehicles_admin_full_access
on public.vehicles for all to authenticated
using ((select private.current_app_role()) = 'admin')
with check ((select private.current_app_role()) = 'admin');

create policy app_settings_admin_full_access
on public.app_settings for all to authenticated
using ((select private.current_app_role()) = 'admin')
with check ((select private.current_app_role()) = 'admin');

create policy products_admin_full_access
on public.products for all to authenticated
using ((select private.current_app_role()) = 'admin')
with check ((select private.current_app_role()) = 'admin');

create policy sales_admin_full_access
on public.sales for all to authenticated
using ((select private.current_app_role()) = 'admin')
with check ((select private.current_app_role()) = 'admin');

create policy sale_items_admin_full_access
on public.sale_items for all to authenticated
using ((select private.current_app_role()) = 'admin')
with check ((select private.current_app_role()) = 'admin');

create policy financial_transactions_admin_full_access
on public.financial_transactions for all to authenticated
using ((select private.current_app_role()) = 'admin')
with check ((select private.current_app_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- 6. Instrutor: somente leitura dos proprios registros.
-- As condicoes EXISTS tambem impedem que uma linha propria revele dados
-- relacionados pertencentes a outro instrutor por meio de joins.
-- ---------------------------------------------------------------------------

create policy students_instrutor_read_own
on public.students for select to authenticated
using (
  (select private.current_app_role()) = 'instrutor'
  and owner_id = (select auth.uid())
);

create policy vehicles_instrutor_read_own
on public.vehicles for select to authenticated
using (
  (select private.current_app_role()) = 'instrutor'
  and owner_id = (select auth.uid())
);

create policy lessons_instrutor_read_own
on public.lessons for select to authenticated
using (
  (select private.current_app_role()) = 'instrutor'
  and owner_id = (select auth.uid())
  and exists (
    select 1
    from public.students as s
    where s.id = lessons.student_id
      and s.owner_id = (select auth.uid())
  )
  and (
    lessons.vehicle_id is null
    or exists (
      select 1
      from public.vehicles as v
      where v.id = lessons.vehicle_id
        and v.owner_id = (select auth.uid())
    )
  )
);

create policy sales_instrutor_read_own
on public.sales for select to authenticated
using (
  (select private.current_app_role()) = 'instrutor'
  and owner_id = (select auth.uid())
  and (
    sales.student_id is null
    or exists (
      select 1
      from public.students as s
      where s.id = sales.student_id
        and s.owner_id = (select auth.uid())
    )
  )
);

create policy sale_items_instrutor_read_own
on public.sale_items for select to authenticated
using (
  (select private.current_app_role()) = 'instrutor'
  and owner_id = (select auth.uid())
  and exists (
    select 1
    from public.sales as s
    where s.id = sale_items.sale_id
      and s.owner_id = (select auth.uid())
  )
);

create policy financial_transactions_instrutor_read_own
on public.financial_transactions for select to authenticated
using (
  (select private.current_app_role()) = 'instrutor'
  and owner_id = (select auth.uid())
  and (
    financial_transactions.student_id is null
    or exists (
      select 1
      from public.students as s
      where s.id = financial_transactions.student_id
        and s.owner_id = (select auth.uid())
    )
  )
  and (
    financial_transactions.sale_id is null
    or exists (
      select 1
      from public.sales as s
      where s.id = financial_transactions.sale_id
        and s.owner_id = (select auth.uid())
    )
  )
);

-- Produtos e app_settings permanecem exclusivos do admin neste primeiro
-- desenho. Os itens vendidos ja guardam descricao/valor em sale_items.


-- ---------------------------------------------------------------------------
-- 7. Integridade referencial entre registros do mesmo instrutor.
-- As FKs simples existentes confirmam apenas que o ID existe. As FKs
-- compostas abaixo exigem igualdade de owner_id entre pai e filho.
-- PostgreSQL 17 suporta SET NULL (coluna), preservando owner_id.
-- Produto e sale_items.product_id ficam fora desta regra: catalogo central.
-- ---------------------------------------------------------------------------

alter table public.students
  add constraint students_id_owner_key unique (id, owner_id);

alter table public.vehicles
  add constraint vehicles_id_owner_key unique (id, owner_id);

alter table public.sales
  add constraint sales_id_owner_key unique (id, owner_id);

alter table public.lessons
  add constraint lessons_student_owner_fkey
  foreign key (student_id, owner_id)
  references public.students (id, owner_id);

alter table public.lessons
  add constraint lessons_vehicle_owner_fkey
  foreign key (vehicle_id, owner_id)
  references public.vehicles (id, owner_id);

alter table public.sales
  add constraint sales_student_owner_fkey
  foreign key (student_id, owner_id)
  references public.students (id, owner_id)
  on delete set null (student_id);

alter table public.sale_items
  add constraint sale_items_sale_owner_fkey
  foreign key (sale_id, owner_id)
  references public.sales (id, owner_id)
  on delete cascade;

alter table public.financial_transactions
  add constraint financial_student_owner_fkey
  foreign key (student_id, owner_id)
  references public.students (id, owner_id)
  on delete set null (student_id);

alter table public.financial_transactions
  add constraint financial_sale_owner_fkey
  foreign key (sale_id, owner_id)
  references public.sales (id, owner_id)
  on delete set null (sale_id);


commit;

-- ---------------------------------------------------------------------------
-- 7. Fora deste SQL: fluxo de gerenciamento de contas (obrigatorio antes
-- de liberar instrutores).
--
-- Criar Edge Function administrativa que:
--   a) valida o JWT do solicitante com supabase.auth.getUser(token);
--   b) consulta profiles do solicitante usando cliente backend e confirma
--      role='admin';
--   c) somente depois usa supabase.auth.admin.createUser/updateUserById;
--   d) cria/atualiza profiles com cliente service_role no servidor;
--   e) nunca devolve nem registra a service_role key;
--   f) valida email, papel permitido e erros; audita operacoes.
--
-- O navegador nunca envia uma coluna role livremente para public.profiles.
-- O endpoint deve negar solicitantes anonimos e qualquer perfil nao-admin.
--
-- 8. Validacoes obrigatorias em ambiente isolado antes de producao:
--   - anon nao le perfis nem dados;
--   - instrutor A le apenas seus alunos, aulas, veiculos e financeiro;
--   - instrutor A nao le nem altera dados do instrutor B;
--   - instrutor nao insere, altera ou apaga dados;
--   - instrutor nao cria perfil nem altera role para admin;
--   - admin le e administra dados de A e B;
--   - joins de aulas, vendas, itens e transacoes nao retornam relacoes
--     pertencentes a outro owner_id;
--   - app_settings e products seguem exclusivos do admin;
--   - politicas de whatsapp/ai_requests nao sao tocadas por este script.
--
-- IMPORTANTE: grants de tabela e coluna foram restringidos para PUBLIC, anon
-- e authenticated. A auditoria encontrou default privileges amplos para
-- supabase_admin/postgres no schema public; eles NAO sao alterados aqui porque
-- isso pode quebrar RPCs e objetos futuros. Exigem plano separado por owner.
-- Ainda revisar grants herdados, default privileges, integridade FK e testar
-- em ambiente isolado. RLS nao substitui privilegios SQL nem integridade FK.
