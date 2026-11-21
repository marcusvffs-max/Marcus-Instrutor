# Auditoria de dados pessoais em refs do Git

Data da verificação: 21/11/2026.

O repositório é público. A varredura foi feita sem reproduzir valores pessoais nos relatórios ou na conversa.

## Arquivos atuais

As versões atuais de `contratos.js` e `index.html` em `main` e `feature/atendimentos-whatsapp-main` foram corrigidas anteriormente. A branch `feature/relatorios-instrutor-app` também contém a versão sem dados pessoais fixos.

Foram identificados padrões de CPF e endereço hardcoded em `contratos.js` nas seguintes refs adicionais:

- `backup-main-2026-11-19`
- `feature/contratos`
- `feature/relatorios-por-instrutor`
- `ia-whatsapp`

As quatro refs apontam para a mesma versão antiga do arquivo. Nenhuma dessas quatro branches foi alterada nesta etapa, pois a autorização anterior para corrigir branches abrangia somente `main` e `feature/atendimentos-whatsapp-main`.

## Histórico Git

O primeiro commit que introduziu `contratos.js` no histórico examinado é `3feef7317071223fdcc7e2a2ce535fe137ca914b`, de 18/11/2026. A análise do diff confirmou padrões de dados pessoais já nesse commit.

O histórico antigo permanece acessível nos ancestrais de `main`, `feature/atendimentos-whatsapp-main`, `feature/relatorios-instrutor-app`, `backup-main-2026-11-19`, `feature/contratos`, `feature/relatorios-por-instrutor` e `ia-whatsapp`.

## Ações não executadas

- Nenhuma reescrita de histórico, force push ou exclusão de refs.
- Nenhuma alteração nas quatro branches adicionais.
- Nenhuma mudança de visibilidade do repositório.
- Nenhuma alteração em deploy ou produção.

A remoção completa do conteúdo antigo exige uma operação coordenada de reescrita do histórico Git e atualização de todas as refs relevantes. Isso é disruptivo para clones e forks e requer autorização específica. A remoção do histórico do repositório, por si só, também não garante apagar cópias externas, caches ou forks.

## Atualização após autorização para corrigir quatro branches

Em 21/11/2026, foram atualizados os arquivos atuais nas quatro branches adicionais autorizadas:

- `backup-main-2026-11-19`
- `feature/contratos`
- `feature/relatorios-por-instrutor`
- `ia-whatsapp`

Em cada uma:
- `contratos.js` foi sincronizado com a versão segura sem dados pessoais fixos.
- `index.html` recebeu os seis campos dinâmicos de identificação do contratante e a versão de cache `contratos31`.
- A verificação estática confirmou ausência dos padrões pessoais identificados, um único bloco de identificação e sintaxe JavaScript válida.

A branch `backup/antes-contratos-2026-11-18` foi inspecionada separadamente: sua raiz contém apenas README, ícones, `index.html`, `manifest.json`, `script.js`, `service-worker.js` e `style.css`; não contém `contratos.js` nem arquivos com nomes de contrato. Os arquivos atuais verificados nessa ref não apresentaram os padrões pessoais examinados.

A branch `Nova-versao` também não contém arquivos com nomes relacionados a contratos na árvore raiz examinada.

A lista de refs heads consultada contém nove branches e não foram encontrados tags Git. Isso delimita a varredura às refs visíveis consultadas, sem afirmar remoção de objetos históricos, forks, clones ou caches.

## Estado após as correções

As quatro branches adicionais agora têm os arquivos atuais corrigidos. O histórico antigo permanece inalterado e continua contendo os dados pessoais nos commits ancestrais identificados. Não houve force push, reescrita de histórico, alteração de visibilidade ou deploy.
