ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS aluguel_veiculo_preco numeric(10,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS cartao_moto_pista_preco numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS alugueis_comprados integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS alugueis_disponiveis integer NOT NULL DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS fixed_item_key text;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_fixed_item_key_check CHECK (fixed_item_key IS NULL OR fixed_item_key IN ('aluguel_veiculo','cartao_moto_pista'));
CREATE TABLE public.student_practical_exams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 student_id uuid NOT NULL,
 scheduled_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','realizado','cancelado')),
 resultado text NULL CHECK (resultado IS NULL OR resultado IN ('aprovado','reprovado')),
 aluguel_consumido boolean NOT NULL DEFAULT false,
 observacoes text NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT student_practical_exams_student_owner_fk FOREIGN KEY (student_id,owner_id) REFERENCES public.students(id,owner_id) ON DELETE CASCADE,
 CONSTRAINT student_practical_exams_result_state_check CHECK (
 (status='agendado' AND resultado IS NULL AND aluguel_consumido=false) OR
 (status='cancelado' AND resultado IS NULL AND aluguel_consumido=false) OR
 (status='realizado' AND resultado IS NOT NULL AND aluguel_consumido=true))
);
CREATE INDEX student_practical_exams_owner_student_date_idx ON public.student_practical_exams(owner_id,student_id,scheduled_at DESC);
CREATE INDEX student_practical_exams_owner_status_date_idx ON public.student_practical_exams(owner_id,status,scheduled_at);
ALTER TABLE public.student_practical_exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_practical_exams_owner_select ON public.student_practical_exams FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY student_practical_exams_owner_insert ON public.student_practical_exams FOR INSERT TO authenticated WITH CHECK (
 owner_id=(SELECT auth.uid()) AND private.current_app_role() IN ('admin','instrutor')
 AND EXISTS(SELECT 1 FROM public.students s WHERE s.id=student_id AND s.owner_id=(SELECT auth.uid()))
 AND status='agendado' AND resultado IS NULL AND aluguel_consumido=false);
CREATE POLICY student_practical_exams_owner_delete ON public.student_practical_exams FOR DELETE TO authenticated USING (owner_id=(SELECT auth.uid()) AND private.current_app_role() IN ('admin','instrutor'));
CREATE OR REPLACE FUNCTION public.record_student_practical_exam_result(p_exam_id uuid,p_resultado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_uid uuid:=auth.uid(); v_exam public.student_practical_exams%rowtype; v_student public.students%rowtype;
BEGIN
 IF v_uid IS NULL OR private.current_app_role() NOT IN ('admin','instrutor') THEN RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor.'; END IF;
 IF p_resultado NOT IN ('aprovado','reprovado') THEN RAISE EXCEPTION 'Resultado de exame inválido.'; END IF;
 SELECT * INTO v_exam FROM public.student_practical_exams WHERE id=p_exam_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado nesta conta.'; END IF;
 IF v_exam.status<>'agendado' THEN RAISE EXCEPTION 'Este exame já foi finalizado ou cancelado.'; END IF;
 SELECT * INTO v_student FROM public.students WHERE id=v_exam.student_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aluno não encontrado nesta conta.'; END IF;
 IF coalesce(v_student.alugueis_disponiveis,0)<1 THEN RAISE EXCEPTION 'O aluno não possui Aluguel de Veículo disponível.'; END IF;
 UPDATE public.students SET alugueis_disponiveis=alugueis_disponiveis-1 WHERE id=v_student.id AND owner_id=v_uid;
 UPDATE public.student_practical_exams SET status='realizado',resultado=p_resultado,aluguel_consumido=true,updated_at=now() WHERE id=v_exam.id AND owner_id=v_uid;
 RETURN jsonb_build_object('exam_id',v_exam.id,'student_id',v_student.id,'resultado',p_resultado,'alugueis_disponiveis',v_student.alugueis_disponiveis-1);
END; $function$;
CREATE OR REPLACE FUNCTION public.cancel_student_practical_exam(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$$
DECLARE v_uid uuid:=auth.uid(); v_exam public.student_practical_exams%rowtype;
BEGIN
 IF v_uid IS NULL OR private.current_app_role() NOT IN ('admin','instrutor') THEN RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor.'; END IF;
 SELECT * INTO v_exam FROM public.student_practical_exams WHERE id=p_exam_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado nesta conta.'; END IF;
 IF v_exam.status<>'agendado' THEN RAISE EXCEPTION 'Somente exames agendados podem ser cancelados.'; END IF;
 UPDATE public.student_practical_exams SET status='cancelado',updated_at=now() WHERE id=v_exam.id AND owner_id=v_uid;
 RETURN jsonb_build_object('exam_id',v_exam.id,'status','cancelado','aluguel_consumido',false);
END; $function$;
REVOKE ALL ON FUNCTION public.record_student_practical_exam_result(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_student_practical_exam_result(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_student_practical_exam(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_student_practical_exam(uuid) TO authenticated;