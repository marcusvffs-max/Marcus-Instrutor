# Revisão crítica e desenho correto do trigger de criação de perfil

Data: 20/11/2026  
Status: proposta SQL para revisão; não executar ainda.

## 1. Descoberta crítica no SQL anterior

O rascunho `rascunho-seguranca-relatorios-instrutor-revisado.sql` cria `private.protect_profile_role()` com esta regra: se `auth.uid()` for NULL e a claim JWT não for `service_role`, rejeita o INSERT.

Isso conflita com o trigger de criação automática em `auth.users`: o trigger roda durante a operação interna do Supabase Auth, e não deve depender de um JWT de usuário final estar presente no contexto da transação. Como resultado, a criação de perfil pelo trigger poderia falhar e bloquear a criação do usuário. A documentação Supabase alerta expressamente que falhas em triggers de `auth.users` podem bloquear signups e recomenda função `SECURITY DEFINER` com `search_path = ''`.

**Correção obrigatória:** não exigir `auth.uid()` para o INSERT de perfil gerado pelo trigger. O papel padrão de qualquer novo perfil deve ser fixado como `instrutor`, e o cliente não deve ter grants nem policy de INSERT/UPDATE em `profiles`.

## 2. Desenho recomendado

- Trigger AFTER INSERT em `auth.users`.
- Função `SECURITY DEFINER`, `search_path = ''`, propriedade do role `postgres` (confirmado com BYPASSRLS no projeto).
- Insere em `public.profiles(id, nome, role)`.
- `role` é sempre literal `instrutor`; não lê role de `raw_user_meta_data`, app_metadata ou payload HTTP.
- `nome` pode vir de `raw_user_meta_data->>'nome'` apenas como dado de exibição; usar fallback porque `profiles.nome` é NOT NULL.
- Não conceder EXECUTE da função a PUBLIC, anon ou authenticated.
- Como a função executa como owner com BYPASSRLS, a gravação pode ocorrer apesar das policies de cliente, mas deve ser confirmada no teste controlado.

Todos os novos usuários Auth passam a receber perfil instrutor por padrão. O perfil admin de Marcus já existente não é alterado. Se no futuro for necessário criar outro admin, isso deverá ser feito por fluxo backend separado e explicitamente autorizado, usando service_role; nunca via metadata fornecida pelo usuário.

## 3. Proposta de função e trigger

Código ilustrativo para revisão. Não executado:

```sql
create or replace function private.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Instrutor'
  );

  insert into public.profiles (id, nome, role)
  values (new.id, profile_name, 'instrutor');

  return new;
end;
$function$;

alter function private.handle_new_auth_user_profile() owner to postgres;

revoke all on function private.handle_new_auth_user_profile()
from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function private.handle_new_auth_user_profile();
```

Não adicionar `ON CONFLICT DO NOTHING` sem justificativa: duplicidade inesperada de profile deve ser investigada, não silenciosamente mascarada. A função deve ser criada na mesma migration que o trigger e a proteção de role, em ordem cuidadosamente definida.

## 4. Correção correspondente em protect_profile_role

O trigger de proteção em `profiles` deve:
- INSERT: se a claim JWT for `service_role`, permitir o valor enviado pelo backend; caso contrário, forçar `NEW.role := 'instrutor'` e NÃO rejeitar apenas porque `auth.uid()` é NULL. Isso permite o INSERT interno de `auth.users`.
- UPDATE: se `NEW.role` mudar e a claim JWT não for `service_role`, rejeitar.
- O usuário autenticado não deve possuir grants de INSERT/UPDATE em `profiles`, nem policy que permita essas operações. A regra do trigger é defesa adicional, não substitui grants/RLS.
- Não confiar em `user_metadata` ou `app_metadata` alterável pelo cliente como autorização.
- Service_role permanece somente no backend.

Código ilustrativo:

```sql
create or replace function private.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.jwt() ->> 'role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'instrutor';
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'O papel do perfil so pode ser alterado pelo backend administrativo.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

alter function private.protect_profile_role() owner to postgres;

revoke all on function private.protect_profile_role()
from public, anon, authenticated;

drop trigger if exists profiles_protect_role on public.profiles;

create trigger profiles_protect_role
before insert or update of role on public.profiles
for each row
execute function private.protect_profile_role();
```

Importante: o caminho service_role precisa ser testado com a forma exata como a Edge Function cria o cliente admin e transmite o JWT. Não usar cliente administrativo com Authorization herdado do usuário.

## 5. Consequência para Edge Function de convite

Com o trigger transacional:
1. Edge Function valida JWT do admin e consulta `profiles.role`.
2. Executa `auth.admin.inviteUserByEmail(email, { data: { nome } })`.
3. Auth cria `auth.users`; trigger cria `profiles` como instrutor na mesma transação.
4. Se o INSERT do profile falhar, a criação do usuário Auth falha e o convite não deve ser considerado concluído.
5. Após retorno, Edge Function confirma que o profile existe e que `role = 'instrutor'`; não faz INSERT manual de profile.
6. Respostas externas devem ser genéricas e logs internos devem registrar ID/erro sem registrar tokens ou segredos.

A documentação oficial informa que trigger de `auth.users` roda na mesma transação e que uma falha pode bloquear o signup. Isso é desejado para impedir contas sem perfil, desde que a função seja simples e testada.

## 6. Pontos de teste antes de produção

1. Convite por admin cria usuário Auth e perfil instrutor.
2. Perfil recebe nome enviado ou fallback sem NULL.
3. Falha controlada no trigger impede usuário Auth incompleto.
4. Usuário comum não consegue INSERT/UPDATE/DELETE em profiles.
5. Tentativa de enviar role=admin em metadata resulta em role instrutor.
6. Admin atual Marcus permanece admin.
7. Criação de usuário por fluxo de signup, Dashboard e outras Edge Functions também cria perfil instrutor; confirmar se esse comportamento global é desejado.
8. Backend service_role consegue executar uma alteração administrativa de role quando explicitamente autorizada.
9. Nenhuma chave secreta é exposta no navegador.

Não executar testes criando contas reais sem autorização. Como não há branch de banco de teste autorizada e o usuário recusou recurso pago para isso, a validação de integração real permanece bloqueadora para produção.

## 7. Fontes oficiais consultadas

- Supabase User Management: recomenda trigger em `auth.users`, `SECURITY DEFINER`, `search_path = ''` e alerta que falha no trigger pode bloquear signup: https://supabase.com/docs/guides/auth/managing-user-data
- Supabase Users: convite é ação administrativa server-side; `user_metadata` é dado associado ao usuário, não fonte de autorização: https://supabase.com/docs/guides/auth/users
- Supabase Security Definer: usar `search_path` vazio e qualificar objetos: https://supabase.com/docs/guides/database/functions

## 8. Estado

- Nenhuma função ou trigger foi criada no banco.
- Nenhum usuário ou convite foi criado.
- Nenhum e-mail foi enviado.
- A função de proteção do SQL anterior foi identificada como incompatível com o trigger proposto e precisa ser substituída antes de qualquer execução.


## Verificação adicional de permissões do trigger (20/11/2026)

O catálogo confirmou:
- `auth.users` é propriedade de `supabase_auth_admin`;
- `postgres` não é proprietário de `auth.users` e não é membro de `supabase_auth_admin`;
- apesar disso, `has_table_privilege('postgres','auth.users','TRIGGER')` retornou TRUE, assim como SELECT e INSERT;
- `postgres` é proprietário de `public.profiles` e tem BYPASSRLS.

Portanto, a proposta não deve depender de transferir a propriedade de `auth.users` nem de conceder membership administrativa. O privilégio TRIGGER já existente para postgres permite avaliar a criação do trigger sem alterar o owner do Auth. A execução real ainda precisa ser testada em ambiente isolado; não foi criada trigger.
