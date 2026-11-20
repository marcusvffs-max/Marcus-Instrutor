# Revisão da integração do login e da área de relatórios do instrutor

Data: 20/11/2026
Branch: `feature/relatorios-instrutor-app`

## Escopo revisado

- `index.html`: autenticação e direcionamento por `profiles.role`.
- `instrutor.html`, `instrutor.css`, `instrutor.js`: área separada do instrutor.
- `service-worker.js`: cache e carregamento dos recursos.

## Comportamento implementado

1. A tela de login cria o cliente Supabase com a chave pública e mantém `sessionStorage` como armazenamento da sessão.
2. Após login ou recuperação de sessão, o perfil é consultado em `profiles`.
3. Perfil `admin`: somente após validar a role, carrega dinamicamente `script.js`, `contratos.js` e `whatsapp-panel.js`, nesta ordem. Depois dispara `marcus-authenticated`, preservando o fluxo do painel administrativo.
4. Perfil `instrutor`: redireciona para `instrutor.html`; os scripts administrativos não são carregados nessa página.
5. Perfil ausente ou role não reconhecida: acesso recusado.
6. A página do instrutor utiliza o mesmo projeto Supabase e `sessionStorage`, verifica a sessão e exige `profiles.role = 'instrutor'`.
7. O botão Sair encerra a sessão local e retorna ao login.

## Auditorias estáticas realizadas

- O HTML do instrutor contém os elementos referenciados pelo JavaScript; `btnImprimir` é criado dinamicamente durante a montagem do relatório.
- O JavaScript do instrutor não referencia `localStorage`, `STORAGE_KEY` ou `carregarDados()`.
- Consultas do módulo são SELECT em:
  - `profiles(id,nome,role)`
  - `students(id,nome,categoria,aulas_compradas,aulas_restantes)`
  - `lessons(id,student_id,data_aula,horario,numero_aula,status,vehicle_id)`
  - `vehicles(id,nome)`
- Não foram encontrados métodos Supabase de escrita (`insert`, `update`, `upsert`, `delete`) no módulo do instrutor.
- A lista diária exclui status `Cancelada`, ordena por data/horário e imprime espaço de assinatura em branco.
- O relatório por período aplica intervalo inclusivo.
- A versão da biblioteca Supabase JS e as credenciais públicas são as mesmas do login principal.
- O Service Worker inclui os arquivos da área de instrutor e busca os scripts administrativos diretamente da rede, sem adicioná-los ao cache compartilhado.

## Bloqueio de segurança para produção

A auditoria anterior do banco identificou que a política atual de `profiles` permite ao usuário atualizar o próprio registro sem impedir alteração de `role`. Enquanto a migration de hardening revisada não for aplicada e validada, um usuário autenticado poderia tentar promover o próprio perfil a `admin`.

Por isso:

- Não implantar/publicar esta integração para instrutores ainda.
- Não convidar nem liberar contas de instrutor ainda.
- Não executar a migration sem nova pré-checagem e autorização explícita.
- Não alterar as policies, triggers ou grants nesta etapa.
- A migration revisada permanece apenas como rascunho documental.

## O que ainda não foi testado

- Login real com uma conta de instrutor.
- Consultas com RLS após aplicação da migration.
- Impressão A4 em navegador/dispositivo real.
- Fluxo real de logout/expiração entre as duas páginas.
- Comportamento em implantação Vercel e atualização do Service Worker.

Nenhum deploy, alteração de banco, convite, criação de usuário ou merge foi realizado nesta etapa.
