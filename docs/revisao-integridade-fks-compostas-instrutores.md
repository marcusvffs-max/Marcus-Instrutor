# Integridade entre instrutores — revisão das FKs compostas

Data: 20/11/2026  
Status: desenho técnico; não executar sem autorização e validação final.

## 1. Resultado da nova consulta

A consulta correta ao catálogo confirmou as FKs existentes e seus comportamentos de exclusão. A consulta anterior que filtrava por `regclass::text` retornou vazio por incompatibilidade do filtro; não significava ausência de FKs.

Comportamentos atuais relevantes:
- `lessons.student_id -> students.id`: NO ACTION.
- `lessons.vehicle_id -> vehicles.id`: NO ACTION.
- `sales.student_id -> students.id`: ON DELETE SET NULL.
- `sale_items.sale_id -> sales.id`: ON DELETE CASCADE.
- `financial_transactions.student_id -> students.id`: ON DELETE SET NULL.
- `financial_transactions.sale_id -> sales.id`: ON DELETE SET NULL.
- `sale_items.product_id -> products.id`: ON DELETE SET NULL.
- `app_settings.owner_id -> auth.users.id`: FK existente (NO ACTION). A documentação anterior que dizia não haver FK estava incorreta e foi corrigida.

Todas as tabelas relacionadas têm `owner_id NOT NULL`. Há registros operacionais no banco; as sete verificações de relações entre owners retornaram zero inconsistências no momento da consulta. Isso não substitui constraints: os dados podem ser inseridos depois.

## 2. Integridade que as FKs simples não garantem

Uma FK simples confirma que o ID relacionado existe, mas não confirma que pertence ao mesmo `owner_id`. O risco é um registro de um instrutor apontar para aluno, veículo ou venda de outro instrutor.

A solução preferida é adicionar chaves únicas compostas nos pais e FKs compostas nos filhos. Na migration final, as FKs compostas substituirão as FKs simples equivalentes na mesma transação, evitando duplicidade. O PostgreSQL 17.11 do projeto suporta `ON DELETE SET NULL (coluna)`, permitindo preservar `owner_id` quando um vínculo opcional for removido.

## 3. DDL proposto — ainda não executado

Antes de aplicar, revisar os nomes e dependências com a migration final. A proposta final é adicionar as constraints compostas e remover as FKs simples equivalentes na mesma transação, após validar os nomes exatos no catálogo. Essa substituição mantém a atomicidade: se qualquer constraint falhar, a transação inteira reverte.

```sql
-- Chaves candidatas para as relações que precisam validar owner.
alter table public.students
  add constraint students_id_owner_key unique (id, owner_id);

alter table public.vehicles
  add constraint vehicles_id_owner_key unique (id, owner_id);

alter table public.sales
  add constraint sales_id_owner_key unique (id, owner_id);

alter table public.products
  add constraint products_id_owner_key unique (id, owner_id);

-- Aula deve apontar para aluno e veículo do mesmo instrutor.
alter table public.lessons
  add constraint lessons_student_owner_fkey
  foreign key (student_id, owner_id)
  references public.students (id, owner_id);

alter table public.lessons
  add constraint lessons_vehicle_owner_fkey
  foreign key (vehicle_id, owner_id)
  references public.vehicles (id, owner_id);

-- Venda pode perder o vínculo com aluno sem apagar owner_id.
alter table public.sales
  add constraint sales_student_owner_fkey
  foreign key (student_id, owner_id)
  references public.students (id, owner_id)
  on delete set null (student_id);

-- Item deve pertencer ao mesmo owner da venda e do produto.
alter table public.sale_items
  add constraint sale_items_sale_owner_fkey
  foreign key (sale_id, owner_id)
  references public.sales (id, owner_id)
  on delete cascade;

alter table public.sale_items
  add constraint sale_items_product_owner_fkey
  foreign key (product_id, owner_id)
  references public.products (id, owner_id)
  on delete set null (product_id);

-- Movimentações preservam owner_id quando aluno ou venda forem removidos.
alter table public.financial_transactions
  add constraint financial_student_owner_fkey
  foreign key (student_id, owner_id)
  references public.students (id, owner_id)
  on delete set null (student_id);

alter table public.financial_transactions
  add constraint financial_sale_owner_fkey
  foreign key (sale_id, owner_id)
  references public.sales (id, owner_id)
  on delete set null (sale_id);
```

### Observações importantes

- A FK composta de `lessons.vehicle_id` aceita `vehicle_id NULL` porque a FK usa MATCH SIMPLE por padrão; se não houver veículo, não há referência a validar.
- A exclusão de uma venda continuará apagando seus itens (`sale_items`) como hoje.
- Ao excluir aluno, vendas e movimentações preservam seus registros e owner, mas ficam sem student_id, como hoje.
- Ao excluir venda, movimentações preservam o histórico e owner, mas ficam sem sale_id, como hoje.
- `sale_items.product_id` também deve pertencer ao mesmo owner do item vendido. As policies de `sale_items` exigem `products.owner_id = auth.uid()`, e `create_instructor_sale`/`admin_create_sale` só selecionam produtos do próprio owner. O catálogo consultado pelo webhook WhatsApp é uma leitura separada de produtos do admin; ele não é uma referência direta de `sale_items`.
- `app_settings.owner_id` já referencia `auth.users(id)`; manter comportamento atual.
- ``products.owner_id` participa da regra de ownership de `sale_items`; o vínculo do catálogo AI usado pelo webhook é separado.

## 4. Segurança das policies

O SQL de RLS já proposto complementa as constraints:
- instrutor só lê linhas próprias;
- aulas verificam aluno e veículo próprios;
- vendas verificam aluno próprio quando informado;
- itens verificam venda própria;
- movimentações verificam aluno e venda próprios;
- admin tem acesso global.

As policies não substituem FKs compostas: policy SELECT limita leitura, mas não garante consistência em todos os caminhos de gravação/backend. As FKs compostas são a barreira no banco.

## 5. Pré-condições e testes antes de produção

1. Confirmar constraints com nomes exatos e inexistência de constraints compostas com os mesmos nomes.
2. Reexecutar as sete consultas de inconsistência antes de DDL.
3. Criar dois instrutores de teste em ambiente isolado autorizado.
4. Tentar criar aula do owner A com aluno B e veículo B; ambas devem falhar.
5. Tentar criar venda de A para aluno B; deve falhar.
6. Tentar criar item de venda de A apontando para venda B; deve falhar.
7. Tentar criar movimentação de A ligada a aluno/venda B; deve falhar.
8. Confirmar exclusões preservando as semânticas listadas.
9. Confirmar que item de venda de A não pode referenciar produto de B; o catálogo usado pelo webhook WhatsApp é uma leitura separada e não é gravado diretamente em sale_items.
10. Verificar consultas e planos de execução para avaliar índices e impacto.

Não criar projeto/branch Supabase pago para teste. Esta observação descrevia apenas o estágio inicial do rascunho. O ambiente isolado de testes foi criado posteriormente, com duas contas Auth sintéticas e fixtures de teste; as migrations de FKs foram aplicadas somente nele.

## 6. Correção de documentação anterior

O documento anterior `rascunho-integridade-referencial-multi-instrutor.md` afirmava que `app_settings.owner_id` não tinha FK. A consulta completa do catálogo mostrou `app_settings_owner_id_fkey -> auth.users(id)`; considerar a informação corrigida neste documento.

## 7. Estado atual

Somente consultas read-only e documentação. Nenhuma alteração foi feita no banco.


## 8. Ajuste após revisão das ações referenciais e índices

A migration deve criar as FKs compostas e, na mesma transação, remover as FKs simples equivalentes já confirmadas no catálogo:
- `lessons_student_id_fkey`
- `lessons_vehicle_id_fkey`
- `sales_student_id_fkey`
- `sale_items_sale_id_fkey`
- `sale_items_product_id_fkey`
- `financial_transactions_student_id_fkey`
- `financial_transactions_sale_id_fkey`

Isso evita manter duas FKs para a mesma relação e disparar ações referenciais redundantes. As FKs de owner_id para Auth e `app_settings.owner_id -> auth.users(id)` permanecem.

A documentação PostgreSQL 17 confirma que `ON DELETE SET NULL (coluna)` pode limitar a ação a uma coluna específica; `MATCH SIMPLE` permite que uma FK composta opcional seja ignorada quando um componente é NULL. Fonte: https://www.postgresql.org/docs/17/ddl-constraints.html

Auditoria dos índices atuais:
- já existem índices individuais em lessons(student_id), lessons(vehicle_id), sale_items(sale_id), sales(student_id), além de índices por owner/data;
- não há índices compostos específicos nas colunas de relacionamento com owner_id;
- não criar todos automaticamente: avaliar planos de consulta e volume. Índices candidatos para teste: lessons(student_id, owner_id), lessons(vehicle_id, owner_id), sales(student_id, owner_id), sale_items(sale_id, owner_id), financial_transactions(student_id, owner_id), financial_transactions(sale_id, owner_id).
- as constraints UNIQUE (id, owner_id) criam os índices únicos necessários nos pais.

O SQL revisado foi atualizado para incluir as FKs compostas e remover as FKs simples equivalentes, dentro da mesma transação. Continua sendo apenas rascunho, não executado.

## 9. Verificação estática adicional — 20/11/2026

O arquivo `scripts/test-student-link-flow.mjs` recebeu quatro testes para a integridade referencial. O harness JavaScript isolado executado com os arquivos atuais da branch terminou com **24/24 testes aprovados**.

Os casos estáticos verificam:
- existência das chaves únicas compostas `(id, owner_id)` nos pais;
- FKs compostas entre aulas/alunos/veículos, vendas/alunos, itens/vendas/produtos e movimentações;
- `ON DELETE SET NULL` limitado à coluna opcional e `ON DELETE CASCADE` dos itens;
- remoção das sete FKs simples antigas na mesma transação;
- validação de owner em `sale_items.product_id` e preservação da FK de `app_settings.owner_id`.

**Limite do resultado:** trata-se de verificação estática de texto/código em harness JavaScript. Não foi executado `node --test`, PostgreSQL, Deno nem teste contra o Supabase. Não comprova que o DDL será aceito ou que as constraints estejam ativas no banco.

O rascunho continua **não aprovado para execução**. Antes de qualquer DDL, repetir em leitura somente:
1. nulidade/tipos das colunas de relacionamento e `owner_id`;
2. existência e nomes das constraints antigas e das novas;
3. linhas órfãs e divergências de proprietário;
4. versão PostgreSQL;
5. índices existentes e impacto de lock.

Nenhuma migration, constraint, índice, policy ou dado foi aplicado/criado nesta etapa.

