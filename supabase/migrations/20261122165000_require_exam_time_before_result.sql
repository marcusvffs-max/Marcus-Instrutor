CREATE OR REPLACE FUNCTION public.record_student_practical_exam_result(p_exam_id uuid,p_resultado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
 v_uid uuid:=auth.uid();
 v_exam public.student_practical_exams%rowtype;
 v_student public.students%rowtype;
BEGIN
 IF v_uid IS NULL OR private.current_app_role() NOT IN ('admin','instrutor') THEN
   RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor.';
 END IF;
 IF p_resultado NOT IN ('aprovado','reprovado') THEN
   RAISE EXCEPTION 'Resultado de exame inválido.';
 END IF;
 SELECT * INTO v_exam FROM public.student_practical_exams
 WHERE id=p_exam_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado nesta conta.'; END IF;
 IF v_exam.status<>'agendado' THEN RAISE EXCEPTION 'Este exame já foi finalizado ou cancelado.'; END IF;
 IF v_exam.scheduled_at>now() THEN RAISE EXCEPTION 'O horário agendado para este exame ainda não chegou.'; END IF;
 SELECT * INTO v_student FROM public.students
 WHERE id=v_exam.student_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aluno não encontrado nesta conta.'; END IF;
 IF coalesce(v_student.alugueis_disponiveis,0)<1 THEN
   RAISE EXCEPTION 'O aluno não possui Aluguel de Veículo disponível.';
 END IF;
 UPDATE public.students SET alugueis_disponiveis=alugueis_disponiveis-1
 WHERE id=v_student.id AND owner_id=v_uid;
 UPDATE public.student_practical_exams
 SET status='realizado',resultado=p_resultado,aluguel_consumido=true,updated_at=now()
 WHERE id=v_exam.id AND owner_id=v_uid;
 RETURN jsonb_build_object('exam_id',v_exam.id,'student_id',v_student.id,'resultado',p_resultado,'alugueis_disponiveis',v_student.alugueis_disponiveis-1);
END;
$function$;