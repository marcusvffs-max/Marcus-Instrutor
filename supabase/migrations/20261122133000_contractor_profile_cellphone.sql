-- Cadastro centralizado do responsável pelo contrato e celular para contato no WhatsApp.
alter table public.app_settings
  add column if not exists contratante_celular text;

drop function if exists public.get_my_instructor_branding();

create function public.get_my_instructor_branding()
returns table (
  instructor_name text,
  logo_url text,
  instructor_cellphone text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
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

  return query
  select
    coalesce(nullif(a.nome_empresa, ''), p.nome, ''),
    a.logo_url,
    a.contratante_celular
  from public.students s
  join public.profiles p on p.id = s.owner_id
  left join public.app_settings a on a.owner_id = s.owner_id
  where s.user_id = v_uid
  order by s.created_at desc
  limit 1;
end;
$function$;

revoke all on function public.get_my_instructor_branding() from public;
grant execute on function public.get_my_instructor_branding() to authenticated;
