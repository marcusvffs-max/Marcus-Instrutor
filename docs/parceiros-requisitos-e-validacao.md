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

## Estado da validação (24/11/2026)
- Sintaxe dos arquivos JavaScript e scripts inline do HTML conferida sem erros na revisão anterior.
- Migration aplicada com sucesso somente no Supabase QA `voyjssflroiwdyaacthh`; índices para as chaves estrangeiras compostas também foram incluídos na migration do branch.
- As seis tabelas do módulo estão com RLS habilitado.
- Edge Functions `admin-manage-partners` e `partner-portal` implantadas no QA, ambas com `verify_jwt=true`.
- Teste transacional em QA aprovado: comissão de 10% criada para serviço, duas aulas contabilizadas sem duplicação, liberação somente após a segunda aula, recálculo da comissão de R$20 para R$10 após redução do valor líquido, pagamento único e bloqueio da tentativa de pagamento duplicado. Todos os dados de teste foram revertidos com ROLLBACK.
- Advisor de performance não apontou mais chaves estrangeiras sem índice no módulo Parceiros. Permanecem alertas preexistentes sobre funções SECURITY DEFINER de outros módulos, tabelas de WhatsApp sem políticas diretas (bloqueio intencional) e proteção contra senhas vazadas desativada no projeto QA.
- A conta administrativa `marcusvffs@gmail.com` já existe no QA com perfil admin; credenciais não foram alteradas nem copiadas da produção.
- O Preview mais recente da branch estava READY antes desta atualização de documentação; novo Preview será gerado pelo commit desta atualização.
- Nada foi aplicado ao Supabase oficial. Nenhum merge ou deploy de produção foi feito.

## Próximas verificações obrigatórias
1. Confirmar o novo Preview READY e validar login com a conta administrativa QA (senha do projeto QA, independente da produção).
2. Testar convite, aprovação, suspensão, login de parceiro e isolamento entre dois parceiros.
3. Testar produtos e itens fixos excluídos de comissão, desconto/devolução, vínculo FIFO de aulas e reversão de aula.
4. Testar cadastro de aluno indicado, mensagens em massa/individuais, leitura, chave PIX e pagamentos.
5. Testar Exames visualmente e operacionalmente no Preview.
6. Corrigir qualquer falha encontrada e consolidar para revisão final; publicação depende de autorização separada.
