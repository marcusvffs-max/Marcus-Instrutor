# Fluxo de autenticação por papel — revisão da interface

Data: 20/11/2026
Base consultada: `feature/atendimentos-whatsapp-main` (PR #3)
Destino de trabalho: `feature/relatorios-instrutor-app`

## Estado atual confirmado

1. A tela de login fica em `index.html` e usa Supabase JS 2.119.1 com chave publishable.
2. A sessão é persistida em `sessionStorage`.
3. A função interna `conferirAdministrador(usuario)` consulta `profiles.id, role` e só aceita `role === 'admin'`; para qualquer outro papel, encerra a sessão.
4. A mensagem inferior do login diz que somente a conta de administrador cadastrada pode acessar.
5. O botão de sair é conectado dentro de `conferirAdministrador`.
6. `script.js` é carregado antes do bloco inline de autenticação. No início do arquivo, ele já executa `let db = carregarDados()`, lendo a chave local `marcus_instrutor_novo_v1`.
7. O aplicativo tem páginas administrativas e navegação com vários botões; os relatórios atuais usam arrays locais.

## Risco importante para a futura liberação

Não basta trocar a condição `role !== 'admin'` por uma aceitação de `instrutor`.

Se isso for feito isoladamente:
- o instrutor pode entrar na interface completa;
- o código do aplicativo já terá carregado o localStorage compartilhado do navegador/aparelho;
- os eventos e rotinas da interface administrativa podem continuar ativos;
- relatórios locais podem apresentar dados que não pertencem à conta autenticada.

Por isso, não liberar o papel instrutor até que a autenticação e a inicialização do aplicativo sejam separadas por papel.

## Fluxo proposto

### Administrador
- Validar sessão e papel admin.
- Inicializar o aplicativo completo como hoje.
- Manter páginas, menus, configurações, cadastros, financeiro, produtos, contratos, backup e painel de atendimentos.
- Consultar dados de todos os instrutores por políticas administrativas do banco.

### Instrutor
- Validar sessão e papel instrutor.
- Não inicializar rotinas administrativas nem usar `marcus_instrutor_novo_v1` como fonte de dados.
- Exibir somente a página de relatórios e ação de sair.
- Carregar os relatórios diretamente do Supabase, sempre sob RLS e usando a sessão autenticada.
- Não permitir escolher outro `owner_id` no cliente; o filtro definitivo deve ser imposto no banco.
- Não exibir nem permitir acesso por navegação direta a outras páginas.

### Papel inexistente ou diferente
- Negar o acesso e encerrar a sessão local, mantendo mensagem genérica.

## Ordem de implementação

1. Finalizar e validar as políticas RLS e a proteção de `profiles.role`.
2. Criar um fluxo administrativo seguro de criação/ativação de contas (Auth + profile), sem expor service_role no navegador.
3. Separar a inicialização do `script.js` para que instrutores não executem a inicialização administrativa nem carreguem localStorage.
4. Adaptar o bloco de autenticação para reconhecer admin e instrutor, com interface restrita ao papel.
5. Migrar consultas de relatórios para Supabase e manter a impressão/PDF existente.
6. Testar com duas contas de instrutor e a conta admin, incluindo tentativas de acesso direto a páginas e registros de outro owner_id.

## Estado

Este documento é planejamento técnico. Nenhum código de autenticação foi alterado, nenhuma conta foi criada e nenhum usuário instrutor foi liberado.
