-- Keep the exposed RPC as SECURITY INVOKER and move the restricted lookup
-- into the non-exposed private schema.
create or replace function private.get_my_instructor_name_internal()
returns text language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
begin
  if v_uid is null then raise exception 'Sessão não autenticada.'; end if;
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is distinct from 'usuario' then
    raise exception 'Acesso permitido somente a contas de alunos.';
  end if;
  select p.nome into v_name
  from public.students s
  join public.profiles p on p.id = s.owner_id
  where s.user_id = v_uid
  order by s.created_at desc
  limit 1;
  return coalesce(v_name, '');
end;
$function$;

revoke all on function private.get_my_instructor_name_internal() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.get_my_instructor_name_internal() to authenticated;

create or replace function public.get_my_instructor_name()
returns text language sql security invoker set search_path = ''
as $function$
  select private.get_my_instructor_name_internal();
$function$;
revoke all on function public.get_my_instructor_name() from public, anon;
grant execute on function public.get_my_instructor_name() to authenticated;
