# Plano consolidado de migração segura — instrutores e relatórios

Data: 20/11/2026  
Status: plano técnico; nenhuma etapa de banco ou deploy executada.

## Objetivo

Liberar instrutores comuns para consultar somente seus próprios relatórios, mantendo Marcus como administrador global. A liberação só ocorre depois de separar autenticação, dados, relatórios e privilégios.

## Estado real confirmado

1. PostgreSQL 17.11.
2. O schema `private` não possui objetos no momento da auditoria. Portanto, a revogação de acesso de PUBLIC/anon/authenticated ao schema não remove acesso a objetos existentes hoje. Revalidar imediatamente antes da execução.
3. O role `postgres` não é superuser, embora tenha BYPASSRLS e CREATEROLE/CREATEDB. O role `supabase_admin` é superuser.
4. Não foi encontrada membership de `postgres` em `supabase_admin`. Logo, não presumir que uma migration executada como postgres possa alterar default privileges pertencentes a supabase_admin.
5. Há default privileges amplos no schema public para objetos criados por `postgres` e `supabase_admin`. Em particular, os defaults de tabela concedem privilégios amplos a authenticated; os defaults de função concedem EXECUTE a authenticated; os defaults de sequence concedem privilégios de uso/atualização. Os defaults de supabase_admin também incluem anon.
6. A auditoria de grants por coluna encontrou permissões diretas para authenticated em colunas das tabelas cobertas. O SQL revisado passou a removê-las explicitamente.
7. O schema private estava vazio; o SQL cria nele apenas funções auxiliares de role e trigger.
8. O Security Advisor ainda aponta RLS sem policies em sales, sale_items e financial_transactions; o SQL proposto cria policies para essas três. Também aponta whatsapp_conversations e whatsapp_messages sem policies, que permanecem fora deste escopo e não devem ser alteradas sem auditoria separada.
9. O Advisor aponta proteção contra senhas vazadas desativada. Não alterar configuração Auth nesta entrega; tratar como item separado com decisão do administrador.

## Sequência de implementação proposta

### Fase A — Pré-checagem imediatamente antes da migração
- confirmar branch/commit e versão final do SQL;
- confirmar contagens e ausência de dados inconsistentes;
- reconsultar policies, grants de tabela/coluna, FKs, triggers, funções, sequences, schemas expostos e default ACLs;
- verificar se a tabela `app_settings` continua sem FK para Auth;
- confirmar que nenhuma alteração concorrente ocorreu desde a auditoria;
- fazer backup/garantir restauração disponível conforme recursos já existentes no plano. Não criar branch de banco nem recurso pago sem autorização.

### Fase B — Hardening dos privilégios existentes
- aplicar somente em migration revisada e aprovada;
- revogar privilégios de tabela e coluna para PUBLIC, anon e authenticated nas tabelas-alvo;
- conceder o mínimo de privilégios necessário à API;
- não revogar privilégios de service_role;
- conferir privilégios efetivos após a mudança.

### Fase C — Default privileges
- para objetos futuros criados por postgres, preparar revogações de defaults para anon/authenticated em tabelas, sequences e funções, com grants explícitos por objeto quando necessário;
- para defaults pertencentes a supabase_admin, não executar comandos como postgres sem confirmar capacidade administrativa: postgres não é membro de supabase_admin e não é superuser nesta configuração;
- avaliar o controle “Automatically expose new tables” nas configurações Data API do projeto e os grants residuais documentados pela Supabase;
- não alterar defaults de funções sem inventariar RPCs e chamadas atuais;
- não afirmar que defaults de supabase_admin foram corrigidos até haver confirmação por catálogo.

### Fase D — Papéis e RLS
- criar funções auxiliares no schema private, com SECURITY DEFINER, search_path vazio, owner revisado e EXECUTE mínimo;
- instalar proteção de role em profiles;
- remover policies antigas com nomes conferidos e instalar policies admin globais e instrutor somente SELECT próprio;
- manter products e app_settings admin-only;
- não alterar policies de WhatsApp ou IA.

### Fase E — Integridade referencial
- garantir que aula, aluno e veículo tenham o mesmo owner;
- garantir que venda e aluno tenham o mesmo owner quando aluno estiver preenchido;
- garantir que item e venda tenham o mesmo owner;
- garantir que movimentação e aluno/venda relacionados tenham o mesmo owner;
- manter a exceção do produto central: item de venda pode referenciar catálogo de Marcus, preservando snapshot de descrição e preço;
- definir constraints compostas ou triggers de validação após verificar comportamento ON DELETE e dados órfãos. O SQL RLS atual ainda não implementa essas garantias.

### Fase F — Gerenciamento de contas
- Edge Function exclusiva do servidor;
- autenticar o solicitante pelo token recebido e confirmar role admin em consulta privilegiada;
- usar service_role somente no cliente backend isolado;
- papel fixo no servidor como instrutor; nunca aceitar role livre do navegador ou user_metadata como fonte de autorização;
- tratar convite e criação de profile como operação não atômica, com reconciliação de falha parcial;
- não enviar convite real até autorização explícita do administrador.

### Fase G — Separação do frontend
- autenticar antes de carregar módulos;
- admin carrega módulos administrativos atuais;
- instrutor carrega módulo isolado, somente relatórios, sem ler localStorage administrativo;
- sair limpa dados e tela;
- revisar service worker/cache para não servir conteúdo administrativo à sessão de instrutor.

### Fase H — Testes e liberação
Testar com admin e dois instrutores distintos:
- admin vê e administra dados de ambos;
- instrutor A só lê dados de A;
- instrutor B só lê dados de B;
- instrutores não escrevem nem excluem;
- instrutores não elevam role;
- relações cruzadas de owner são recusadas;
- products e app_settings não são acessíveis a instrutores;
- relatórios não usam localStorage do admin;
- nenhuma alteração inesperada em WhatsApp/IA.

Só liberar acesso comum após todos os testes aprovados e revisão do Advisor.

## Observações de documentação Supabase atual

- A Supabase separa grants (se a role pode alcançar o objeto pela Data API) de RLS (quais linhas pode acessar).
- A documentação atual informa que default privileges para tabelas, funções e sequences podem expor objetos novos; a opção de exposição automática da Data API deve ser revisada, e privilégios residuais como TRUNCATE/REFERENCES/TRIGGER/MAINTAIN não são resolvidos apenas por RLS.
- `inviteUserByEmail` é uma ação administrativa de servidor e sua opção `data` grava em user_metadata; esse campo não deve ser usado para decidir papel/autorização.
- Links de referência:
  - https://supabase.com/docs/guides/api/securing-your-api
  - https://supabase.com/docs/guides/auth/users
  - https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail

## Itens que continuam bloqueando produção

1. O SQL revisado ainda não implementa integridade cross-owner por constraint/trigger.
2. Default privileges de supabase_admin não foram corrigidos nem comprovadamente controlados.
3. A função Edge de convite ainda precisa de revisão final e testes de falha parcial.
4. O frontend ainda não foi separado por papel.
5. Não há teste de isolamento com duas contas instrutoras.

## Segurança operacional

- Nenhum SQL foi executado.
- Nenhuma policy/grant/constraint/trigger foi alterada.
- Nenhum usuário foi criado ou convidado.
- Nenhum deploy foi realizado.
- Nenhum recurso pago ou branch de banco foi criado.


## Atualização crítica — trigger de perfil (20/11/2026)

A revisão da função de proteção de papel encontrou conflito com o trigger em `auth.users`: a versão anterior rejeitava INSERT quando `auth.uid()` fosse NULL, o que poderia bloquear a criação de usuários pelo Supabase Auth.

A proposta foi corrigida:
- todo novo usuário Auth recebe perfil `instrutor` por padrão, em trigger transacional;
- o papel não é lido de metadata;
- INSERT interno de perfil não exige `auth.uid()`;
- mudança de papel em UPDATE continua reservada ao backend com claim `service_role`;
- clientes autenticados não recebem INSERT/UPDATE/DELETE em `profiles`.

O SQL de revisão agora inclui a função e o trigger, mas permanece documento não executado. O desenho exige teste em ambiente isolado antes da produção. O trigger se aplica a qualquer usuário criado em Auth, inclusive usuários criados pelo Dashboard; novos administradores exigirão fluxo backend explícito e autorizado.

Ver:
- `docs/desenho-corrigido-trigger-auth-perfis.md`
- `docs/rascunho-seguranca-relatorios-instrutor-revisado.sql`


## Auditoria complementar de defaults e memberships (20/11/2026)

A nova leitura de `pg_default_acl` confirmou defaults amplos para objetos futuros no schema `public`, criados por `postgres` e `supabase_admin`. Há permissões amplas de tabelas, sequences e EXECUTE em funções para papéis de API; os defaults de `supabase_admin` também incluem `anon`.

Não foi feito REVOKE global. A ação correta é controlar grants em cada migration de objeto da aplicação e revisar o owner efetivo que cria cada objeto. Não alterar defaults globais gerenciados pelo Supabase sem plano específico e autorização.

A auditoria de memberships não encontrou usuário final herdando diretamente `service_role`; `authenticator` tem memberships com `INHERIT=false` e `SET=true`, compatível com a troca de papel do PostgREST. Não remover memberships internas.

Documento: `docs/auditoria-final-default-privileges-e-roles.md`.
