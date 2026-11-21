-- Restore current financial RPCs for isolated security tests.
-- These functions remain SECURITY INVOKER and enforce role/owner checks.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_create_sale(p_student_id uuid, p_forma_pagamento text, p_items jsonb, p_desconto_tipo text DEFAULT 'valor'::text, p_desconto_valor numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 v_uid uuid:=auth.uid(); v_sale_id uuid; v_student public.students%rowtype;
 v_product public.products%rowtype; v_sale_item public.sale_items%rowtype; v_item jsonb;
 v_product_id uuid; v_quantity numeric; v_item_type text; v_subtotal numeric;
 v_total_bruto numeric:=0; v_subtotal_servicos numeric:=0; v_discount numeric:=0;
 v_discount_allocated numeric:=0; v_discount_item numeric:=0; v_total numeric:=0;
 v_classes integer:=0; v_item_classes integer; v_descricao_itens text:='';
 v_item_count integer:=0; v_item_index integer:=0;
BEGIN
 IF v_uid IS NULL OR private.current_app_role()<>'admin' THEN RAISE EXCEPTION 'Acesso administrativo obrigatório.'; END IF;
 IF p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência bancária','Outro') THEN
  RAISE EXCEPTION 'Forma de pagamento inválida.';
 END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Adicione ao menos um item à venda.'; END IF;
 IF p_desconto_tipo NOT IN ('valor','percentual') OR p_desconto_valor IS NULL OR p_desconto_valor<0 THEN RAISE EXCEPTION 'Desconto inválido.'; END IF;
 SELECT * INTO v_student FROM public.students WHERE id=p_student_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aluno não encontrado nesta conta.'; END IF;
 INSERT INTO public.sales(owner_id,student_id,data_venda,total,subtotal_bruto,desconto_tipo,desconto_valor,desconto,forma_pagamento,status,observacoes)
 VALUES(v_uid,p_student_id,current_date,0,0,p_desconto_tipo,p_desconto_valor,0,p_forma_pagamento,'confirmada',null)
 RETURNING id INTO v_sale_id;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_product_id:=nullif(v_item->>'product_id','')::uuid;
  v_quantity:=nullif(v_item->>'quantidade','')::numeric;
  IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<=0 OR v_quantity<>trunc(v_quantity) THEN RAISE EXCEPTION 'Produto ou quantidade inválida.'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id=v_product_id AND owner_id=v_uid AND ativo=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado, inativo ou de outra conta.'; END IF;
  IF v_product.preco<=0 THEN RAISE EXCEPTION 'O item % não possui preço válido.',v_product.nome; END IF;
  IF v_product.quantidade_aulas_min IS NOT NULL AND v_quantity<v_product.quantidade_aulas_min THEN RAISE EXCEPTION 'A quantidade do pacote % está abaixo do mínimo de % aulas.',v_product.nome,v_product.quantidade_aulas_min; END IF;
  IF v_product.quantidade_aulas_max IS NOT NULL AND v_quantity>v_product.quantidade_aulas_max THEN RAISE EXCEPTION 'A quantidade do pacote % ultrapassa o máximo de % aulas.',v_product.nome,v_product.quantidade_aulas_max; END IF;
  v_item_type:=CASE
   WHEN v_product.tipo IN ('servico','pacote') OR v_product.quantidade_aulas IS NOT NULL OR v_product.quantidade_aulas_min IS NOT NULL OR v_product.quantidade_aulas_max IS NOT NULL OR lower(coalesce(v_product.app_product_id,'')) IN ('bronze','prata','ouro') OR lower(v_product.nome) LIKE 'pacote %' OR lower(v_product.nome) LIKE 'aula avulsa%'
   THEN 'servico' ELSE 'produto' END;
  v_subtotal:=round(v_product.preco*v_quantity,2); v_item_classes:=0;
  IF v_item_type='servico' THEN
   IF v_product.quantidade_aulas_min IS NOT NULL OR v_product.quantidade_aulas_max IS NOT NULL THEN v_item_classes:=v_quantity::integer;
   ELSE v_item_classes:=(v_quantity*greatest(1,coalesce(v_product.quantidade_aulas,1)))::integer; END IF;
   v_classes:=v_classes+v_item_classes; v_subtotal_servicos:=v_subtotal_servicos+v_subtotal;
  END IF;
  INSERT INTO public.sale_items(owner_id,sale_id,product_id,descricao,quantidade,valor_unitario,subtotal,tipo_item,aulas_contratadas,aulas_devolvidas,valor_por_aula,valor_devolvido,valor_liquido)
  VALUES(v_uid,v_sale_id,v_product.id,v_product.nome,v_quantity,v_product.preco,v_subtotal,v_item_type,v_item_classes,0,0,0,v_subtotal);
  v_total_bruto:=v_total_bruto+v_subtotal;
  v_descricao_itens:=concat_ws(', ',nullif(v_descricao_itens,''),v_product.nome||' ('||v_quantity::text||')');
 END LOOP;
 IF v_total_bruto<=0 THEN RAISE EXCEPTION 'O subtotal da venda deve ser maior que zero.'; END IF;
 IF p_desconto_valor>0 AND v_subtotal_servicos<=0 THEN RAISE EXCEPTION 'Desconto permitido somente para serviços.'; END IF;
 IF p_desconto_tipo='percentual' THEN
  IF p_desconto_valor>=100 THEN RAISE EXCEPTION 'O desconto percentual deve ser inferior a 100%%.'; END IF;
  v_discount:=round(v_subtotal_servicos*p_desconto_valor/100,2);
 ELSE v_discount:=round(p_desconto_valor,2); END IF;
 IF v_discount<0 OR (v_discount>=v_subtotal_servicos AND v_discount>0) THEN RAISE EXCEPTION 'O desconto deve ser menor que o subtotal dos serviços.'; END IF;
 SELECT count(*) INTO v_item_count FROM public.sale_items WHERE sale_id=v_sale_id AND owner_id=v_uid AND tipo_item='servico';
 FOR v_sale_item IN SELECT * FROM public.sale_items WHERE sale_id=v_sale_id AND owner_id=v_uid AND tipo_item='servico' ORDER BY id LOOP
  v_item_index:=v_item_index+1;
  IF v_item_index=v_item_count THEN v_discount_item:=v_discount-v_discount_allocated;
  ELSE v_discount_item:=round(v_sale_item.subtotal*v_discount/v_subtotal_servicos,2); END IF;
  v_discount_allocated:=v_discount_allocated+v_discount_item;
  UPDATE public.sale_items SET valor_liquido=greatest(0,v_sale_item.subtotal-v_discount_item),
   valor_por_aula=CASE WHEN v_sale_item.aulas_contratadas>0 THEN round(greatest(0,v_sale_item.subtotal-v_discount_item)/v_sale_item.aulas_contratadas,2) ELSE 0 END
  WHERE id=v_sale_item.id AND owner_id=v_uid;
 END LOOP;
 v_total:=round(v_total_bruto-v_discount,2);
 UPDATE public.students SET aulas_compradas=coalesce(aulas_compradas,0)+v_classes,aulas_restantes=coalesce(aulas_restantes,0)+v_classes
 WHERE id=p_student_id AND owner_id=v_uid;
 UPDATE public.sales SET subtotal_bruto=v_total_bruto,desconto=v_discount,total=v_total WHERE id=v_sale_id AND owner_id=v_uid;
 INSERT INTO public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
 VALUES(v_uid,p_student_id,v_sale_id,'entrada','Venda para '||v_student.nome||': '||v_descricao_itens||CASE WHEN v_discount>0 THEN ' (desconto somente em serviços: '||v_discount::text||')' ELSE '' END,v_total,current_date,'confirmado');
 RETURN jsonb_build_object('sale_id',v_sale_id,'subtotal_bruto',v_total_bruto,'subtotal_servicos',v_subtotal_servicos,'desconto',v_discount,'total',v_total,'aulas_adicionadas',v_classes);
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_delete_sale(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_sale public.sales%rowtype; v_student public.students%rowtype; v_net_lessons integer:=0;
BEGIN
 IF v_uid IS NULL OR private.current_app_role()<>'admin' THEN RAISE EXCEPTION 'Acesso administrativo obrigatório.'; END IF;
 SELECT * INTO v_sale FROM public.sales WHERE id=p_sale_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada nesta conta.'; END IF;
 IF v_sale.student_id IS NOT NULL THEN
  SELECT * INTO v_student FROM public.students WHERE id=v_sale.student_id AND owner_id=v_uid FOR UPDATE;
  SELECT coalesce(sum(greatest(0,aulas_contratadas-aulas_devolvidas)),0)::integer INTO v_net_lessons
  FROM public.sale_items WHERE sale_id=p_sale_id AND owner_id=v_uid;
  IF coalesce(v_student.aulas_restantes,0)<v_net_lessons THEN RAISE EXCEPTION 'Não é possível excluir: parte das aulas já foi utilizada.'; END IF;
  UPDATE public.students SET aulas_compradas=greatest(0,coalesce(aulas_compradas,0)-v_net_lessons),aulas_restantes=greatest(0,coalesce(aulas_restantes,0)-v_net_lessons)
  WHERE id=v_sale.student_id AND owner_id=v_uid;
 END IF;
 DELETE FROM public.financial_transactions WHERE sale_id=p_sale_id AND owner_id=v_uid;
 DELETE FROM public.sales WHERE id=p_sale_id AND owner_id=v_uid;
 RETURN jsonb_build_object('sale_id',p_sale_id,'aulas_removidas',v_net_lessons);
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_refund_sale_lessons(p_sale_item_id uuid, p_quantidade integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_item public.sale_items%rowtype; v_sale public.sales%rowtype; v_student public.students%rowtype; v_refund numeric;
BEGIN
 IF v_uid IS NULL OR private.current_app_role()<>'admin' THEN RAISE EXCEPTION 'Acesso administrativo obrigatório.'; END IF;
 IF p_quantidade IS NULL OR p_quantidade<1 THEN RAISE EXCEPTION 'Quantidade para devolução inválida.'; END IF;
 SELECT s.* INTO v_sale FROM public.sales s JOIN public.sale_items si ON si.sale_id=s.id WHERE si.id=p_sale_item_id AND s.owner_id=v_uid LIMIT 1;
 IF NOT FOUND OR v_sale.student_id IS NULL THEN RAISE EXCEPTION 'Venda ou aluno não encontrado.'; END IF;
 SELECT * INTO v_student FROM public.students WHERE id=v_sale.student_id AND owner_id=v_uid FOR UPDATE;
 SELECT * INTO v_item FROM public.sale_items WHERE id=p_sale_item_id AND sale_id=v_sale.id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_item.tipo_item<>'servico' THEN RAISE EXCEPTION 'Item de serviço não encontrado.'; END IF;
 IF p_quantidade>v_item.aulas_contratadas-v_item.aulas_devolvidas THEN RAISE EXCEPTION 'Quantidade maior que as aulas disponíveis para devolução.'; END IF;
 IF coalesce(v_student.aulas_restantes,0)<p_quantidade THEN RAISE EXCEPTION 'Parte dessas aulas já foi utilizada e não pode ser devolvida.'; END IF;
 v_refund:=least(round(v_item.valor_por_aula*p_quantidade,2),v_item.valor_liquido-v_item.valor_devolvido);
 IF v_refund<=0 THEN RAISE EXCEPTION 'Valor de devolução inválido.'; END IF;
 UPDATE public.sale_items SET aulas_devolvidas=aulas_devolvidas+p_quantidade,valor_devolvido=valor_devolvido+v_refund WHERE id=p_sale_item_id AND owner_id=v_uid;
 UPDATE public.students SET aulas_compradas=greatest(0,coalesce(aulas_compradas,0)-p_quantidade),aulas_restantes=greatest(0,coalesce(aulas_restantes,0)-p_quantidade) WHERE id=v_sale.student_id AND owner_id=v_uid;
 INSERT INTO public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
 VALUES(v_uid,v_sale.student_id,v_sale.id,'saida','Devolução de '||p_quantidade||' aula(s) - '||v_item.descricao,v_refund,current_date,'confirmado');
 RETURN jsonb_build_object('sale_id',v_sale.id,'aulas_devolvidas',p_quantidade,'valor_devolvido',v_refund);
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_refund_sale_product(p_sale_item_id uuid, p_quantidade numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_item public.sale_items%rowtype; v_sale public.sales%rowtype; v_refund numeric; v_remaining numeric; v_unit_net numeric;
BEGIN
 IF v_uid IS NULL OR private.current_app_role()<>'admin' THEN RAISE EXCEPTION 'Acesso administrativo obrigatório.'; END IF;
 IF p_quantidade IS NULL OR p_quantidade<=0 OR p_quantidade<>trunc(p_quantidade) THEN RAISE EXCEPTION 'Quantidade de produtos para devolução inválida.'; END IF;
 SELECT s.* INTO v_sale FROM public.sales s JOIN public.sale_items si ON si.sale_id=s.id WHERE si.id=p_sale_item_id AND s.owner_id=v_uid LIMIT 1 FOR UPDATE OF s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.'; END IF;
 SELECT si.* INTO v_item FROM public.sale_items si WHERE si.id=p_sale_item_id AND si.sale_id=v_sale.id AND si.owner_id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_item.tipo_item<>'produto' THEN RAISE EXCEPTION 'Item de produto não encontrado.'; END IF;
 v_remaining:=v_item.quantidade-v_item.quantidade_devolvida;
 IF p_quantidade>v_remaining THEN RAISE EXCEPTION 'Quantidade maior que os produtos disponíveis para devolução.'; END IF;
 IF v_item.quantidade<=0 THEN RAISE EXCEPTION 'Quantidade original do produto inválida.'; END IF;
 v_unit_net:=v_item.valor_liquido/v_item.quantidade;
 v_refund:=least(round(v_unit_net*p_quantidade,2),v_item.valor_liquido-v_item.valor_devolvido);
 IF v_refund<=0 THEN RAISE EXCEPTION 'Valor de devolução inválido.'; END IF;
 UPDATE public.sale_items SET quantidade_devolvida=quantidade_devolvida+p_quantidade,valor_devolvido=valor_devolvido+v_refund WHERE id=p_sale_item_id AND owner_id=v_uid;
 INSERT INTO public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
 VALUES(v_uid,v_sale.student_id,v_sale.id,'saida','Devolução de '||p_quantidade||' unidade(s) - '||v_item.descricao,v_refund,current_date,'confirmado');
 RETURN jsonb_build_object('sale_id',v_sale.id,'produto_devolvido',p_quantidade,'valor_devolvido',v_refund);
END;
$function$


CREATE OR REPLACE FUNCTION public.create_instructor_sale(p_sale_id uuid, p_student_id uuid, p_items jsonb, p_payment_method text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 v_owner_id uuid:=auth.uid(); v_student_name text; v_product public.products%rowtype;
 v_item jsonb; v_product_id uuid; v_quantity numeric; v_subtotal numeric;
 v_total numeric:=0; v_lessons integer:=0; v_item_description text;
 v_description text:=''; v_inserted_id uuid; v_existing_owner uuid;
BEGIN
 IF v_owner_id IS NULL OR private.current_app_role()<>'instrutor' THEN
  RAISE EXCEPTION 'Apenas instrutores autenticados podem registrar vendas.' USING ERRCODE='42501';
 END IF;
 IF p_sale_id IS NULL OR p_student_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
  RAISE EXCEPTION 'Informe aluno e pelo menos um item válido.' USING ERRCODE='22023';
 END IF;
 SELECT s.nome INTO v_student_name FROM public.students s WHERE s.id=p_student_id AND s.owner_id=v_owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aluno não encontrado ou não pertence a este instrutor.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.sales(id,owner_id,student_id,total,forma_pagamento,status,observacoes)
 VALUES(p_sale_id,v_owner_id,p_student_id,0,p_payment_method,'confirmada',p_notes)
 ON CONFLICT(id) DO NOTHING RETURNING id INTO v_inserted_id;
 IF v_inserted_id IS NULL THEN
  SELECT s.owner_id INTO v_existing_owner FROM public.sales s WHERE s.id=p_sale_id;
  IF v_existing_owner=v_owner_id THEN RETURN p_sale_id; END IF;
  RAISE EXCEPTION 'Identificador de venda já utilizado.' USING ERRCODE='23505';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_product_id:=nullif(v_item->>'product_id','')::uuid;
  v_quantity:=nullif(v_item->>'quantidade','')::numeric;
  IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<=0 OR v_quantity<>trunc(v_quantity) THEN
   RAISE EXCEPTION 'Item de venda ou quantidade inválida.' USING ERRCODE='22023';
  END IF;
  SELECT p.* INTO v_product FROM public.products p WHERE p.id=v_product_id AND p.owner_id=v_owner_id AND p.ativo=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto ou serviço não encontrado, inativo ou de outro instrutor.' USING ERRCODE='42501'; END IF;
  v_subtotal:=round(v_product.preco*v_quantity,2);
  v_total:=v_total+v_subtotal;
  INSERT INTO public.sale_items(owner_id,sale_id,product_id,descricao,quantidade,valor_unitario,subtotal)
  VALUES(v_owner_id,p_sale_id,v_product.id,v_product.nome,v_quantity,v_product.preco,v_subtotal);
  IF v_product.tipo IN ('servico','pacote') THEN
   v_lessons:=v_lessons+(coalesce(v_product.quantidade_aulas,CASE WHEN v_product.tipo='servico' THEN 1 ELSE 0 END)*v_quantity)::integer;
  END IF;
  v_item_description:=v_product.nome||' ('||trim(to_char(v_quantity,'FM999999990'))||')';
  v_description:=concat_ws(', ',nullif(v_description,''),v_item_description);
 END LOOP;
 UPDATE public.sales SET total=v_total WHERE id=p_sale_id AND owner_id=v_owner_id;
 INSERT INTO public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
 VALUES(v_owner_id,p_student_id,p_sale_id,'entrada','Venda para '||v_student_name||': '||v_description,v_total,current_date,'confirmado');
 IF v_lessons>0 THEN
  UPDATE public.students SET aulas_compradas=coalesce(aulas_compradas,0)+v_lessons,aulas_restantes=coalesce(aulas_restantes,0)+v_lessons
  WHERE id=p_student_id AND owner_id=v_owner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível atualizar o saldo de aulas do aluno.' USING ERRCODE='P0001'; END IF;
 END IF;
 RETURN p_sale_id;
END;
$function$

ALTER FUNCTION public.admin_create_sale(uuid, text, jsonb, text, numeric) OWNER TO postgres;
ALTER FUNCTION public.admin_delete_sale(uuid) OWNER TO postgres;
ALTER FUNCTION public.admin_refund_sale_lessons(uuid, integer) OWNER TO postgres;
ALTER FUNCTION public.admin_refund_sale_product(uuid, numeric) OWNER TO postgres;
ALTER FUNCTION public.create_instructor_sale(uuid, uuid, jsonb, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_create_sale(uuid, text, jsonb, text, numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_sale(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_refund_sale_lessons(uuid, integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_refund_sale_product(uuid, numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_instructor_sale(uuid, uuid, jsonb, text, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_sale(uuid, text, jsonb, text, numeric) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_sale(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_refund_sale_lessons(uuid, integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_refund_sale_product(uuid, numeric) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_instructor_sale(uuid, uuid, jsonb, text, text) TO authenticated,service_role;
COMMIT;
