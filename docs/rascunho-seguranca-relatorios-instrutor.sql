-- RASCUNHO DE SEGURANCA - NAO EXECUTAR EM PRODUCAO AINDA
-- Projeto Marcus Instrutor
--
-- Objetivo:
--   * admin (Marcus): controle completo dos dados de todos os instrutores;
--   * instrutor: somente leitura dos proprios dados para gerar relatorios;
--   * impedir que um usuario autenticado promova o proprio perfil para admin.
--
-- IMPORTANTE:
--   Este arquivo foi preparado para revisao em branch isolada.
--   NAO foi aplicado ao Supabase.
--   Antes de executar, revisar em ambiente de teste e validar o fluxo de criacao
--   de perfis/usuarios e os relacionamentos entre registros.
--
-- Pre-requisitos confirmados na auditoria:
--   profiles.role aceita 'admin' e 'instrutor';
--   students, lessons, vehicles, app_settings, products, sales,
--   sale_items e financial_transactions possuem owner_id;
--   RLS esta habilitado nessas tabelas.
--
-- 1) Funcao segura para consultar a funcao do usuario autenticado.
-- SECURITY DEFINER evita recursao das politicas RLS ao consultar profiles.
CREATE OR REPLACE FUNCTION public.current_app_role()
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

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;

-- 2) Bloqueia auto-promocao para admin.
-- A criacao feita por usuario autenticado sempre resulta em instrutor.
-- Alteracoes de role por usuario autenticado sao rejeitadas.
-- Operacoes administrativas feitas por service_role/SQL administrativo
-- continuam podendo atribuir role, pois nao possuem auth.uid() de usuario.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'instrutor';
    ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'A funcao do perfil so pode ser alterada por administracao segura.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM anon;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM authenticated;

DROP TRIGGER IF EXISTS profiles_protect_role ON public.profiles;
CREATE TRIGGER profiles_protect_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_role();

-- 3) Remove as politicas antigas de acesso geral por owner_id.
-- Elas permitiam INSERT/UPDATE/DELETE a qualquer usuario autenticado
-- que conhecesse seu proprio owner_id, inclusive instrutores.
DROP POLICY IF EXISTS students_select_own ON public.students;
DROP POLICY IF EXISTS students_insert_own ON public.students;
DROP POLICY IF EXISTS students_update_own ON public.students;
DROP POLICY IF EXISTS students_delete_own ON public.students;

DROP POLICY IF EXISTS lessons_select_own ON public.lessons;
DROP POLICY IF EXISTS lessons_insert_own ON public.lessons;
DROP POLICY IF EXISTS lessons_update_own ON public.lessons;
DROP POLICY IF EXISTS lessons_delete_own ON public.lessons;

DROP POLICY IF EXISTS vehicles_select_own ON public.vehicles;
DROP POLICY IF EXISTS vehicles_insert_own ON public.vehicles;
DROP POLICY IF EXISTS vehicles_update_own ON public.vehicles;
DROP POLICY IF EXISTS vehicles_delete_own ON public.vehicles;

DROP POLICY IF EXISTS app_settings_select_own ON public.app_settings;
DROP POLICY IF EXISTS app_settings_insert_own ON public.app_settings;
DROP POLICY IF EXISTS app_settings_update_own ON public.app_settings;
DROP POLICY IF EXISTS app_settings_delete_own ON public.app_settings;

DROP POLICY IF EXISTS products_admin_select_own ON public.products;
DROP POLICY IF EXISTS products_admin_insert_own ON public.products;
DROP POLICY IF EXISTS products_admin_update_own ON public.products;
DROP POLICY IF EXISTS products_admin_delete_own ON public.products;

DROP POLICY IF EXISTS sales_admin_full_access ON public.sales;
DROP POLICY IF EXISTS sales_instrutor_read_own ON public.sales;
DROP POLICY IF EXISTS sale_items_admin_full_access ON public.sale_items;
DROP POLICY IF EXISTS sale_items_instrutor_read_own ON public.sale_items;
DROP POLICY IF EXISTS financial_transactions_admin_full_access ON public.financial_transactions;
DROP POLICY IF EXISTS financial_transactions_instrutor_read_own ON public.financial_transactions;

-- 4) Acesso completo para admin.
-- O administrador pode consultar e administrar todos os registros.
-- O owner_id continua sendo gravado para manter a autoria de cada dado.
CREATE POLICY students_admin_full_access
ON public.students FOR ALL TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY lessons_admin_full_access
ON public.lessons FOR ALL TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY vehicles_admin_full_access
ON public.vehicles FOR ALL TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY app_settings_admin_full_access
ON public.app_settings FOR ALL TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY products_admin_full_access
ON public.products FOR ALL TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY sales_admin_full_access
ON public.sales FOR ALL TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY sale_items_admin_full_access
ON public.sale_items FOR ALL TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY financial_transactions_admin_full_access
ON public.financial_transactions FOR ALL TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

-- 5) Instrutor: somente SELECT dos proprios dados.
-- Nao ha politicas de INSERT, UPDATE ou DELETE para instrutor.
CREATE POLICY students_instrutor_read_own
ON public.students FOR SELECT TO authenticated
USING (
  public.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
);

CREATE POLICY lessons_instrutor_read_own
ON public.lessons FOR SELECT TO authenticated
USING (
  public.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
);

CREATE POLICY vehicles_instrutor_read_own
ON public.vehicles FOR SELECT TO authenticated
USING (
  public.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
);

CREATE POLICY products_instrutor_read_own
ON public.products FOR SELECT TO authenticated
USING (
  public.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
);

CREATE POLICY sales_instrutor_read_own
ON public.sales FOR SELECT TO authenticated
USING (
  public.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
);

CREATE POLICY sale_items_instrutor_read_own
ON public.sale_items FOR SELECT TO authenticated
USING (
  public.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
);

CREATE POLICY financial_transactions_instrutor_read_own
ON public.financial_transactions FOR SELECT TO authenticated
USING (
  public.current_app_role() = 'instrutor'
  AND owner_id = (SELECT auth.uid())
);

-- 6) app_settings fica exclusivo do admin.
-- Instrutores nao recebem politica de leitura ou escrita nessa tabela.
--
-- 7) profiles mantem leitura/edicao do proprio nome. A funcao acima impede
-- alteracao de role por usuario autenticado. A politica de INSERT existente
-- continua limitada a id = auth.uid(); o trigger fixa role = 'instrutor'.
--
-- 8) Antes de aplicar, validar tambem:
--   a) se o fluxo administrativo de criacao de usuarios cria profiles com
--      service_role ou por SQL seguro;
--   b) se as telas de relatorio consultarao apenas SELECT;
--   c) se os joins usam owner_id consistente entre pai e filho;
--   d) se as politicas de whatsapp/ai_requests permanecem inalteradas.
