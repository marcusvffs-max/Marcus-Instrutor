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
