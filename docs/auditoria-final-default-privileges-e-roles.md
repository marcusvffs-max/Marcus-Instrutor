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


## Revisão complementar: proteção de profiles.role e grants diretos

A revisão estática do rascunho SQL confirma os seguintes controles propostos:

- A função `private.protect_profile_role()` é `SECURITY DEFINER`, usa `search_path = ''` e tem owner explícito `postgres`.
- A função só aceita mudança de papel quando o JWT validado da requisição contém `role = service_role`. Não usa `user_metadata` nem dados editáveis do perfil como autorização.
- Para INSERT que não venha do backend confiável, força `NEW.role = 'instrutor'`.
- Para UPDATE, rejeita qualquer mudança de `role` com SQLSTATE `42501`.
- O trigger é `BEFORE INSERT OR UPDATE OF role` em `public.profiles`.
- EXECUTE da função de trigger é revogado de `PUBLIC`, `anon` e `authenticated`; o PostgreSQL chama a função pelo trigger sem exigir que esses papéis tenham EXECUTE direto.
- O desenho remove as políticas antigas de INSERT/UPDATE próprios e concede ao cliente apenas SELECT em `profiles`. O backend administrativo usa service_role depois de validar o usuário solicitante como admin na Edge Function.
- O rascunho revoga privilégios de tabela para `PUBLIC`, `anon` e `authenticated` nas tabelas abrangidas, remove também grants por coluna encontrados no catálogo e re-concede apenas SELECT/INSERT/UPDATE/DELETE onde o RLS define o acesso por linha. Isso elimina TRUNCATE, REFERENCES e TRIGGER desses papéis sem revogar os grants de service_role.
- Os default privileges globais de `postgres` e `supabase_admin` permanecem intocados. A auditoria anterior encontrou defaults amplos; alterar esses defaults globalmente poderia afetar objetos e fluxos gerenciados pelo Supabase. A proteção de objetos futuros deve ser tratada por owner/objeto em plano separado.

### Limitações e bloqueios antes da aplicação

- O rascunho não é migration e não foi executado. A proteção de role ainda não está ativa no banco.
- A permissão `service_role` é deliberadamente confiável; a Edge Function precisa continuar validando o JWT com `getUser` e exigir perfil `admin` antes de qualquer operação de gerenciamento de papéis.
- O rascunho concede CRUD às tabelas de dados para `authenticated`; isso só é seguro junto com todas as policies RLS revisadas. A aplicação deve ser testada com admin, instrutor A, instrutor B e aluno, inclusive tentativas negativas.
- A remoção de grants por coluna e os grants finais devem ser conferidos por privilégios efetivos após execução em ambiente isolado.
- Não alterar default privileges globais nem memberships internos do Supabase como parte desta etapa.
- Nenhuma mudança foi aplicada ao Supabase atual.


## Verificação do backend administrativo

A Edge Function atual `admin-manage-instructors` foi revisada estaticamente junto ao rascunho SQL:

- Autentica o solicitante com `auth.getUser(token)` antes de usar o cliente privilegiado.
- Lê o papel do solicitante em `profiles` com o cliente de serviço.
- Rejeita papéis fora de `admin`, `instrutor` e `usuario`.
- Instrutor só pode executar `invite_student`; usuário só pode executar `complete_student_link`.
- Portanto, ações gerais de gerenciamento, incluindo `change_role`, `delete`, `list` e `activate_access`, ficam restritas ao admin.
- `change_role` impede alterar o próprio papel, valida os papéis permitidos, protege o único administrador e limpa `instructor_access_until` ao trocar o papel.

Essa proteção é do endpoint e deve permanecer alinhada ao trigger SQL: a chave `service_role` não pode ser exposta ao navegador e nenhuma chamada administrativa pode confiar apenas no corpo enviado pelo cliente.


## Verificação estática desta revisão

Em 20/11/2026, os 24 testes do arquivo `scripts/test-student-link-flow.mjs` foram executados em um harness JavaScript isolado com os arquivos atuais obtidos da branch. Resultado: 24/24 passaram.

O harness JavaScript isolado não equivale a executar `node --test`; não foi executado PostgreSQL, não foi compilada a Edge Function Deno e nenhum teste autenticado foi feito contra o Supabase. Os quatro novos casos verificam estaticamente as FKs compostas, ações SET NULL/CASCADE, remoção das FKs simples e exceção do catálogo de produtos. A validação confirma a consistência textual do desenho, não a efetividade das constraints no banco.


## Próxima etapa: matriz de testes de autorização

Foi criada a matriz `docs/TESTE-RLS-ISOLAMENTO-INSTRUTORES.md`, com cenários SEC-001 a SEC-057. Ela cobre anon, aluno, dois instrutores independentes e admin; leitura, escrita, alteração de papel, joins, integridade referencial, funções privilegiadas, schema privado, privilégios SQL e caminhos alternativos de exposição.

A matriz é um roteiro de teste em ambiente isolado, não uma declaração de que os testes já passaram. Não usar o banco atual, dados reais ou qualquer ambiente que gere cobrança.


A cobertura adicional inclui a existência da matriz SEC-001 a SEC-057 em `docs/TESTE-RLS-ISOLAMENTO-INSTRUTORES.md`. Os casos ainda estão pendentes de execução em banco descartável; os 20 testes estáticos verificam somente a presença e consistência documental da matriz.

## Auditoria adicional de sequences, views e funções — 20/11/2026

Foi criado o roteiro `docs/PRECHECK-READONLY-SEQUENCES-VIEWS-FUNCTIONS.md`, com consultas somente de leitura para:
- privilégios efetivos de sequences;
- views e materialized views, owner, ACL e `security_invoker`;
- funções/RPCs, owner, SECURITY DEFINER, `search_path`, ACL explícita e EXECUTE efetivo;
- funções de trigger e chamadas indiretas;
- schemas, schemas expostos pelo PostgREST e default privileges.

### Evidências estáticas disponíveis no repositório

A leitura das migrations atuais da branch encontrou estas funções SECURITY DEFINER relacionadas aos fluxos já revisados:
- `private.current_app_role()`: owner `postgres`; EXECUTE concedido a `authenticated` para uso nas policies.
- `private.get_my_scheduled_lessons_internal()`: owner `postgres`; execução direta revogada de PUBLIC/anon/authenticated.
- `public.get_my_scheduled_lessons()`: owner `postgres`; EXECUTE concedido a `authenticated`.
- `private.clear_student_account_link_on_user_delete()`: owner `postgres`; execução direta revogada de PUBLIC/anon/authenticated.
- `private.link_student_account_from_invite()`: owner `postgres`; execução direta revogada de PUBLIC/anon/authenticated.

As funções privadas de trigger são chamadas pelo mecanismo de triggers; a ausência de EXECUTE direto para clientes não impede a execução pelo trigger. A RPC pública de aulas agendadas é intencionalmente acessível a authenticated e precisa continuar filtrando por `auth.uid()`, sem fallback por e-mail.

O rascunho de segurança propõe outras duas funções de trigger em `private`: `handle_new_auth_user_profile()` e `protect_profile_role()`. Elas ainda não existem no banco, pois o rascunho não foi aplicado.

### Limitação importante

A documentação estática não contém inventário completo e atual do catálogo de sequences, views, materialized views e funções do banco. Portanto, não afirmo que não existam views ou sequences expostas, nem que todas as ACLs efetivas estejam seguras. O roteiro deve ser executado em ambiente de teste autorizado para obter essa evidência. A lista de schemas expostos pela Data API também precisa ser confirmada separadamente se `current_setting('pgrst.db_schemas', true)` não estiver disponível.

### Testes

O harness JavaScript isolado foi executado novamente com os arquivos atuais da branch: **27/27 testes aprovados**. Os dois testes novos verificam que as consultas de catálogo são somente leitura e que o roteiro cobre SECURITY DEFINER, ACL efetiva, views, triggers e default privileges.

Esse resultado não equivale a executar SQL no PostgreSQL, `node --test` ou testes reais de autorização. Nenhuma consulta deste roteiro foi executada e nenhum privilégio, view, função, sequence, schema, policy ou default privilege foi alterado.

**Decisão:** não aplicar REVOKE global, não alterar default privileges e não alterar views/funções até obter o inventário do catálogo e mapear as dependências no ambiente isolado.



## Auditoria estática PostgREST/RPCs — 20/11/2026

Foi examinado o frontend atual e o inventário de migrations versionadas da branch. Foram identificadas chamadas para `create_instructor_sale`, `admin_create_sale`, `admin_refund_sale_product`, `admin_refund_sale_lessons` e `admin_delete_sale`, além da RPC de agenda `get_my_scheduled_lessons()`.

As cinco RPCs de venda/estorno/exclusão não têm suas definições SQL nas migrations versionadas da branch. Assim, não é possível confirmar estaticamente owner, SECURITY DEFINER/INVOKER, search_path, ACL EXECUTE ou verificações internas de role/owner. Isso é uma **pendência crítica de evidência, não uma vulnerabilidade confirmada**. Chamadas feitas pelo frontend não provam autorização no servidor.

Também não há `supabase/config.toml` na branch; schemas expostos pela Data API precisam ser confirmados na configuração real do projeto. Foram adicionados os casos SEC-058 a SEC-063 para testes diretos das RPCs, inclusive tentativas de acesso cruzado entre instrutores.

O harness foi ampliado com uma verificação estática do inventário de RPCs. Resultado atualizado: **28 testes estáticos aprovados** (harness isolado; não é execução PostgreSQL, Deno ou teste real contra Supabase). Os novos casos SEC-058 a SEC-063 permanecem pendentes de execução em ambiente isolado.

Nenhuma RPC foi chamada, nenhum SQL foi executado, nenhuma migration/grant/configuração foi alterada e nenhuma publicação foi feita.


## Coleta de catálogo para RPCs — 20/11/2026

Criado `docs/PRECHECK-READONLY-RPCS-POSTGREST.md`, com sete consultas somente SELECT para definições SQL, ACL efetiva, schemas, triggers e memberships. O roteiro não chama funções de negócio nem altera o banco. A ausência das definições das cinco RPCs financeiras permanece pendência crítica de evidência, não vulnerabilidade confirmada. Nenhuma conexão ao Supabase ou alteração de banco ocorreu nesta etapa. Harness atualizado para 29 testes estáticos.


## Evidência de catálogo real — RPCs e fluxo de agenda (20/11/2026)

Consulta read-only no projeto Supabase confirmou que as cinco RPCs financeiras são SECURITY INVOKER, owner postgres, search_path vazio, executáveis por authenticated/service_role e não por anon. Os corpos verificam papel administrativo ou de instrutor e owner_id dos registros manipulados. Não foram feitos testes de transação com contas reais.

Achado prioritário: `private.get_my_scheduled_lessons_internal()` é SECURITY DEFINER, tem EXECUTE para authenticated e o schema private concede USAGE a authenticated. A função verifica role usuario, mas ainda encontra aulas por comparação de e-mail, não por students.user_id. O histórico real do banco contém `20261120154116_student_email_and_user_scheduled_lessons_by_email`; não contém a migration `20261121120000_student_account_link.sql` versionada na branch. Logo, o fluxo novo de vínculo por user_id ainda não está ativo no banco consultado. A exposição REST direta do schema private não foi confirmada: os GUCs pgrst consultados retornaram NULL.

Advisors: RLS sem policies em whatsapp_conversations e whatsapp_messages (INFO; possivelmente backend-only) e proteção de senhas vazadas desabilitada (WARN). Nenhuma configuração foi alterada.

As consultas foram somente SELECT/listagem. Nenhuma RPC de negócio, migration, grant, deploy ou alteração de configuração foi executada.


## Achado crítico confirmado — isolamento da agenda por e-mail

Consulta read-only adicional ao banco atual encontrou um e-mail normalizado compartilhado por cadastros de 2 instrutores, 1 conta Auth correspondente e 2 aulas agendadas nesses cadastros. A função interna atual é SECURITY DEFINER, filtra somente pelo e-mail do JWT e não limita owner_id nem students.user_id. As policies RLS de students/lessons não dão SELECT ao papel usuario, mas a função privilegiada lê esses dados. A condição para cruzamento de aulas entre instrutores existe; não foi feita exploração autenticada.

A migration `20261121120000_student_account_link.sql` da branch corrige o fluxo: usa students.user_id = auth.uid(), não tem fallback por e-mail e revoga EXECUTE direto da função interna a authenticated. Ela ainda não foi aplicada; o banco atual não possui a coluna user_id. Não foi feita alteração no banco.


Complemento: a RPC pública atual `get_my_scheduled_lessons()` é SECURITY INVOKER e executável por authenticated; ela chama a função interna SECURITY DEFINER. A migration pendente muda o wrapper para SECURITY DEFINER e revoga EXECUTE direto da função interna, preservando o caminho público autenticado com validação interna de auth.uid()/role e vínculo user_id.
