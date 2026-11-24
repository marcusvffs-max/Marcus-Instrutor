# Backfill do ledger de aluguéis

Data: 24/11/2026  
Branch: `feature/relatorios-instrutor-app`

## Correção versionada

A migration de criação do ledger não bloqueia mais ambientes com histórico. A conciliação está em:

`supabase/migrations/20261124045009_backfill_student_rental_credit_ledger.sql`

Ela:
1. cria créditos para cada item de aluguel de venda confirmada, mantendo quantidade original e devoluções já registradas;
2. vincula exames históricos realizados e ainda sem crédito à compra elegível mais antiga (FIFO);
3. não debita novamente `students.alugueis_disponiveis`, pois o fluxo histórico já realizou esse débito;
4. interrompe e reverte a migration se houver quantidades inválidas, exame sem compra elegível ou divergência entre ledger e saldo agregado.

A operação é idempotente para créditos já existentes, usando `ON CONFLICT (sale_item_id) DO NOTHING`.

## Aplicação no QA

A migration foi aplicada com sucesso no projeto QA `voyjssflroiwdyaacthh`. A consulta anterior encontrou zero vendas confirmadas de aluguel, zero créditos e zero exames históricos consumidos sem vínculo. Portanto, a execução validou a estrutura e a conciliação vazia, mas não substitui um teste com histórico operacional representativo.

## Proteção no aplicativo

- Administrador e instrutor leem somente as colunas necessárias do ledger, sob RLS limitado à própria conta.
- Se a tabela ainda não existir, o frontend mantém compatibilidade com o comportamento legado.
- Se a tabela existir, mas uma compra não tiver crédito individual, a interface não oferece quantidade para devolução daquela compra.

## Antes de produção

Não foi aplicada migration na produção. Antes de qualquer liberação, revisar o SQL e testar em uma cópia representativa de dados históricos; depois conferir por aluno a soma de compras, devoluções, exames consumidos e saldo disponível. A publicação e a migração de produção continuam dependendo de autorização separada.
