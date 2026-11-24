# Backfill do ledger de aluguéis

Data: 24/11/2026  
Branch: `feature/relatorios-instrutor-app`

## Correção versionada

Foi removido da migration de criação do ledger o bloqueio que impedia a instalação quando já existiam vendas ou exames históricos. A conciliação agora acontece em migration própria:

`supabase/migrations/20261124090000_backfill_student_rental_credit_ledger.sql`

Ela:
1. cria créditos para cada item de aluguel de venda confirmada, mantendo a quantidade original e as devoluções já registradas;
2. vincula exames históricos realizados e ainda sem crédito à compra elegível mais antiga (FIFO);
3. não debita novamente `students.alugueis_disponiveis`, pois o fluxo histórico já fez esse débito;
4. interrompe e reverte a migration se houver quantidades inválidas, exame sem compra elegível ou divergência entre o ledger e o saldo agregado do aluno.

A migration é idempotente para créditos já existentes, usando `ON CONFLICT (sale_item_id) DO NOTHING`.

## Proteção no aplicativo

- Administrador e instrutor leem apenas as colunas necessárias do ledger, sob política RLS limitada à própria conta.
- Se a tabela ainda não existir, o frontend mantém compatibilidade com o comportamento legado.
- Se a tabela existir, mas uma compra não tiver crédito individual, a interface não oferece quantidade para devolução daquela compra.

## Verificação QA

A consulta somente de leitura anterior retornou zero vendas confirmadas de aluguel, zero créditos, zero exames consumidos sem vínculo e zero exames agendados vencidos. O ambiente QA está sem dados operacionais para validar a conciliação com registros reais.

## Próxima validação

A migration foi versionada na branch, mas não foi aplicada ao QA ou à produção. Antes de aplicar, revisar o SQL e executar primeiro em uma cópia de dados representativa; em seguida validar as somas por aluno e os exames vinculados. Nenhum dado foi alterado por este trabalho.
