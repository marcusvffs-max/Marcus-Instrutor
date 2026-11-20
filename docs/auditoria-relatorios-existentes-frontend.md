# Auditoria dos relatórios existentes no frontend

Data: 20/11/2026  
Branch: `feature/relatorios-instrutor-app`

## Arquivos e versões consultados
- `script.js`, blob SHA `c835d7649cd2bbaddec18aaa3c279fa585547253`.
- `index.html`, blob SHA `d9e606e320ac21e7422b5263529b0c7119c4c04f`.

## Relatório individual por aluno
- Interface: `#relatorioAluno`, `#btnRelatorioAluno`, resultado em `#resultadoRelatorio`.
- Função: `gerarRelatorioAluno()`, linhas 2057–2085.
- Campos locais do aluno: `id`, `nome`, `categoria`, `contratadas`, `saldo`.
- Campos locais da aula: `alunoId`, `data`, `horario`, `status`, `veiculoId`.
- Conta como realizada quando `status === "Realizada"`.
- Mapeamento Supabase: `students.id/nome/categoria/aulas_compradas/aulas_restantes`; `lessons.student_id/data_aula/horario/status/vehicle_id`.

## Relatório por período
- Interface: `#relatorioInicio`, `#relatorioFim`, `#btnRelatorioPeriodo`.
- Função: `gerarRelatorioPeriodo()`, linhas 2087–2105.
- Filtra aulas inclusivamente: data maior/igual ao início e menor/igual ao fim.
- A função atual não ordena explicitamente os resultados; não presumir ordenação cronológica sem definir isso na implementação.

## Lista diária
- Interface: `#relatorioData`, `#btnRelatorioDiario`.
- Função: `gerarRelatorioDiario()`, linhas 2107–2124.
- Exclui aulas cujo status local é exatamente `"Cancelada"`; ordena por horário.
- Usa a tabela comum com coluna vazia de assinatura para impressão.

## Tabela comum
- Função: `tabelaAulas()`, linhas 2127–2162.
- Colunas: data, horário, aluno, veículo, situação e assinatura opcional.
- Resolve nome do aluno por `nomeAluno(alunoId)`.
- O frontend usa `veiculo.modelo`; a tabela Supabase `vehicles` auditada possui `nome`, `tipo`, `categoria`, `placa`, não `modelo`. O novo módulo deve usar os campos existentes.

## Relatório financeiro
- Botão: `#btnImprimirRelatorioFinanceiro`.
- Função: `gerarRelatorioFinanceiro()`, linhas 1293–1354.
- Fonte local: `obterMovimentacoesFiltradas()`, linhas 1229–1238, que filtra `db.movimentacoes` pelo período financeiro selecionado.
- Soma `tipo === "entrada"` e `tipo === "saida"`; exibe data, descrição, tipo e valor.
- Mapeamento provável: `financial_transactions.data_movimento/descricao/tipo/valor/status`. Antes de implementar, validar como o app define status e período e como vendas/despesas são registradas.
- Não somar `sales.total` junto de `financial_transactions.valor` sem regra explícita, para evitar dupla contagem.

## Conclusões de arquitetura
1. Os relatórios atuais são gerados de dados do `localStorage`; não consultam Supabase.
2. O módulo de instrutor deve ser independente, com consultas somente leitura ao Supabase e RLS como barreira de segurança.
3. Não reutilizar `db`, `carregarDados()`, `STORAGE_KEY` ou funções globais do aplicativo administrativo no módulo de instrutor.
4. Não alterar a interface principal nesta fase. Esta auditoria é documental; nenhum dado ou configuração do Supabase foi alterado.
