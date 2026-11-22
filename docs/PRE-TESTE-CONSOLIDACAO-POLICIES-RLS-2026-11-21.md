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

## Resultado da simulação de policies e privilégios

**84 asserções passaram** nas rodadas anteriores, com dois instrutores sintéticos ativos, um instrutor temporariamente expirado e um administrador sintético.

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
- INSERT próprio e DELETE próprio passaram em todas as quatro tabelas (8/8 asserções), usando registros sintéticos relacionados por aluno, venda e produto.

## Regressão dos fluxos financeiros com policies candidatas — 22/11/2026

Foi executada uma bateria adicional em três transações de teste, mais uma repetição focada para confirmar o bloqueio de exclusão cruzada. **48 asserções válidas passaram**. Uma primeira verificação de existência de venda B feita sob o papel autenticado não foi contabilizada, pois a própria RLS ocultava corretamente a linha; o caso foi repetido e a existência foi conferida após `RESET ROLE`, confirmando que a venda B permaneceu intacta.

### Venda e saldo — instrutor

- Venda mista com serviço e produto passou sob as policies candidatas.
- Cinco aulas foram creditadas corretamente; os dois itens foram gravados e o lançamento de entrada de R$ 140,00 foi criado.
- Repetir a mesma venda não duplicou itens, saldo ou venda (idempotência).
- Venda para aluno de outro instrutor foi bloqueada com SQLSTATE `42501`.
- Uso de produto de outro instrutor foi bloqueado com SQLSTATE `42501`, sem venda parcial.
- INSERT direto de venda, item e transação com owner forjado foi bloqueado.
- SELECT de produtos, vendas, itens e transações de outro owner retornou zero linhas.
- UPDATE e DELETE cruzados em vendas, itens e transações retornaram zero linhas.
- A tentativa de chamar RPC administrativa de estorno como instrutor foi bloqueada com SQLSTATE `P0001`.

### Consumo, estorno e exclusão — administrador

- Trigger de aula realizada consumiu uma aula do saldo.
- Estorno de duas aulas gerou saída de R$ 32,00 e atualizou o saldo.
- Estorno de uma unidade de produto gerou saída de R$ 30,00; saídas acumuladas de R$ 62,00.
- Tentativas de devolver aulas ou produtos acima do limite foram bloqueadas com SQLSTATE `P0001`.
- Exclusão de venda com aula já consumida e saldo insuficiente foi bloqueada.
- Exclusão de venda sem consumo reverteu o saldo e removeu a venda.
- Devolução parcial seguida de exclusão da venda removeu somente as aulas líquidas restantes e zerou o saldo.
- SELECT, UPDATE e DELETE cruzados do administrador não alcançaram registros de outro owner.

### Pacotes e exclusão pelo instrutor

- Quantidade abaixo do mínimo e acima do máximo do pacote foram bloqueadas com SQLSTATE `22023`.
- Quantidade válida dentro da faixa foi aceita.
- Serviço com duas unidades de três aulas creditou seis aulas corretamente.
- `delete_my_sale` removeu a venda própria e reverteu o saldo.
- Tentativa do Instrutor A de excluir venda do Instrutor B retornou `P0002`; consulta posterior como proprietário confirmou que a venda B continuava existente.

### Limites da bateria financeira

- A bateria adicional cobre os fluxos financeiros e de isolamento acima sob as policies candidatas, mas não deve ser confundida com testes HTTP/PostgREST com JWT real.
- Os testes usaram `SET LOCAL ROLE authenticated`, claims simuladas e fixtures sintéticas.
- Não foram executados testes de concorrência real entre sessões independentes, pagamentos externos, conciliação bancária, SMTP ou notificações.
- A simulação não mede ganho de desempenho real.
- A validação funcional das RPCs continua limitada ao banco PostgreSQL isolado; não houve homologação visual do aplicativo.

## Reversão confirmada

Após as rodadas, consulta ao projeto isolado confirmou:

- zero policies candidatas persistentes;
- zero alunos e produtos temporários com prefixo de teste;
- perfis A e B restaurados ao papel `instrutor`;
- 17 policies originais presentes nas quatro tabelas avaliadas;
- todas as alterações e fixtures foram revertidas com `ROLLBACK`.

## Advisors após rollback

No projeto isolado, após confirmar o rollback:

- Security Advisor: 2 avisos INFO de RLS sem policies nas tabelas backend-only `whatsapp_conversations` e `whatsapp_messages`; 2 avisos WARN de funções `SECURITY DEFINER` públicas com guards internos (`get_my_scheduled_lessons()` e `remove_student_app_access(uuid)`); e 1 aviso WARN de proteção contra senhas vazadas desabilitada.
- Performance Advisor: 16 ocorrências WARN de múltiplas policies permissivas nas quatro tabelas avaliadas; 10 índices INFO sem uso reportados em ambiente de baixo volume.
- Os achados foram apenas consultados. Nenhum ajuste foi aplicado nesta rodada.



### Validação adicional de UPDATE das relações — 22/11/2026

Com as policies candidatas novamente ativas dentro de transação, foram testadas tentativas de alterar referências de registros próprios para entidades de outro owner. Os cinco cenários foram repetidos como instrutor e como administrador:

- `sales.student_id` apontando para aluno de outro owner;
- `sale_items.sale_id` apontando para venda de outro owner;
- `sale_items.product_id` apontando para produto de outro owner;
- `financial_transactions.student_id` apontando para aluno de outro owner;
- `financial_transactions.sale_id` apontando para venda de outro owner.

Resultado: **10/10 bloqueios aprovados**, todos com SQLSTATE `42501`. Nenhuma referência cruzada foi gravada.

Com essa bateria adicional, o conjunto de regressão sob policies candidatas soma **58 asserções válidas aprovadas**: 48 dos fluxos financeiros/isolamento e 10 dos testes de UPDATE relacional. As transações foram revertidas.

## Revisão estática das RPCs financeiras — 22/11/2026

Foram localizadas seis RPCs públicas que leem ou gravam nas tabelas avaliadas: `admin_create_sale`, `admin_delete_sale`, `admin_refund_sale_lessons`, `admin_refund_sale_product`, `create_instructor_sale` e `delete_my_sale`.

A inspeção do catálogo no projeto isolado confirmou, para as seis:

- `SECURITY INVOKER` (não SECURITY DEFINER), portanto as policies RLS do chamador continuam aplicáveis;
- owner `postgres` e `search_path` vazio;
- EXECUTE concedido a `authenticated`;
- EXECUTE não concedido a `anon` nem a `PUBLIC`;
- guards de papel via `private.current_app_role()` e filtros de escopo por `owner_id`;
- as funções de criação verificam aluno/produto no escopo do chamador; as funções de estorno/exclusão verificam venda, item e aluno no escopo do chamador.

Esta revisão foi estática e de catálogo, complementando os testes transacionais. Não substitui chamadas HTTP com JWT real nem revisão linha a linha de todos os demais objetos do schema.


## Aplicação controlada no projeto isolado — 22/11/2026

Após a bateria de regressão e a revisão estática, a migration foi criada na branch e aplicada **somente** no projeto isolado `voyjssflroiwdyaacthh`.

- Migration registrada no Supabase: versão `20261122003833`, nome `consolidate_owner_policies_financial_tables`.
- Arquivo versionado na branch: `supabase/migrations/20261122003833_consolidate_owner_policies_financial_tables.sql`.
- O arquivo foi alinhado ao número de versão gerado pelo registro de migrations do Supabase, evitando divergência entre o histórico do projeto isolado e o nome do arquivo no repositório.
- As quatro tabelas agora têm uma policy `FOR ALL` por owner: `products_owner_access`, `sales_owner_access`, `sale_items_owner_access` e `financial_transactions_owner_access`.
- A consulta pós-aplicação confirmou exatamente quatro policies nessas tabelas, sem policies candidatas temporárias.
- Nenhuma alteração foi feita no Supabase original.

### Smoke tests após a aplicação persistente

Foram executados **9/9 testes aprovados** em nova transação com claims simuladas e rollback dos dados:

- instrutor cria venda e credita saldo;
- venda para aluno de outro owner bloqueada;
- uso de produto de outro owner bloqueado;
- UPDATE de relação para aluno de outro owner bloqueado;
- instrutor não visualiza vendas de outro owner;
- administrador cria venda;
- administrador devolve aulas e registra saída financeira;
- excesso de devolução bloqueado;
- administrador exclui venda e reverte saldo.

### Advisors após a migration

- Performance Advisor: as **16 ocorrências de múltiplas policies permissivas desapareceram** das quatro tabelas consolidadas.
- Permanecem 10 avisos INFO de índices sem uso em ambiente de baixo volume.
- Security Advisor permanece com os mesmos achados anteriores: duas tabelas internas de WhatsApp com RLS sem policies (INFO), duas RPCs públicas `SECURITY DEFINER` com guards internos (WARN) e proteção contra senhas vazadas desabilitada (WARN).
- Não foi feita alteração para tratar esses avisos nesta etapa.

A confirmação de `private` na lista de schemas expostos da Data API continua pendente de inspeção no Dashboard do projeto isolado. Também continuam pendentes testes HTTP/PostgREST com JWT real e homologação funcional do aplicativo.

## Recomendação

A equivalência funcional das policies candidatas recebeu cobertura transacional, a migration foi aplicada no projeto isolado e os smoke tests pós-aplicação passaram. Antes de qualquer integração com a branch principal, ainda é necessário:

1. fazer revisão estática final das policies e de todas as RPCs que dependem de `sales`, `sale_items`, `financial_transactions` e `products`;
2. revisar a lista de schemas expostos pela Data API no Dashboard do projeto isolado, pois essa confirmação não foi obtida via SQL;
3. confirmar no Dashboard se o schema `private` está fora da lista de schemas expostos;
4. validar por HTTP/PostgREST com JWT real e realizar homologação funcional antes de propor integração.

Nenhuma alteração em produção ou no Supabase original foi realizada. Não houve merge nem deploy manual. Um Preview `READY` não valida login ou fluxos funcionais autenticados.
