-- Permite que a própria conta de aluno consulte somente o telefone público de contato do instrutor vinculado.
create or replace function public.get_my_instructor_whatsapp()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_phone text;
begin
  if v_uid is null then
    raise exception 'Sessão não autenticada.';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role is distinct from 'usuario' then
    raise exception 'Acesso permitido somente a contas de alunos.';
  end if;

  select nullif(btrim(a.contratante_celular), '')
    into v_phone
  from public.students s
  join public.app_settings a on a.owner_id = s.owner_id
  where s.user_id = v_uid
  order by s.created_at desc
  limit 1;

  return coalesce(v_phone, '');
end;
$function$;

revoke all on function public.get_my_instructor_whatsapp() from public, anon;
grant execute on function public.get_my_instructor_whatsapp() to authenticated;
