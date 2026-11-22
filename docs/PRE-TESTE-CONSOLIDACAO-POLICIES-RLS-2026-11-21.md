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

**84 asserções passaram** nas transações com dois instrutores sintéticos ativos, um instrutor temporariamente expirado e um administrador sintético:

### Instrutores

- SELECT: cada instrutor leu o próprio registro e não viu registros do outro em todas as quatro tabelas;
- UPDATE e DELETE cruzados: zero linhas afetadas nas quatro tabelas;
- INSERT próprio: aceito em `products`, `sales`, `sale_items` e `financial_transactions`;
- CRUD próprio completo em `products`;
- INSERT com `owner_id` forjado: bloqueado nas quatro tabelas para ambos os instrutores;
- acesso expirado: instrutor expirado não viu produtos e teve INSERT bloqueado.

### Administrador sintético

Uma identidade de teste já existente no projeto isolado foi promovida temporariamente a `admin` dentro da transação; não foi criada identidade Auth permanente.

- `private.current_app_role()` retornou `admin`;
- SELECT e UPDATE dos próprios registros funcionaram nas quatro tabelas;
- SELECT de produtos pertencentes a outro owner retornou zero;
- UPDATE e DELETE cruzados retornaram zero linhas nas quatro tabelas;
- INSERT com `owner_id` de outro instrutor foi bloqueado nas quatro tabelas;
- **nova rodada: INSERT próprio e DELETE próprio passaram em todas as quatro tabelas (8/8 asserções)**, usando registros sintéticos relacionados por aluno, venda e produto.

Todas as identidades, perfis, fixtures e mudanças temporárias de policies foram revertidas com `ROLLBACK`. Consulta posterior confirmou que nenhuma policy candidata ou fixture temporária permaneceu e que o perfil sintético voltou ao papel `instrutor`.

## Limitações

- Os testes usaram `SET LOCAL ROLE authenticated` e claims simuladas; não foram chamadas HTTP/PostgREST com JWT real.
- A matriz financeira completa de 41 verificações foi previamente executada com as policies originais, conforme o relatório `docs/TESTE-RLS-ISOLAMENTO-INSTRUTORES.md`; **ela ainda não foi repetida integralmente com as policies candidatas**.
- O novo teste administrativo cobre INSERT e DELETE próprios nas quatro tabelas, mas não reexecuta todos os fluxos de venda, estorno, exclusão, idempotência, consumo de aulas e relações cruzadas sob a versão candidata.
- A simulação não mede ganho de desempenho real. O objetivo foi verificar equivalência funcional e isolamento, não provar redução de latência.
- O Advisor foi consultado após o rollback e continuou reportando 16 ocorrências de policies permissivas múltiplas, pois a consolidação não foi persistida.
- Não foi criada nem aplicada migration nesta etapa.

## Advisors após rollback

No projeto isolado, após confirmar o rollback:

- Security Advisor: 2 avisos INFO de RLS sem policies nas tabelas backend-only `whatsapp_conversations` e `whatsapp_messages`; 2 avisos WARN de funções `SECURITY DEFINER` públicas com guards internos (`get_my_scheduled_lessons()` e `remove_student_app_access(uuid)`); e 1 aviso WARN de proteção contra senhas vazadas desabilitada.
- Performance Advisor: 16 ocorrências WARN de múltiplas policies permissivas nas quatro tabelas avaliadas; 10 índices sem uso reportados em ambiente de baixo volume.
- Os achados foram apenas consultados. Nenhum ajuste foi aplicado nesta rodada.

## Recomendação

A consolidação tem cobertura adicional para INSERT/DELETE administrativo, mas deve continuar fora do schema persistente até:

1. repetir a matriz financeira completa com as policies candidatas;
2. revisar todos os caminhos de integridade e RPCs dependentes dessas tabelas;
3. somente então preparar migration, aplicar no projeto isolado e executar novamente os Advisors;
4. revisar os diffs finais e confirmar ausência de regressão antes de qualquer proposta de integração.

Nenhuma alteração em produção ou no Supabase original foi realizada. Não houve merge nem deploy manual. Um Preview `READY` não valida login ou fluxos funcionais autenticados.
