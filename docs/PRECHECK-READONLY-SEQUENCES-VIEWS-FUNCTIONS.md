# Auditoria somente leitura — sequences, views e funções expostas

Data: 20/11/2026  
Branch: `feature/relatorios-instrutor-app`  
Status: consultas preparadas; **não executadas nesta etapa**.

## Objetivo

Identificar caminhos de acesso que podem contornar as policies RLS ou conceder privilégios além do necessário:
- sequences e privilégios USAGE/SELECT/UPDATE;
- views comuns, materialized views e opções de execução como invoker;
- funções RPC, ACL efetiva, SECURITY DEFINER, proprietário e search_path;
- funções de trigger e chamadas internas;
- schemas e configuração do PostgREST.

Este roteiro é somente leitura. Não contém alterações de banco. Executar apenas no ambiente de teste autorizado. Não compartilhar dados pessoais ou definições internas que contenham segredos.

## 1. Schemas e schemas expostos pelo PostgREST

```sql
select
  current_setting('pgrst.db_schemas', true) as postgrest_exposed_schemas,
  n.nspname as schema_name,
  n.nspowner::regrole as owner,
  n.nspacl as schema_acl,
  has_schema_privilege('anon', n.oid, 'USAGE') as anon_usage,
  has_schema_privilege('authenticated', n.oid, 'USAGE') as authenticated_usage,
  has_schema_privilege('service_role', n.oid, 'USAGE') as service_role_usage,
  has_schema_privilege('anon', n.oid, 'CREATE') as anon_create,
  has_schema_privilege('authenticated', n.oid, 'CREATE') as authenticated_create
from pg_namespace n
where n.nspname not like 'pg_%'
  and n.nspname <> 'information_schema'
order by n.nspname;
```

A configuração pode não estar disponível por `current_setting`; nesse caso, registrar NULL e confirmar a lista de schemas expostos nas configurações da Data API, sem alterá-las. Schema com USAGE não significa, sozinho, que todas as suas tabelas estejam acessíveis.

## 2. Inventário de sequences e privilégios efetivos

```sql
select
  n.nspname as schema_name,
  c.relname as sequence_name,
  pg_get_userbyid(c.relowner) as owner,
  c.relacl as explicit_acl,
  has_sequence_privilege('anon', c.oid, 'USAGE') as anon_usage,
  has_sequence_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_sequence_privilege('anon', c.oid, 'UPDATE') as anon_update,
  has_sequence_privilege('authenticated', c.oid, 'USAGE') as authenticated_usage,
  has_sequence_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_sequence_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  has_sequence_privilege('service_role', c.oid, 'USAGE') as service_role_usage,
  has_sequence_privilege('service_role', c.oid, 'SELECT') as service_role_select,
  has_sequence_privilege('service_role', c.oid, 'UPDATE') as service_role_update
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where c.relkind='S'
  and n.nspname not in ('pg_catalog','information_schema')
order by n.nspname,c.relname;
```

As colunas booleanas representam privilégios efetivos, incluindo herança e grants aplicáveis. Não revogar privilégios de sequences sem identificar dependências de colunas identity/serial, RPCs e fluxos de inserção. RLS não se aplica diretamente a sequences.

## 3. Views, materialized views e opções de segurança

```sql
select
  n.nspname as schema_name,
  c.relname as relation_name,
  case c.relkind
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'f' then 'foreign_table'
    else c.relkind::text
  end as relation_type,
  pg_get_userbyid(c.relowner) as owner,
  c.reloptions,
  c.relacl as explicit_acl,
  case when c.relkind='v' then pg_get_viewdef(c.oid,true) end as view_definition,
  has_table_privilege('anon',c.oid,'SELECT') as anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
  has_table_privilege('service_role',c.oid,'SELECT') as service_role_select
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('v','m','f')
  and n.nspname not in ('pg_catalog','information_schema')
order by n.nspname,c.relname;
```

Para views comuns, verificar se `reloptions` contém `security_invoker=true`. Sem esse modo, a view pode executar com privilégios do owner e expor linhas que o chamador não conseguiria ler diretamente sob RLS. Para materialized views, não presumir proteção por RLS; tratar como cópia de dados com controle de acesso próprio. Revisar qualquer definição que junte tabelas de instrutores diferentes.

## 4. Funções: owner, SECURITY DEFINER, search_path e ACL explícita

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proconfig as function_settings,
  p.proacl as explicit_acl,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname not in ('pg_catalog','information_schema')
  and p.prokind in ('f','p')
order by n.nspname,p.proname,identity_arguments;
```

Revisar com prioridade:
- toda função em schema exposto com EXECUTE para anon/authenticated;
- toda função SECURITY DEFINER;
- owner e search_path de cada SECURITY DEFINER;
- validação de identidade via `auth.uid()` e papel consultado de fonte confiável;
- SQL dinâmico, referências sem schema, chamadas a funções auxiliares e acesso a tabelas;
- se a função devolve linhas ou campos de outros instrutores.

A definição completa pode conter lógica interna; não publicar esse resultado indiscriminadamente.

## 5. Privilégio EXECUTE efetivo por função e papel

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_userbyid(p.proowner) as owner,
  p.proacl as explicit_acl,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname not in ('pg_catalog','information_schema')
  and p.prokind in ('f','p')
order by n.nspname,p.proname,identity_arguments;
```

A consulta mede acesso efetivo, inclusive ACL herdada/default. Uma ACL NULL não deve ser interpretada como EXECUTE negado. Para funções de trigger, clientes não precisam de EXECUTE direto para que o PostgreSQL execute a função pelo trigger; confirmar os triggers associados separadamente.

## 6. ACL detalhada efetiva de funções (inclui PUBLIC)

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  coalesce(grantee.rolname,'PUBLIC') as grantee,
  privilege.privilege_type,
  privilege.is_grantable,
  pg_get_userbyid(p.proowner) as function_owner,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) privilege
left join pg_roles grantee on grantee.oid=privilege.grantee
where n.nspname not in ('pg_catalog','information_schema')
  and p.prokind in ('f','p')
order by n.nspname,p.proname,identity_arguments,grantee;
```

Esta é uma expansão da ACL armazenada/default; complementar com a consulta anterior de privilégio efetivo para capturar memberships e herança. Avaliar PUBLIC separadamente, pois PUBLIC inclui todos os papéis.

## 7. Triggers e funções executadas indiretamente

```sql
select
  ns.nspname as table_schema,
  tbl.relname as table_name,
  trg.tgname as trigger_name,
  pg_get_userbyid(fn.proowner) as function_owner,
  fn_ns.nspname as function_schema,
  fn.proname as trigger_function,
  fn.prosecdef as security_definer,
  fn.proconfig as function_settings,
  pg_get_triggerdef(trg.oid,true) as trigger_definition
from pg_trigger trg
join pg_class tbl on tbl.oid=trg.tgrelid
join pg_namespace ns on ns.oid=tbl.relnamespace
join pg_proc fn on fn.oid=trg.tgfoid
join pg_namespace fn_ns on fn_ns.oid=fn.pronamespace
where not trg.tgisinternal
order by ns.nspname,tbl.relname,trg.tgname;
```

Triggers podem chamar SECURITY DEFINER sem conceder EXECUTE direto aos usuários. Confirmar se a função valida os dados de entrada, usa search_path seguro e não permite acesso cruzado.

## 8. Privilégios de tabelas e views expostas

```sql
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind,
  pg_get_userbyid(c.relowner) as owner,
  has_table_privilege('anon',c.oid,'SELECT') as anon_select,
  has_table_privilege('anon',c.oid,'INSERT') as anon_insert,
  has_table_privilege('anon',c.oid,'UPDATE') as anon_update,
  has_table_privilege('anon',c.oid,'DELETE') as anon_delete,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
  has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_insert,
  has_table_privilege('authenticated',c.oid,'UPDATE') as authenticated_update,
  has_table_privilege('authenticated',c.oid,'DELETE') as authenticated_delete
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p','v','m','f')
  and n.nspname not in ('pg_catalog','information_schema')
order by n.nspname,c.relname;
```

Esta consulta não substitui a inspeção das policies RLS. Para tabelas com RLS, revisar grants e policies em conjunto; para views/materialized views, avaliar o modo de execução e a origem dos dados.

## 9. Defaults por owner (somente leitura)

```sql
select
  pg_get_userbyid(d.defaclrole) as object_creator,
  n.nspname as schema_name,
  d.defaclobjtype as object_type,
  d.defaclacl as default_acl
from pg_default_acl d
left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' or d.defaclnamespace=0
order by object_creator,schema_name,object_type;
```

Não alterar defaults globais de `postgres` ou `supabase_admin` nesta etapa. Mapear primeiro quais migrations, RPCs e objetos gerenciados dependem desses defaults.

## 10. Critérios de bloqueio

Interromper e documentar qualquer achado:
- função em schema exposto executável por anon sem justificativa;
- SECURITY DEFINER sem owner confiável ou search_path seguro;
- RPC que retorna dados sem filtrar por usuário/owner;
- view comum que usa privilégios do owner e expõe dados sob RLS;
- materialized view com dados multi-instrutor e leitura concedida a clientes;
- sequence com privilégios de escrita/uso além do necessário;
- função de trigger com validação insuficiente ou SQL dinâmico inseguro;
- privilégio padrão que reabre acesso em objetos futuros.

Não revogar permissões nem mudar opções de views nesta etapa. Corrigir apenas depois de mapear dependências e testar em ambiente isolado, sem custo.

## Estado

As consultas deste roteiro não foram executadas. Não houve GRANT/REVOKE, alteração de view, função, sequence, default privilege, schema, policy, trigger ou dado. O documento é um roteiro de auditoria e não uma autorização para aplicar alterações.
