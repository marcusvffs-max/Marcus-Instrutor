# Testes de CRUD próprio e escrita cruzada em products e app_settings — 21/11/2026

## Ambiente e escopo

Projeto Supabase isolado: `voyjssflroiwdyaacthh` (PostgreSQL 17.12).
Foram usados dois perfis sintéticos de instrutor com autorização ativa:

- Instrutor A: `11111111-1111-4111-8111-111111111111`
- Instrutor B: `22222222-2222-4222-8222-222222222222`

O projeto original `ydyqagqsuqntuibzgwzd` não foi acessado nem alterado nesta rodada.

A inspeção de catálogo confirmou as policies:

- `products`: admin e instrutor podem gerenciar somente linhas com `owner_id = auth.uid()`.
- `app_settings`: admin e instrutor podem gerenciar somente linhas com `owner_id = auth.uid()`.

## Procedimento

Os testes foram executados em transações SQL com `SET LOCAL ROLE authenticated`, claims JWT simuladas alternando a identidade A/B e fixtures temporárias. O bloco PL/pgSQL interromperia a execução com erro caso qualquer condição esperada falhasse.

### A. CRUD próprio — 12 verificações

Para cada instrutor e em cada tabela, foram executados INSERT, UPDATE e DELETE em uma linha pertencente ao próprio `owner_id`. Cada operação deveria afetar exatamente uma linha.

### B. Escrita cruzada — 12 verificações

Para cada instrutor e tabela, foram testados:

1. UPDATE de linha pertencente ao outro owner — esperado: zero linhas afetadas;
2. DELETE de linha pertencente ao outro owner — esperado: zero linhas afetadas;
3. INSERT declarando o `owner_id` do outro owner — esperado: bloqueio com SQLSTATE `42501`.

## Resultado

**24/24 verificações aprovadas.**

| Tabela | CRUD próprio A | CRUD próprio B | Escrita cruzada A → B | Escrita cruzada B → A |
|---|---:|---:|---:|---:|
| `products` | 3/3 | 3/3 | 3/3 bloqueios | 3/3 bloqueios |
| `app_settings` | 3/3 | 3/3 | 3/3 bloqueios | 3/3 bloqueios |

As 12 operações próprias foram aceitas com uma linha afetada cada. As 12 tentativas cruzadas foram impedidas conforme esperado.

Todas as fixtures e operações foram revertidas com `ROLLBACK`; nenhuma linha de teste permaneceu no banco.

## Limitações

- São testes SQL transacionais com `SET LOCAL ROLE authenticated` e claims simuladas, não chamadas HTTP/PostgREST com JWT real emitido pelo Auth.
- Não validam a interface do aplicativo nem os fluxos completos de criação/edição.
- O resultado comprova somente as operações descritas acima, para os dois perfis sintéticos ativos.
- Não altera a avaliação dos avisos de múltiplas policies permissivas: a duplicidade de policies de admin/instrutor continua como oportunidade de otimização, sem alteração de semântica nesta etapa.

## Atualização da matriz

O caso SEC-017 passa a ter cobertura de leitura, CRUD próprio e bloqueio de escrita cruzada para `products` e `app_settings`, no escopo limitado descrito neste relatório. Não marcar os demais casos SEC como concluídos por consequência destes testes.
