# Pendência: backfill do ledger de aluguéis

Data: 24/11/2026  
Branch: `feature/relatorios-instrutor-app`

## Achado

A migration `20261122213000_student_rental_credit_ledger.sql` cria `student_rental_credits` e um trigger para novos itens de venda de aluguel. Ela não contém um `INSERT ... SELECT` de backfill para itens de aluguel já vendidos antes da migration.

A mesma migration substitui `record_student_practical_exam_result` para exigir um crédito individual disponível antes de concluir um exame. Portanto, uma venda antiga sem linha em `student_rental_credits` pode ter saldo agregado em `students.alugueis_disponiveis`, mas não terá crédito que a RPC consiga consumir. O histórico de exames anteriores também pode ficar sem `rental_credit_id`.

## Proteção adicionada no frontend

- Administrador e instrutor agora leem apenas `sale_item_id, quantity_purchased, quantity_refunded, quantity_consumed`; a política RLS restringe as linhas à própria conta.
- Quando a tabela ainda não existe, o app mantém o fallback legado.
- Quando a tabela existe, mas uma compra não possui crédito individual, a interface considera zero disponível para aquela compra, evitando oferecer devolução que a RPC recusará.

## Verificação QA

Consulta somente de leitura no projeto QA retornou zero vendas confirmadas de aluguel, zero linhas de crédito, zero exames consumidos sem vínculo de crédito e zero exames agendados vencidos. O ambiente QA está sem dados operacionais para validar backfill.

## Bloqueio antes de produção

É necessário criar uma migration de backfill que:
1. crie um crédito para cada item de aluguel confirmado e vinculado a aluno;
2. distribua os exames já consumidos entre compras elegíveis em ordem FIFO, respeitando data da venda, data do exame e quantidades devolvidas;
3. preencha `student_practical_exams.rental_credit_id` nos exames históricos já realizados;
4. valide que `quantity_refunded + quantity_consumed <= quantity_purchased` e que a soma dos créditos disponíveis seja coerente com `students.alugueis_disponiveis`.

Não foi executada nenhuma escrita no banco, nenhum pagamento e nenhuma implantação. A migration ainda precisa ser criada pelo fluxo local do Supabase CLI e revisada antes de aplicar.
