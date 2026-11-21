# Persistência da identificação do contratante

## Escopo

Implementado somente na branch `feature/relatorios-instrutor-app` e no projeto Supabase de testes `voyjssflroiwdyaacthh`.

Os campos salvos por conta em `public.app_settings` são:

- `contratante_nome`
- `contratante_documento`
- `contratante_nacionalidade`
- `contratante_estado_civil`
- `contratante_profissao`
- `contratante_endereco`

## Comportamento

- O painel administrativo e a área do instrutor carregam os campos da linha cujo `owner_id` é o ID da conta autenticada.
- A alteração de um campo salva após o campo perder o foco; o botão **Salvar meus dados** também grava explicitamente.
- O helper `contratante-perfil.js` não usa `localStorage` nem `sessionStorage` para armazenar esses dados.
- O gerador de contrato do instrutor usa o nome e CPF/CNPJ salvos na identificação do instrutor.
- O gerador de contratos do painel administrativo usa os mesmos campos de identificação.
- O service worker não mantém o helper no cache compartilhado.

## Segurança

A tabela `app_settings` já tinha RLS e policies para SELECT, INSERT e UPDATE limitadas aos papéis `admin` e `instrutor`, com `owner_id = auth.uid()`. A chave primária é `owner_id`.

No projeto de testes, a verificação com dois instrutores sintéticos confirmou:
- a conta A enxerga sua própria linha;
- a conta B não enxerga a linha da conta A;
- uma tentativa de UPDATE por B não altera a linha de A;
- uma conta temporariamente promovida a admin consegue inserir e ler sua própria linha.

As linhas sintéticas foram removidas ou revertidas por rollback ao final dos testes; o perfil temporariamente promovido voltou ao papel instrutor. Nenhum dado pessoal real foi usado.

## Limites da validação

Os arquivos JavaScript alterados passaram por verificação de sintaxe e verificações estáticas de integração. Foi criado `scripts/test-contractor-profile.mjs` para regressão automatizada, mas a suíte Node ainda precisa ser executada em ambiente de runtime e os formulários precisam de teste visual/browser.

A migration `20261121170000_add_contractor_identity_to_app_settings.sql` foi aplicada somente no Supabase de testes. O Supabase original foi consultado apenas por SELECT e continua sem essas seis colunas. Nenhum deploy foi feito.
