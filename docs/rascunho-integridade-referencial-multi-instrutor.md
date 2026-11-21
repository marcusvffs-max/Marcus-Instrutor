# Rascunho de integridade referencial multi-instrutor

Data: 20/11/2026  
Status: proposta técnica para revisão; NÃO executar no Supabase.

## 1. FKs atualmente encontradas

A consulta a `pg_constraint` confirmou:
- `students.owner_id -> auth.users.id`
- `vehicles.owner_id -> auth.users.id`
- `lessons.owner_id -> auth.users.id`
- `sales.owner_id -> auth.users.id`
- `sale_items.owner_id -> auth.users.id`
- `financial_transactions.owner_id -> auth.users.id`
- `products.owner_id -> auth.users.id`
- `profiles.id -> auth.users.id`
- `lessons.student_id -> students.id`
- `lessons.vehicle_id -> vehicles.id`
- `sales.student_id -> students.id`
- `sale_items.sale_id -> sales.id`
- `sale_items.product_id -> products.id`
- `financial_transactions.student_id -> students.id`
- `financial_transactions.sale_id -> sales.id`

Não foi encontrada FK para `app_settings.owner_id` no catálogo consultado.

As FKs de owner apontam para Auth, não para profiles. Isso impede owner_id inexistente em Auth, mas não garante que o usuário tenha perfil ativo e papel permitido. A criação de perfil deve preceder a liberação da conta.

## 2. Regra de consistência necessária

As FKs atuais não garantem igualdade de owner entre pai e filho. O desenho precisa impor:
- lessons: aluno e veículo (quando informado) pertencem ao mesmo owner da aula;
- sales: aluno (quando informado) pertence ao owner da venda;
- sale_items: venda pertence ao owner do item;
- financial_transactions: aluno e venda (quando informados) pertencem ao owner da movimentação.

`sale_items.product_id` também deve referenciar produto do mesmo owner do item. As policies de `sale_items` e as RPCs de venda exigem produto com `owner_id` igual ao usuário autenticado. O catálogo que o webhook WhatsApp consulta diretamente no owner admin é uma leitura separada e não é gravado em `sale_items`; se um produto for disponibilizado a um instrutor, a venda usa o registro de produto pertencente àquele instrutor.

## 3. Estratégia técnica recomendada

Preferir chaves únicas compostas nos pais (`id, owner_id`) e FKs compostas nos filhos. Antes disso:
1. confirmar que não há duplicidade em `(id, owner_id)` (a PK em id já torna pares únicos);
2. confirmar zero linhas inconsistentes em cada relação;
3. confirmar versão PostgreSQL e suporte à cláusula de exclusão parcial por coluna quando necessária;
4. decidir o comportamento de exclusão, preservando a semântica atual de `ON DELETE SET NULL` para student_id/sale_id quando isso for desejado;
5. criar constraints com nomes explícitos e avaliar `NOT VALID` seguido de validação, quando aplicável;
6. considerar lock e impacto operacional antes de aplicar em produção.

Não substituir FKs atuais automaticamente. Uma FK composta pode coexistir com FK atual durante migração, mas ações de exclusão precisam ser planejadas para não produzir conflito ou tentar definir owner_id como NULL.

Alternativa aceitável: triggers de validação de ownership em INSERT/UPDATE, com função cuidadosamente protegida e teste de concorrência. Não confiar somente nas policies SELECT ou no frontend.

## 4. app_settings

A tabela usa `owner_id` como chave primária, mas não apareceu FK para Auth no catálogo. Como o acesso ficará admin-only na primeira fase:
- avaliar FK `app_settings.owner_id -> auth.users.id` ou -> `profiles.id`;
- decidir comportamento ao encerrar uma conta;
- manter configurações por owner, sem tratar como uma configuração global compartilhada.

## 5. Verificações adicionais antes do SQL consolidado

A consulta de grants anterior verificou privilégios de tabela, mas ainda é necessário auditar:
- grants por coluna;
- membership/inheritance de roles;
- default privileges para futuras tabelas;
- grants de schema e funções expostas;
- privilégios de sequences (se forem adicionadas colunas serial no futuro).

O script RLS atual revoga privilégios de tabela de PUBLIC, anon e authenticated, mas não deve ser declarado completo até essa auditoria adicional.

## 6. Estado
Somente consultas de catálogo. Nenhuma constraint, FK, trigger, índice, policy, grant ou dado foi alterado. Não houve execução de DDL.


## Correção após nova consulta ao catálogo (20/11/2026)

A afirmação da seção 1 sobre `app_settings.owner_id` estava incorreta: consulta completa a `pg_constraint` confirmou `app_settings_owner_id_fkey` referenciando `auth.users(id)` com comportamento NO ACTION. A informação foi corrigida e detalhada em `docs/revisao-integridade-fks-compostas-instrutores.md`.

A mesma revisão confirmou os comportamentos atuais de exclusão:
- lessons -> students/vehicles: NO ACTION;
- sales -> students: SET NULL;
- sale_items -> sales: CASCADE;
- financial_transactions -> students/sales: SET NULL;
- sale_items -> products: SET NULL.

As sete consultas de inconsistência entre owner_id dos registros relacionados retornaram zero linhas inconsistentes na auditoria de 20/11/2026, incluindo sale_items.product_id. As tabelas estavam vazias naquele momento; isso não elimina a necessidade de constraints para os novos dados.

A solução proposta agora é adicionar chaves únicas compostas `(id, owner_id)` e FKs compostas entre aulas/alunos/veículos, vendas/alunos, itens/vendas/produtos e movimentações/alunos/vendas. Para relações opcionais com exclusão SET NULL, o desenho usa `ON DELETE SET NULL (coluna)`, preservando `owner_id`. A relação de produto em `sale_items` também exige o mesmo owner.

Nenhuma constraint foi executada.
