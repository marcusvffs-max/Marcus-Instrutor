-- Logomarcas individuais por conta, com leitura pública apenas dos arquivos de marca.
-- Escrita e remoção ficam restritas ao diretório cujo primeiro segmento é o auth.uid().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'instructor-logos',
  'instructor-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Instructor logos are publicly readable" on storage.objects;
create policy "Instructor logos are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'instructor-logos');

drop policy if exists "Owners can upload their own instructor logo" on storage.objects;
create policy "Owners can upload their own instructor logo"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'instructor-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Owners can update their own instructor logo" on storage.objects;
create policy "Owners can update their own instructor logo"
on storage.objects for update
to authenticated
using (
  bucket_id = 'instructor-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'instructor-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Owners can delete their own instructor logo" on storage.objects;
create policy "Owners can delete their own instructor logo"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'instructor-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.get_my_instructor_branding()
returns table (instructor_name text, logo_url text)
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
  select coalesce(p.nome, ''), a.logo_url
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
