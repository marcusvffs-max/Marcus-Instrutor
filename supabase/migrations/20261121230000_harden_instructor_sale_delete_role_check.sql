-- Require an explicit administrator or instructor role before deleting a sale.
create or replace function public.delete_my_sale(p_sale_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_sale public.sales%rowtype;
  v_student public.students%rowtype;
  v_net_lessons integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessão não autenticada.';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is distinct from 'admin' and v_role is distinct from 'instrutor' then
    raise exception 'Acesso permitido somente ao administrador ou instrutor.';
  end if;

  select * into v_sale from public.sales
  where id = p_sale_id and owner_id = v_uid for update;
  if not found then raise exception 'Venda não encontrada nesta conta.'; end if;

  if v_sale.student_id is not null then
    select * into v_student from public.students
    where id = v_sale.student_id and owner_id = v_uid for update;

    select coalesce(sum(greatest(0, coalesce(si.aulas_contratadas, 0) - coalesce(si.aulas_devolvidas, 0))), 0)::integer
    into v_net_lessons from public.sale_items si
    where si.sale_id = p_sale_id and si.owner_id = v_uid;

    if coalesce(v_student.aulas_restantes, 0) < v_net_lessons then
      raise exception 'Não é possível excluir: parte das aulas desta venda já foi utilizada.';
    end if;

    update public.students
    set aulas_compradas = greatest(0, coalesce(aulas_compradas, 0) - v_net_lessons),
        aulas_restantes = greatest(0, coalesce(aulas_restantes, 0) - v_net_lessons)
    where id = v_sale.student_id and owner_id = v_uid;
  end if;

  delete from public.financial_transactions where sale_id = p_sale_id and owner_id = v_uid;
  delete from public.sales where id = p_sale_id and owner_id = v_uid;
  return jsonb_build_object('sale_id', p_sale_id, 'aulas_removidas', v_net_lessons);
end;
$function$;

revoke all on function public.delete_my_sale(uuid) from public, anon;
grant execute on function public.delete_my_sale(uuid) to authenticated;
