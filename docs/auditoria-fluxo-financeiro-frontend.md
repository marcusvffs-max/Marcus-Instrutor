# Auditoria do fluxo financeiro atual no frontend

Data: 20/11/2026  
Arquivo analisado: `script.js`, blob SHA `c835d7649cd2bbaddec18aaa3c279fa585547253`.

## Venda
A função `salvarVenda()`, linhas 1669–1739:
- cria um objeto de venda com aluno, itens, descrição, quantidade de aulas, valor total e data;
- adiciona a venda em `db.vendas`;
- atualiza saldo e aulas contratadas do aluno;
- cria uma movimentação `tipo: "entrada"` em `db.movimentacoes`, com `vendaId`, `alunoId`, descrição, valor e data.

A venda local contém itens embutidos no objeto `venda.itens`; o banco tem tabelas separadas `sales` e `sale_items`. O mapeamento exige preservar os itens e a relação com a venda.

## Despesa
A função genérica `registrarMovimentacao()`, linhas 1155–1166, cria movimentação com tipo, descrição, valor, aluno opcional e data. O fluxo de formulário de despesa chama `registrarMovimentacao("saida", ...)` na linha 1946.

Mapeamento provável: `financial_transactions`, usando `tipo='saida'`, `descricao`, `valor`, `student_id` opcional e `data_movimento`.

## Devolução
O fluxo de devolução, linhas 1826–1912:
- atualiza quantidades e valores devolvidos na venda e nos itens;
- reduz aulas contratadas/saldo do aluno;
- cria uma movimentação `tipo: "saida"`, associada à venda, com descrição de devolução, valor, aluno e data.

O schema auditado não tem campos dedicados de devolução em `sales` ou `sale_items`; a movimentação de saída é o registro financeiro mais próximo. É necessário validar como o backend vai persistir os totais devolvidos antes de considerar esse fluxo equivalente.

## Regra segura provisória para relatórios
- Usar `financial_transactions` como fonte principal dos totais financeiros.
- Somar entradas e saídas somente com `status='confirmado'`.
- Mostrar `pendente` em seção separada, sem compor saldo confirmado.
- Excluir `cancelado` dos totais e mostrar apenas se houver necessidade de auditoria.
- Não somar `sales.total` aos lançamentos financeiros: uma venda cria uma entrada associada, e somar ambos duplicaria receita.
- `sales` e `sale_items` podem alimentar uma seção de detalhamento de vendas, separada do resumo de movimentações.
- Devoluções devem aparecer como saídas associadas à venda, sem subtrair novamente `valorDevolvido` do total das entradas se a saída já foi lançada.

## Limitação atual
O frontend analisado ainda grava em `localStorage`, e as tabelas Supabase financeiras estão vazias. Portanto, esta auditoria documenta o comportamento do código, não prova que o fluxo Supabase já está implementado.

Nenhuma alteração no código, banco ou dados foi feita.
