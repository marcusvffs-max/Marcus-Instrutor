-- Make financial RPC role checks fail closed when current_app_role() returns NULL.
-- Existing RLS remains the second authorization layer; function ACLs are preserved by CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.admin_create_sale(p_student_id uuid, p_forma_pagamento text, p_items jsonb, p_desconto_tipo text DEFAULT 'valor'::text, p_desconto_valor numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sale_id uuid;
  v_student public.students%rowtype;
  v_product public.products%rowtype;
  v_sale_item public.sale_items%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_item_type text;
  v_subtotal numeric;
  v_total_bruto numeric := 0;
  v_subtotal_servicos numeric := 0;
  v_discount numeric := 0;
  v_discount_allocated numeric := 0;
  v_discount_item numeric := 0;
  v_total numeric := 0;
  v_classes integer := 0;
  v_item_classes integer;
  v_descricao_itens text := '';
  v_item_count integer := 0;
  v_item_index integer := 0;
begin
  if v_uid is null or private.current_app_role() IS DISTINCT FROM 'admin' then
    raise exception 'Acesso administrativo obrigatório.';
  end if;

  if p_forma_pagamento is null or p_forma_pagamento not in (
    'Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência bancária','Outro'
  ) then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um item à venda.';
  end if;

  if p_desconto_tipo not in ('valor','percentual') or p_desconto_valor is null or p_desconto_valor < 0 then
    raise exception 'Desconto inválido.';
  end if;

  select * into v_student
  from public.students
  where id = p_student_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Aluno não encontrado nesta conta.';
  end if;

  insert into public.sales(
    owner_id,student_id,data_venda,total,subtotal_bruto,desconto_tipo,
    desconto_valor,desconto,forma_pagamento,status,observacoes
  )
  values(v_uid,p_student_id,current_date,0,0,p_desconto_tipo,p_desconto_valor,0,p_forma_pagamento,'confirmada',null)
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_quantity := nullif(v_item->>'quantidade','')::numeric;

    if v_product_id is null or v_quantity is null or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'Produto ou quantidade inválida.';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and owner_id = v_uid and ativo = true
    for share;

    if not found then
      raise exception 'Produto não encontrado, inativo ou de outra conta.';
    end if;

    if v_product.preco <= 0 then
      raise exception 'O item % não possui preço válido.',v_product.nome;
    end if;

    if v_product.quantidade_aulas_min is not null and v_quantity < v_product.quantidade_aulas_min then
      raise exception 'A quantidade do pacote % está abaixo do mínimo de % aulas.',v_product.nome,v_product.quantidade_aulas_min;
    end if;

    if v_product.quantidade_aulas_max is not null and v_quantity > v_product.quantidade_aulas_max then
      raise exception 'A quantidade do pacote % ultrapassa o máximo de % aulas.',v_product.nome,v_product.quantidade_aulas_max;
    end if;

    v_item_type := case
      when v_product.tipo in ('servico','pacote')
        or v_product.quantidade_aulas is not null
        or v_product.quantidade_aulas_min is not null
        or v_product.quantidade_aulas_max is not null
        or lower(coalesce(v_product.app_product_id,'')) in ('bronze','prata','ouro')
        or lower(v_product.nome) like 'pacote %'
        or lower(v_product.nome) like 'aula avulsa%'
      then 'servico' else 'produto'
    end;

    v_subtotal := round(v_product.preco * v_quantity,2);
    v_item_classes := 0;

    if v_item_type = 'servico' then
      if v_product.quantidade_aulas_min is not null or v_product.quantidade_aulas_max is not null then
        v_item_classes := v_quantity::integer;
      else
        v_item_classes := (v_quantity * greatest(1,coalesce(v_product.quantidade_aulas,1)))::integer;
      end if;
      v_classes := v_classes + v_item_classes;
      v_subtotal_servicos := v_subtotal_servicos + v_subtotal;
    end if;

    insert into public.sale_items(
      owner_id,sale_id,product_id,descricao,quantidade,valor_unitario,subtotal,
      tipo_item,aulas_contratadas,aulas_devolvidas,valor_por_aula,valor_devolvido,valor_liquido
    )
    values(
      v_uid,v_sale_id,v_product.id,v_product.nome,v_quantity,v_product.preco,v_subtotal,
      v_item_type,v_item_classes,0,0,0,v_subtotal
    );

    v_total_bruto := v_total_bruto + v_subtotal;
    v_descricao_itens := concat_ws(', ',nullif(v_descricao_itens,''),v_product.nome||' ('||v_quantity::text||')');
  end loop;

  if v_total_bruto <= 0 then
    raise exception 'O subtotal da venda deve ser maior que zero.';
  end if;

  if p_desconto_valor > 0 and v_subtotal_servicos <= 0 then
    raise exception 'Desconto permitido somente para serviços.';
  end if;

  if p_desconto_tipo = 'percentual' then
    if p_desconto_valor >= 100 then
      raise exception 'O desconto percentual deve ser inferior a 100%%.';
    end if;
    v_discount := round(v_subtotal_servicos * p_desconto_valor / 100,2);
  else
    v_discount := round(p_desconto_valor,2);
  end if;

  if v_discount < 0 or v_discount >= v_subtotal_servicos and v_discount > 0 then
    raise exception 'O desconto deve ser menor que o subtotal dos serviços.';
  end if;

  select count(*) into v_item_count
  from public.sale_items
  where sale_id = v_sale_id and owner_id = v_uid and tipo_item = 'servico';

  for v_sale_item in
    select * from public.sale_items
    where sale_id = v_sale_id and owner_id = v_uid and tipo_item = 'servico'
    order by id
  loop
    v_item_index := v_item_index + 1;

    if v_item_index = v_item_count then
      v_discount_item := v_discount - v_discount_allocated;
    else
      v_discount_item := round(v_sale_item.subtotal * v_discount / v_subtotal_servicos,2);
    end if;

    v_discount_allocated := v_discount_allocated + v_discount_item;

    update public.sale_items
    set valor_liquido = greatest(0,v_sale_item.subtotal-v_discount_item),
        valor_por_aula = case
          when v_sale_item.aulas_contratadas > 0
          then round(greatest(0,v_sale_item.subtotal-v_discount_item)/v_sale_item.aulas_contratadas,2)
          else 0
        end
    where id = v_sale_item.id and owner_id = v_uid;
  end loop;

  v_total := round(v_total_bruto-v_discount,2);

  update public.students
  set aulas_compradas = coalesce(aulas_compradas,0)+v_classes,
      aulas_restantes = coalesce(aulas_restantes,0)+v_classes
  where id = p_student_id and owner_id = v_uid;

  update public.sales
  set subtotal_bruto = v_total_bruto,desconto = v_discount,total = v_total
  where id = v_sale_id and owner_id = v_uid;

  insert into public.financial_transactions(
    owner_id,student_id,sale_id,tipo,descricao,valor,data_movimento,status
  )
  values(
    v_uid,p_student_id,v_sale_id,'entrada',
    'Venda para '||v_student.nome||': '||v_descricao_itens||
      case when v_discount > 0 then ' (desconto somente em serviços: '||v_discount::text||')' else '' end,
    v_total,current_date,'confirmado'
  );

  return jsonb_build_object(
    'sale_id',v_sale_id,
    'subtotal_bruto',v_total_bruto,
    'subtotal_servicos',v_subtotal_servicos,
    'desconto',v_discount,
    'total',v_total,
    'aulas_adicionadas',v_classes
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_delete_sale(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_student public.students%rowtype;
  v_net_lessons integer := 0;
begin
  if v_uid is null or private.current_app_role() IS DISTINCT FROM 'admin' then
    raise exception 'Acesso administrativo obrigatório.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Venda não encontrada nesta conta.';
  end if;

  if v_sale.student_id is not null then
    select * into v_student
    from public.students
    where id = v_sale.student_id and owner_id = v_uid
    for update;

    select coalesce(sum(greatest(0, aulas_contratadas - aulas_devolvidas)),0)::integer
    into v_net_lessons
    from public.sale_items
    where sale_id = p_sale_id and owner_id = v_uid;

    if coalesce(v_student.aulas_restantes,0) < v_net_lessons then
      raise exception 'Não é possível excluir: parte das aulas já foi utilizada.';
    end if;

    update public.students
    set aulas_compradas = greatest(0, coalesce(aulas_compradas,0) - v_net_lessons),
        aulas_restantes = greatest(0, coalesce(aulas_restantes,0) - v_net_lessons)
    where id = v_sale.student_id and owner_id = v_uid;
  end if;

  delete from public.financial_transactions
  where sale_id = p_sale_id and owner_id = v_uid;

  delete from public.sales
  where id = p_sale_id and owner_id = v_uid;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'aulas_removidas', v_net_lessons
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_refund_sale_lessons(p_sale_item_id uuid, p_quantidade integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid(); v_item public.sale_items%rowtype; v_sale public.sales%rowtype;
 v_student public.students%rowtype; v_refund numeric;
begin
 if v_uid is null or private.current_app_role() IS DISTINCT FROM 'admin' then raise exception 'Acesso administrativo obrigatório.'; end if;
 if p_quantidade is null or p_quantidade<1 then raise exception 'Quantidade para devolução inválida.'; end if;
 select s.* into v_sale from public.sales s join public.sale_items si on si.sale_id=s.id
 where si.id=p_sale_item_id and s.owner_id=v_uid limit 1;
 if not found or v_sale.student_id is null then raise exception 'Venda ou aluno não encontrado.'; end if;
 select * into v_student from public.students where id=v_sale.student_id and owner_id=v_uid for update;
 select * into v_item from public.sale_items where id=p_sale_item_id and sale_id=v_sale.id and owner_id=v_uid for update;
 if not found or v_item.tipo_item<>'servico' then raise exception 'Item de serviço não encontrado.'; end if;
 if p_quantidade>v_item.aulas_contratadas-v_item.aulas_devolvidas then raise exception 'Quantidade maior que as aulas disponíveis para devolução.'; end if;
 if coalesce(v_student.aulas_restantes,0)<p_quantidade then raise exception 'Parte dessas aulas já foi utilizada e não pode ser devolvida.'; end if;
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

  if not found then
    raise exception 'Venda não encontrada.';
  end if;

  select si.* into v_item
  from public.sale_items si
  where si.id = p_sale_item_id
    and si.sale_id = v_sale.id
    and si.owner_id = v_uid
  for update;

  if not found or v_item.tipo_item <> 'produto' then
    raise exception 'Item de produto não encontrado.';
  end if;

  v_remaining := v_item.quantidade - v_item.quantidade_devolvida;
  if p_quantidade > v_remaining then
    raise exception 'Quantidade maior que os produtos disponíveis para devolução.';
  end if;

  if v_item.quantidade <= 0 then
    raise exception 'Quantidade original do produto inválida.';
  end if;

  v_unit_net := v_item.valor_liquido / v_item.quantidade;
  v_refund := least(
    round(v_unit_net * p_quantidade, 2),
    v_item.valor_liquido - v_item.valor_devolvido
  );

  if v_refund <= 0 then
    raise exception 'Valor de devolução inválido.';
  end if;

  update public.sale_items
  set quantidade_devolvida = quantidade_devolvida + p_quantidade,
      valor_devolvido = valor_devolvido + v_refund
  where id = p_sale_item_id
    and owner_id = v_uid;

  insert into public.financial_transactions(
    owner_id, student_id, sale_id, tipo, descricao,
    valor, data_movimento, status
  )
  values (
    v_uid, v_sale.student_id, v_sale.id, 'saida',
    'Devolução de ' || p_quantidade || ' unidade(s) - ' || v_item.descricao,
    v_refund, current_date, 'confirmado'
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'produto_devolvido', p_quantidade,
    'valor_devolvido', v_refund
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_instructor_sale(p_sale_id uuid, p_student_id uuid, p_items jsonb, p_payment_method text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_owner_id uuid := auth.uid();
  v_student_name text;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_subtotal numeric;
  v_total numeric := 0;
  v_lessons integer := 0;
  v_item_description text;
  v_description text := '';
  v_inserted_id uuid;
  v_existing_owner uuid;
begin
  if v_owner_id is null or private.current_app_role() IS DISTINCT FROM 'instrutor' then
    raise exception 'Apenas instrutores autenticados podem registrar vendas.'
      using errcode = '42501';
  end if;

  if p_sale_id is null or p_student_id is null
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe aluno e pelo menos um item válido.'
      using errcode = '22023';
  end if;

  select s.nome into v_student_name
  from public.students s
  where s.id = p_student_id and s.owner_id = v_owner_id
  for update;

  if not found then
    raise exception 'Aluno não encontrado ou não pertence a este instrutor.'
      using errcode = '42501';
  end if;

  insert into public.sales (id, owner_id, student_id, total, forma_pagamento, status, observacoes)
  values (p_sale_id, v_owner_id, p_student_id, 0, p_payment_method, 'confirmada', p_notes)
  on conflict (id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select s.owner_id into v_existing_owner
    from public.sales s where s.id = p_sale_id;
    if v_existing_owner = v_owner_id then
      return p_sale_id;
    end if;
    raise exception 'Identificador de venda já utilizado.'
      using errcode = '23505';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := nullif(v_item->>'quantidade', '')::numeric;

    if v_product_id is null or v_quantity is null
       or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'Item de venda ou quantidade inválida.'
        using errcode = '22023';
    end if;

    select p.* into v_product
    from public.products p
    where p.id = v_product_id and p.owner_id = v_owner_id and p.ativo = true;

    if not found then
      raise exception 'Produto ou serviço não encontrado, inativo ou de outro instrutor.'
        using errcode = '42501';
    end if;

    v_subtotal := round(v_product.preco * v_quantity, 2);
    v_total := v_total + v_subtotal;

    insert into public.sale_items (
      owner_id, sale_id, product_id, descricao, quantidade, valor_unitario, subtotal
    ) values (
      v_owner_id, p_sale_id, v_product.id, v_product.nome,
      v_quantity, v_product.preco, v_subtotal
    );

    if v_product.tipo in ('servico', 'pacote') then
      v_lessons := v_lessons +
        (coalesce(v_product.quantidade_aulas,
          case when v_product.tipo = 'servico' then 1 else 0 end) * v_quantity)::integer;
    end if;

    v_item_description := v_product.nome || ' (' || trim(to_char(v_quantity, 'FM999999990')) || ')';
    v_description := concat_ws(', ', nullif(v_description, ''), v_item_description);
  end loop;

  update public.sales
  set total = v_total
  where id = p_sale_id and owner_id = v_owner_id;

  insert into public.financial_transactions (
    owner_id, student_id, sale_id, tipo, descricao, valor, data_movimento, status
  ) values (
    v_owner_id, p_student_id, p_sale_id, 'entrada',
    'Venda para ' || v_student_name || ': ' || v_description,
    v_total, current_date, 'confirmado'
  );

  if v_lessons > 0 then
    update public.students
    set aulas_compradas = coalesce(aulas_compradas, 0) + v_lessons,
        aulas_restantes = coalesce(aulas_restantes, 0) + v_lessons
    where id = p_student_id and owner_id = v_owner_id;

    if not found then
      raise exception 'Não foi possível atualizar o saldo de aulas do aluno.'
        using errcode = 'P0001';
    end if;
  end if;

  return p_sale_id;
end;
$function$;

