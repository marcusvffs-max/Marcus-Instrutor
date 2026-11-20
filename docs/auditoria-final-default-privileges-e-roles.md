# Auditoria final de privilégios herdados e privilégios padrão

Data: 20/11/2026  
Status: leitura de catálogo; nenhuma permissão foi alterada.

## 1. Memberships de roles

A consulta a `pg_auth_members` encontrou:
- `authenticator` é membro de `anon`, `authenticated` e `service_role`, com `inherit_option=false` e `set_option=true`. Isso corresponde ao modelo de troca de role do PostgREST; não significa que o navegador receba automaticamente privilégios de service_role.
- `postgres` aparece como membro de roles administrativas e de API com opções administrativas; é um papel de manutenção do banco, não o papel usado pelo navegador.
- `supabase_read_only_user` e `supabase_etl_admin` têm memberships de leitura/monitoramento; não foram encontrados como membros de `authenticated`.
- Nenhuma membership direta de usuário final foi identificada.

A interpretação de membership deve considerar `INHERIT`, `SET` e o papel efetivo de sessão. Não remover memberships gerenciadas pelo Supabase.

## 2. Privilégios padrão confirmados

A consulta `pg_default_acl` confirmou privilégios padrão amplos para objetos futuros no schema `public`:

| Criador dos objetos | Tipo | anon | authenticated | service_role |
|---|---|---|---|---|
| postgres | tabelas | não listado | SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | mesmos privilégios |
| postgres | funções | não listado | EXECUTE | EXECUTE |
| postgres | sequences | não listado | USAGE/SELECT/UPDATE | mesmos privilégios |
| supabase_admin | tabelas | SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | mesmos | mesmos |
| supabase_admin | funções | EXECUTE | EXECUTE | EXECUTE |
| supabase_admin | sequences | USAGE/SELECT/UPDATE | mesmos | mesmos |

A tabela real retornada pela consulta deve ser consultada no relatório bruto antes de qualquer migration. Em especial, os defaults de `supabase_admin` concedem permissões a `anon` em objetos futuros, e os defaults de `postgres` concedem permissões amplas a `authenticated`.

## 3. Schemas

- `public`: USAGE para anon/authenticated/service_role; CREATE não concedido a anon nem authenticated.
- `auth`: USAGE para anon/authenticated/service_role; CREATE não concedido a esses papéis.
- `private`: ainda não existe no banco atual (o schema foi apenas proposto no SQL não executado).
- Acesso USAGE ao schema não concede por si só acesso a tabelas; grants do objeto e RLS continuam sendo camadas separadas.

## 4. ACLs de funções existentes

A consulta de `pg_proc.proacl` não retornou funções em `public/private` com ACL explícita no filtro utilizado; isso não prova que não existam funções nem que EXECUTE esteja bloqueado. ACL NULL usa defaults do proprietário, então funções criadas por `postgres` ou `supabase_admin` podem herdar EXECUTE para anon/authenticated conforme os defaults acima.

Antes de expor qualquer RPC:
- identificar funções acessíveis por anon/authenticated;
- conferir `SECURITY DEFINER`, proprietário e `search_path`;
- revogar EXECUTE de PUBLIC/anon/authenticated quando não for necessário;
- conceder EXECUTE somente aos papéis necessários;
- revisar chamadas indiretas e dependências antes de alterar.

## 5. Recomendação — não aplicar REVOKE global

Não executar `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` ou `FOR ROLE postgres ...` de forma global neste momento. Isso pode afetar componentes e futuras migrations do Supabase, inclusive funções e tabelas não relacionadas ao app.

A estratégia segura é:
1. identificar quem cria cada objeto da aplicação (migration role e owner efetivo);
2. criar/revisar defaults específicos do owner dedicado da aplicação, se houver e se isso for compatível com o Supabase;
3. para cada tabela nova da aplicação, declarar explicitamente grants e RLS na mesma migration;
4. para cada função nova, revogar EXECUTE padrão de PUBLIC/anon/authenticated e conceder explicitamente;
5. manter o schema `private` fora dos schemas expostos pela Data API;
6. verificar exposição da Data API separadamente dos grants/RLS;
7. não alterar objetos gerenciados pelo Supabase nem memberships internos.

Não foi identificado owner dedicado isolado para objetos do app; o uso de `postgres` é comum no projeto. Não inventar um owner ou role novo sem planejar impacto e autorização.

## 6. Estado

Nenhum GRANT, REVOKE, ALTER DEFAULT PRIVILEGES, membership, função, schema ou objeto foi alterado. A auditoria foi somente leitura.
