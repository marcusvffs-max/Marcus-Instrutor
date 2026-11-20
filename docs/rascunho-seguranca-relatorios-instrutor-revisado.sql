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

revoke all on function private.current_app_role() from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Defesa adicional contra alteracao de role pelo cliente autenticado.
-- O fluxo backend usa a chave secreta service_role, que nao pode estar no
-- navegador. Com a chave service_role no cabeçalho Authorization, a chamada
-- nao representa um usuario final e auth.uid() retorna NULL. O trigger
-- preserva o papel enviado pelo backend; usuarios autenticados comuns
-- sempre recebem instrutor no INSERT e nao podem alterar role no UPDATE.
-- ---------------------------------------------------------------------------

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' then
      new.role := 'instrutor';
    elsif new.role is distinct from old.role then
      raise exception 'O papel do perfil so pode ser alterado pelo backend administrativo.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.protect_profile_role() from public, anon, authenticated;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
before insert or update of role on public.profiles
for each row
execute function private.protect_profile_role();

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
-- IMPORTANTE: revisar os grants SQL existentes e executar Supabase Advisors
-- no ambiente de teste. RLS nao substitui privilegios SQL nem integridade FK.
