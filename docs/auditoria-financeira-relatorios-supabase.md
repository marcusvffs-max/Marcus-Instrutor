# Auditoria financeira do Supabase para relatórios por instrutor

Data: 20/11/2026  
Projeto consultado: `ydyqagqsuqntuibzgwzd`  
Método: consultas somente de leitura e Security Advisor. Nenhum DDL ou DML executado.

## Estrutura confirmada

### financial_transactions
Campos: `id`, `owner_id`, `student_id`, `sale_id`, `tipo`, `descricao`, `valor`, `data_movimento`, `status`, `created_at`.

Restrições:
- `tipo`: `entrada` ou `saida`.
- `valor > 0`.
- `status`: `pendente`, `confirmado` ou `cancelado`.
- `data_movimento` tem default `CURRENT_DATE`.

### sales
Campos: `id`, `owner_id`, `student_id`, `data_venda`, `total`, `forma_pagamento`, `status`, `observacoes`, `created_at`.

Restrições:
- `total >= 0`.
- `status`: `confirmada` ou `cancelada`.
- `data_venda` tem default `CURRENT_DATE`.

### sale_items
Campos: `id`, `owner_id`, `sale_id`, `product_id`, `descricao`, `quantidade`, `valor_unitario`, `subtotal`, `created_at`.

Restrições:
- `quantidade > 0`.
- `valor_unitario >= 0`.
- `subtotal >= 0`.

### products
Campos relevantes: `id`, `owner_id`, `nome`, `tipo`, `preco`, `quantidade_aulas`, `ativo`, além de campos complementares de pacote.

## Contagens e dados existentes

Consulta agregada somente leitura em `financial_transactions`, `sales`, `sale_items` e `students` não retornou movimentações ou vendas. O resultado de `sale_items` foi zero; a auditoria de tabelas também indicou zero registros em `sales`, `students` e `financial_transactions`.

Portanto, não há amostra real para validar somas, status, cancelamentos, datas ou relação entre venda e lançamento financeiro.

## Security Advisor — achados atuais

O Advisor de segurança apontou RLS habilitado sem policies nas cinco tabelas:
- `public.financial_transactions`
- `public.sale_items`
- `public.sales`
- `public.whatsapp_conversations`
- `public.whatsapp_messages`

Também alertou que a proteção contra senhas vazadas está desabilitada no Auth.

Documentação do alerta RLS: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy  
Documentação de proteção de senha: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Os três primeiros achados impactam diretamente o relatório financeiro e a futura separação por instrutor. Os dois achados de WhatsApp são preexistentes e não devem ser alterados neste escopo sem análise/autorização específica. A configuração Auth também exige decisão do administrador; não foi alterada.

## Decisões de implementação pendentes

1. Definir se o relatório financeiro mostrará apenas lançamentos `financial_transactions` ou se também terá seção de vendas baseada em `sales`.
2. Se apresentar ambos, não somar `sales.total` com lançamentos de entrada relacionados à mesma venda, para evitar dupla contagem.
3. Definir se o saldo considera somente status `confirmado`; recomendação técnica inicial: entradas e saídas confirmadas compõem o saldo, pendentes aparecem separadas e canceladas ficam fora dos totais.
4. Confirmar como o aplicativo grava uma venda e seu lançamento financeiro, pois não há registros para examinar.
5. Corrigir policies de `sales`, `sale_items` e `financial_transactions` antes de liberar acesso comum. O Security Advisor confirma que RLS está ativo, mas sem policy nessas tabelas.

## Estado
- Auditoria somente leitura: concluída.
- Alterações no banco: nenhuma.
- Registros criados: nenhum.
- Relatório financeiro liberado: não.
- Próximo passo: documentar a regra de cálculo e revisar o fluxo de gravação de vendas no código atual, sem alterar o fluxo em produção.
