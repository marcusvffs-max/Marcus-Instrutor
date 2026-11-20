# Plano de implementação — relatórios por instrutor

## Base de trabalho

- Repositório: `marcusvffs-max/Marcus-Instrutor`
- Branch de trabalho: `feature/relatorios-instrutor-app`
- Base: branch `feature/atendimentos-whatsapp-main`, PR #3.
- A branch foi criada a partir do head da PR #3 em 20/11/2026.
- Esta implementação não altera a PR #3 nem a PR #4.

## Estado confirmado na base

1. O login Supabase está embutido no final de `index.html`.
2. A função `conferirAdministrador()` só aceita `profiles.role === "admin"`; qualquer outro papel é desconectado.
3. O texto da tela de login também informa que somente administrador pode entrar.
4. O botão `#btnUsuarios` existe na tela de configurações, mas não há implementação de gerenciamento de usuários identificada no `script.js`.
5. Os relatórios em `script.js` leem os arrays locais `db.alunos`, `db.aulas`, `db.veiculos` e `db.movimentacoes`, carregados de `localStorage`.
6. O seletor do relatório individual é preenchido a partir de `db.alunos`; os três relatórios de aulas são montados no navegador com dados locais.
7. A autenticação da PR #3 e o painel WhatsApp devem ser preservados. As regras da Assistente Virtual não fazem parte deste escopo.

## Auditoria de carregamento do frontend (20/11/2026)

Na branch `feature/relatorios-instrutor-app`, a inspeção das versões atuais confirmou:

- `index.html` inclui `script.js` antes do bloco inline que valida o perfil.
- `script.js` lê `localStorage` no topo (`let db = carregarDados()`, linha 37) e chama `iniciarAplicativo()` sem aguardar autenticação (linha 2951).
- `contratos.js` e `whatsapp-panel.js` também são carregados antes da validação do perfil.
- `whatsapp-panel.js` cria sua página e botão durante a própria execução.
- O login continua aceitando apenas admin.

Isso impede liberar instrutores com segurança pela simples mudança da condição do login. A implementação deverá carregar módulos dinamicamente, somente após a validação do perfil: módulos atuais apenas para admin; módulo novo, isolado e sem acesso ao localStorage administrativo, para instrutor.

## Objetivo funcional

- Administrador: manter acesso completo às telas e funcionalidades atuais.
- Instrutor: após autenticação e validação do papel, exibir somente a área de relatórios autorizada.
- Relatórios de instrutor: consultar exclusivamente dados do próprio usuário no Supabase; não usar o `localStorage` como fonte de dados.
- A separação efetiva deve ser garantida por RLS no banco, não apenas por ocultação de menus ou filtros JavaScript.

## Relatórios a migrar

| Relatório | Fontes Supabase |
|---|---|
| Individual por aluno | `students`, `lessons`, `vehicles` |
| Aulas por período | `lessons`, `students`, `vehicles` |
| Lista diária | `lessons`, `students`, `vehicles` |
| Financeiro | `financial_transactions` |
| Detalhamento de vendas | `sales`, `sale_items`, `products` |

A implementação deve respeitar os nomes e tipos reais das colunas existentes, incluindo os relacionamentos por UUID. Não presumir que o modelo local e o modelo Supabase são idênticos.

## Sequência segura

1. Revisar o esquema atual e as políticas RLS das tabelas envolvidas, sem executar alterações.
2. Revisar e corrigir o SQL de segurança da PR #4 antes de qualquer aplicação. Verificar especialmente proteção de `profiles.role`, permissões de cadastro e políticas de leitura/escrita por papel.
3. Reorganizar a ordem de carregamento: autenticar primeiro; carregar `script.js`, `contratos.js` e `whatsapp-panel.js` somente para admin; para instrutor, carregar exclusivamente um módulo de relatórios isolado.
4. Implementar consultas Supabase dos relatórios e preservar os formatos de impressão/PDF existentes. O módulo de instrutor não poderá ler `marcus_instrutor_novo_v1` nem inicializar rotinas administrativas.
5. Criar estratégia de backup e importação dos dados locais, com mapeamento de IDs locais para UUIDs. Não apagar nem sobrescrever dados locais.
6. Revisar service worker/cache, logout e troca de contas no mesmo aparelho para evitar reaproveitamento de módulos ou dados administrativos.
7. Validar isolamento com duas contas de instrutor e uma conta admin, usando registros de teste identificáveis.
8. Somente após aprovação do usuário e validação de segurança, considerar habilitar contas comuns.

## Restrições

- Não executar SQL de alteração, migração, cadastro de usuários, merge ou deploy sem autorização explícita.
- Não habilitar acesso de instrutor enquanto RLS e consultas dos relatórios não estiverem prontas.
- Não alterar login, autenticação ou painel da PR #3 fora do necessário e sem manter a compatibilidade.
- Não alterar o comportamento da Assistente Virtual, suas regras de ativação ou pausa.
- Não repetir testes de orçamento já concluídos.
