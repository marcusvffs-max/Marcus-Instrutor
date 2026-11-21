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
