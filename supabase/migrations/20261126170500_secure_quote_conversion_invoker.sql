-- Keep quote conversion under the authenticated caller's RLS policies.
create or replace function public.convert_sales_quote_to_sale(
  p_quote_id uuid, p_sale_id uuid, p_student_id uuid, p_payment_method text
)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_quote public.sales_quotes%rowtype;
  v_student_id uuid;
  v_result jsonb;
  v_item jsonb;
  v_product_price numeric;
  v_fixed_price numeric;
  v_settings public.app_settings%rowtype;
begin
  if v_uid is null then raise exception 'Sessão não autenticada.'; end if;
  v_role := private.current_app_role();
  if v_role is null or v_role not in ('admin','instrutor') then raise exception 'Acesso permitido somente ao administrador ou instrutor.'; end if;
  if p_quote_id is null or p_sale_id is null then raise exception 'Orçamento ou venda inválidos.'; end if;
  if p_payment_method is null or p_payment_method not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência bancária','Transferência','Outro') then raise exception 'Informe uma forma de pagamento válida.'; end if;
  select * into v_quote from public.sales_quotes where id=p_quote_id and owner_id=v_uid for update;
  if not found then raise exception 'Orçamento não encontrado nesta conta.'; end if;
  if v_quote.converted_sale_id is not null then raise exception 'Este orçamento já foi convertido em venda.'; end if;
  select * into v_settings from public.app_settings where owner_id=v_uid for share;
  for v_item in select value from jsonb_array_elements(v_quote.items) loop
    if nullif(v_item->>'fixed_item_key','') is not null then
      v_fixed_price := case v_item->>'fixed_item_key'
        when 'aluguel_veiculo' then v_settings.aluguel_veiculo_preco
        when 'cartao_moto_pista' then v_settings.cartao_moto_pista_preco
        when 'taxa_inscricao_detran' then v_settings.taxa_inscricao_detran_preco
        when 'taxa_legislacao_detran' then v_settings.taxa_legislacao_detran_preco
        when 'taxa_direcao_detran' then v_settings.taxa_direcao_detran_preco else null end;
      if v_fixed_price is null or v_fixed_price <> (v_item->>'preco_unitario')::numeric then raise exception 'O preço de um item fixo mudou desde o orçamento. Revise o orçamento antes de converter.'; end if;
    else
      select preco into v_product_price from public.products where id=nullif(v_item->>'product_id','')::uuid and owner_id=v_uid and ativo=true;
      if not found or v_product_price <> (v_item->>'preco_unitario')::numeric then raise exception 'O preço ou a disponibilidade de um item mudou desde o orçamento. Revise o orçamento antes de converter.'; end if;
    end if;
  end loop;
  if p_student_id is not null then
    select id into v_student_id from public.students where id=p_student_id and owner_id=v_uid;
    if not found then raise exception 'Aluno selecionado não pertence a esta conta.'; end if;
  else
    insert into public.students(owner_id,nome,status) values(v_uid,v_quote.client_name,'em_aberto') returning id into v_student_id;
  end if;
  v_result := public.create_sale_with_fixed_items(p_sale_id,v_student_id,v_quote.items,p_payment_method,'Conversão do orçamento ' || left(v_quote.id::text,8),v_quote.discount_type,v_quote.discount_value);
  update public.sales_quotes set converted_sale_id=p_sale_id,updated_at=now() where id=v_quote.id and owner_id=v_uid;
  return v_result || jsonb_build_object('student_id',v_student_id,'quote_id',v_quote.id);
end;
$function$;
revoke all on function public.convert_sales_quote_to_sale(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.convert_sales_quote_to_sale(uuid,uuid,uuid,text) to authenticated;
