CREATE OR REPLACE FUNCTION public.register_fixed_item_sale(
 p_sale_id uuid,
 p_student_id uuid,
 p_fixed_item_key text,
 p_quantity integer,
 p_payment_method text DEFAULT NULL,
 p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
 v_uid uuid:=auth.uid();
 v_role text;
 v_student public.students%rowtype;
 v_price numeric;
 v_label text;
 v_total numeric;
 v_existing_owner uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão não autenticada.'; END IF;
 v_role:=private.current_app_role();
 IF v_role NOT IN ('admin','instrutor') THEN RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor.'; END IF;
 IF p_sale_id IS NULL OR p_student_id IS NULL OR p_quantity IS NULL OR p_quantity<1 THEN
   RAISE EXCEPTION 'Informe aluno e quantidade válida.';
 END IF;
 IF p_fixed_item_key NOT IN ('aluguel_veiculo','cartao_moto_pista') THEN
   RAISE EXCEPTION 'Item fixo inválido.';
 END IF;
 IF p_payment_method IS NOT NULL AND p_payment_method NOT IN ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência bancária','Outro') THEN
   RAISE EXCEPTION 'Forma de pagamento inválida.';
 END IF;
 SELECT * INTO v_student FROM public.students WHERE id=p_student_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aluno não encontrado nesta conta.'; END IF;
 SELECT CASE p_fixed_item_key
   WHEN 'aluguel_veiculo' THEN a.aluguel_veiculo_preco
   ELSE a.cartao_moto_pista_preco
 END INTO v_price
 FROM public.app_settings a WHERE a.owner_id=v_uid FOR SHARE;
 IF NOT FOUND OR coalesce(v_price,0)<=0 THEN RAISE EXCEPTION 'Configure o valor deste item fixo em Ajustes antes de vender.'; END IF;
 v_label:=CASE p_fixed_item_key WHEN 'aluguel_veiculo' THEN 'Aluguel de Veículo' ELSE 'Cartão Moto Pista' END;
 v_total:=round(v_price*p_quantity,2);
 INSERT INTO public.sales(id,owner_id,student_id,data_venda,total,subtotal_bruto,desconto,forma_pagamento,status,observacoes)
 VALUES(p_sale_id,v_uid,p_student_id,current_date,v_total,v_total,0,p_payment_method,'confirmada',p_notes)
 ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN
   SELECT owner_id INTO v_existing_owner FROM public.sales WHERE id=p_sale_id;
   IF v_existing_owner=v_uid THEN RETURN jsonb_build_object('sale_id',p_sale_id,'reused',true); END IF;
   RAISE EXCEPTION 'Identificador de venda já utilizado.';
 END IF;
 INSERT INTO public.sale_items(owner_id,sale_id,product_id,descricao,quantidade,valor_unitario,subtotal,tipo_item,aulas_contratadas,aulas_devolvidas,valor_por_aula,valor_devolvido,valor_liquido,fixed_item_key)
 VALUES(v_uid,p_sale_id,NULL,v_label,p_quantity,v_price,v_total,'produto',0,0,0,0,v_total,p_fixed_item_key);
 IF p_fixed_item_key='aluguel_veiculo' THEN
   UPDATE public.students SET alugueis_comprados=alugueis_comprados+p_quantity, alugueis_disponiveis=alugueis_disponiveis+p_quantity
   WHERE id=p_student_id AND owner_id=v_uid;
 END IF;
 INSERT INTO public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
 VALUES(v_uid,p_student_id,p_sale_id,'entrada','Venda para '||v_student.nome||': '||v_label||' ('||p_quantity::text||')',v_total,current_date,'confirmado');
 RETURN jsonb_build_object('sale_id',p_sale_id,'item',v_label,'quantidade',p_quantity,'total',v_total,'alugueis_disponiveis',CASE WHEN p_fixed_item_key='aluguel_veiculo' THEN v_student.alugueis_disponiveis+p_quantity ELSE v_student.alugueis_disponiveis END);
END;
$function$;
REVOKE ALL ON FUNCTION public.register_fixed_item_sale(uuid,uuid,text,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_fixed_item_sale(uuid,uuid,text,integer,text,text) TO authenticated;