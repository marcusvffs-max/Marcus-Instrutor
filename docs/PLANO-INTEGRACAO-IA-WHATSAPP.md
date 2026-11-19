# Plano de integração — IA e WhatsApp
## Projeto Marcus Instrutor

**Branch de desenvolvimento:** `ia-whatsapp`  
**Branch oficial:** `main`  
**Status:** diagnóstico inicial e planejamento; nenhuma alteração funcional realizada.

## 1. Objetivo

Adicionar atendimento por WhatsApp Business com IA, permitindo que o interessado solicite cadastro, informações sobre serviços e pacotes, agendamentos, alterações e consultas. A IA deverá registrar solicitações como pendentes. Nenhuma operação que altere os dados oficiais será concluída sem autorização explícita do instrutor.

## 2. Diagnóstico do aplicativo atual

- Aplicação web/PWA estática publicada no GitHub Pages.
- Arquivos principais identificados: `index.html`, `style.css`, `script.js`, `contratos.js`, `manifest.json` e `service-worker.js`.
- Os dados são armazenados no navegador por `localStorage`, usando a chave `marcus_instrutor_novo_v1`.
- Estrutura principal atual: `alunos`, `veiculos`, `aulas`, `produtos`, `vendas`, `movimentacoes` e `configuracoes`.
- O cadastro de aluno contém nome, telefone, CPF, endereço, categoria, situação, aulas contratadas e saldo.
- O agendamento utiliza aluno, data, horário, veículo, status e observações. Há validação de conflito por veículo/data/horário e controle de saldo quando uma aula é marcada como realizada.
- Produtos e serviços têm nome, classificação e preço. A venda pode conter vários itens, atualizar saldo de aulas e gerar movimentação financeira.
- O aplicativo possui exportação e restauração de backup local.
- Contratos dependem dos dados de alunos e configurações existentes.

## 3. Consequência técnica

O WhatsApp não pode gravar diretamente no `localStorage` de um aparelho. Esse armazenamento é local ao navegador/dispositivo e não funciona como banco compartilhado nem recebe webhooks externos.

Por isso, a integração exige um backend seguro e um banco de dados online. O GitHub Pages continuará servindo a interface; credenciais da Meta, chaves da IA e credenciais administrativas nunca serão colocadas no JavaScript público.

## 4. Arquitetura proposta

1. WhatsApp Business Platform / Cloud API para mensagens e webhooks.
2. Backend com endpoints autenticados para receber eventos, validar origem e controlar o fluxo.
3. Serviço de IA para interpretar mensagens e preencher solicitações estruturadas.
4. Banco de dados online para solicitações, estados de aprovação, usuários e auditoria.
5. Nova área no aplicativo para revisar, editar, aprovar ou recusar solicitações.
6. Camada de integração que executa operações aprovadas usando validações equivalentes às regras atuais.

## 5. Regra de aprovação

Estados previstos para solicitações: `pendente`, `em_revisao`, `aprovada`, `recusada`, `precisa_correcao` e `concluida`.

A IA pode coletar dados, responder dúvidas com informações autorizadas e criar uma solicitação pendente. A IA não pode, por conta própria, criar/alterar alunos oficiais, agendar aulas, alterar saldo, registrar vendas ou movimentações, emitir contratos finais, excluir registros ou confirmar pagamentos.

Toda aprovação deve registrar usuário responsável, data/hora, ação autorizada e dados submetidos. Operações financeiras e de agenda devem ser revalidadas no servidor no momento da aprovação para evitar duplicidade e conflitos.

## 6. Migração e preservação de dados

- Não substituir o armazenamento atual de imediato.
- Fazer cópia exportada e validada antes de qualquer migração.
- Definir importação controlada para banco online, com conferência de totais e amostras.
- Manter identificadores e vínculos entre alunos, aulas, veículos, vendas e movimentações.
- Não habilitar sincronização bidirecional até que conflitos, autenticação e recuperação estejam testados.
- Não usar dados reais em ambiente de teste sem proteção e autorização.

## 7. Etapas de implementação

1. Concluir inventário das regras e campos atuais.
2. Definir banco, autenticação, permissões e política de backup.
3. Criar backend isolado e ambiente de teste.
4. Implementar fila de solicitações pendentes e painel no aplicativo.
5. Conectar WhatsApp Cloud API e webhooks.
6. Configurar IA com ferramentas limitadas e respostas baseadas em dados aprovados.
7. Implementar aprovação transacional para cadastro, venda, agenda e contratos.
8. Testar cenários normais, duplicados, conflitos, falhas de rede e tentativas de operação sem autorização.
9. Só após validação do proprietário, preparar integração por pull request para o `main`.

## 8. Segurança e privacidade

- Segredos somente no backend e em variáveis de ambiente.
- Verificação de assinatura dos webhooks e proteção contra repetição de eventos.
- Autenticação forte para o painel administrativo e autorização por função.
- Minimização de dados pessoais, controle de acesso, retenção e trilha de auditoria conforme LGPD.
- Não solicitar CPF ou documentos antes de explicar a finalidade e obter os dados estritamente necessários.
- Respostas automáticas devem permitir encaminhamento para atendimento humano.

## 9. Limites deste documento

Este documento registra o diagnóstico e a proposta. Não altera arquivos funcionais, banco de dados, dados de alunos, publicação do PWA ou branch `main`.
