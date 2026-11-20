# Pré-checagem SQL somente leitura — RPCs e PostgREST

Executar somente em ambiente de teste autorizado e sem custo. Todas as consultas abaixo são SELECT; não alteram dados nem executam funções de negócio.

## 1. Definições das RPCs de interesse

```sql
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_function_result(p.oid) AS result_type,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
       pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('create_instructor_sale','admin_create_sale',
'admin_refund_sale_product','admin_refund_sale_lessons','admin_delete_sale',
'get_my_scheduled_lessons')
ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
```

## 2. ACL expandida, incluindo PUBLIC

```sql
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type,a.is_grantable,pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
WHERE p.proname IN ('create_instructor_sale','admin_create_sale',
'admin_refund_sale_product','admin_refund_sale_lessons','admin_delete_sale',
'get_my_scheduled_lessons')
ORDER BY n.nspname,p.proname,grantee;
```

## 3. Inventário de funções nos schemas usuais

```sql
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','private','api')
ORDER BY n.nspname,p.proname;
```

## 4. Schemas e permissões

```sql
SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner,
       has_schema_privilege('anon',n.oid,'USAGE') AS anon_usage,
       has_schema_privilege('authenticated',n.oid,'USAGE') AS authenticated_usage,
       has_schema_privilege('anon',n.oid,'CREATE') AS anon_create,
       has_schema_privilege('authenticated',n.oid,'CREATE') AS authenticated_create
FROM pg_namespace n
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
ORDER BY n.nspname;
```

## 5. Configuração PostgREST visível na sessão (pode retornar NULL)

```sql
SELECT current_setting('pgrst.db_schemas',true) AS pgrst_db_schemas,
       current_setting('pgrst.db_extra_search_path',true) AS pgrst_extra_search_path;
```

NULL não prova quais schemas estão expostos; confirmar na configuração da API, sem alterar.

## 6. Triggers ligados a funções

```sql
SELECT p.proname,t.tgname,tn.nspname AS table_schema,c.relname AS table_name,
       pg_get_triggerdef(t.oid,true) AS trigger_definition
FROM pg_proc p JOIN pg_trigger t ON t.tgfoid=p.oid
JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace tn ON tn.oid=c.relnamespace
WHERE NOT t.tgisinternal ORDER BY tn.nspname,c.relname,t.tgname;
```

## 7. Memberships privilegiadas

```sql
SELECT member.rolname AS member_role,granted.rolname AS granted_role,m.admin_option
FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member
JOIN pg_roles granted ON granted.oid=m.roleid
WHERE granted.rolname IN ('postgres','service_role','supabase_admin')
ORDER BY member.rolname,granted.rolname;
```

## Regras de segurança

- Se houver sobrecargas, revisar todas as assinaturas.
- Não executar RPCs financeiras como teste: podem gravar ou excluir dados.
- Não compartilhar tokens, chaves, emails, CPF ou dados de alunos.
- A ausência de uma RPC no catálogo consultado deve ser registrada; não criar substituta por suposição.
- Não executar DDL/DML, migrations ou mudanças de grants com base neste roteiro.
