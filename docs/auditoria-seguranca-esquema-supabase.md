# Auditoria de segurança e esquema — relatórios por instrutor

Data da consulta: 20/11/2026
Projeto Supabase: `ydyqagqsuqntuibzgwzd`
Ambiente: leitura somente; nenhuma alteração foi executada.

## 1. Contagem atual de registros

| Tabela | Registros |
|---|---:|
| profiles | 1 |
| students | 0 |
| lessons | 0 |
| vehicles | 0 |
| sales | 0 |
| sale_items | 0 |
| financial_transactions | 0 |

O único perfil existente é Marcus, com papel `admin`. A tabela `products` contém 5 registros. Portanto, ainda não há dados de alunos, aulas ou financeiro no Supabase para alimentar relatórios.

## 2. Esquema confirmado

### students
- `id uuid` (PK)
- `owner_id uuid` (FK para auth.users)
- `nome text`, `telefone text`, `cpf text`, `endereco text`
- `categoria text`, `status text`
- `aulas_compradas integer`, `aulas_restantes integer`

### lessons
- `id uuid` (PK), `owner_id uuid`
- `student_id uuid` (FK students.id)
- `vehicle_id uuid` (FK vehicles.id, nullable)
- `data_aula date`, `horario time`, `numero_aula integer`
- `status text`, `observacoes text`, `assinatura text`

### vehicles
- `id uuid` (PK), `owner_id uuid`
- `nome text`, `tipo text`, `categoria text`, `placa text`

### financial_transactions
- `id uuid` (PK), `owner_id uuid`
- `student_id uuid` (nullable), `sale_id uuid` (nullable)
- `tipo text`, `descricao text`, `valor numeric`
- `data_movimento date`, `status text`

### sales / sale_items / products
- `sales`: owner_id, student_id, data_venda, total, forma_pagamento, status, observacoes.
- `sale_items`: owner_id, sale_id, product_id, descricao, quantidade, valor_unitario, subtotal.
- `products`: owner_id, nome, tipo, descricao, preco, quantidade_aulas, ativo e campos adicionais de pacote.

### profiles
- `id uuid` (PK e FK auth.users.id), `nome text`, `role text`.
- CHECK limita role a `admin` ou `instrutor`; default `instrutor`.

## 3. Políticas RLS encontradas

RLS está habilitado nas tabelas examinadas.

- `students`, `lessons`, `vehicles`: políticas atuais permitem SELECT, INSERT, UPDATE e DELETE para qualquer usuário autenticado sobre linhas cujo `owner_id = auth.uid()`. Ainda não implementam a distinção admin/instrutor pretendida.
- `app_settings`: mesmas quatro operações por owner_id; o rascunho pretende torná-la exclusiva do admin.
- `profiles`: SELECT, INSERT e UPDATE próprios. A política de INSERT só exige `id = auth.uid()`; a política de UPDATE só exige que a linha continue com o próprio id. Não há trigger de proteção de role encontrado. Como a coluna `role` é gravável, o conjunto atual de políticas permite tentativa de inserir/alterar o próprio papel para admin. Isso é um bloqueio de segurança prioritário antes de criar contas de instrutor.
- `products`: políticas atuais são admin-only, mas também exigem `owner_id = auth.uid()`.
- `sales`, `sale_items`, `financial_transactions`: RLS está habilitado, mas não foram encontradas políticas. Sem políticas, operações via cliente ficam bloqueadas mesmo para admin; o rascunho da PR #4 prevê criá-las.
- Nenhum trigger foi encontrado no schema public durante a consulta.

## 4. Revisão do rascunho SQL da PR #4

O rascunho cobre parte importante do modelo, mas ainda NÃO deve ser aplicado.

Pontos a corrigir/confirmar antes de execução:

1. A política de `profiles` precisa ser planejada junto com o gerenciamento de usuários: admin deve conseguir listar/gerenciar perfis; instrutor não pode atribuir ou alterar papel. O rascunho atual não cria política administrativa de leitura/gerenciamento de perfis.
2. A criação de contas Auth e perfis deve ocorrer por fluxo administrativo confiável no servidor, nunca permitindo que o navegador escolha livremente `role='admin'`. O trigger proposto ajuda, mas o fluxo completo ainda não existe/foi verificado.
3. A função `current_app_role()` é SECURITY DEFINER. Antes de adotá-la, restringir a execução e considerar colocá-la em schema não exposto, com validação explícita de usuário autenticado, conforme recomendações atuais do Supabase. Não confiar em metadados editáveis pelo usuário para autorização.
4. Revisar os joins: além de RLS por tabela, confirmar que os registros relacionados têm o mesmo `owner_id` e que `student_id`/ `vehicle_id` não permitem referências cruzadas entre instrutores. RLS individual em cada tabela não substitui validação da integridade de propriedade em gravações.
5. A tabela `app_settings` é exclusiva do admin no desenho atual; confirmar se instrutores não precisarão de configuração individual antes de fechar a política.
6. Definir se o relatório financeiro de instrutor deve mostrar apenas transações diretamente próprias e se vendas/itens precisam ser incluídos; manter os filtros de status e cancelamento conforme regras do app.

## 5. Consequências para os relatórios

- Relatório individual: consultar `students` por owner_id e `lessons` relacionadas por student_id, incluindo `vehicles` por vehicle_id.
- Período e lista diária: consultar `lessons` filtrando `data_aula`, relacionando aluno e veículo.
- Financeiro: usar `financial_transactions.data_movimento`, não o nome local `data`.
- Vendas: relacionar `sales` a `sale_items` e `products`.
- O modelo Supabase não possui o campo `veiculo.modelo` da versão local; usar `vehicles.nome`/tipo/categoria/placa.
- Não usar os arrays do localStorage como fonte dos relatórios de instrutor.

## 6. Decisão de segurança

Não liberar instrutores ainda. A prioridade é fechar o desenho seguro de `profiles` e do gerenciamento de contas, corrigir o rascunho SQL, validar em ambiente isolado e só então adaptar a interface e as consultas.

Nenhum SQL foi aplicado, nenhum usuário foi criado e nenhum dado foi migrado nesta auditoria.
