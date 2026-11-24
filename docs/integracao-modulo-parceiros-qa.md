# Integração do módulo de parceiros — estado da branch

Data: 24/11/2026  
Branch: `feature/relatorios-instrutor-app`

## Backend existente no projeto QA

O projeto QA `voyjssflroiwdyaacthh` já possui a fundação do módulo de parceiros:

- Tabelas: `partners`, `partner_commissions`, `partner_commission_lessons`, `partner_payouts`, `partner_messages` e `partner_message_recipients`.
- O perfil aceita o papel `parceiro`.
- Edge Functions ativas: `admin-manage-partners` (JWT obrigatório) e `partner-portal` (JWT obrigatório).
- A RLS separa a leitura administrativa pela conta proprietária e a leitura do parceiro aprovado pela conta vinculada.
- As comissões são geradas a partir de itens de serviço de vendas confirmadas de alunos associados ao parceiro; aulas realizadas alimentam o progresso, e o pagamento quita as comissões selecionadas.

## Integração frontend adicionada nesta branch

- Roteamento do papel `parceiro` para `parceiro.html`.
- Área administrativa de parceiros: convite, aprovação/suspensão/reprovação, ajuste de percentual, comunicados e registro de pagamento.
- Portal do parceiro: alunos indicados, progresso e valores de comissão, histórico de pagamentos, comunicados e atualização da chave PIX.
- Cadastro administrativo do aluno com associação opcional a um parceiro.
- Service worker atualizado para manter o portal estático em cache e não armazenar o script administrativo no cache compartilhado.
- Testes estáticos em `scripts/test-partner-module.mjs`.

## Bloqueio antes de produção

As migrations da fundação de parceiros aparecem no histórico do projeto QA (`partner_module_foundation`, `partner_foreign_key_indexes` e `fix_partner_commission_refund_rules`), mas os respectivos arquivos SQL não estão versionados nesta branch. As Edge Functions também estão confirmadas apenas no projeto QA.

Portanto, **não fazer merge nem deploy em produção** deste módulo até:
1. recuperar e versionar as migrations SQL completas;
2. revisar as migrations e as Edge Functions em conjunto;
3. aplicar a fundação no ambiente autorizado;
4. validar com contas de teste de administrador e parceiro;
5. testar associação de aluno, geração/progresso de comissão, comunicados, PIX e pagamento.

Nenhum dado real foi criado ou alterado durante esta integração. Nenhuma migration foi aplicada e nenhuma Edge Function foi implantada nesta etapa.
