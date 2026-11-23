# Módulo Parceiros — requisitos e critérios de aceite

Este documento acompanha a implementação independente do módulo Parceiros no aplicativo Marcus Instrutor. Não autoriza aplicar migrations, publicar em produção ou alterar módulos protegidos.

## Administração pelo proprietário
- Cadastrar parceiros e seus dados de identificação/contato.
- Aprovar, reprovar, suspender e reativar parceiros.
- Definir e alterar o percentual de comissão de cada parceiro.
- Consultar individualmente cadastro, alunos indicados, vendas, comissões e pagamentos.
- Vincular ou corrigir o vínculo de um aluno com um parceiro, mantendo o histórico.
- Registrar pagamentos de comissões e guardar data, valor, forma e referência.
- Consultar valores pendentes, disponíveis e já pagos.
- Gerar contratos de parceiros exclusivamente na área do proprietário. O parceiro não recebe acesso ao módulo de contratos.

## Acesso individual do parceiro
- Cada parceiro terá conta própria.
- O parceiro só poderá consultar seus próprios dados, alunos indicados, comissões, pagamentos e mensagens.
- Parceiro pendente, reprovado ou suspenso não poderá consultar dados financeiros nem operar como parceiro aprovado.
- O acesso de parceiro não concede permissões de administrador, instrutor ou aluno.

## Indicação, vendas e comissões
- O aluno indicado deve ficar vinculado ao parceiro correto.
- Vendas futuras desse aluno devem carregar a indicação automaticamente.
- Comissão incide somente sobre itens classificados como serviço; produtos e itens fixos (Aluguel de Veículo e Cartão Moto Pista) não geram comissão.
- A base deve considerar o valor líquido do serviço, respeitando descontos e devoluções.
- Quando o serviço tiver aulas vinculadas, a comissão fica pendente até todas as aulas correspondentes serem concluídas.
- Cada aula realizada pode ser contabilizada uma única vez e não pode liberar comissões de outro pacote.
- A comissão passa a disponível somente após atingir a quantidade de aulas exigida.
- O histórico financeiro deve preservar os registros e impedir pagamentos duplicados.

## Chave PIX e pagamentos
- O parceiro pode informar/atualizar sua chave PIX.
- O proprietário visualiza a chave PIX no momento do pagamento.
- Cada pagamento deve registrar valor, data, forma, referência e comissões quitadas.
- O parceiro visualiza valores pendentes, disponíveis e pagos, sem acesso aos dados financeiros de outros parceiros.

## Mensagens para parceiros
- O proprietário pode enviar uma mensagem para todos os parceiros aprovados ou selecionar destinatários.
- Mensagens, destinatários, histórico e estados de leitura são independentes dos grupos de instrutores.
- Cada parceiro recebe somente as mensagens destinadas a ele.
- Exibir indicadores de lidas/não lidas e preservar o histórico.

## Critérios de validação antes de liberar
1. Parceiro pendente não vê valores, alunos nem mensagens restritas.
2. Parceiro aprovado só enxerga seus próprios registros.
3. Tentativa de consultar IDs de outro parceiro é bloqueada pelo banco (RLS), não apenas pela interface.
4. Produtos e itens fixos não geram comissão.
5. Venda de serviço a aluno indicado gera uma única comissão com base líquida.
6. Comissão de pacote não fica disponível antes da conclusão de todas as aulas vinculadas.
7. A mesma aula não pode ser alocada duas vezes.
8. Cancelamento/reversão de aula reverte a contabilização correspondente.
9. Pagamento não pode quitar comissões pendentes nem ser registrado duas vezes.
10. Mensagem em massa alcança somente os parceiros selecionados/aprovados e não se mistura com mensagens de instrutores.
11. Contratos continuam exclusivos do proprietário.
12. Testar em projeto QA isolado; não inserir dados fictícios na base oficial.

## Estado desta entrega (23/11/2026)
Implementado no branch de desenvolvimento:
- Migration de estrutura de parceiros, vínculo de alunos, comissões, vínculo de aulas, pagamentos, mensagens e políticas RLS.
- Comissão gerada somente para serviço vendido a aluno indicado; itens fixos/produtos ficam excluídos.
- Percentual de comissão é congelado na venda; base e valor acompanham descontos/devoluções antes do pagamento.
- Comissão de pacote só fica disponível após todas as aulas exigidas serem realizadas.
- Pagamento de comissões usa rotina SQL transacional e bloqueia quitação duplicada.
- Edge Functions separadas para administração e portal do parceiro.
- Painel administrativo inicial para convites, aprovação/suspensão, percentual, mensagens e registro de pagamentos.
- Portal individual do parceiro com alunos, comissões, pagamentos, mensagens e atualização de chave PIX.
- Cadastro do aluno permite selecionar parceiro indicador.
- Login encaminha o perfil parceiro para página independente.
- Scripts do parceiro foram excluídos do cache compartilhado do service worker.
- No módulo Exames, a lista de próximos exames no painel inicial agora é atualizada após carregar os dados.

## Estado da validação
- Sintaxe dos arquivos JavaScript e scripts inline do HTML conferida sem erros.
- Revisão estática dos arquivos SQL e Edge Functions realizada; ainda não equivale a execução real do banco nem a compilação Deno.
- O projeto Supabase de QA associado ao Preview (voyjssflroiwdyaacthh) está INACTIVE. Por isso a migration não foi aplicada e as Edge Functions não foram implantadas; não há como executar testes de integração neste momento.
- A migration e as funções estão somente no branch; nada foi aplicado ao Supabase oficial.
- Nenhum merge ou deploy de produção foi feito.

## Próximas verificações obrigatórias
1. Reativar o projeto QA quando estiver disponível e confirmar o status ACTIVE_HEALTHY.
2. Aplicar a migration somente no QA e revisar a execução sem dados reais.
3. Implantar as duas Edge Functions somente no QA.
4. Testar convite, aprovação, suspensão, login e isolamento entre dois parceiros.
5. Testar aluno indicado, vendas de serviços, desconto, devolução, aulas realizadas, liberação e pagamento único de comissão.
6. Testar exclusão de acesso, mensagens em massa/individuais, leitura e chave PIX.
7. Testar Exames visualmente e operacionalmente no Preview.
8. Só depois consolidar a versão para revisão final; publicação depende de autorização separada.
