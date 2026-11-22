# Teste de escrita cruzada em products e app_settings — 22/11/2026

## Ambiente e escopo

Projeto Supabase isolado: `voyjssflroiwdyaacthh` (PostgreSQL 17.12).
Foram usados dois perfis sintéticos de instrutor com autorização ativa:

- Instrutor A: `11111111-1111-4111-8111-111111111111`
- Instrutor B: `22222222-2222-4222-8222-222222222222`

O projeto original `ydyqagqsuqntuibzgwzd` não foi acessado nem alterado nesta rodada.

Antes do teste, a inspeção de catálogo confirmou as policies:

- `products`: admin e instrutor podem gerenciar somente linhas com `owner_id = auth.uid()`.
- `app_settings`: admin e instrutor podem selecionar/inserir/atualizar/excluir somente linhas com `owner_id = auth.uid()`.

## Procedimento

Foram inseridas linhas de fixture temporárias para A e B em ambas as tabelas, em uma transação SQL. Em seguida, com `SET LOCAL ROLE authenticated`, foram aplicadas claims JWT simuladas alternando a identidade A/B.

Para cada conta e tabela, foram testados:

1. UPDATE de linha pertencente ao outro owner;
2. DELETE de linha pertencente ao outro owner;
3. INSERT declarando o `owner_id` do outro owner.

As operações de UPDATE/DELETE cruzadas deveriam afetar zero linhas. Os INSERTs forjados deveriam falhar com `42501`. O bloco PL/pgSQL interromperia a execução com erro caso qualquer condição de segurança falhasse.

## Resultado

**12/12 verificações aprovadas.**

| Tabela | A → B: UPDATE | A → B: DELETE | A: INSERT com owner B | B → A: UPDATE | B → A: DELETE | B: INSERT com owner A |
|---|---:|---:|---:|---:|---:|---:|
| `products` | 0 linhas | 0 linhas | Bloqueado | 0 linhas | 0 linhas | Bloqueado |
| `app_settings` | 0 linhas | 0 linhas | Bloqueado | 0 linhas | 0 linhas | Bloqueado |

Todas as fixtures e operações foram revertidas com `ROLLBACK`; nenhuma linha de teste permaneceu no banco.

## Limitações

- São testes SQL transacionais com `SET LOCAL ROLE authenticated` e claims simuladas, não chamadas HTTP/PostgREST com JWT real emitido pelo Auth.
- Não validam a interface do aplicativo nem os fluxos completos de criação/edição.
- O resultado comprova somente as seis tentativas por tabela descritas acima, para os dois perfis sintéticos ativos.
- Não altera a avaliação dos avisos de múltiplas policies permissivas: a duplicidade de policies de admin/instrutor continua como oportunidade de otimização, sem alteração de semântica nesta etapa.

## Atualização da matriz

O caso SEC-017 passa a ter cobertura de leitura e de escrita cruzada para `products` e `app_settings`, no escopo limitado descrito neste relatório. Não marcar os demais casos SEC como concluídos por consequência deste teste.
