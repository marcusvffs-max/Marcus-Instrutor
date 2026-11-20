# Revisão consolidada da migration de segurança e relatórios

Data: 20/11/2026  
Branch: `feature/relatorios-instrutor-app`  
Commit da branch consultado antes desta revisão: `0ffbea36cefb2ec1e5ffc1642398ba8006fb03b2`  
Arquivo SQL revisado: `docs/rascunho-seguranca-relatorios-instrutor-revisado.sql`  
Blob SHA consultado: `48cfa2aa8cc9f64784d7325d6fd8e9f6f8235c13`

**Resultado: NÃO APROVADO PARA EXECUÇÃO/PRODUÇÃO.** O desenho está coerente em vários pontos, mas faltam validações de integração e decisões operacionais. Esta revisão foi estática e read-only.

## 1. O que foi conferido

- O arquivo SQL completo, 521 linhas, foi lido diretamente da branch atual.
- A branch foi consultada pela API GitHub; não foi presumido SHA antigo.
- As seis FKs simples que o script remove correspondem exatamente às constraints existentes:
  - `lessons_student_id_fkey`
  - `lessons_vehicle_id_fkey`
  - `sales_student_id_fkey`
  - `sale_items_sale_id_fkey`
  - `financial_transactions_student_id_fkey`
  - `financial_transactions_sale_id_fkey`
- FKs de owner_id para Auth e `sale_items_product_id_fkey` permanecem fora da substituição.
- Não existem triggers de usuário atuais em `auth.users` nem em `public.profiles`, segundo a auditoria anterior.
- `auth.users` pertence a `supabase_auth_admin`; `postgres` tem privilégio TRIGGER na tabela e é proprietário das tabelas públicas da aplicação, com BYPASSRLS.
- O schema `private` não existe atualmente no catálogo consultado. O SQL o criará. A configuração efetiva de schemas expostos do PostgREST não foi confirmada por esta consulta; deve ser verificada no Dashboard antes de produção.
- Security Advisor atual (antes da migration) reporta cinco tabelas RLS-enabled sem policies: `sales`, `sale_items`, `financial_transactions`, `whatsapp_conversations`, `whatsapp_messages`. As três primeiras estão no escopo do SQL; as duas WhatsApp ficam explicitamente fora.
- Advisor também reporta proteção contra senhas vazadas desativada. Não alterar configuração Auth sem autorização específica.

## 2. Partes coerentes no SQL

- Revoga privilégios de tabela e privilégios concedidos diretamente a colunas para PUBLIC/anon/authenticated nas tabelas cobertas.
- Concede ao cliente authenticated somente SELECT em profiles e CRUD nas tabelas operacionais, deixando RLS decidir por papel.
- Não concede TRUNCATE, REFERENCES ou TRIGGER ao cliente.
- Mantém service_role fora dos REVOKEs explícitos.
- Cria helper `private.current_app_role()` SECURITY DEFINER com `search_path = ''`, owner postgres, e EXECUTE apenas para authenticated; a função só retorna o papel do próprio usuário autenticado.
- Policies administrativas permitem controle global ao perfil admin.
- Policies de instrutor limitam leitura por `owner_id = auth.uid()` e verificam relações associadas.
- Policies não concedem escrita ao instrutor.
- Trigger de profile força `role='instrutor'` para INSERT não-service_role e bloqueia alteração de papel por usuário não-service_role.
- Trigger Auth cria perfil na mesma transação e usa metadata apenas para nome de exibição, nunca para autorização.
- FKs compostas propostas impedem relações cross-owner, mantendo a exceção intencional do catálogo central de produtos.
- A remoção das seis FKs simples usa nomes exatos confirmados no catálogo e ocorre dentro da mesma transação que cria as compostas.

## 3. Riscos e pré-condições ainda abertos

### 3.1 Trigger global de Auth

O trigger em `auth.users` será acionado para qualquer usuário criado no projeto: convite, signup habilitado, criação via Dashboard ou outra integração. Todos receberão `role='instrutor'`.

Antes de instalar, confirmar que:
- o projeto não depende de criar outras categorias de usuários por Auth;
- novos administradores continuarão sendo criados por procedimento administrativo separado;
- a equipe aceita que falha na criação do perfil bloqueie a criação do usuário Auth, como esperado em uma operação transacional.

Não executar convites ou criar usuários para validar sem autorização.

### 3.2 Contexto JWT dentro do trigger

A função `protect_profile_role()` permite preservar papel enviado apenas quando `auth.jwt()->>'role' = 'service_role'`. Durante o trigger interno de Auth, o contexto pode não carregar esse JWT; nesse caso, a função força instrutor, que é o comportamento desejado para novos usuários.

O caminho de promoção administrativa de papel deve ser testado separadamente com cliente service_role de backend, garantindo que o header Authorization usado na chamada PostgREST seja o JWT service_role e não o JWT do administrador autenticado. Não presumir que uma chamada `auth.admin.*` altera profiles automaticamente.

### 3.3 Schema private e Data API

O SQL concede USAGE em `private` a authenticated porque as policies chamam `private.current_app_role()`. O schema não deve ser incluído nos schemas expostos do PostgREST. A consulta de catálogo não revelou o valor de `pgrst.db_schemas`; verificar a lista efetiva em Dashboard → API/Data API antes de produção. Mesmo se não estiver exposto, grants e RLS devem permanecer restritos.

### 3.4 Default privileges

Os defaults globais de `postgres` e `supabase_admin` permanecem amplos. O SQL não os altera, corretamente evitando uma revogação global potencialmente destrutiva. Porém, cada nova tabela/função da aplicação precisará de grants explícitos e revisão de RLS/EXECUTE na mesma migration. Isso é um controle operacional pendente, não resolvido por este script.

### 3.5 Compatibilidade e execução

A sintaxe `ON DELETE SET NULL (student_id)` / `(sale_id)` exige PostgreSQL 17; o projeto foi auditado como PostgreSQL 17.11. Não executar em projeto PostgreSQL 15.

A criação de UNIQUEs compostas e FKs exige locks e pode falhar se os dados mudarem entre auditoria e execução. Reexecutar as consultas de inconsistência e checar constraints já existentes imediatamente antes da migration. Não adicionar constraints `NOT VALID` sem plano de validação posterior.

### 3.6 Interface e relatórios

Mesmo com RLS correto, o trabalho ainda não está pronto para liberar instrutores:
- o frontend ainda não tem módulo isolado de relatórios por papel;
- relatórios atuais usam localStorage, não Supabase;
- login/roteamento por papel precisa impedir carregamento do painel administrativo para instrutor;
- service worker/cache deve evitar reutilizar HTML/JS administrativos em sessão de instrutor;
- relatórios financeiros devem usar regras de status já documentadas, sem duplicar `sales.total` com `financial_transactions`.

## 4. Security Advisor — linha de base

No momento da revisão, antes de executar o SQL:
- 3 findings no escopo: sales, sale_items, financial_transactions sem policies;
- 2 findings fora do escopo: whatsapp_conversations e whatsapp_messages sem policies;
- 1 warning Auth: leaked password protection desabilitada.

Depois de eventual implantação autorizada, rodar Advisor novamente. O resultado esperado é que os 3 findings financeiros desapareçam. Os dois de WhatsApp e o warning Auth permanecerão até uma decisão separada; não tentar corrigi-los nesta migration.

## 5. Changelog Supabase consultado

O changelog de breaking changes consultado não apresentou alteração recente que invalide as operações PostgreSQL usadas neste rascunho. Há, porém, uma mudança importante já efetiva em 30/10/2026: novas tabelas public não são expostas automaticamente à Data API em projetos existentes; tabelas existentes preservam seus grants. A migration trabalha em tabelas existentes e concede explicitamente acesso a authenticated, então a configuração Data API ainda deve ser conferida. Fonte: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

O Supabase recomenda trigger em `auth.users` com `SECURITY DEFINER` e `search_path = ''`, e alerta que falha no trigger pode bloquear signup. Fonte: https://supabase.com/docs/guides/auth/managing-user-data

## 6. Próxima sequência segura

1. Revisar o endpoint Edge Function de gerenciamento de instrutores, incluindo autorização admin, isolamento do service_role e reconciliação de falha parcial.
2. Fechar a migration SQL em revisão estática, com lista de pré-checagens e pós-checagens.
3. Fazer backup/confirmar recuperação antes de qualquer mudança em produção.
4. Obter autorização explícita antes de aplicar SQL no projeto atual. Não usar branch de banco paga.
5. Após autorização, aplicar em janela controlada; executar testes read-only e Advisor. Testes com usuários reais exigem autorização específica.
6. Implementar frontend de login e módulo de relatórios isolado.
7. Só liberar contas de instrutor depois de testar isolamento com duas contas distintas e admin.

## 7. Estado operacional

- Nenhum SQL executado.
- Nenhuma policy, grant, FK, trigger ou função alterada.
- Nenhuma conta/convite/e-mail criado.
- Nenhum deploy.
- PR3 e PR4 não alteradas.
- WhatsApp e IA não alterados.
- Nenhum recurso pago criado.


## 8. Revisão do endpoint de convite — conflito corrigido

A inspeção do documento `docs/edge-function-gerenciar-instrutores.md` encontrou conflito: o código anterior chamava `inviteUserByEmail` e depois fazia INSERT manual em `profiles`. Com o trigger transacional proposto, o profile já existe quando Auth retorna; o INSERT manual duplicaria a PK e poderia disparar exclusão compensatória do usuário após o convite.

O documento foi corrigido:
- convite Auth cria o usuário;
- trigger cria o perfil instrutor;
- Edge Function apenas consulta e confirma o perfil;
- não existe mais INSERT manual;
- o endpoint só poderá ser implantado depois do trigger validado.

O código agora limita o corpo JSON a 8 KiB e não encaminha o Authorization do solicitante ao cliente service_role. Rate limit, allowlist CORS real, verificação das variáveis e teste de falha parcial continuam pendentes.

Arquivo: `docs/edge-function-gerenciar-instrutores.md`. Nenhuma Edge Function foi criada ou implantada.
