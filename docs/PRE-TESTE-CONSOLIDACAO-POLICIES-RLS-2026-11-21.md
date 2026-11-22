# Pré-teste de consolidação de policies permissivas — 21/11/2026

## Ambiente e escopo

Projeto Supabase isolado: `voyjssflroiwdyaacthh`, PostgreSQL 17.12.
A consolidação foi simulada dentro de transações SQL, com fixtures sintéticas e claims JWT simuladas. As policies originais foram removidas apenas dentro das transações, substituídas por policies candidatas e restauradas automaticamente pelo `ROLLBACK`.

Nenhuma policy persistente foi alterada. O projeto original `ydyqagqsuqntuibzgwzd` não foi acessado.

## Hipótese avaliada

As policies de admin e instrutor nas tabelas `products`, `sales`, `sale_items` e `financial_transactions` repetem as mesmas verificações de proprietário e integridade relacional, variando apenas o papel retornado por `private.current_app_role()`.

A policy candidata usa uma condição combinada equivalente:

`current_app_role() IN ('admin', 'instrutor') AND owner_id = auth.uid()`

Nas tabelas `sales`, `sale_items` e `financial_transactions`, os `WITH CHECK` preservaram as validações de proprietário das referências a alunos, vendas e produtos. Nas tabelas `sales` e `sale_items`, a policy de SELECT redundante foi incluída na simulação de consolidação, pois a policy candidata `FOR ALL` já cobre a mesma condição de leitura.

## Resultado da simulação

**76 asserções passaram** nas transações com dois instrutores sintéticos ativos, um instrutor temporariamente expirado e um administrador sintético:

### Instrutores

- SELECT: cada instrutor leu o próprio registro e não viu registros do outro em todas as quatro tabelas;
- UPDATE e DELETE cruzados: zero linhas afetadas nas quatro tabelas;
- INSERT próprio: aceito em `products`, `sales`, `sale_items` e `financial_transactions`;
- CRUD próprio completo em `products`;
- INSERT com `owner_id` forjado: bloqueado nas quatro tabelas para ambos os instrutores;
- acesso expirado: instrutor expirado não viu produtos e teve INSERT bloqueado.

### Administrador sintético

Uma identidade Auth sintética foi criada dentro da transação; o trigger criou o perfil e o papel foi ajustado para `admin` somente no banco isolado e dentro da transação.

- `private.current_app_role()` retornou `admin`;
- SELECT e UPDATE dos próprios registros funcionaram nas quatro tabelas;
- SELECT de produtos pertencentes a outro owner retornou zero;
- UPDATE e DELETE cruzados retornaram zero linhas nas quatro tabelas;
- INSERT com `owner_id` de outro instrutor foi bloqueado nas quatro tabelas.

Todas as identidades, perfis, fixtures e mudanças temporárias de policies foram revertidas com `ROLLBACK`. A consulta posterior confirmou que a identidade administrativa sintética não permaneceu no Auth e que as contagens de policies originais foram restauradas.

## Limitações

- Os testes usaram `SET LOCAL ROLE authenticated` e claims simuladas; não foram chamadas HTTP/PostgREST com JWT real.
- Para o administrador, foram testados SELECT, UPDATE, bloqueios cruzados e INSERT forjado; não foram testados INSERT próprio e DELETE próprio em todas as quatro tabelas.
- O teste de INSERT próprio em vendas, itens e transações para instrutores foi realizado; não se deve interpretar este relatório como cobertura de todos os fluxos financeiros/RPCs.
- A simulação não mede ganho de desempenho real. O objetivo foi verificar equivalência funcional e isolamento, não provar redução de latência.
- O Advisor foi consultado após o rollback e continuou reportando as 16 ocorrências de policies permissivas múltiplas, pois a consolidação não foi persistida.
- Não foi criada nem aplicada migration nesta etapa.

## Recomendação

A equivalência funcional das policies candidatas foi testada para os papéis de instrutor e administrador, mas a consolidação deve continuar fora do schema persistente até:

1. completar INSERT e DELETE próprios para o administrador;
2. executar novamente a matriz financeira completa com as policies candidatas;
3. aplicar a migration somente no projeto isolado e executar os Advisors após a alteração persistente;
4. revisar os diffs finais e confirmar ausência de regressão antes de qualquer proposta de integração.

Nenhuma alteração em produção ou no Supabase original foi realizada. O commit desta documentação acionou automaticamente a integração Git da Vercel; o Preview do commit anterior ficou `READY`. O commit mais recente não recebeu implantação de Preview: o check Vercel retornou falha por limite de builds (`build-rate-limit`). Não foi executado deploy manual nem deploy de produção. Um Preview `READY` não valida login ou fluxos funcionais autenticados.
