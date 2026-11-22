-- Devoluções administrativas somente em vendas confirmadas.
-- A validação fica no banco para impedir chamadas diretas que contornem a interface.

CREATE OR REPLACE FUNCTION public.admin_refund_sale_lessons(p_sale_item_id uuid, p_quantidade integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid(); v_item public.sale_items%rowtype; v_sale public.sales%rowtype;
 v_student public.students%rowtype; v_refund numeric;
begin
 if v_uid is null or private.current_app_role() IS DISTINCT FROM 'admin' then
   raise exception 'Acesso administrativo obrigatório.';
 end if;
 if p_quantidade is null or p_quantidade<1 then
   raise exception 'Quantidade para devolução inválida.';
 end if;
 select s.* into v_sale from public.sales s join public.sale_items si on si.sale_id=s.id
 where si.id=p_sale_item_id and s.owner_id=v_uid limit 1 for update of s;
 if not found or v_sale.student_id is null then
   raise exception 'Venda ou aluno não encontrado.';
 end if;
 if v_sale.status is distinct from 'confirmada' then
   raise exception 'Somente vendas confirmadas permitem devolução.';
 end if;
 select * into v_student from public.students where id=v_sale.student_id and owner_id=v_uid for update;
 select * into v_item from public.sale_items where id=p_sale_item_id and sale_id=v_sale.id and owner_id=v_uid for update;
 if not found or v_item.tipo_item<>'servico' then
   raise exception 'Item de serviço não encontrado.';
 end if;
 if p_quantidade>v_item.aulas_contratadas-v_item.aulas_devolvidas then
   raise exception 'Quantidade maior que as aulas disponíveis para devolução.';
 end if;
 if coalesce(v_student.aulas_restantes,0)<p_quantidade then
   raise exception 'Parte dessas aulas já foi utilizada e não pode ser devolvida.';
 end if;
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

CREATE OR REPLACE FUNCTION public.admin_refund_sale_product(p_sale_item_id uuid, p_quantidade numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item public.sale_items%rowtype;
  v_sale public.sales%rowtype;
  v_refund numeric;
  v_remaining numeric;
  v_unit_net numeric;
  v_student public.students%rowtype;
begin
  if v_uid is null or private.current_app_role() IS DISTINCT FROM 'admin' then
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
  if not found then raise exception 'Venda não encontrada.'; end if;
  if v_sale.status is distinct from 'confirmada' then
    raise exception 'Somente vendas confirmadas permitem devolução.';
  end if;
  select si.* into v_item
  from public.sale_items si
  where si.id = p_sale_item_id
    and si.sale_id = v_sale.id
    and si.owner_id = v_uid
  for update;
  if not found then raise exception 'Item de produto não encontrado.'; end if;
  if v_item.fixed_item_key = 'aluguel_veiculo' then
    select * into v_student from public.students where id=v_sale.student_id and owner_id=v_uid for update;
    if not found then raise exception 'Aluno desta venda não encontrado.'; end if;
    v_remaining:=coalesce(v_item.quantidade,0)-coalesce(v_item.quantidade_devolvida,0);
    if p_quantidade>v_remaining then raise exception 'Quantidade maior que os aluguéis desta venda disponíveis para devolução.'; end if;
    if coalesce(v_student.alugueis_disponiveis,0)<p_quantidade then raise exception 'Não é possível devolver aluguéis já utilizados em exames.'; end if;
    if coalesce(v_item.quantidade,0)<=0 then raise exception 'Quantidade original inválida.'; end if;
    v_unit_net:=coalesce(v_item.valor_liquido,v_item.subtotal,0)/v_item.quantidade;
    v_refund:=least(round(v_unit_net*p_quantidade,2),coalesce(v_item.valor_liquido,v_item.subtotal,0)-coalesce(v_item.valor_devolvido,0));
    if v_refund<=0 then raise exception 'Valor de devolução inválido.'; end if;
    perform set_config('app.allow_vehicle_rental_refund','true',true);
    update public.students set alugueis_comprados=greatest(0,coalesce(alugueis_comprados,0)-p_quantidade),
      alugueis_disponiveis=greatest(0,coalesce(alugueis_disponiveis,0)-p_quantidade)
      where id=v_sale.student_id and owner_id=v_uid;
    update public.sale_items set quantidade_devolvida=coalesce(quantidade_devolvida,0)+p_quantidade,
      valor_devolvido=coalesce(valor_devolvido,0)+v_refund where id=p_sale_item_id and owner_id=v_uid;
    insert into public.financial_transactions(owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status)
      values(v_uid,v_sale.student_id,v_sale.id,'saida','Devolução de '||p_quantidade||' aluguel(is) de veículo - '||v_item.descricao,v_refund,current_date,'confirmado');
    return jsonb_build_object('sale_id',v_sale.id,'alugueis_devolvidos',p_quantidade,'valor_devolvido',v_refund,
      'alugueis_disponiveis',v_student.alugueis_disponiveis-p_quantidade);
  end if;
  if v_item.tipo_item <> 'produto' then raise exception 'Item de produto não encontrado.'; end if;
  v_remaining := v_item.quantidade - v_item.quantidade_devolvida;
  if p_quantidade > v_remaining then
    raise exception 'Quantidade maior que os produtos disponíveis para devolução.';
  end if;
  if v_item.quantidade <= 0 then raise exception 'Quantidade original do produto inválida.'; end if;
  v_unit_net := v_item.valor_liquido / v_item.quantidade;
  v_refund := least(round(v_unit_net * p_quantidade, 2),v_item.valor_liquido - v_item.valor_devolvido);
  if v_refund <= 0 then raise exception 'Valor de devolução inválido.'; end if;
  update public.sale_items
  set quantidade_devolvida = quantidade_devolvida + p_quantidade,
      valor_devolvido = valor_devolvido + v_refund
  where id = p_sale_item_id and owner_id = v_uid;
  insert into public.financial_transactions(owner_id, student_id, sale_id, tipo, descricao,valor, data_movimento, status)
  values (v_uid, v_sale.student_id, v_sale.id, 'saida',
    'Devolução de ' || p_quantidade || ' unidade(s) - ' || v_item.descricao,
    v_refund, current_date, 'confirmado');
  return jsonb_build_object('sale_id', v_sale.id,'produto_devolvido', p_quantidade,'valor_devolvido', v_refund);
end;
$function$;
