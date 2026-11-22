# Pré-teste de consolidação de policies permissivas — 21/11/2026

## Ambiente e escopo

Projeto Supabase isolado: `voyjssflroiwdyaacthh`, PostgreSQL 17.12.
A consolidação foi simulada dentro de transação SQL, com fixtures sintéticas e claims JWT simuladas. As policies originais foram removidas apenas dentro da transação, substituídas por policies candidatas e restauradas automaticamente pelo `ROLLBACK`.

Nenhuma policy persistente foi alterada. O projeto original `ydyqagqsuqntuibzgwzd` não foi acessado.

## Hipótese avaliada

As policies de admin e instrutor nas tabelas `products`, `sales`, `sale_items` e `financial_transactions` repetem as mesmas verificações de proprietário e integridade relacional, variando apenas o papel retornado por `private.current_app_role()`.

A policy candidata usa uma condição combinada equivalente:

`current_app_role() IN ('admin', 'instrutor') AND owner_id = auth.uid()`

Nas tabelas `sales`, `sale_items` e `financial_transactions`, os `WITH CHECK` preservaram as validações de proprietário das referências a alunos, vendas e produtos. Nas tabelas `sales` e `sale_items`, a policy de SELECT redundante foi incluída na simulação de consolidação, pois a policy candidata `FOR ALL` já cobre a mesma condição de leitura.

## Resultado da simulação

**54 asserções passaram** na execução transacional com dois instrutores sintéticos ativos:

- SELECT: cada instrutor leu o próprio registro e não viu registros do outro em todas as quatro tabelas;
- UPDATE e DELETE cruzados: zero linhas afetadas nas quatro tabelas;
- INSERT próprio: aceito em `products`, `sales`, `sale_items` e `financial_transactions`;
- CRUD próprio completo em `products`;
- INSERT com `owner_id` forjado: bloqueado nas quatro tabelas para ambos os instrutores;
- acesso expirado: instrutor expirado não viu produtos e teve INSERT bloqueado.

Todas as fixtures e mudanças temporárias de policies foram revertidas com `ROLLBACK`.

## Limitações

- Os testes usaram `SET LOCAL ROLE authenticated` e claims simuladas; não foram chamadas HTTP/PostgREST com JWT real.
- O banco isolado contém dois instrutores sintéticos e nenhum perfil administrador disponível nesta rodada. Portanto, o ramo de papel `admin` da condição combinada ainda precisa de teste com identidade administrativa sintética antes de aplicar a consolidação.
- O teste de INSERT próprio em vendas, itens e transações foi realizado; não se deve interpretar este relatório como cobertura de todos os fluxos financeiros/RPCs.
- A simulação não mede ganho de desempenho real. O objetivo foi verificar equivalência funcional e isolamento, não provar redução de latência.
- Não foi criada nem aplicada migration nesta etapa.

## Recomendação

A consolidação é candidata tecnicamente viável, mas deve permanecer fora do schema persistente até:

1. testar o ramo `admin` com identidade sintética isolada;
2. executar novamente a matriz financeira completa;
3. revisar os diffs finais das policies e obter resultado limpo nos Advisors aplicáveis.

Nenhuma alteração em produção, Preview, Git migration ou projeto Supabase original foi realizada.
