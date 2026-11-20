# Mapa dos relatorios: localStorage para Supabase

## Estado atual confirmado

O aplicativo principal (branch main) ainda usa localStorage com a chave:

- marcus_instrutor_novo_v1

O objeto local contém:

- alunos
- veiculos
- aulas
- produtos
- vendas
- movimentacoes
- configuracoes

Os relatorios atuais sao montados em script.js usando diretamente esses arrays. Portanto, a liberacao de um login comum sem trocar a origem dos relatorios nao e segura.

## Mapeamento dos relatorios

| Relatorio atual | Dados locais usados | Tabelas Supabase | Campos/relacionamentos |
|---|---|---|---|
| Individual por aluno | aluno, aulas, nome do veiculo | students, lessons, vehicles | aluno: nome, categoria, contratadas/saldo; Supabase: nome, categoria, aulas_compradas, aulas_restantes; aulas por student_id; veiculo por vehicle_id |
| Aulas por periodo | aulas, aluno, veiculo | lessons, students, vehicles | data_aula, horario, status, numero_aula, observacoes, assinatura |
| Lista diaria | aulas nao canceladas, aluno, veiculo, assinatura | lessons, students, vehicles | filtro por data_aula; ordenar por horario; assinatura esta disponivel em lessons.assinatura |
| Financeiro diario/mensal/anual | movimentacoes | financial_transactions | tipo, descricao, valor, data_movimento, student_id, sale_id, status |
| Vendas (origem do financeiro) | vendas e itens | sales, sale_items, products | venda: student_id, data_venda, total, forma_pagamento, status; itens: descricao, quantidade, valor_unitario, subtotal |

## Diferencas que exigem adaptacao

1. O codigo local usa alunoId; no Supabase o relacionamento e lessons.student_id.
2. O codigo local usa veiculoId; no Supabase e lessons.vehicle_id.
3. O codigo local exibe veiculo.modelo; a tabela vehicles nao possui coluna modelo. Ela possui nome, tipo, categoria e placa. A futura interface deve montar uma descricao usando os campos realmente existentes, sem inventar uma coluna.
4. O codigo local usa contratadas e saldo; no banco os campos equivalentes sao aulas_compradas e aulas_restantes.
5. O financeiro local usa data; no banco o campo correspondente e data_movimento.
6. A tabela financial_transactions e distinta de sales. O relatorio financeiro deve consultar as movimentacoes e, quando precisar detalhar uma venda, relacionar por sale_id.
7. As tabelas Supabase estavam vazias para alunos, aulas, veiculos, vendas, itens de venda e movimentacoes financeiras na auditoria de 20/11/2026. Os cinco produtos existentes nao substituem os dados locais.

## Autenticacao e navegacao

- A branch principal nao contem a tela de login/autorizacao adicionada na PR #3.
- A PR #3 contem autenticacao Supabase, mas a funcao de autorizacao ainda aceita somente profiles.role === 'admin'.
- A futura liberacao de instrutores deve ser feita sobre uma base que inclua a autenticacao, sem alterar as regras da Assistente Virtual ou o painel WhatsApp.
- Para perfil instrutor, a interface devera mostrar somente a pagina de relatorios e retirar do menu/atalhos todas as paginas administrativas. Isso e apenas uma barreira de interface; a seguranca real deve continuar nas politicas RLS do banco.

## Sequencia tecnica recomendada

1. Validar o rascunho de politicas RLS em ambiente de teste.
2. Implementar consultas Supabase de leitura para cada relatorio e normalizar os dados para o formato esperado pelos componentes de exibicao.
3. Manter a experiencia atual de impressao/A4, substituindo apenas a fonte dos dados.
4. Implementar um fluxo administrativo de backup/exportacao do localStorage antes de qualquer migracao.
5. Fazer importacao controlada, com mapeamento de IDs locais para UUIDs Supabase e verificacao de totais/relacionamentos.
6. Testar isolamento com duas contas de instrutor distintas e uma conta admin.
7. Somente depois liberar o perfil comum e publicar.

## Limites desta etapa

Este documento e um mapa tecnico. Nenhum dado foi migrado, nenhuma tabela foi alterada e nenhum usuario foi criado ou liberado.
