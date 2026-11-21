-- Restore operational RLS policies in isolated security-test project.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.profiles,public.students,public.vehicles,public.lessons FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.profiles,public.students,public.vehicles,public.lessons TO authenticated;

DROP POLICY IF EXISTS students_delete_by_role ON public.students;
DROP POLICY IF EXISTS students_insert_by_role ON public.students;
DROP POLICY IF EXISTS students_select_by_role ON public.students;
DROP POLICY IF EXISTS students_update_by_role ON public.students;
CREATE POLICY students_delete_by_role ON public.students FOR DELETE TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY students_insert_by_role ON public.students FOR INSERT TO authenticated WITH CHECK (((private.current_app_role()='admin') AND owner_id=(SELECT auth.uid())) OR ((private.current_app_role()='instrutor') AND owner_id=(SELECT auth.uid())));
CREATE POLICY students_select_by_role ON public.students FOR SELECT TO authenticated USING (((private.current_app_role()='admin') AND owner_id=(SELECT auth.uid())) OR ((private.current_app_role()='instrutor') AND owner_id=(SELECT auth.uid())));
CREATE POLICY students_update_by_role ON public.students FOR UPDATE TO authenticated USING (((private.current_app_role()='admin') AND owner_id=(SELECT auth.uid())) OR ((private.current_app_role()='instrutor') AND owner_id=(SELECT auth.uid()))) WITH CHECK (((private.current_app_role()='admin') AND owner_id=(SELECT auth.uid())) OR ((private.current_app_role()='instrutor') AND owner_id=(SELECT auth.uid())));

DROP POLICY IF EXISTS lessons_delete_by_role ON public.lessons;
DROP POLICY IF EXISTS lessons_insert_by_role ON public.lessons;
DROP POLICY IF EXISTS lessons_select_by_role ON public.lessons;
DROP POLICY IF EXISTS lessons_update_by_role ON public.lessons;
CREATE POLICY lessons_delete_by_role ON public.lessons FOR DELETE TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY lessons_insert_by_role ON public.lessons FOR INSERT TO authenticated WITH CHECK (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.students s WHERE s.id=lessons.student_id AND s.owner_id=(SELECT auth.uid())) AND (vehicle_id IS NULL OR EXISTS(SELECT 1 FROM public.vehicles v WHERE v.id=lessons.vehicle_id AND v.owner_id=(SELECT auth.uid()))));
CREATE POLICY lessons_select_by_role ON public.lessons FOR SELECT TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY lessons_update_by_role ON public.lessons FOR UPDATE TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.students s WHERE s.id=lessons.student_id AND s.owner_id=(SELECT auth.uid())) AND (vehicle_id IS NULL OR EXISTS(SELECT 1 FROM public.vehicles v WHERE v.id=lessons.vehicle_id AND v.owner_id=(SELECT auth.uid()))));

DROP POLICY IF EXISTS vehicles_delete_by_role ON public.vehicles;
DROP POLICY IF EXISTS vehicles_insert_by_role ON public.vehicles;
DROP POLICY IF EXISTS vehicles_select_by_role ON public.vehicles;
DROP POLICY IF EXISTS vehicles_update_by_role ON public.vehicles;
CREATE POLICY vehicles_delete_by_role ON public.vehicles FOR DELETE TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY vehicles_insert_by_role ON public.vehicles FOR INSERT TO authenticated WITH CHECK (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY vehicles_select_by_role ON public.vehicles FOR SELECT TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));
CREATE POLICY vehicles_update_by_role ON public.vehicles FOR UPDATE TO authenticated USING (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid())) WITH CHECK (private.current_app_role()=ANY(ARRAY['admin','instrutor']) AND owner_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles FOR SELECT TO authenticated USING (id=(SELECT auth.uid()) OR private.current_app_role()='admin');
COMMIT;
