CREATE OR REPLACE FUNCTION public.create_sale_with_fixed_items(p_sale_id uuid, p_student_id uuid, p_items jsonb, p_payment_method text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_discount_type text DEFAULT 'valor'::text, p_discount_value numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_student public.students%rowtype;
  v_product public.products%rowtype;
  v_settings public.app_settings%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_fixed_key text;
  v_quantity numeric;
  v_price numeric;
  v_label text;
  v_type text;
  v_lessons integer;
  v_subtotal numeric;
  v_gross numeric := 0;
  v_service_subtotal numeric := 0;
  v_discount numeric := 0;
  v_discount_allocated numeric := 0;
  v_discount_item numeric := 0;
  v_total numeric := 0;
  v_lessons_total integer := 0;
  v_rentals_total integer := 0;
  v_description text := '';
  v_sale_item public.sale_items%rowtype;
  v_item_count integer := 0;
  v_item_index integer := 0;
  v_existing_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão não autenticada.'; END IF;
  v_role := private.current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('admin','instrutor') THEN RAISE EXCEPTION 'Acesso permitido somente ao administrador ou instrutor.'; END IF;
  IF p_sale_id IS NULL OR p_student_id IS NULL OR p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Informe aluno e pelo menos um item válido.';
  END IF;
  IF p_payment_method IS NOT NULL AND p_payment_method NOT IN
    ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência bancária','Transferência','Outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;
  IF p_discount_type NOT IN ('valor','percentual') OR p_discount_value IS NULL OR p_discount_value < 0 THEN
    RAISE EXCEPTION 'Desconto inválido.';
  END IF;
  SELECT * INTO v_student FROM public.students WHERE id=p_student_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno não encontrado nesta conta.'; END IF;
  SELECT * INTO v_settings FROM public.app_settings WHERE owner_id=v_uid FOR SHARE;
  INSERT INTO public.sales(id,owner_id,student_id,data_venda,total,subtotal_bruto,desconto_tipo,desconto_valor,desconto,forma_pagamento,status,observacoes)
  VALUES(p_sale_id,v_uid,p_student_id,current_date,0,0,p_discount_type,p_discount_value,0,p_payment_method,'confirmada',p_notes)
  ON CONFLICT(id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT owner_id INTO v_existing_owner FROM public.sales WHERE id=p_sale_id;
    IF v_existing_owner=v_uid THEN RETURN jsonb_build_object('sale_id',p_sale_id,'reused',true); END IF;
    RAISE EXCEPTION 'Identificador de venda já utilizado.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := nullif(v_item->>'quantidade','')::numeric;
    v_fixed_key := nullif(v_item->>'fixed_item_key','');
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    IF v_quantity IS NULL OR v_quantity<=0 OR v_quantity<>trunc(v_quantity) THEN
      RAISE EXCEPTION 'Quantidade de item inválida.';
    END IF;
    IF v_fixed_key IS NOT NULL THEN
      IF v_fixed_key NOT IN ('aluguel_veiculo','cartao_moto_pista') OR v_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'Item fixo inválido.';
      END IF;
      v_price := CASE v_fixed_key WHEN 'aluguel_veiculo' THEN v_settings.aluguel_veiculo_preco ELSE v_settings.cartao_moto_pista_preco END;
      IF coalesce(v_price,0)<=0 THEN RAISE EXCEPTION 'Configure o preço de Aluguel e Cartão Moto Pista em Produtos e Serviços antes de vender.'; END IF;
      v_label := CASE v_fixed_key WHEN 'aluguel_veiculo' THEN 'Aluguel de Veículo' ELSE 'Cartão Moto Pista' END;
      v_type := 'produto';
      v_lessons := 0;
      IF v_fixed_key='aluguel_veiculo' THEN v_rentals_total := v_rentals_total + v_quantity::integer; END IF;
    ELSE
      IF v_product_id IS NULL THEN RAISE EXCEPTION 'Produto ou serviço inválido.'; END IF;
      SELECT * INTO v_product FROM public.products
      WHERE id=v_product_id AND owner_id=v_uid AND ativo=true FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado, inativo ou de outra conta.'; END IF;
      v_price := v_product.preco;
      v_label := v_product.nome;
      IF v_price<=0 THEN RAISE EXCEPTION 'O item % não possui preço válido.',v_label; END IF;
      IF v_product.quantidade_aulas_min IS NOT NULL AND v_quantity<v_product.quantidade_aulas_min THEN
        RAISE EXCEPTION 'A quantidade do pacote % está abaixo do mínimo de % aulas.',v_label,v_product.quantidade_aulas_min;
      END IF;
      IF v_product.quantidade_aulas_max IS NOT NULL AND v_quantity>v_product.quantidade_aulas_max THEN
        RAISE EXCEPTION 'A quantidade do pacote % ultrapassa o máximo de % aulas.',v_label,v_product.quantidade_aulas_max;
      END IF;
      v_type := CASE WHEN v_product.tipo IN ('servico','pacote') OR v_product.quantidade_aulas IS NOT NULL
        OR v_product.quantidade_aulas_min IS NOT NULL OR v_product.quantidade_aulas_max IS NOT NULL
        OR lower(coalesce(v_product.app_product_id,'')) IN ('bronze','prata','ouro')
        OR lower(v_product.nome) LIKE 'pacote %' OR lower(v_product.nome) LIKE 'aula avulsa%'
        THEN 'servico' ELSE 'produto' END;
      v_lessons := 0;
      IF v_type='servico' THEN
        IF v_product.quantidade_aulas_min IS NOT NULL OR v_product.quantidade_aulas_max IS NOT NULL THEN
          v_lessons := v_quantity::integer;
        ELSE
          v_lessons := (v_quantity*greatest(1,coalesce(v_product.quantidade_aulas,1)))::integer;
        END IF;
      END IF;
      v_lessons_total := v_lessons_total + v_lessons;
      IF v_type='servico' THEN v_service_subtotal := v_service_subtotal + round(v_price*v_quantity,2); END IF;
    END IF;
    v_subtotal := round(v_price*v_quantity,2);
    INSERT INTO public.sale_items(owner_id,sale_id,product_id,descricao,quantidade,valor_unitario,subtotal,tipo_item,aulas_contratadas,aulas_devolvidas,valor_por_aula,valor_devolvido,valor_liquido,fixed_item_key)
    VALUES(v_uid,p_sale_id,v_product_id,v_label,v_quantity,v_price,v_subtotal,v_type,v_lessons,0,
      CASE WHEN v_lessons>0 THEN round(v_subtotal/v_lessons,2) ELSE 0 END,0,v_subtotal,v_fixed_key);
    v_gross := v_gross + v_subtotal;
    v_description := concat_ws(', ',nullif(v_description,''),v_label||' ('||v_quantity::text||')');
  END LOOP;
  IF v_gross<=0 THEN RAISE EXCEPTION 'O total da venda deve ser maior que zero.'; END IF;
  IF p_discount_value>0 AND v_service_subtotal<=0 THEN RAISE EXCEPTION 'Desconto permitido somente para serviços.'; END IF;
  IF p_discount_type='percentual' THEN
    IF p_discount_value>=100 THEN RAISE EXCEPTION 'O desconto percentual deve ser inferior a 100%%.'; END IF;
    v_discount := round(v_service_subtotal*p_discount_value/100,2);
  ELSE v_discount := round(p_discount_value,2); END IF;
  IF v_discount<0 OR (v_discount>=v_service_subtotal AND v_discount>0) THEN
    RAISE EXCEPTION 'O desconto deve ser menor que o subtotal dos serviços.';
  END IF;
  SELECT count(*) INTO v_item_count FROM public.sale_items WHERE sale_id=p_sale_id AND owner_id=v_uid AND tipo_item='servico';
  FOR v_sale_item IN SELECT * FROM public.sale_items WHERE sale_id=p_sale_id AND owner_id=v_uid AND tipo_item='servico' ORDER BY id LOOP
    v_item_index := v_item_index+1;
    IF v_item_index=v_item_count THEN v_discount_item:=v_discount-v_discount_allocated;
    ELSE v_discount_item:=round(v_sale_item.subtotal*v_discount/v_service_subtotal,2); END IF;
    v_discount_allocated:=v_discount_allocated+v_discount_item;
    UPDATE public.sale_items SET valor_liquido=greatest(0,v_sale_item.subtotal-v_discount_item),
      valor_por_aula=CASE WHEN v_sale_item.aulas_contratadas>0 THEN round(greatest(0,v_sale_item.subtotal-v_discount_item)/v_sale_item.aulas_contratadas,2) ELSE 0 END
    WHERE id=v_sale_item.id AND owner_id=v_uid;
  END LOOP;
  v_total:=round(v_gross-v_discount,2);
  UPDATE public.students SET aulas_compradas=coalesce(aulas_compradas,0)+v_lessons_total,
    aulas_restantes=coalesce(aulas_restantes,0)+v_lessons_total,
    alugueis_comprados=coalesce(alugueis_comprados,0)+v_rentals_total,
    alugueis_disponiveis=coalesce(alugueis_disponiveis,0)+v_rentals_total
  WHERE id=p_student_id AND owner_id=v_uid;
  UPDATE public.sales SET subtotal_bruto=v_gross,desconto=v_discount,total=v_total
  WHERE id=p_sale_id AND owner_id=v_uid;
  INSERT INTO public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
  VALUES(v_uid,p_student_id,p_sale_id,'entrada','Venda para '||v_student.nome||': '||v_description||
    CASE WHEN v_discount>0 THEN ' (desconto somente em serviços: '||v_discount::text||')' ELSE '' END,
    v_total,current_date,'confirmado');
  RETURN jsonb_build_object('sale_id',p_sale_id,'subtotal_bruto',v_gross,'desconto',v_discount,'total',v_total,
    'aulas_adicionadas',v_lessons_total,'alugueis_adicionados',v_rentals_total);
END;
$function$
