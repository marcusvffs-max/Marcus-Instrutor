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

O projeto de testes possui ainda três triggers/funções adicionais ligados ao vínculo e à proteção dos campos internos do aluno: `link_student_account_from_invite`, `clear_student_account_link_on_user_delete` e `guard_student_account_link_fields`; esses objetos não existem no banco original atual e são intencionais para testar a correção planejada.

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
- 31 índices no original e 35 no teste após as quatro chaves únicas compostas;
- 62 constraints no original e 67 no teste: 1 FK extra de `students.user_id`, 4 chaves únicas compostas e 7 FKs compostas substituindo 7 FKs simples;
- as três colunas adicionais em `students` (`user_id`, `invited_at`, `invite_attempt_id`) também são intencionais para testar a nova vinculação;
- 15 funções no teste contra 12 no original e 8 triggers no teste contra 5 no original, pelas três funções e três triggers adicionais de vínculo/proteção do aluno.

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


### Teste transacional da RPC de venda do instrutor

Foi executada uma chamada SQL autenticada simulada à RPC `create_instructor_sale()` dentro de transação revertida:

- Venda de teste para aluno próprio: concluída.
- Registro de venda e lançamento financeiro visíveis ao instrutor durante a transação.
- Saldo do aluno aumentou de 5 para 7 aulas, conforme produto sintético de 2 aulas.
- A transação foi revertida ao final; nenhum registro de venda/financeiro foi mantido.

Teste negativo:
- O mesmo instrutor tentou registrar venda para o aluno sintético do outro instrutor.
- A RPC rejeitou a operação com SQLSTATE `42501`: aluno não encontrado ou não pertence ao instrutor.

As RPCs administrativas de venda/devolução/exclusão foram restauradas e comparadas com o original, mas ainda não foram executadas com um perfil admin autenticado no ambiente de testes.


## Atualização: testes adicionais de autorização e revisão da RPC de agenda

Em 21/11/2026, foram executadas novas verificações somente no projeto isolado `voyjssflroiwdyaacthh`. Os testes com alterações temporárias foram executados dentro de transações revertidas.

### Resultado de acesso por papel

| Verificação | Resultado |
|---|---|
| `authenticated` executa a RPC pública de agenda com perfil instrutor | Bloqueado com SQLSTATE `42501` (somente perfil Usuário) |
| `anon` executa a RPC pública de agenda | Bloqueado por falta de EXECUTE (`42501`) |
| `authenticated` executa a função interna em `private` | EXECUTE negado |
| Perfil `usuario` consulta diretamente `students` | 0 linhas |
| Perfil `usuario` consulta diretamente `lessons` | 0 linhas |
| Perfil `usuario` consulta diretamente `vehicles` | 0 linhas |
| Perfil `usuario` usa a RPC pública com vínculo próprio por `students.user_id` | 1 aula agendada sintética retornada |

No teste do perfil `usuario`, o perfil de instrutor sintético foi temporariamente convertido para `usuario` e um aluno sintético foi vinculado ao mesmo UUID em `students.user_id`. A RPC retornou a aula do cadastro vinculado; as consultas diretas às três tabelas operacionais retornaram zero linhas. A transação foi revertida integralmente.

### Grants e RLS das 13 tabelas

Nova consulta ao catálogo confirmou:

- RLS habilitado nas 13 tabelas públicas.
- As 11 tabelas operacionais/administrativas com policies possuem entre 1 e 8 policies cada, totalizando 38.
- Nenhuma das 13 tabelas concede DML a `PUBLIC` ou `anon`.
- `whatsapp_conversations` e `whatsapp_messages` não concedem DML a `authenticated`; `service_role` mantém acesso.
- As outras 11 tabelas concedem DML a `authenticated`, sempre sujeito às policies RLS.
- `relforcerowsecurity=false` nas tabelas. Isso significa que o owner PostgreSQL continua sujeito à regra padrão de bypass do proprietário; os testes de aplicação foram realizados com `SET ROLE authenticated`, não como owner.

### Revisão específica do wrapper SECURITY DEFINER

Definições e permissões verificadas novamente:

- `public.get_my_scheduled_lessons()`: owner `postgres`, `SECURITY DEFINER`, `search_path=''`; EXECUTE para `authenticated` e `service_role`, sem EXECUTE para `anon`.
- `private.get_my_scheduled_lessons_internal()`: owner `postgres`, `SECURITY DEFINER`, `search_path=''`; sem EXECUTE para `PUBLIC`, `anon`, `authenticated` ou `service_role`.
- A função interna valida `auth.uid()`, exige perfil `usuario`, exige vínculo em `students.user_id`, não usa fallback por e-mail e combina os relacionamentos de aulas/veículos com `owner_id`.
- A única função exposta na API é o wrapper público, cuja chamada encaminha para a função interna protegida. A validação de identidade e papel ocorre na função interna antes de consultar/atualizar os registros vinculados.
- A função interna também limpa `invited_at` e `invite_attempt_id` somente do cadastro cujo `user_id` corresponde ao usuário autenticado.

**Conclusão da revisão:** o alerta Advisor `authenticated_security_definer_function_executable` permanece porque o wrapper público precisa ser executável pelo cliente autenticado. No desenho atual, a função interna inacessível diretamente aplica as verificações de identidade, papel e vínculo. O alerta deve permanecer documentado e monitorado; não foi removido artificialmente nem alterado o desenho nesta etapa. Uma confirmação adicional via chamada HTTP/PostgREST com JWT real continua pendente.

### Advisors atuais

A consulta aos Security Advisors retornou:

1. INFO `rls_enabled_no_policy`: duas tabelas WhatsApp sem policies — esperado, pois não há grants para `anon/authenticated`.
2. WARN `authenticated_security_definer_function_executable`: wrapper público de agenda — esperado pelo desenho atual, com as ressalvas acima.
3. WARN `auth_leaked_password_protection`: proteção contra senhas vazadas desabilitada; não alterada.

### Limitações remanescentes

- A matriz SEC-001 a SEC-070 ainda não foi executada integralmente.
- Não houve chamadas HTTP com JWT real via PostgREST.
- As RPCs administrativas ainda não foram testadas com uma identidade admin autenticada.
- Nenhuma alteração foi feita no projeto original, em produção ou nas configurações de Auth.
- Nenhuma ação paga foi executada.

**Status:** testes adicionais de autorização por papel e grants concluídos no banco de testes; a revisão estática e SQL do wrapper foi concluída, mas a validação HTTP/JWT real e os casos restantes da matriz continuam pendentes.


### Ampliação da verificação de leitura cruzada entre instrutores

Foram repetidas consultas sob `SET ROLE authenticated` para os dois instrutores sintéticos, alternando a identidade do JWT simulado e sempre revertendo a transação. Em cada direção, o instrutor consultou registros com o `owner_id` do outro instrutor (e o perfil alheio por `profiles.id`).

| Tabela | Instrutor A consultando B | Instrutor B consultando A |
|---|---:|---:|
| profiles | 0 | 0 |
| students | 0 | 0 |
| vehicles | 0 | 0 |
| lessons | 0 | 0 |
| app_settings | 0 | 0 |
| products | 0 | 0 |
| sales | 0 | 0 |
| sale_items | 0 | 0 |
| financial_transactions | 0 | 0 |
| ai_requests | 0 | 0 |
| ai_runtime_settings | 0 | 0 |

**Resultado:** nenhuma linha do outro proprietário foi visível nas 11 tabelas consultadas em qualquer direção. Essa verificação cobre leitura sob o papel PostgreSQL `authenticated` com claims simuladas; não substitui chamadas HTTP com JWT real, testes de INSERT/UPDATE/DELETE em todas as tabelas, nem a matriz SEC-001 a SEC-070 completa.


### Testes de escrita cruzada e adulteração do proprietário

Em nova rodada, sob `SET ROLE authenticated` e identidade simulada do instrutor A, foram testadas operações contra os registros do instrutor B nas dez tabelas que possuem `owner_id` e grants de aplicação relevantes.

| Tabela | UPDATE em registros de B | DELETE em registros de B |
|---|---:|---:|
| students | 0 linhas | 0 linhas |
| vehicles | 0 linhas | 0 linhas |
| lessons | 0 linhas | 0 linhas |
| app_settings | 0 linhas | 0 linhas |
| products | 0 linhas | 0 linhas |
| sales | 0 linhas | 0 linhas |
| sale_items | 0 linhas | 0 linhas |
| financial_transactions | 0 linhas | 0 linhas |
| ai_requests | bloqueado por privilégio (42501) | bloqueado por privilégio (42501) |
| ai_runtime_settings | 0 linhas | 0 linhas |

Os comandos para `ai_requests` não são concedidos a authenticated e foram bloqueados. Nas outras tabelas, as policies filtraram os registros alheios e nenhuma linha foi afetada.

Também foram tentadas alterações do `owner_id` dos registros próprios do instrutor A para o UUID do instrutor B em `students`, `vehicles` e `lessons`. As três operações foram rejeitadas com SQLSTATE `42501` pelas condições de `WITH CHECK` das policies; nenhuma linha foi alterada.

Todas as tentativas foram executadas em transações revertidas. Nenhum registro foi excluído, transferido ou persistido.

**Limitação:** os testes de escrita cruzada cobrem as tabelas e fixtures existentes nesta rodada; não substituem tentativas de INSERT com todos os formatos de payload, chamadas HTTP com JWT real ou a execução integral da matriz SEC-001 a SEC-070.


## Achado crítico: alteração direta dos campos de vínculo de aluno

Durante os testes de INSERT, foi identificada uma falha que não era coberta pelas policies RLS existentes: um instrutor autenticado podia atualizar `students.user_id`, `students.invited_at` e `students.invite_attempt_id` diretamente no cadastro que já pertencia a ele. A policy validava `owner_id`, mas não impedia a alteração dos campos internos do fluxo de convite.

O impacto foi confirmado em transação revertida: ao mudar temporariamente o perfil de uma segunda identidade sintética para `usuario` e atribuir essa identidade ao cadastro de aluno do primeiro instrutor, a segunda identidade conseguiu consultar pela RPC pública a aula agendada daquele cadastro, incluindo nome do aluno e dados do veículo. Isso confirmou um caminho de quebra do isolamento de agenda por adulteração do vínculo. Nenhuma alteração foi persistida.

### Correção preparada e aplicada somente no ambiente de testes

Foi criada a migration:

`supabase/migrations/20261121133000_guard_student_account_link_fields.sql`

Ela adiciona a função `private.guard_student_account_link_fields()` e um trigger BEFORE INSERT / UPDATE em `public.students`, protegendo os campos:

- `user_id`
- `invited_at`
- `invite_attempt_id`

A função é SECURITY INVOKER, tem `search_path=''` e permite alterações nesses campos somente quando `current_user` é `postgres` ou `service_role`. Assim, o fluxo de convite pela Edge Function (service_role), os triggers de Auth e a RPC SECURITY DEFINER que limpa os campos de reserva continuam funcionando; clientes authenticated não podem forjar ou alterar o vínculo diretamente.

A migration foi aplicada exclusivamente ao projeto de testes `voyjssflroiwdyaacthh`. Não foi aplicada ao Supabase original.

### Testes de regressão após a correção

| Teste | Resultado |
|---|---|
| Instrutor altera `students.user_id` diretamente | Bloqueado (`42501`) |
| Instrutor altera `students.invited_at` diretamente | Bloqueado (`42501`) |
| Instrutor altera `students.invite_attempt_id` diretamente | Bloqueado (`42501`) |
| Instrutor insere aluno com `user_id` forjado | Bloqueado (`42501`) |
| Instrutor atualiza campo normal do próprio aluno (`nome`) | Permitido |
| Operação de vínculo via `service_role` | Permitida |
| RPC legítima de agenda limpa os campos de reserva | Permitida; retornou a aula vinculada e deixou os três campos de reserva nulos |
| Tentativa de adulteração seguida de acesso à agenda por outra conta | Adulteração bloqueada (`42501`); RPC da outra conta retornou `CONTA_SEM_VINCULO` (`P0002`) |

Todos os testes foram feitos com identidades e dados sintéticos no banco de testes, em transações revertidas. Não foram criadas contas Auth nem enviados convites. O fluxo real de e-mail/convite não foi executado.

**Status:** o caminho de adulteração do vínculo foi reproduzido, diagnosticado e bloqueado no ambiente isolado. A migration está versionada na branch de testes e aplicada somente no projeto de testes. Antes de qualquer aplicação no banco original, ainda são necessários testes HTTP com JWT real, revisão independente da migration e autorização explícita do usuário. Produção e o banco original permanecem inalterados.


### Testes complementares de INSERT e preservação do banco original

Após a correção do vínculo, foram executadas tentativas adicionais de INSERT sob identidade simulada do instrutor A:

- Inserir venda com `student_id` pertencente ao instrutor B: bloqueado (`42501`).
- Inserir lançamento financeiro ligado ao aluno B: bloqueado (`42501`).
- Inserir item de venda associado a uma venda do instrutor B: bloqueado (`42501`).
- Inserir produto com `owner_id` do instrutor B: bloqueado (`42501`).
- Inserir configuração com `owner_id` do instrutor B: bloqueado (`42501`).

A tentativa de item de venda foi repetida com o UUID da venda estrangeira obtido antes da troca para `authenticated`; a policy rejeitou o INSERT. Todos os testes foram revertidos.

Foi feita também uma consulta somente de leitura no Supabase original `ydyqagqsuqntuibzgwzd`: a função `private.guard_student_account_link_fields()` e o trigger correspondente não existem no projeto original. Isso confirma que a correção está somente no ambiente de testes; nenhuma migration foi aplicada ao banco original.


### Endurecimento adicional de permissões de função de trigger

Na etapa seguinte, foi identificada uma função de trigger em private cujo ACL ainda herdava EXECUTE de PUBLIC:

- private.protect_profile_role(), ligada exclusivamente ao trigger protect_profile_role_trigger de public.profiles.
- A função retorna trigger; uma chamada direta foi recusada pelo PostgreSQL com 0A000: trigger functions can only be called as triggers.
- Mesmo sem ser invocável como RPC, o EXECUTE padrão foi removido para reduzir a superfície de permissões.

Migration criada e aplicada somente no projeto de testes:

20261121143000_restrict_profile_role_trigger_function.sql

A migration revoga EXECUTE de PUBLIC, anon, authenticated e service_role. Verificação posterior confirmou:
- anon: sem EXECUTE;
- authenticated: sem EXECUTE;
- service_role: sem EXECUTE;
- trigger protect_profile_role_trigger: continua anexado à tabela profiles.

Um teste de UPDATE do papel do perfil sob identidade simulada não foi considerado conclusivo: a instrução não demonstrou que uma linha elegível foi efetivamente atingida pela policy RLS. Portanto, não se registra esse caso como regressão aprovada. O bloqueio da função como chamada direta e a remoção de EXECUTE foram confirmados.

### Testes adicionais de vínculo e exclusão de usuário Auth

- Sob identidade simulada do instrutor A, UPDATE no campo students.user_id do cadastro pertencente ao instrutor B afetou 0 linhas.
- O ambiente contém duas identidades Auth sintéticas com e-mails .invalid, usadas exclusivamente nas fixtures de teste; não são contas reais e não foram criadas nesta etapa.
- Foi executado um teste transacional do trigger BEFORE DELETE ON auth.users: vinculou temporariamente a identidade sintética do aluno ao cadastro sintético correspondente, tentou excluir a identidade e verificou a limpeza do vínculo pelo trigger private.clear_student_account_link_on_user_delete(). O teste foi revertido; a identidade Auth permaneceu existente e o cadastro voltou a ficar sem vínculo.
- Estado final conferido: duas identidades Auth sintéticas preservadas, dois alunos sintéticos, nenhum aluno com user_id preenchido.

### Advisors após endurecimento

A consulta posterior aos Security Advisors retornou:
- INFO rls_enabled_no_policy: as duas tabelas WhatsApp backend-only, sem grants para clientes.
- WARN authenticated_security_definer_function_executable: wrapper público get_my_scheduled_lessons(), mantido intencionalmente e ainda sob revisão.
- WARN auth_leaked_password_protection: proteção contra senhas vazadas desabilitada; não foi alterada.

Nenhum novo alerta foi introduzido pela migration de permissões. Nenhuma alteração foi aplicada ao Supabase original ou à produção. Não houve deploy, criação de contas, envio de convites ou ação paga.

Status desta rodada: permissões da função de trigger endurecidas no projeto isolado; UPDATE cruzado do vínculo bloqueado; rotina de limpeza do vínculo em exclusão de Auth exercitada em teste transacional revertido. A matriz SEC-001 a SEC-070 e os testes HTTP com JWT real continuam pendentes.


### Revisão estática do fluxo de convite e conclusão de vínculo

Foi revisada a Edge Function admin-manage-instructors da branch de testes e a definição da função de trigger private.link_student_account_from_invite().

A revisão estática confirmou os seguintes controles no fluxo:
- A Edge Function valida o token com auth.getUser() e consulta o perfil do usuário por service_role.
- Instrutores precisam ter acesso temporário válido e só podem executar invite_student; o cadastro do aluno é buscado com id e owner_id iguais ao aluno e ao instrutor autenticado.
- O fluxo reserva o cadastro com invite_attempt_id e invited_at, com prazo de 15 minutos.
- O trigger de Auth só liga automaticamente quando os metadados incluem UUIDs válidos para tentativa, aluno e instrutor; o cadastro precisa pertencer ao instrutor indicado, ter a mesma tentativa ativa, ainda não ter user_id e possuir e-mail correspondente ao novo usuário.
- A Edge Function verifica que o trigger concluiu o vínculo esperado; não usa fallback para forçar o vínculo quando o trigger não o fez.
- Para conta legada já existente, o fluxo usa confirmação explícita do titular, exige e-mail confirmado, perfil role=usuario e revalida a reserva antes de gravar o user_id.
- A ação complete_student_link só é permitida a perfil usuario; ações de instrutor e admin não podem usar esse caminho.
- Não foi executado o envio de e-mail, geração de convite real ou criação de conta nesta revisão.

Foi testado adicionalmente um INSERT de ai_runtime_settings com owner_id do instrutor B sob a identidade simulada do instrutor A; a policy administrativa bloqueou a tentativa. Nenhum registro foi persistido.

### Confirmação de isolamento entre projetos após a migration de ACL

Consulta somente de leitura no projeto original confirmou que private.protect_profile_role() continua com EXECUTE herdado por anon e authenticated, enquanto no projeto de testes ambos estão sem EXECUTE. Isso confirma que a migration de endurecimento foi aplicada somente no projeto isolado.

Commit da migration: 96f0a2526488e326fdbce5486913e7f080bbcce4
Commit da atualização desta documentação: be62f2d7bc55f95d48127816432da935c74b0fe4

A migration não foi aplicada ao projeto original. Nenhuma publicação ou deploy foi executado.


### Regressão do trigger após revogar EXECUTE

Para confirmar que a revogação de EXECUTE não interrompe o uso legítimo do trigger, foi executado UPDATE transacional de um perfil sintético sob SET ROLE service_role. A operação atingiu uma linha e passou pelo trigger protect_profile_role_trigger com sucesso. A transação foi revertida.

Resultado: chamadas diretas continuam sem EXECUTE para anon/authenticated/service_role, mas a execução interna do trigger continua funcionando para a operação legítima de service_role. O teste não alterou permanentemente o perfil.


## Atualização da auditoria: rodada adicional de autorização e superfície de funções

Em 21/11/2026, foram executados novos testes exclusivamente no projeto isolado `voyjssflroiwdyaacthh`. Todos os testes que alteraram estado foram executados em transações revertidas.

### RPCs administrativas e alteração de papel

- As quatro RPCs `admin_create_sale`, `admin_delete_sale`, `admin_refund_sale_lessons` e `admin_refund_sale_product` foram chamadas sob a identidade sintética de um instrutor. Todas rejeitaram a chamada com a mensagem de acesso administrativo obrigatório, antes de processar a operação.
- UPDATE do próprio perfil para `role='admin'` sob `authenticated`: 0 linhas alteradas.
- Consulta ao perfil do outro instrutor: 0 linhas visíveis.
- A função `private.current_app_role()` calcula o papel a partir de `profiles.id = auth.uid()`; não recebe papel como parâmetro do cliente.

### INSERT cross-owner adicional

Sob identidade simulada do instrutor A, foram tentados INSERTs com proprietário B ou com referência a aluno B. Todos foram bloqueados por autorização (SQLSTATE `42501`):

- `students` com `owner_id` B;
- `vehicles` com `owner_id` B;
- `lessons` com `student_id` B;
- `app_settings` com `owner_id` B;
- `products` com `owner_id` B;
- `sales` com `owner_id` B;
- `financial_transactions` do instrutor A apontando para aluno B;
- `ai_runtime_settings` por um instrutor (policy reservada a admin);
- `ai_requests` (authenticated não tem INSERT);
- `whatsapp_conversations` (authenticated não tem grants).

O INSERT de `sale_items` apontando para venda de outro proprietário já havia sido testado anteriormente e bloqueado com `42501`. Todos os testes foram revertidos.

### Validade do acesso de instrutor

O prazo de acesso do instrutor A foi temporariamente definido como expirado. Sob `authenticated`, `private.current_app_role()` retornou NULL e as consultas a `students`, `vehicles` e `lessons` retornaram zero linhas. A alteração de validade foi revertida.

### Inventário das funções SECURITY DEFINER

Foi feita varredura das funções SECURITY DEFINER nos schemas de aplicação e nos schemas de plataforma:

- Todas as funções SECURITY DEFINER de aplicação em `public/private` usam `search_path=''`.
- Nenhuma dessas funções concede EXECUTE a PUBLIC ou anon.
- `private.current_app_role()` é executável por authenticated e retorna somente o papel do próprio `auth.uid()`.
- `public.get_my_scheduled_lessons()` é a única função SECURITY DEFINER no schema public executável por authenticated; permanece como wrapper de agenda sob revisão e mantém validação na função interna privada.
- Funções de trigger em private têm EXECUTE revogado para papéis de aplicação e continuam ligadas aos respectivos triggers.
- Funções SECURITY DEFINER de storage/vault/pgbouncer observadas pertencem aos schemas de plataforma e não concedem execução a anon/authenticated.

### Storage e funções HTTP no ambiente de teste

- Não há buckets nem policies em `storage` no projeto original nem no projeto de testes; portanto, não há regra de Storage a reproduzir nesta auditoria.
- O projeto de testes não tem Edge Functions implantadas. A revisão estática do código versionado não substitui testes HTTP/JWT; essa etapa permanece pendente.
- Não foram criadas contas ou enviados convites para viabilizar esses testes.

### Estado atual das fixtures

Consulta final confirmou no projeto de testes:
- 2 perfis sintéticos;
- 3 alunos, 3 veículos e 3 aulas sintéticos;
- 0 alunos com `user_id` preenchido;
- 0 usuários Auth com e-mail fora do domínio de teste `.invalid`.

Há um conjunto adicional de registros sintéticos sob o instrutor A além da fixture original `RLS_TEST_*` (rótulos identificados como `Aluno Sintético`, `Veículo Sintético` e uma aula agendada). Eles não foram apagados: não foi necessária limpeza destrutiva para a auditoria, e todos os testes continuam filtrando por proprietário e UUIDs conhecidos.

### Status desta rodada

A rodada adicional de RPCs administrativas, escalada de papel, INSERT cross-owner, validade expirada, superfície SECURITY DEFINER e inventário de Storage foi concluída no banco de testes. A matriz SEC-001 a SEC-070 ainda não está integralmente concluída; também faltam chamadas HTTP/PostgREST com JWT real e validação de Edge Functions em ambiente de testes. Não houve alteração no Supabase original, produção, deploy, envio de convites ou ação paga.


## Revisão estática das Edge Functions implantadas no Supabase original

Foi feita somente leitura das definições das Edge Functions ativas no projeto original. Nenhuma função foi chamada por HTTP, atualizada ou implantada.

### Inventário no momento da inspeção

| Edge Function | Versão ativa | verify_jwt |
|---|---:|---|
| gemini-assistant-preview | 45 | true |
| openai-connection-check | 11 | true |
| whatsapp-webhook | 64 | false |
| whatsapp-connection-check | 15 | true |
| whatsapp-webhook-subscription-check | 12 | true |
| gemini-connection-check | 12 | true |
| whatsapp-list-phone-numbers | 13 | true |
| admin-manage-instructors | 7 | true |

### Controles observados

- As sete funções com `verify_jwt=true` também validam o token com `auth.getUser(token)`; as rotas administrativas verificam `profiles.role='admin'` usando cliente de backend.
- A única função com `verify_jwt=false` é `whatsapp-webhook`, que precisa receber callbacks do provedor. O GET de verificação compara o verify token; o POST exige `WHATSAPP_APP_SECRET`, valida o cabeçalho `x-hub-signature-256` com HMAC-SHA256 e responde 503 quando o segredo não está configurado. Não foi identificada condição de fail-open na verificação de assinatura durante a revisão estática.
- As credenciais externas e chaves Supabase são lidas de variáveis de ambiente; não foram encontrados valores de chaves secretas embutidos nos trechos inspecionados.
- `gemini-assistant-preview` e `whatsapp-webhook` usam um `OWNER_ID` fixo. Isso corresponde a uma arquitetura de atendimento de proprietário único; não deve ser interpretado como isolamento multi-tenant. Se o atendimento WhatsApp passar a ser compartilhado por vários instrutores, essa premissa precisará ser redesenhada.
- Há cabeçalhos CORS amplos em algumas rotas de diagnóstico/preview, mas essas funções mantêm autenticação JWT e validação de administrador; CORS não substitui autenticação.

### Diferença entre produção e branch de testes

A função implantada `admin-manage-instructors` está na versão 7 e tem 325 linhas no arquivo retornado pelo Supabase. O arquivo correspondente na branch `feature/relatorios-instrutor-app` tem 674 linhas e não é idêntico.

A versão implantada contém o gerenciamento administrativo tradicional (listar usuários, liberar acesso, alterar papel, excluir, reenviar acesso e convidar usuários). A branch de testes acrescenta ações específicas de vínculo de aluno, incluindo `invite_student` e `complete_student_link`, validação de prazo de acesso do instrutor, confirmação do e-mail pelo próprio aluno e reserva por `invite_attempt_id`.

**Consequência:** os testes SQL e a revisão estática do novo fluxo de vínculo descrevem o código versionado na branch e o schema isolado; não provam que esse fluxo esteja implantado ou ativo no Supabase original. A versão 7 em produção não foi substituída. Não foi realizado deploy.

### Limitação de validação dinâmica

O projeto de testes não tem Edge Functions implantadas e não há identidade JWT sintética disponível para chamadas HTTP reais. Não foram enviados POSTs ao webhook de produção, não foram disparados convites, e-mails ou mensagens, nem foram chamadas rotas que pudessem alterar dados ou gerar custos.

**Status:** revisão estática das oito funções ativas concluída; controles de JWT/admin e assinatura do webhook identificados. A validação HTTP/JWT das funções continua pendente e exige ambiente de testes com funções implantadas e contas sintéticas criadas de modo controlado. Nenhuma alteração foi feita no projeto original ou na produção.


### Achado condicional no webhook: falta validar o número de telefone de origem

Na leitura estática da versão ativa 64 de `whatsapp-webhook`, confirmei que o POST valida corretamente a assinatura HMAC da Meta antes de interpretar o JSON. Porém, após a validação, o processamento percorre `payload.entry[].changes[].value.messages[]` sem comparar `value.metadata.phone_number_id` com o `WHATSAPP_PHONE_NUMBER_ID` configurado no servidor.

A função grava e processa todas essas mensagens usando o `OWNER_ID` fixo. Portanto:

- Se a aplicação Meta estiver inscrita em somente um número, o risco prático fica limitado à configuração atual.
- Se a mesma aplicação Meta receber eventos de mais de um número/WABA, eventos assinados de outro número poderão ser tratados como mensagens do proprietário fixo, misturando conversas e atendimentos.

Classificação: **achado condicional de escopo de origem**, não exploração confirmada. Não foi feita chamada HTTP nem alteração na função implantada.

Correção recomendada para uma futura versão de testes: antes de processar mensagens, exigir que `value.metadata.phone_number_id` exista e corresponda exatamente a `WHATSAPP_PHONE_NUMBER_ID`; rejeitar/ignorar eventos de números diferentes. Se houver mais de uma conta empresarial, validar também o identificador WABA esperado. Adicionar teste negativo com outro `phone_number_id`.

O arquivo da função webhook não está presente no caminho convencional da branch consultada, e o projeto de testes não tem Edge Functions implantadas. Por isso, não foi criada uma cópia parcial nem aplicado patch sem o arquivo-fonte correto. A produção permanece inalterada.


### Revisão do trigger de criação de perfil Auth

A definição de `private.handle_new_auth_user_profile()` no ambiente de testes foi revisada. Ela cria o perfil com papel fixo `instrutor` e não lê `role` de `raw_user_meta_data`; o nome pode vir dos metadados, mas o papel não. O trigger é SECURITY DEFINER, `search_path=''`, e não tem EXECUTE para os papéis de aplicação.

O papel inicial `instrutor` não libera acesso automaticamente: `private.current_app_role()` retorna NULL quando `instructor_access_until` está ausente ou expirado. O teste transacional de acesso expirado confirmou zero linhas visíveis em `students`, `vehicles` e `lessons`. A função de proteção do papel também impede alteração direta do role por authenticated, e o UPDATE de autoelevação testado afetou zero linhas.

No fluxo de convite de aluno da branch, a Edge Function atribui explicitamente o papel `usuario` via service_role depois da criação da conta e antes de concluir o envio; o titular precisa confirmar o e-mail para concluir o vínculo legado. Esse fluxo ainda não foi executado por HTTP e não está implantado na versão 7 de produção.

**Resultado da revisão estática:** não foi encontrado caminho de autoatribuição de `admin` por metadados de signup na função de criação de perfil. A criação real de contas e o fluxo HTTP permanecem fora dos testes por decisão de não criar usuários nem disparar e-mails.


### Recontagem final de funções, triggers e grants

Uma nova consulta direta ao catálogo, após todas as migrations de endurecimento, corrigiu a contagem registrada anteriormente:

| Objeto | Projeto original | Projeto de testes |
|---|---:|---:|
| Tabelas públicas | 13 | 13 |
| Funções de aplicação em public/private | 12 | 15 |
| Triggers não internos em public/auth | 5 | 8 |

As três funções e os três triggers adicionais do ambiente de testes são:
- `private.link_student_account_from_invite()` / trigger de vínculo após criação Auth;
- `private.clear_student_account_link_on_user_delete()` / trigger de limpeza antes da exclusão Auth;
- `private.guard_student_account_link_fields()` / trigger de proteção dos campos de vínculo em `students`.

Nova verificação efetiva de privilégios no projeto de testes:
- 13 tabelas públicas;
- 0 tabelas com qualquer privilégio de SELECT/INSERT/UPDATE/DELETE/TRUNCATE para anon;
- 0 tabelas com TRUNCATE, REFERENCES ou TRIGGER para authenticated;
- 15 funções public/private;
- 0 funções executáveis por anon;
- 0 funções de private executáveis por authenticated fora da allowlist `current_app_role()`;
- 0 funções com EXECUTE herdado de PUBLIC.

A contagem anterior de 14 funções e 7 triggers estava subestimada porque não contabilizava separadamente a função/trigger de proteção dos campos `user_id`, `invited_at` e `invite_attempt_id`. Esta seção passa a ser a contagem de referência.


## Achado de configuração: permissões padrão de novas funções

A inspeção dos `pg_default_acl` identificou que funções criadas pelo proprietário `postgres` recebiam EXECUTE por padrão de PUBLIC. Como `anon` e `authenticated` têm USAGE nos schemas expostos relevantes, uma nova função criada sem ACL explícita poderia ficar chamável por clientes:

- Em `public`, a permissão padrão PUBLIC pode tornar uma nova função chamável por anon e authenticated.
- Em `private`, authenticated tem USAGE; portanto, uma nova função privada sem revogação explícita também pode ficar chamável por authenticated.
- Isso não representa exposição de todas as funções atuais: a varredura das 15 funções de aplicação confirmou zero EXECUTE para anon, zero EXECUTE herdado de PUBLIC e somente `private.current_app_role()` executável por authenticated no schema privado.

O catálogo do projeto original também apresenta o default global PostgreSQL de EXECUTE para PUBLIC e USAGE de authenticated em `private` e de anon/authenticated em `public`. Não foi feito teste DDL no original por restrição de somente leitura. Portanto, o risco descrito para novas funções é uma configuração preventiva a tratar antes de criar futuras funções no projeto original; não é uma exploração nem prova de que alguma função atual esteja exposta.

### Correção testada e aplicada somente no projeto isolado

Migration criada na branch de testes e aplicada somente ao projeto `voyjssflroiwdyaacthh`:

`20261121150000_harden_default_function_privileges.sql`

Ela:
- revoga EXECUTE padrão de PUBLIC para funções futuras criadas por `postgres`;
- revoga EXECUTE padrão de `anon`, `authenticated` e `service_role` para novas funções no schema `public`;
- exige que cada nova RPC receba GRANT EXECUTE explícito aos papéis necessários;
- deixa novas funções em `private` sem EXECUTE para papéis de aplicação, salvo concessão explícita.

### Verificação da migration

Antes de aplicar, foi feita uma prova transacional criando funções temporárias em `public` e `private`; a configuração antiga concedia EXECUTE a PUBLIC, anon e authenticated. A transação foi revertida.

Depois da migration, uma segunda prova transacional confirmou que funções novas temporárias nos dois schemas não concedem EXECUTE a PUBLIC, anon, authenticated ou service_role. A transação foi revertida.

Também foi confirmado que as seis RPCs públicas já existentes mantiveram seus grants explícitos:
- anon: sem EXECUTE;
- PUBLIC: sem EXECUTE;
- authenticated e service_role: EXECUTE preservado onde necessário.

Os Security Advisors permaneceram com os mesmos três apontamentos anteriores; a migration não introduziu novos avisos. A alteração não afeta permissões de funções já existentes.

**Importante:** a migration de default privileges está somente na branch de testes e aplicada somente no Supabase de testes. O Supabase original continua sem alterações. A correção equivalente no original exige revisão e autorização explícita antes de qualquer aplicação.

## Testes adicionais de referências cruzadas, owner_id e perfil

Nova rodada SQL no projeto de testes, sempre com transações revertidas:

### Referências cruzadas entre entidades

- INSERT de aula do instrutor A com veículo pertencente ao instrutor B: bloqueado (42501).
- INSERT de item de venda do instrutor A com produto pertencente ao instrutor B, embora a venda fosse própria: bloqueado (42501).
- INSERT de lançamento financeiro do instrutor A com aluno próprio, mas venda pertencente ao instrutor B: bloqueado (42501).

Esses casos complementam os testes anteriores de aluno estrangeiro em aula/venda/lançamento e venda estrangeira em item de venda.

### Impedir transferência de owner_id

Sob identidade autenticada do instrutor A, foram tentadas alterações de owner_id dos registros próprios para o UUID do instrutor B:

- products: bloqueado (42501);
- sales: bloqueado (42501);
- sale_items: bloqueado (42501);
- financial_transactions: bloqueado (42501);
- app_settings: bloqueado (42501).

As tentativas anteriores de students, vehicles e lessons também foram bloqueadas. Nenhuma transferência persistiu.

### Campos administrativos do perfil

Sob a identidade autenticada do próprio instrutor:
- UPDATE de profiles.role para admin: 0 linhas alteradas;
- UPDATE de profiles.instructor_access_until para estender a validade: 0 linhas alteradas.

A liberação e a troca de papel continuam dependendo do fluxo administrativo de backend.

### Unicidade do vínculo e da tentativa

A inspeção dos índices de students confirmou:
- students_user_id_unique: índice UNIQUE parcial em user_id IS NOT NULL, garantindo no máximo um cadastro de aluno por conta Auth;
- students_invite_attempt_id_unique: índice UNIQUE parcial em invite_attempt_id IS NOT NULL, impedindo reutilização de um mesmo identificador de tentativa em mais de um cadastro.

Foi tentado, em transação revertida, vincular a mesma identidade sintética a dois cadastros de instrutores diferentes. O segundo vínculo foi bloqueado pela unicidade (23505). A transação foi revertida e a consulta final confirmou 0 alunos vinculados e o papel original do perfil preservado.

### Estado final após esta rodada

- 2 perfis sintéticos, ambos preservados;
- 3 alunos, 3 veículos e 3 aulas sintéticos;
- 0 alunos com user_id preenchido;
- nenhuma venda, item ou transação financeira de teste persistida;
- nenhuma alteração de owner_id persistida.


## Achado de configuração: permissões padrão de novas tabelas e sequences

A mesma revisão de defaults identificou permissões amplas para novos objetos criados por postgres no schema public:

- No projeto de testes, novas tabelas recebiam SELECT/INSERT/UPDATE/DELETE e outros privilégios para anon, authenticated e service_role.
- Novas sequences também recebiam privilégios para os três papéis.
- No projeto original, o catálogo mostra grants padrão de authenticated e service_role para novas tabelas/sequences; anon não aparece na ACL específica de tabelas, mas authenticated continua recebendo privilégios amplos por padrão.
- Nenhuma tabela atual está exposta por isso: as 13 tabelas existentes têm RLS habilitado e nenhuma concede SELECT/INSERT/UPDATE/DELETE a anon.

### Correção aplicada somente no projeto de testes

Migration:
`20261121152000_harden_default_table_privileges.sql`

Revoga privilégios padrão de anon, authenticated e service_role para novas tabelas e sequences no schema public, criadas por postgres. Novos objetos começam privados e precisam receber GRANT explícito, além de RLS e policies, quando necessário.

### Prova antes/depois

- Antes: uma tabela temporária com coluna IDENTITY foi criada dentro de uma transação; anon, authenticated e service_role tinham SELECT/INSERT, e todos tinham USAGE na sequence. A transação foi revertida.
- A regra proposta foi testada dentro de outra transação; os três papéis não receberam SELECT na tabela nem USAGE na sequence. A transação foi revertida.
- A migration foi aplicada ao projeto de testes.
- Depois: a mesma prova temporária confirmou zero privilégios para anon, authenticated e service_role em novas tabelas e sequences.
- As 13 tabelas existentes mantiveram RLS habilitado; nenhuma concede SELECT/INSERT/UPDATE/DELETE a anon.
- Os três Security Advisor findings permaneceram iguais; nenhum alerta novo foi introduzido.

A configuração original não foi modificada. O risco identificado no original é preventivo para futuras tabelas: migrations devem habilitar RLS e definir grants/policies explicitamente; a correção segura por default foi validada somente no projeto de testes.


## Achado e correção: comparações de papel que não tratavam NULL como negação

A função private.current_app_role() retorna NULL para instrutor com autorização expirada. Cinco RPCs financeiras comparavam o resultado com `<>` dentro de PL/pgSQL `IF`. Como `NULL <> 'papel'` resulta em NULL e um IF com NULL não entra no ramo, a checagem de papel não encerrava a execução imediatamente.

### Impacto avaliado

- Antes da correção, uma chamada de instrutor expirado a create_instructor_sale com itens vazios passava pela checagem de papel e chegava à validação de itens (erro 22023).
- As operações de dados continuavam protegidas pelas policies RLS: instrutor expirado não vê o aluno nem os registros de venda, e os testes anteriores confirmaram zero linhas visíveis. Não foi confirmada leitura ou alteração indevida.
- O achado é uma falha de defesa em profundidade nas próprias RPCs; pode se tornar mais grave se futuramente forem adicionadas operações antes das consultas protegidas por RLS.

A consulta somente de leitura ao Supabase original confirmou o mesmo padrão nas cinco funções originais. Nenhuma alteração foi feita nele.

### Correção no projeto de testes

Migration:
`20261121154000_null_safe_financial_rpc_role_checks.sql`

Substitui comparações de papel por `IS DISTINCT FROM`, que considera NULL diferente de qualquer papel permitido, nas funções:
- create_instructor_sale (exige instrutor ativo);
- admin_create_sale;
- admin_delete_sale;
- admin_refund_sale_lessons;
- admin_refund_sale_product (as quatro últimas exigem admin).

### Testes após a correção

- Instrutor expirado: as cinco RPCs bloquearam imediatamente com as mensagens de autorização esperadas.
- Perfil usuario: create_instructor_sale bloqueada imediatamente.
- Instrutor ativo: venda legítima de teste continuou funcionando; criou 1 venda, 1 item e 1 lançamento financeiro, e acrescentou 2 aulas ao saldo.
- A venda positiva foi revertida; consulta posterior confirmou zero venda/item/lançamento persistidos e saldo restaurado a 5 aulas compradas e 5 restantes.
- As cinco funções continuam SECURITY INVOKER, owner postgres, search_path vazio, sem EXECUTE para anon/PUBLIC e com EXECUTE preservado para authenticated/service_role.

**Importante:** a correção foi aplicada somente ao banco de testes e versionada na branch de testes. O mesmo ajuste precisa ser avaliado para as cinco RPCs do projeto original, mas não foi aplicado sem autorização explícita.


## Ajuste estático no fluxo de convite de aluno: conta já vinculada

A unicidade de students.user_id garante que uma conta Auth só pode pertencer a um cadastro de aluno. A revisão da Edge Function na branch identificou que o fluxo de convite legado verificava se a conta existente tinha role usuario, mas não consultava se ela já estava vinculada a outro cadastro. Isso poderia enviar um link desnecessário; a conclusão falharia depois no índice UNIQUE e retornaria erro genérico.

A branch de testes foi ajustada em supabase/functions/admin-manage-instructors/index.ts:
- antes de reservar e enviar link para uma conta Auth existente, consulta students por user_id;
- se já houver vínculo, retorna HTTP 409 sem reservar o cadastro e sem enviar e-mail;
- se ocorrer uma corrida entre a pré-consulta e a conclusão, o SQLSTATE 23505 do índice UNIQUE também é convertido em HTTP 409.

A mudança não afrouxa a unicidade nem permite múltiplos vínculos. Ela alinha a resposta da Edge Function à regra já imposta pelo banco. Foi feita revisão estática do arquivo após a edição. Não houve deploy e não foram criadas contas, enviados e-mails ou chamadas rotas HTTP; a validação dinâmica permanece pendente porque o projeto de testes não tem Edge Functions implantadas.


## Verificações complementares de superfície PostgreSQL

- As 38 policies RLS das 11 tabelas com policies foram revisadas: nenhuma usa expressão incondicional `true`, e todas incluem predicado de identidade (`auth.uid()`) ou papel calculado (`private.current_app_role()`).
- Nenhuma das 15 funções de aplicação usa SQL dinâmico (`EXECUTE`), `format()` para montar SQL ou `quote_ident/quote_literal`.
- anon e authenticated não são membros de service_role; nenhum deles tem BYPASSRLS, CREATE ROLE ou CREATE DATABASE.
- anon e authenticated não têm CREATE nos schemas public/private; service_role também não tem CREATE em public.
- Nenhuma tabela está publicada em `supabase_realtime` no projeto original ou no projeto de testes.
- Não há buckets nem policies de Storage em nenhum dos dois projetos.


## Revalidação do achado de agenda no Supabase original

Uma consulta somente de leitura feita em 21/11/2026 confirmou a diferença exata entre original e testes:

### Projeto original: ydyqagqsuqntuibzgwzd

- public.get_my_scheduled_lessons(): SECURITY INVOKER, owner postgres, search_path vazio, EXECUTE para authenticated e sem EXECUTE para anon.
- private.get_my_scheduled_lessons_internal(): SECURITY DEFINER, owner postgres, search_path vazio, EXECUTE para authenticated; o schema private também concede USAGE a authenticated.
- A função interna deriva o e-mail do JWT e seleciona alunos por lower(trim(students.email)) = e-mail autenticado. Não filtra por students.user_id (coluna ainda inexistente no original) nem por proprietário do instrutor.
- O wrapper público apenas chama a função interna; por isso, mesmo sendo SECURITY INVOKER, a consulta privilegiada da função interna é executada.
- A consulta agregada atual confirmou 1 e-mail normalizado compartilhado entre proprietários, 2 cadastros de alunos e 2 aulas agendadas.

Esse conjunto mantém o achado de isolamento de agenda no projeto original. Não foi feita chamada autenticada exploratória, alteração de dados ou DDL no original.

### Projeto de testes: voyjssflroiwdyaacthh

O desenho é diferente e intencional:
- public.get_my_scheduled_lessons(): SECURITY DEFINER, EXECUTE autenticado, wrapper público;
- private.get_my_scheduled_lessons_internal(): SECURITY DEFINER, sem EXECUTE para authenticated/service_role/anon/PUBLIC;
- a função interna valida auth.uid(), role usuario e students.user_id = auth.uid(), sem fallback por e-mail;
- a função também faz joins com student_id + owner_id e vehicle_id + owner_id.

A diferença de SECURITY DEFINER do wrapper apontada pelo Advisor refere-se ao projeto de testes. No original, o wrapper é SECURITY INVOKER; o SECURITY DEFINER vulnerável é a função interna privada, executável por authenticated. Esta distinção substitui qualquer interpretação anterior que confundisse os dois objetos.


## Integridade referencial entre proprietários: FKs compostas

### Achado

As policies RLS já bloqueavam tentativas de INSERT cross-owner. Porém, as chaves estrangeiras originais de lessons, sales, sale_items e financial_transactions referenciavam apenas o ID do registro, sem incluir owner_id. A segurança dependia também das policies e da lógica das RPCs para impedir relacionamentos entre proprietários.

### Desenho confirmado na implementação

A revisão das policies e RPCs ativas confirmou que produtos usados em vendas também são owner-scoped:
- as policies de sale_items exigem que products.owner_id seja igual a auth.uid();
- create_instructor_sale e admin_create_sale selecionam produtos somente com owner_id do usuário autenticado;
- o catálogo que o webhook WhatsApp consulta no owner admin é uma leitura separada e não é uma referência direta de sale_items.

Portanto, sale_items.product_id também precisa usar FK composta com owner_id. A antiga documentação que tratava esse campo como exceção de catálogo central estava desatualizada.

### Correção no ambiente de testes

Migrations:
- `20261121160000_enforce_same_owner_foreign_keys.sql`
- `20261121162000_align_composite_fk_delete_actions.sql`

A migration `20261121160000` foi revisada na branch antes de qualquer publicação para preservar NO ACTION nas duas FKs de lessons e remover as sete FKs simples após validar as compostas. Como a versão inicial já havia sido aplicada ao projeto de testes, a migration `20261121162000` corrige o estado remoto de testes: recria as duas FKs de lessons com NO ACTION e remove as FKs simples redundantes. Em uma reconstrução nova, ambas as migrations continuam compatíveis e o resultado final é o mesmo.

Adicionam chaves únicas compostas (id, owner_id) em students, vehicles, sales e products, e sete FKs compostas:
- lessons(student_id, owner_id) → students(id, owner_id), ON DELETE NO ACTION;
- lessons(vehicle_id, owner_id) → vehicles(id, owner_id), ON DELETE NO ACTION;
- sales(student_id, owner_id) → students(id, owner_id), ON DELETE SET NULL somente em student_id;
- sale_items(sale_id, owner_id) → sales(id, owner_id), ON DELETE CASCADE;
- sale_items(product_id, owner_id) → products(id, owner_id), ON DELETE SET NULL somente em product_id;
- financial_transactions(student_id, owner_id) → students(id, owner_id), ON DELETE SET NULL somente em student_id;
- financial_transactions(sale_id, owner_id) → sales(id, owner_id), ON DELETE SET NULL somente em sale_id.

As sete FKs simples equivalentes foram removidas depois que as compostas foram validadas, evitando duplicar triggers de ações referenciais. As FKs owner_id para Auth e app_settings.owner_id → auth.users(id) permanecem.

### Semânticas de exclusão preservadas

A consulta read-only do original confirmou:
- lessons.student_id e lessons.vehicle_id: NO ACTION;
- sales.student_id: SET NULL;
- sale_items.sale_id: CASCADE;
- sale_items.product_id: SET NULL;
- financial_transactions.student_id e sale_id: SET NULL.

As FKs compostas agora preservam exatamente essas ações, incluindo NO ACTION nas duas relações de lessons.

### Testes realizados após as migrations

- As sete tentativas de INSERT cross-owner e as sete tentativas de UPDATE cross-owner foram bloqueadas diretamente pelas FKs compostas (SQLSTATE 23503), em contexto privilegiado para isolar as constraints das policies.
- Tentativa de alterar owner_id do aluno referenciado por uma aula foi bloqueada.
- Exclusão de aluno ou veículo ainda referenciado por aula foi bloqueada (23503), preservando o NO ACTION original.
- Exclusão de produto definiu sale_items.product_id como NULL.
- Exclusão de venda apagou sale_items em cascata e definiu financial_transactions.sale_id como NULL.
- Após remover a aula, exclusão de aluno foi permitida e definiu financial_transactions.student_id como NULL.
- create_instructor_sale continuou funcionando com 1 venda, 1 item, 1 lançamento financeiro e acréscimo de 2 aulas. A transação foi revertida e o saldo voltou a 5.
- A consulta de pré-verificação no original encontrou zero divergências de owner nas sete relações, incluindo sale_items.product_id.
- Todos os testes foram feitos no projeto isolado e revertidos. Nenhuma migration foi aplicada ao Supabase original.

### Observação sobre privilégios padrão

A consulta de pg_default_acl confirmou que os privilégios padrão restritivos para objetos criados pelo owner postgres estão ativos em public: novas funções, tabelas e sequences não recebem permissões de anon/authenticated por padrão. ACLs de papéis internos do Supabase, como supabase_admin e supabase_auth_admin, foram apenas inspecionadas e não foram alteradas.

## Webhook WhatsApp: validação do número de destino

### Achado na função ativa do Supabase original

A função `whatsapp-webhook` já:
- mantém `verify_jwt=false`, adequado a um webhook externo da Meta;
- valida o token de verificação no GET;
- valida `X-Hub-Signature-256` por HMAC-SHA256 sobre o corpo bruto no POST, antes de interpretar o JSON;
- usa um segredo do servidor para o cliente Supabase privilegiado;
- grava conversas e mensagens com owner_id fixo.

Entretanto, não comparava `value.metadata.phone_number_id` do evento com `WHATSAPP_PHONE_NUMBER_ID` configurado. Uma assinatura Meta válida autentica a origem/app, mas não substitui a validação de que o evento pertence ao número conectado a esta instalação.

### Preparação na branch de testes

- Foi copiada a versão ativa lida do Supabase para `supabase/functions/whatsapp-webhook/index.ts`, preservando seu conteúdo original.
- Foi adicionada uma validação por evento: se o ID configurado estiver vazio, o ID recebido estiver ausente ou os IDs forem diferentes, o evento é ignorado antes de percorrer mensagens.
- O log registra apenas presença/ausência dos IDs, não seus valores.
- Foi criado `supabase/config.toml` com `[functions.whatsapp-webhook] verify_jwt = false`; as outras funções continuam com o padrão verify_jwt=true. A assinatura HMAC permanece obrigatória no handler.
- A comparação do arquivo confirma que a versão da branch é exatamente o código ativo recuperado, mais apenas esse guard.

Casos lógicos verificados estaticamente: ID igual é aceito; ID diferente, ausente ou configuração vazia são rejeitados.

**Limite da validação:** não houve deploy nem chamada HTTP à Meta ou à Edge Function. O Supabase original continua sem alteração. Antes de um futuro deploy, será necessário testar com evento de número correto, número divergente e assinatura inválida no ambiente isolado.


## Controles de perfil e proteção do último administrador

No projeto de testes, a tabela `profiles` tem policy de SELECT apenas para o próprio usuário ou admin; não existe policy de UPDATE/DELETE para authenticated. A função `protect_profile_role` também rejeita alterações de papel que não venham de postgres/supabase_admin/service_role.

### Testes executados

- Sob identidade authenticated do instrutor A, tentativa de alterar o próprio role para admin: 0 linhas afetadas.
- Tentativa de estender diretamente `instructor_access_until` por 100 anos: 0 linhas afetadas.
- Tentativa de apagar o próprio perfil: 0 linhas afetadas.
- Em transação isolada e revertida, um perfil sintético existente foi temporariamente promovido a admin pelo contexto postgres; tentativa de rebaixar o único admin foi bloqueada com SQLSTATE 23514.
- Na mesma transação, tentativa de excluir o único admin também foi bloqueada com SQLSTATE 23514.
- A transação foi revertida; os dois perfis de teste continuam instrutores, sem perfil admin sintético persistente.

Esses testes confirmam a proteção de último administrador no nível do banco sem criar contas Auth nem manter alterações de role.


## Testes positivos das RPCs administrativas financeiras

Para validar as quatro RPCs administrativas sem criar uma conta Auth, um dos dois perfis sintéticos existentes foi temporariamente promovido a admin dentro de uma transação no projeto de testes. O papel foi revertido automaticamente com ROLLBACK; nenhum perfil admin ficou persistido.

Resultados:
- `admin_create_sale`: criou 1 venda, 1 item, 1 lançamento financeiro; produto físico foi classificado como `produto`; resultado JSON trouxe total de 20 e zero aulas adicionadas.
- `admin_refund_sale_product`: devolveu 1 unidade, valor 10, e registrou 1 lançamento financeiro de saída.
- `admin_refund_sale_lessons`: devolveu 2 aulas, valor 20, reduziu o saldo de 7 para 5 aulas compradas e de 7 para 5 restantes (as 2 aulas haviam sido adicionadas pela venda administrativa anterior na mesma transação).
- `admin_delete_sale`: excluiu a venda criada, seu item e o lançamento financeiro associado.
- Todas as operações e fixtures foram revertidas.

As definições das cinco RPCs financeiras no banco de testes foram comparadas com o original. Após normalizar somente a comparação de papel para o operador null-safe aplicado na branch, os corpos são equivalentes; não foram identificadas outras diferenças funcionais.


## Correção de status no painel de atendimento WhatsApp

### Incompatibilidade identificada

O arquivo `whatsapp-panel.js` atualizava diretamente `ai_requests.atendimento_status` pelo cliente. No banco original, `authenticated` tem somente SELECT em `ai_requests`; não tem UPDATE. Assim, o seletor de status do painel não podia salvar a alteração diretamente, mesmo com a policy de leitura permitindo exibir os pedidos.

### Correção preparada na branch de testes

- A Edge Function `admin-manage-instructors` ganhou a ação `update_whatsapp_request_status`.
- A ação exige perfil `admin`, valida UUID e aceita apenas `pendente`, `em_atendimento`, `concluido` ou `cancelado`.
- O UPDATE com service_role filtra simultaneamente por ID, owner_id da conta autenticada, canal WhatsApp e tipo de solicitação de atendimento humano.
- Retorna 404 se não houver pedido pertencente ao administrador autenticado.
- O painel agora chama a Edge Function em vez de tentar UPDATE direto via cliente.

### Verificação

- Revisão estática confirmou que instrutores expirados, instrutores ativos e alunos não conseguem usar a ação: os bloqueios gerais de papel na Edge Function acontecem antes do bloco, e a ação exige admin.
- No projeto de testes, uma transação sintética com service_role simulou os filtros do UPDATE: 1 pedido do proprietário autenticado foi atualizado e 1 pedido de outro proprietário permaneceu `pendente`.
- Nenhum pedido sintético persistiu (ROLLBACK).
- Não houve deploy nem chamada HTTP da Edge Function; a validação dinâmica com JWT real continua pendente.


## Revisão dos triggers de ciclo de vida do Supabase Auth

Foram lidas as três funções de trigger do projeto de testes:

- `handle_new_auth_user_profile()`: cria perfil com role fixa `instrutor`; usa metadados do usuário somente para nome e nunca aceita role de `raw_user_meta_data`. Instrutores novos ficam sem autorização até liberação administrativa, pois a validade de acesso não é definida pelo cadastro público.
- `link_student_account_from_invite()`: só tenta vincular quando os metadados contêm os três UUIDs esperados (attempt_id, student_id e instructor_id), e o cadastro reservado corresponde ao owner, ao attempt_id, à janela de 15 minutos, ao e-mail normalizado e continua sem user_id. É SECURITY DEFINER com search_path vazio e sem EXECUTE concedido diretamente aos papéis de cliente.
- `clear_student_account_link_on_user_delete()`: trigger BEFORE DELETE em auth.users, SECURITY DEFINER owner postgres, limpa user_id e campos de reserva antes da ação da FK ON DELETE SET NULL; assim, a proteção de campos internos é executada no contexto privilegiado esperado.

As três funções não concedem EXECUTE direto a anon/authenticated/service_role; são chamadas pelos triggers. Nenhuma conta Auth foi criada ou excluída durante a revisão. O comportamento real de criação/exclusão de conta não foi exercitado por HTTP; foi revisado estaticamente e por catálogo.


### Pré-verificação read-only no banco original para FKs compostas

Foi executada a mesma consulta agregada somente de leitura no Supabase original. Resultado: zero relacionamentos cross-owner nas sete combinações que receberiam FKs compostas (lessons/student, lessons/vehicle, sales/student, sale_items/sale, sale_items/product, financial_transactions/student e financial_transactions/sale).

Isso indica que, no estado observado, os dados existentes não impediriam a validação dessas FKs no original. A migration permanece apenas na branch e no projeto de testes; a pré-verificação não é autorização para aplicá-la no original.


Também foram testadas as mesmas sete relações por UPDATE, além de uma tentativa de trocar o owner_id do cadastro-pai:
- as sete alterações de referências para registros de outro proprietário foram bloqueadas com SQLSTATE 23503;
- a tentativa de alterar o owner_id do aluno que já possui aulas foi bloqueada pela FK composta `lessons_student_owner_fkey`;
- todas as fixtures e alterações estavam dentro de uma transação revertida.


## Estado consolidado ao final desta rodada

Projeto de testes `voyjssflroiwdyaacthh`:
- ACTIVE_HEALTHY, PostgreSQL 17.12, região São Paulo.
- 19 migrations registradas no histórico do projeto de testes, incluindo FKs compostas e alinhamento das ações referenciais.
- 13 tabelas públicas, RLS habilitado em todas, 38 policies nas 11 tabelas com policies, 35 índices e 67 constraints públicas.
- 2 perfis Auth sintéticos, ambos instrutores; zero perfis admin persistentes.
- 3 alunos, 3 veículos e 3 aulas, todos com nomes/identificadores sintéticos.
- zero vínculos user_id persistentes, zero vendas, itens, lançamentos financeiros, produtos ou registros de IA/WhatsApp.
- 15 funções public/private e 8 triggers não internos; nenhum usuário Auth foi criado ou excluído nesta rodada.
- nenhuma Edge Function implantada no projeto de testes; os testes HTTP/JWT real permanecem pendentes.

Supabase original `ydyqagqsuqntuibzgwzd`:
- apenas consultas de leitura nesta rodada;
- pré-checagem de FKs compostas encontrou zero relações cross-owner nas sete combinações;
- permanece sem colunas de vínculo de aluno, sem trigger de proteção de vínculo e sem as FKs compostas;
- nenhum deploy, migration, DDL/DML, grant ou alteração de configuração foi executado.

Branch de testes:
- migrations, Edge Functions e painel WhatsApp atualizados e documentados;
- validações de código foram estáticas; nenhuma alteração foi implantada;
- a branch continua separada da produção.


## Isolamento do cache local administrativo entre contas

### Achado no frontend

O painel administrativo usava uma única chave `localStorage` (`marcus_instrutor_novo_v1`) para todos os administradores do mesmo navegador. Além disso, o painel era carregado uma única vez por página. Depois de sair e entrar com outra conta administrativa sem recarregar a página, o objeto `db` em memória poderia continuar contendo dados do administrador anterior. Se a consulta à nuvem falhasse ou a conta nova ainda não tivesse registros, os dados locais antigos poderiam aparecer.

Isso era uma exposição local de dados entre contas no mesmo navegador, não uma quebra das policies RLS do banco.

### Correção preparada na branch

- O cache local passa a usar uma chave por usuário: `marcus_instrutor_novo_v1:user:<auth.uid>`.
- O script só lê e grava a chave correspondente ao ID da sessão autenticada.
- A identidade da chave é comparada com o ID retornado pelo Supabase antes de carregar os dados operacionais.
- A página guarda o ID do admin na sessionStorage antes de carregar os scripts administrativos.
- Se uma conta diferente entrar sem logout, a página recarrega para inicializar o painel com a nova identidade.
- Ao receber `SIGNED_OUT`, remove o ID do contexto e recarrega a página.
- A antiga chave global não é lida para exibição nem sobrescrita. Se houver dados antigos nela, são preservados no navegador e o admin recebe um aviso de que precisam ser conferidos antes de qualquer importação.

### Verificação estática

Foram confirmados:
- nenhuma leitura automática da chave global antiga;
- nenhuma gravação na chave global antiga;
- todas as gravações locais usam a chave por usuário;
- troca de conta força recarga;
- logout remove o identificador da conta;
- os dados antigos não são apagados.

**Limite:** não foi executado teste de navegador com duas sessões reais. A correção está apenas na branch de testes e não foi implantada. Dados antigos sem proprietário identificado permanecem preservados e não foram migrados automaticamente.


Também foram atualizados os parâmetros de versão dos scripts administrativos em `index.html` para que o navegador solicite as versões novas de `script.js` e `whatsapp-panel.js`, evitando reutilização de uma URL antiga após a futura publicação da branch.
Os testes estáticos de isolamento do cache foram acrescentados a `scripts/test-student-link-flow.mjs`; não foram executados em navegador ou runtime Node nesta sessão.


### Compatibilidade com a Edge Function atualmente implantada

A comparação read-only confirmou que a função `admin-manage-instructors` atualmente implantada no Supabase original ainda não contém a ação `update_whatsapp_request_status` nem a verificação de conta já vinculada adicionadas na branch. Portanto, o novo painel e a Edge Function da branch precisam ser publicados juntos em um futuro deploy autorizado; não se deve publicar apenas o frontend.
Nenhuma publicação foi feita nesta rodada.


## Atualização de validação das migrations mais recentes — 21/11/2026

Esta rodada foi executada exclusivamente no projeto isolado `voyjssflroiwdyaacthh` (PostgreSQL 17.12). O projeto original `ydyqagqsuqntuibzgwzd` não foi consultado nem alterado nesta etapa.

### Migrations aplicadas no projeto isolado

Foram aplicadas, em sequência, as migrations versionadas na branch:

- `20261121170000_add_contractor_identity_to_app_settings.sql` — operação idempotente; as colunas já existiam no schema de teste.
- `20261121190000_remove_student_app_access.sql`.
- `20261121210000_add_fk_indexes_and_rls_initplan.sql`.
- `20261121220000_instructor_profile_and_sale_management.sql`.
- `20261121230000_harden_instructor_sale_delete_role_check.sql`.
- `20261121231000_move_instructor_name_lookup_to_private_helper.sql`.

Todas retornaram sucesso. A migration de identificação do contratante foi registrada novamente no histórico de teste porque a estrutura já estava presente, mas não havia registro correspondente com o nome/versão da branch. Nenhuma dessas migrations foi aplicada ao projeto original.

### Verificações SQL transacionais

Com identidades sintéticas e transações revertidas:

- Instrutor autenticado tentou remover acesso de um UUID de aluno sem vínculo: a RPC rejeitou com `P0002`.
- Instrutor autenticado tentou excluir uma venda inexistente: a função passou pela verificação de papel e rejeitou a busca fora do próprio `owner_id`.
- Instrutor tentou consultar o nome do instrutor pela RPC de aluno: rejeitado por papel incompatível.
- Instrutor tentou consultar a agenda pela RPC de aluno: rejeitado por papel incompatível.
- Em teste positivo, uma identidade sintética foi temporariamente colocada como `usuario` e vinculada a um cadastro sintético; `get_my_instructor_name()` retornou o nome do instrutor responsável. A transação foi revertida.

Resultado: **4 verificações de bloqueio por papel/escopo e 1 verificação positiva do nome do instrutor passaram** no PostgreSQL isolado. Não houve exclusão persistente de conta, venda, aluno ou histórico.

### ACLs e Advisors após as migrations

Consulta de catálogo confirmou:

- `remove_student_app_access`: SECURITY DEFINER, owner `postgres`, `search_path` vazio; sem EXECUTE para `anon`, com EXECUTE para `authenticated`, conforme o fluxo da tela de Acessos.
- `delete_my_sale` e `get_my_instructor_name`: SECURITY INVOKER, owner `postgres`, `search_path` vazio; EXECUTE apenas para `authenticated`.
- `private.get_my_instructor_name_internal`: SECURITY DEFINER, owner `postgres`, `search_path` vazio; EXECUTE para `authenticated`, necessário ao wrapper público. A exposição do schema `private` pela Data API ainda deve ser confirmada nas configurações do projeto.
- Os dez índices previstos na migration `20261121210000` foram encontrados no catálogo.

Security Advisors no ambiente isolado:
- INFO: `whatsapp_conversations` e `whatsapp_messages` com RLS sem policies; desenho backend-only, sem grants para clientes.
- WARN: `get_my_scheduled_lessons()` e `remove_student_app_access()` são RPCs públicas SECURITY DEFINER executáveis por authenticated. Ambas validam identidade/papel/escopo internamente; manter como itens de revisão e considerar wrappers SECURITY INVOKER com helpers privados em uma etapa posterior.
- WARN: proteção contra senhas vazadas desabilitada; não alterada.

Performance Advisors:
- Restou 1 FK sem índice de cobertura: `students_owner_id_fkey`.
- Os índices recém-criados aparecem como não utilizados porque o banco de teste tem pouco volume e não representa carga real; não remover com base apenas nesse Advisor.
- Permanecem alertas de múltiplas policies permissivas em tabelas com políticas distintas para admin e instrutor; revisar otimização sem enfraquecer o isolamento.

### Limites desta rodada

- As verificações foram SQL dentro do banco de teste, com claims simuladas e rollback; não são chamadas HTTP/PostgREST com JWT real.
- Não houve teste de exclusão real de conta Auth vinculada, envio de convite/e-mail ou teste concorrente.
- Não foram executados os scripts Node completos nem os testes Deno.
- O Preview da Vercel continua associado ao commit `fb3ae47c165c03774e5c62acc8149b03e44b1ee1` e READY; isso confirma build/publicação, não validação funcional autenticada.
- A PR #5 continua draft, baseada em `feature/relatorios-instrutor-app`. Essa branch permanece divergente de `main` (567 commits à frente e 4 atrás, na comparação consultada); não fazer merge direto sem plano de consolidação.
- Nenhuma ação foi executada em produção, no Supabase original, na branch `main` ou em deploy de produção. Nenhuma ação paga foi realizada.


## Separação de fixtures e migrations implantáveis — 21/11/2026

As sete migrations de reconstrução do banco isolado foram movidas integralmente para `test-fixtures/supabase-migrations/`, fora de `supabase/migrations/`. Os arquivos originais foram preservados, e o teste estático `scripts/test-student-link-flow.mjs` foi atualizado para ler a fixture do novo caminho. A pasta contém um README com a proibição explícita de usar essas fixtures em produção.

Objetivo: impedir que `supabase db push` trate scripts de reconstrução do ambiente descartável como migrations implantáveis. As migrations reais de evolução do produto permanecem em `supabase/migrations/`.

A separação é uma proteção de organização do repositório, não uma autorização para executar `db push`. Antes de qualquer implantação, ainda será necessário revisar a cadeia completa de migrations contra o histórico real do projeto de destino e validar o diff em ambiente isolado.


## Atualização: isolamento autenticado parcial e hardening de perfis — 21/11/2026

Projeto de testes isolado: `voyjssflroiwdyaacthh`. Nenhuma alteração foi feita no projeto original.

### Testes transacionais com duas contas de instrutor

Com duas identidades sintéticas, `SET LOCAL ROLE authenticated` e claims simuladas:

- RLS de leitura aprovado em `students`, `vehicles`, `lessons`, `sales`, `sale_items` e `financial_transactions`: cada conta visualizou somente linhas do próprio owner. As três tabelas financeiras/comerciais estavam vazias, portanto não houve teste positivo com registros reais de venda.
- Tentativas de UPDATE/DELETE de aluno, veículo e aula de outro owner não afetaram linhas.
- INSERT de aluno/veículo com owner alheio e INSERT de aula ligada a aluno/veículo de outro owner foram bloqueados com SQLSTATE `42501`.
- Fixtures temporárias de `products` e `app_settings` provaram que cada instrutor vê uma linha própria e zero linhas do outro owner.
- Um instrutor temporariamente expirado não visualizou registros operacionais em nenhuma das seis tabelas consultadas.

Todas as operações foram feitas em transações com `ROLLBACK`. Claims simuladas não equivalem a autenticação HTTP/PostgREST com JWT real.

### RPCs

- `remove_student_app_access(uuid)` e `delete_my_sale(uuid)`: instrutor expirado bloqueado com `42501`; instrutor ativo passou pelo guard de papel/validade e chegou à validação do registro inexistente (`P0002`).
- `admin_create_sale`, `admin_delete_sale`, `admin_refund_sale_lessons` e `admin_refund_sale_product`: chamadas diretas por instrutor foram bloqueadas pelo guard administrativo com a mensagem `Acesso administrativo obrigatório.`.

### Privilégios de profiles

A migration `20261121260000_restrict_profile_insert_delete.sql` foi aplicada no projeto de testes. `authenticated` agora mantém SELECT e UPDATE somente de `profiles.nome`; INSERT e DELETE foram revogados em nível de tabela/coluna. Teste transacional confirmou atualização do próprio nome e bloqueio de INSERT/DELETE.

### Estado versionado

Na branch `feature/acessos-alunos-instrutor`:

- 20 migrations implantáveis em `supabase/migrations`;
- sete fixtures SQL mantidas em `test-fixtures/supabase-migrations`;
- nenhum arquivo `restore_*` ou `reconcile_financial_rpc_definitions` permanece em `supabase/migrations`;
- PR #5 continua aberta, draft e sem merge.

### Pendências que continuam explícitas

- JWT real via HTTP/PostgREST, fluxo completo de aluno e RPC de agenda;
- teste com registros sintéticos de venda/itens/transações para cenários positivos, cruzamento e estorno;
- testes reais de Admin/Edge Functions;
- confirmação da lista de schemas expostos pela Data API (em especial `private`);
- habilitar proteção contra senhas vazadas após validação administrativa;
- revisar warnings intencionais de RPCs SECURITY DEFINER públicas, sem remover os guards necessários.

Não houve deploy, merge, operação paga, envio de convite ou alteração no Supabase original.


## Atualização: correção de venda e testes financeiros — 21/11/2026

Foi identificada uma inconsistência na RPC `create_instructor_sale`: o saldo de aulas aumentava, mas os campos de aulas e valores do item da venda não eram preenchidos. Isso fazia com que a exclusão da venda não devolvesse as aulas ao saldo e impedia a base correta para devolução administrativa.

Migration criada e aplicada somente no projeto isolado `voyjssflroiwdyaacthh`:

`20261121270000_fix_instructor_sale_item_lesson_tracking.sql`

A função agora grava `tipo_item`, `aulas_contratadas`, `aulas_devolvidas`, `valor_por_aula`, `valor_devolvido` e `valor_liquido`, e valida preço/limites do produto. O cálculo de aulas contratadas segue as regras já usadas pela RPC administrativa de vendas.

### Evidências transacionais posteriores à correção

- Venda própria adiciona cinco aulas e persiste cinco aulas contratadas no item.
- Exclusão de venda não utilizada devolve o saldo a zero e remove venda/lançamento.
- Repetição da chamada com o mesmo ID não duplica itens nem saldo.
- Venda não pode ser excluída depois que uma aula vinculada foi realizada.
- Devolução de duas aulas em venda de R$ 80,00 gerou R$ 32,00 de saída e reduziu saldo de cinco para três.
- Devolução de uma unidade de produto de R$ 30,00 gerou R$ 30,00 de saída.
- Excesso de devolução de aulas ou produtos foi bloqueado sem alteração persistente.
- UPDATE/DELETE de vendas, itens e transações de outra conta afetaram zero linhas; INSERTs cruzados foram bloqueados por RLS.

Foram registradas 41 verificações aprovadas após a correção, todas em transações revertidas com claims simuladas. A lista detalhada e as limitações estão em `docs/TESTE-RLS-ISOLAMENTO-INSTRUTORES.md`.

A migration eleva o conjunto para 21 migrations implantáveis. O projeto original continua intocado. Não houve teste HTTP com JWT real, validação de UI, merge ou deploy.


Complemento da validação financeira:
- pacote com faixa mínima/máxima e serviço de múltiplas aulas: 12 aulas adicionadas e persistidas corretamente;
- quantidade abaixo do mínimo do pacote: bloqueada;
- chamada de `delete_my_sale` para venda de outro owner: bloqueada com `P0002`.


## Atualização: agenda do aluno e proteção do vínculo — 21/11/2026

No projeto isolado `voyjssflroiwdyaacthh`, foram criadas identidades Auth sintéticas e dois cadastros de aluno, cada um ligado a um instrutor diferente. Com claims simuladas:

- cada aluno recebeu somente sua própria aula agendada, nome e veículo corretos;
- nenhum dos dois viu a aula do outro;
- usuário sem vínculo recebeu `P0002 / CONTA_SEM_VINCULO`;
- instrutor foi bloqueado ao chamar a RPC exclusiva do aluno;
- aluno não obteve linhas por SELECT direto em `students` ou `lessons`, mas recebeu a agenda pela RPC;
- a RPC limpou a reserva `invited_at`/`invite_attempt_id`;
- trigger bloqueou alteração ou inserção direta de vínculo Auth por instrutor (`42501`);
- Edge Function verifica se a conta Auth já está ligada a outro cadastro, com índice único parcial `students_user_id_unique` como proteção adicional.

Foram registradas 14 verificações/asserções aprovadas em transações revertidas. Isso não substitui login real, JWT emitido pelo Auth, e-mail/convite implantado ou teste HTTP. Os detalhes estão em `docs/TESTE-RLS-ISOLAMENTO-INSTRUTORES.md`.


## Atualização: trigger de convite e remoção de acesso — 21/11/2026

No projeto isolado, testes SQL transacionais confirmaram:

- trigger de vínculo Auth: metadados e reserva ativa correspondentes criam o vínculo; e-mail divergente e reserva expirada não criam vínculo (3 verificações);
- RPC `remove_student_app_access`: remove a identidade Auth do aluno da própria conta e preserva o cadastro/histórico, com limpeza do `user_id` pelo trigger;
- tentativa de remover vínculo de aluno de outro owner é bloqueada com `P0002`, preservando a identidade Auth estrangeira (4 verificações).

Tudo foi revertido. Não houve e-mail, convite persistente, chamada HTTP da Edge Function nem alteração no Supabase original.


Complemento da área do aluno:
- RPC de nome do instrutor: aluno A recebeu nome do owner A, aluno B recebeu nome do owner B; instrutor foi bloqueado ao chamar a RPC exclusiva do aluno (3 verificações).
- Revisão estática de `admin-manage-instructors` confirmou validação de bearer token, papel do chamador, validade do acesso de instrutor, owner scope do cadastro, reserva/attempt ID e confirmação de e-mail. Sem execução HTTP ou SMTP.

O conjunto de testes SQL da área de aluno, vínculo, convite e remoção soma 24 verificações/asserções aprovadas, todas com dados sintéticos e rollback. Não é homologação HTTP com JWT real.


## Atualização: índice de cobertura da FK de alunos — 21/11/2026

O Performance Advisor identificou que `students.owner_id` não tinha índice próprio para cobrir a FK para `auth.users`. Foi criada e aplicada somente no banco isolado a migration:

`20261121280000_add_students_owner_fk_index.sql`

O índice `students_owner_id_idx` foi confirmado no catálogo. A recomendação `unindexed_foreign_keys` deixou de aparecer no Performance Advisor. O índice aparece como ainda não utilizado porque o banco de testes tem pouco volume; manter a decisão para revisão quando houver carga representativa.

O conjunto versionado passa a ter 22 migrations implantáveis. Os avisos de políticas permissivas sobrepostas continuam sem alteração para evitar mudança de semântica RLS sem testes CRUD completos.


## Atualização: revisão de API, permissões do schema private e CI — 21/11/2026

### Schema `private`

No projeto isolado, a consulta de privilégios confirmou:
- `anon`: sem USAGE no schema `private`;
- `authenticated`: com USAGE no schema `private`;
- `service_role`: sem USAGE;
- `private.get_my_scheduled_lessons_internal()`: sem EXECUTE direto para anon/authenticated;
- `private.current_app_role()`: EXECUTE para authenticated, usada por RPCs públicas SECURITY INVOKER de autorização;
- `public.get_my_scheduled_lessons()` e `public.remove_student_app_access(uuid)`: SECURITY DEFINER, sem EXECUTE para anon e com EXECUTE para authenticated; ambas têm `search_path` vazio e guards internos testados.

A consulta SQL não revela a lista de schemas configurada no PostgREST/API. Portanto, **não foi possível confirmar pelo banco se `private` está exposto na Data API**. Não revogar USAGE nem mudar as funções neste passo: várias RPCs públicas SECURITY INVOKER dependem de `private.current_app_role()`. A confirmação da lista de schemas deve ser feita em Project Settings → API → Exposed schemas, somente no projeto isolado. Se `private` estiver listado, retirar da lista de schemas expostos é preferível a alterar a semântica das RPCs.

### Edge Functions e CI

- O projeto Supabase isolado não tem Edge Functions implantadas; nenhum teste HTTP ou JWT real foi executado.
- Não há workflow run associado à branch `feature/acessos-alunos-instrutor` nem check run no commit `dadc22d32b8fa5d4ecc1548d5969a7226da0b02e`. O histórico recente de Actions retornou apenas o workflow de Pages na branch `main`, não testes da PR.
- A PR #5 continua aberta em Draft, base `feature/relatorios-instrutor-app`.
- Comparação atual com `main`: branch divergente, 616 commits à frente e 4 atrás. Não retargetar nem fazer merge automaticamente; é necessária uma estratégia de consolidação e revisão de diff antes da integração.

### Configuração Auth pendente

O Security Advisor do projeto isolado ainda aponta proteção contra senhas vazadas desabilitada. A configuração não é exposta pelas consultas SQL usadas nesta auditoria e não foi alterada. Habilitar somente pelo painel de Auth do projeto de testes, após revisão da política de senha; nunca no projeto original sem autorização específica.


### Cobertura estática ampliada

O script `scripts/test-instructor-workflow.mjs` recebeu dois testes estáticos adicionais:
- a migration de criação de venda deve validar papel/owner, persistir `aulas_contratadas`, `valor_por_aula`, `valor_liquido`, movimentação financeira e saldo do aluno;
- a migration de índice deve declarar `students_owner_id_idx` sobre `students(owner_id)`.

Os testes foram adicionados ao repositório, mas não foram executados neste ambiente. Os resultados SQL transacionais relatados nas seções anteriores permanecem evidências separadas.


### Correção da matriz de acesso a produtos e configurações

A matriz de testes foi alinhada ao comportamento observado: `products` e `app_settings` permitem leitura por owner, de modo que instrutor A e B visualizam somente seus próprios registros. A expectativa anterior de negar leitura a instrutores foi removida. O resultado cobre leitura isolada com fixtures; escritas cruzadas nessas tabelas ainda precisam de teste.
