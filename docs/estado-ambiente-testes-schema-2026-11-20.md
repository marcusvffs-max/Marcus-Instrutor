# Inventário do schema e estado do ambiente isolado

Data da inspeção: 20/11/2026

## Ambientes

- Produção (somente leitura nesta auditoria): `ydyqagqsuqntuibzgwzd`
- Testes isolados: `voyjssflroiwdyaacthh`
- Repositório/branch: `marcusvffs-max/Marcus-Instrutor` / `feature/relatorios-instrutor-app`

Nenhum dado de produção foi copiado. Nenhuma migration foi aplicada ao projeto original.

## Inventário consultado no projeto original

Consulta somente aos catálogos PostgreSQL:

- 13 tabelas no schema `public`, todas com RLS habilitado.
- 38 policies distribuídas em 11 tabelas.
- 62 constraints.
- 31 índices.
- 12 funções nos schemas `public` e `private`.
- 5 triggers não internos em `public` e `auth`.

Tabelas: `ai_requests`, `ai_runtime_settings`, `app_settings`, `financial_transactions`, `lessons`, `products`, `profiles`, `sale_items`, `sales`, `students`, `vehicles`, `whatsapp_conversations`, `whatsapp_messages`.

Este inventário descreve o estado encontrado, não uma aprovação de segurança.

### Policies por tabela

| Tabela | Policies |
|---|---:|
| ai_requests | 2 |
| ai_runtime_settings | 2 |
| app_settings | 4 |
| financial_transactions | 3 |
| lessons | 4 |
| products | 8 |
| profiles | 1 |
| sale_items | 3 |
| sales | 3 |
| students | 4 |
| vehicles | 4 |
| whatsapp_conversations | 0 |
| whatsapp_messages | 0 |
| **Total** | **38** |

### Funções e triggers observados

Funções em `private`: `current_app_role`, `get_my_scheduled_lessons_internal`, `handle_new_auth_user_profile`, `prevent_last_admin_removal`, `protect_profile_role`.

Funções em `public`: `admin_create_sale`, `admin_delete_sale`, `admin_refund_sale_lessons`, `admin_refund_sale_product`, `create_instructor_sale`, `get_my_scheduled_lessons`, `sync_lesson_student_balance`.

Triggers:
- `auth.users`: `on_auth_user_created_profile`.
- `public.lessons`: `lessons_sync_student_balance`.
- `public.profiles`: `prevent_last_admin_deletion_trigger`, `prevent_last_admin_demotion_trigger`, `protect_profile_role_trigger`.

## Estado do projeto de testes

O projeto isolado contém quatro tabelas públicas: `profiles`, `students`, `vehicles` e `lessons`.

- RLS habilitado nas quatro tabelas.
- Zero policies RLS cadastradas.
- 11 constraints e 6 índices.
- As duas migrations funcionais de validade de acesso e vínculo de aluno estão registradas.
- Também existem migrations de fixture mínima, habilitação de RLS e restrição inicial de grants.

### Correção de grants executada somente no projeto de testes

Foi aplicada a migration `harden_minimal_test_table_grants`:

- Revogou todos os privilégios de `anon` nas quatro tabelas.
- Revogou `TRUNCATE`, `REFERENCES` e `TRIGGER` de `authenticated`.
- Preservou os privilégios CRUD de `authenticated`, ainda sujeitos a RLS.
- Não alterou dados, policies, funções ou tabelas.
- Não alterou o projeto original.

Verificação posterior confirmou que `anon` não possui grants nessas quatro tabelas e que `authenticated` mantém somente `SELECT`, `INSERT`, `UPDATE` e `DELETE`.

## Limitações e próximos passos

O ambiente de testes ainda não é equivalente ao schema do aplicativo. Não considerar a matriz SEC-001 a SEC-070 validada até reconstruir e conferir:

1. Todas as tabelas e colunas necessárias, incluindo tabelas financeiras, produtos, configurações e integrações.
2. Constraints, índices e chaves estrangeiras.
3. Policies RLS e privilégios SQL.
4. Funções, triggers e permissões de execução.
5. Dados sintéticos e identidades separadas para admin, instrutores A/B e aluno.

A reconstrução deve excluir dados de produção, segredos, tokens, usuários reais e conteúdo de conversas. As tabelas WhatsApp/IA precisam de revisão específica antes de qualquer reprodução.

**Status:** inventário documentado; equivalência do schema e testes reais de isolamento ainda pendentes.


## Atualização após reconstrução parcial

Em 21/11/2026, exclusivamente no projeto isolado de testes, foram restauradas as tabelas operacionais e financeiras:

- `app_settings`
- `products`
- `sales`
- `sale_items`
- `financial_transactions`

Também foram adicionadas colunas ausentes em `profiles`, `students`, `vehicles` e `lessons`, sem copiar registros do banco original.

Foram restauradas as policies das nove tabelas operacionais. Verificação no catálogo confirmou:

- 9 tabelas públicas;
- 9 tabelas com RLS habilitado;
- 34 policies em 9 tabelas;
- grants diretos efetivos: `authenticated` somente com SELECT/INSERT/UPDATE/DELETE;
- nenhuma linha de grant para `anon` nas tabelas verificadas.

A auditoria de advisors, após essa etapa, deixou de apontar RLS habilitado sem policy nas nove tabelas. Permanecem:
- aviso de função `public.get_my_scheduled_lessons()` SECURITY DEFINER executável por authenticated;
- proteção de senha vazada desabilitada no Auth.

As duas migrations desta etapa foram registradas no histórico do projeto de testes e versionadas na branch de testes:

- `20261121001300_restore_core_application_schema.sql`
- `20261121001307_restore_operational_rls_policies.sql`

## Diferenças ainda abertas

A reconstrução ainda é parcial. Permanecem fora do ambiente de testes as tabelas `ai_requests`, `ai_runtime_settings`, `whatsapp_conversations` e `whatsapp_messages`. As duas tabelas de WhatsApp e as tabelas de IA serão tratadas em etapa separada, sem conteúdo real.

As colunas adicionadas às quatro tabelas preexistentes foram inicialmente criadas sem impor todas as restrições NOT NULL do banco original, para não alterar ou invalidar fixtures já existentes no projeto de testes. Portanto, a equivalência de nulabilidade e constraints dessas quatro tabelas ainda precisa ser finalizada.

Os 34 policies restaurados reproduzem as regras atuais do banco original para as tabelas operacionais/financeiras, não representam a correção final do problema de vínculo da agenda. O teste de isolamento autenticado entre dois instrutores ainda não foi executado.

**Status atualizado:** schema operacional/financeiro reconstruído parcialmente e versionado; AI/WhatsApp, equivalência integral de constraints e testes autenticados SEC-001 a SEC-070 continuam pendentes.


## Atualização: tabelas administrativas de IA

Em 21/11/2026, as tabelas `ai_requests` e `ai_runtime_settings` também foram reconstruídas no projeto isolado, com suas quatro policies administrativas e os grants verificados conforme o banco original:

- `ai_requests`: authenticated tem somente SELECT; atualizações de rotina ficam restritas ao backend com service_role.
- `ai_runtime_settings`: authenticated tem CRUD, mas as policies permitem leitura/alteração somente ao admin e somente no próprio owner_id.
- RLS habilitado em ambas.
- Nenhum dado real foi copiado.

Migration registrada no projeto de testes e versionada:
`20261121001402_restore_ai_admin_tables.sql`.

### Estado atualizado após a etapa de IA

- 11 tabelas públicas reconstruídas.
- 11 tabelas com RLS habilitado.
- 38 policies em 11 tabelas.
- A contagem de policies e tabelas com RLS agora coincide com o inventário do banco original.

Ainda falta reconstruir `whatsapp_conversations` e `whatsapp_messages`. Elas têm RLS habilitado, mas não possuem policies nem grants para anon/authenticated no banco original. A etapa de WhatsApp será feita separadamente, após revisar índices, constraints, funções/Edge Functions que usam essas tabelas e confirmar que nenhum conteúdo de conversa será copiado.

A equivalência integral das colunas, nulabilidade e constraints das quatro tabelas iniciais também permanece pendente. O número de tabelas/policies coincidir não significa que o schema esteja integralmente equivalente nem que os testes de isolamento estejam aprovados.


## Atualização: WhatsApp, triggers, índices e RPCs financeiras

Em 21/11/2026, o projeto de testes passou a conter as 13 tabelas públicas encontradas no banco original.

### WhatsApp em modo backend-only

Foram reconstruídas `whatsapp_conversations` e `whatsapp_messages`, com colunas, constraints e índices conferidos por catálogo.

- RLS habilitado nas duas.
- Nenhuma policy, igual ao banco original.
- Nenhum grant para `PUBLIC`, `anon` ou `authenticated`.
- `service_role` preservado como único papel de aplicação com acesso.
- Nenhum telefone, conteúdo de mensagem, metadado ou conversa real copiado.
- Não foram encontrados triggers nem funções SQL do schema `public/private` que referenciem diretamente essas duas tabelas.

Migration: `20261121001451_restore_backend_only_whatsapp_tables.sql`.

### Triggers e constraints

Foram adicionados os índices ausentes em `lessons` e `vehicles`, a constraint de papel em `profiles`, e os triggers/funções de criação de perfil, proteção de papel, último administrador e atualização de saldo de aulas.

Migration: `20261121001551_restore_core_triggers_and_constraints.sql`.

O projeto de testes possui ainda dois triggers/funções adicionais de vínculo de aluno, oriundos da migration nova de vínculo por `user_id`; esses objetos não existem no banco original atual e são intencionais para testar a correção planejada.

### RPCs financeiras

As cinco RPCs financeiras foram copiadas para o ambiente de testes:
- `create_instructor_sale`
- `admin_create_sale`
- `admin_refund_sale_product`
- `admin_refund_sale_lessons`
- `admin_delete_sale`

As cinco foram comparadas com as definições do banco original por hash do texto normalizado e os hashes coincidiram. Também foram verificados owner `postgres`, `SECURITY INVOKER`, `search_path='' ` e EXECUTE apenas para `authenticated` e `service_role`.

Migrations versionadas:
- `20261121001658_restore_financial_rpc_functions.sql`
- `20261121001803_reconcile_financial_rpc_definitions.sql` (reconciliação para igualar exatamente as definições de produção).

### Comparação estrutural atual

O catálogo dos dois projetos confirma:
- 13 tabelas públicas;
- RLS habilitado nas 13;
- 38 policies nas mesmas 11 tabelas;
- 31 índices;
- 62 constraints de produção e 63 no teste. A constraint adicional é a FK de `students.user_id`, introduzida pela migration de vínculo por conta do aluno;
- as três colunas adicionais em `students` (`user_id`, `invited_at`, `invite_attempt_id`) também são intencionais para testar a nova vinculação;
- 14 funções no teste contra 12 no original e 7 triggers no teste contra 5 no original, pelas duas funções e dois triggers extras de vínculo de aluno.

### Testes RLS simulados executados

Foram preparados dois perfis sintéticos de instrutor com acesso temporário ativo e registros sintéticos próprios para cada um. Nenhum dado de produção foi copiado.

Com `SET ROLE authenticated` e claims de sessão configurados no banco, os resultados foram:

| Verificação | Instrutor A | Instrutor B |
|---|---:|---:|
| Alunos sintéticos próprios visíveis | 1 | 1 |
| Veículos sintéticos próprios visíveis | 1 | 1 |
| Aulas sintéticas próprias visíveis | 1 | 1 |
| Registro sintético do outro instrutor visível | 0 | 0 |

Testes negativos adicionais:
- INSERT de aluno atribuído ao outro instrutor: bloqueado por RLS (`42501`).
- UPDATE de aluno do outro instrutor: 0 linhas alteradas.
- DELETE de aluno do outro instrutor: 0 linhas removidas.

Esses são testes reais de políticas PostgreSQL sob `SET ROLE authenticated` e claims simuladas no banco, não chamadas HTTP autenticadas com JWT real via PostgREST. A matriz SEC-001 a SEC-070 ainda não foi integralmente executada; não considerar todos os testes de segurança concluídos.

### Advisors após reconstrução

Permanecem três observações:
- INFO: as duas tabelas WhatsApp têm RLS sem policies; isso é intencional no desenho backend-only, pois não há grants para `anon/authenticated`.
- WARN: `public.get_my_scheduled_lessons()` é SECURITY DEFINER e executável por authenticated. É o wrapper de agenda da migration de vínculo; deve continuar sob revisão específica e não foi alterado nesta etapa.
- WARN: proteção de senha vazada desabilitada no Auth; configuração não foi alterada.

**Status:** as 13 tabelas, 38 policies, índices, constraints essenciais, triggers e RPCs financeiras estão reconstruídos no projeto de testes. O isolamento de leitura e bloqueio de escrita entre dois instrutores passou nos testes SQL simulados. Ainda faltam testes HTTP/JWT reais, a matriz completa SEC-001 a SEC-070 e revisão específica do wrapper de agenda.


### Testes adicionais do vínculo e RPC de agenda

Também foram executados testes SQL simulando a sessão autenticada de um aluno, sempre dentro de transações revertidas:

- Com perfil temporariamente `usuario` e vínculo sintético por `students.user_id`, `public.get_my_scheduled_lessons()` retornou somente a aula agendada do cadastro vinculado.
- A chamada direta de `private.get_my_scheduled_lessons_internal()` como `authenticated` foi negada com SQLSTATE `42501`.
- Sem vínculo em `students.user_id`, a RPC pública retornou `CONTA_SEM_VINCULO` com SQLSTATE `P0002`; não houve fallback por e-mail.
- As alterações temporárias de papel/vínculo foram revertidas. Estado final confirmado: dois perfis de instrutor ativos para os testes, dois alunos/veículos/aulas sintéticos e nenhum vínculo de aluno ativo.

A chamada da RPC foi executada dentro do PostgreSQL com role e claims simuladas; não foi uma requisição HTTP com JWT real ao endpoint PostgREST.

A lista de migrations do projeto original foi consultada novamente e permaneceu inalterada. Toda a reconstrução e os dados sintéticos permanecem exclusivamente no projeto `voyjssflroiwdyaacthh`.
