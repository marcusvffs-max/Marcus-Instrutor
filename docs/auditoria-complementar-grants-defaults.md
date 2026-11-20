# Auditoria complementar de grants por coluna e privilégios padrão

Data: 20/11/2026  
Escopo: auditoria somente de leitura para completar a revisão do SQL multi-instrutor.

## 1. Grants por coluna

A consulta a `information_schema.column_privileges` encontrou privilégios concedidos diretamente a `authenticated` em colunas de tabelas como:
- `app_settings`
- `lessons`
- `students`
- `vehicles`

Foram observados privilégios SELECT, INSERT, UPDATE e REFERENCES por coluna. O resultado também apresenta grants equivalentes a service_role, que devem ser preservados para o backend.

**Consequência:** `REVOKE ALL PRIVILEGES ON TABLE ... FROM ...` não deve ser tratado como prova suficiente de remoção de grants por coluna. O SQL revisado precisa revogar explicitamente privilégios por coluna de PUBLIC, anon e authenticated nas tabelas abrangidas, sem retirar os grants de service_role.

O procedimento futuro deve enumerar as colunas pelo catálogo e aplicar revogação por coluna de forma controlada; não executar uma lista parcial de colunas copiada manualmente.

## 2. Privilégios padrão do schema public

A consulta a `pg_default_acl` encontrou defaults para o role `supabase_admin` no schema `public`:
- tabelas: grants padrão amplos para anon, authenticated e service_role;
- sequences: grants padrão para anon, authenticated e service_role;
- funções: EXECUTE padrão para anon, authenticated e service_role.

Também foram encontrados defaults associados ao role `postgres`, com grants a authenticated e service_role para tabelas/sequences e EXECUTE para funções.

**Consequência:** mesmo que as tabelas existentes sejam corrigidas, objetos criados futuramente por esses owners podem voltar a receber privilégios amplos. Isso deve ser analisado como uma tarefa separada de hardening dos default privileges.

Não aplicar revogações globais de default privileges automaticamente: isso pode quebrar endpoints RPC, tabelas e fluxos existentes do aplicativo. Antes, inventariar migrations e dependências dos objetos criados por `supabase_admin` e `postgres`, depois propor uma política por tipo de objeto e owner.

## 3. Memberships de roles

A consulta a `pg_auth_members` mostrou as associações esperadas de `authenticator` com `anon`, `authenticated` e `service_role`, além de memberships administrativos do role postgres e do serviço realtime. Não foi identificada associação inesperada de authenticated com service_role.

## 4. Schema public

A consulta confirmou USAGE para anon, authenticated e service_role e CREATE falso para os três. Não foi encontrado CREATE concedido diretamente a essas roles no schema public.

## 5. Versão PostgreSQL

O servidor consultado reportou PostgreSQL 17.11. Isso permite avaliar recursos atuais de constraints compostas e ações referenciais, mas a migração ainda precisa ser desenhada com cuidado para preservar o comportamento atual de exclusão.

## 6. Correções necessárias no rascunho RLS

Antes de qualquer aprovação:
1. adicionar revogação explícita de privilégios por coluna para PUBLIC, anon e authenticated nas tabelas cobertas;
2. manter service_role sem alterações;
3. avaliar default privileges por owner, separadamente, sem revogar EXECUTE globalmente antes de inventariar RPCs;
4. consultar também grants de schema, funções e sequences no plano consolidado;
5. repetir a auditoria após a migração, conferindo privilégios efetivos, não apenas grants diretos.

## 7. Estado
- Apenas consultas aos catálogos PostgreSQL.
- Nenhum grant, default privilege, policy, função, trigger, dado ou schema foi alterado.
- O SQL revisado permanece não aprovado para execução.
