# Matriz de testes de autorização e isolamento RLS

Projeto: Marcus Instrutor  
Branch de referência: `feature/acessos-alunos-instrutor`  
Status: matriz parcialmente executada em projeto Supabase isolado; os casos não listados como aprovados permanecem pendentes.

## Objetivo

Validar, em um projeto Supabase isolado e descartável, que os privilégios SQL, RLS, triggers e integridade referencial impedem leitura ou alteração cruzada entre instrutores e alunos.

## Preparação obrigatória

Usar somente dados fictícios, sem telefone, CPF, e-mail ou nome de pessoas reais.

Criar quatro identidades Auth independentes:
- **Admin:** perfil `admin`.
- **Instrutor A:** perfil `instrutor`, com autorização ativa quando a regra de validade estiver instalada.
- **Instrutor B:** perfil `instrutor`, com autorização ativa quando a regra de validade estiver instalada.
- **Aluno A:** perfil `usuario`, associado exclusivamente a um cadastro fictício do Instrutor A por `students.user_id`.

Criar registros fictícios:
- Um aluno e um veículo do Instrutor A.
- Uma aula do aluno A vinculada ao veículo A.
- Um aluno e um veículo do Instrutor B.
- Uma aula do aluno B vinculada ao veículo B.
- Uma venda, item e transação para cada instrutor, se essas tabelas estiverem habilitadas no ambiente.
- Um produto e uma configuração global, para verificar exclusividade administrativa.

Guardar os UUIDs em variáveis de teste; não copiar dados reais. Tirar snapshot/backup do banco descartável antes de executar operações negativas.

## Matriz de autorização

| Identidade | Ler dados A | Ler dados B | Inserir/alterar/apagar dados operacionais | Alterar profiles.role | Ler produtos/configuração |
|---|---|---|---|---|---|
| anon | Negado | Negado | Negado | Negado | Negado |
| Aluno A | Somente agenda própria pela RPC | Negado | Negado | Negado | Negado |
| Instrutor A | Permitido | Negado | Negado | Negado | Negado |
| Instrutor B | Negado | Permitido | Negado | Negado | Negado |
| Admin | Permitido | Permitido | Permitido | Somente pelo backend confiável | Permitido |

A área do aluno não deve receber acesso direto às tabelas `students`, `lessons` ou `vehicles`; a consulta de agenda ocorre pela RPC autenticada e vinculada a `auth.uid()`.

## Casos positivos e negativos

### A. Sem autenticação e papel de aluno

- [ ] **SEC-001:** chamadas REST anônimas não leem linhas de `profiles`, `students`, `lessons`, `vehicles`, `sales`, `sale_items` ou `financial_transactions`.
- [ ] **SEC-002:** aluno A chama a RPC e recebe somente as próprias aulas agendadas.
- [ ] **SEC-003:** aluno A tenta consultar diretamente as tabelas de cadastro, aulas e veículos; a API nega.
- [ ] **SEC-004:** aluno A tenta passar UUID de aluno B ou ID de aula B à RPC/parâmetros extras; nenhum dado B é retornado.
- [ ] **SEC-005:** aluno A tenta INSERT/UPDATE/DELETE em tabelas operacionais; todas as operações são negadas.
- [ ] **SEC-006:** aluno A tenta INSERT/UPDATE em `profiles`, inclusive mudar o próprio `role` para `admin`; operação negada.
- [ ] **SEC-007:** aluno sem `students.user_id` correspondente recebe erro controlado `P0002`, sem dados de outros alunos.

### B. Isolamento entre Instrutor A e Instrutor B

- [ ] **SEC-010:** Instrutor A lista alunos e recebe somente linhas com `owner_id = auth.uid()`.
- [ ] **SEC-011:** Instrutor A lista veículos e recebe somente os próprios.
- [ ] **SEC-012:** Instrutor A lista aulas e recebe somente aulas próprias, com aluno e veículo também pertencentes a A.
- [ ] **SEC-013:** Instrutor A tenta selecionar aluno, veículo ou aula B por UUID direto; recebe zero linhas/negação, sem campos vazados por joins.
- [ ] **SEC-014:** repetir SEC-010 a SEC-013 com Instrutor B, invertendo A e B.
- [ ] **SEC-015:** Instrutor A tenta INSERT/UPDATE/DELETE em `students`, `lessons`, `vehicles`, `sales`, `sale_items` e `financial_transactions`; operações negadas por ausência de policies de escrita.
- [ ] **SEC-016:** Instrutor A tenta usar `TRUNCATE`, `REFERENCES` ou criar trigger nas tabelas; privilégio SQL negado antes mesmo de considerar RLS.
- [ ] **SEC-017:** Instrutor A tenta ler/alterar `products` e `app_settings`; acesso negado.
- [ ] **SEC-018:** Instrutor A tenta ler perfil de Instrutor B; SELECT negado por RLS.
- [ ] **SEC-019:** Instrutor A tenta atualizar `profiles.role` para `admin`, `usuario` ou qualquer papel diferente; negado pelo trigger e pelos grants.
- [ ] **SEC-020:** Instrutor A tenta criar perfil para outro UUID; negado.

### C. Administrador

- [ ] **SEC-030:** Admin lê alunos, aulas, veículos, vendas, itens e transações de A e B.
- [ ] **SEC-031:** Admin cria/edita/exclui registros operacionais nos limites funcionais do app.
- [ ] **SEC-032:** Admin lê todos os perfis, mas não usa escrita direta pelo navegador para alterar papel.
- [ ] **SEC-033:** Admin usa a Edge Function para alterar papel; a Edge Function autentica o JWT, confirma `profiles.role = 'admin'`, valida o alvo e o papel permitido.
- [ ] **SEC-034:** instrutor e aluno tentam chamar `change_role`, `delete`, `list` ou `activate_access`; recebem 403/negação e nenhum dado é alterado.
- [ ] **SEC-035:** Admin acessa produtos e configurações globais.

### D. Integridade de relações e prevenção de cruzamento

- [ ] **SEC-040:** Instrutor A tenta criar aula apontando para aluno B; FK composta rejeita.
- [ ] **SEC-041:** Instrutor A tenta criar aula própria apontando para veículo B; FK composta rejeita.
- [ ] **SEC-042:** Instrutor A tenta criar venda ou transação associada a aluno B; FK composta rejeita.
- [ ] **SEC-043:** Instrutor A tenta criar item ligado a venda B; FK composta rejeita.
- [ ] **SEC-044:** exclusão de aluno preserva o comportamento definido pelas FKs compostas: referências opcionais ficam NULL apenas na coluna de relação, mantendo `owner_id`.
- [ ] **SEC-045:** exclusão de venda remove itens vinculados conforme `ON DELETE CASCADE` e limpa somente a referência opcional da transação, sem apagar dados de outro owner.

### E. Funções, schemas e privilégios

- [ ] **SEC-050:** `private` não aparece entre os schemas expostos pela Data API/PostgREST.
- [ ] **SEC-051:** `authenticated` tem USAGE em `private` para avaliar as policies, mas não CREATE.
- [ ] **SEC-052:** `anon` e `authenticated` não executam diretamente as funções internas nem as funções de trigger.
- [ ] **SEC-053:** RPC pública de agenda executa para `authenticated`, mas não para `anon`.
- [ ] **SEC-054:** todas as funções `SECURITY DEFINER` têm `search_path` vazio, referências qualificadas, owner esperado e grants mínimos.
- [ ] **SEC-055:** nenhum usuário final tem membership que permita assumir `service_role`, `postgres` ou outro papel privilegiado.
- [ ] **SEC-056:** privilégios efetivos por tabela e coluna não incluem `TRUNCATE`, `REFERENCES` ou `TRIGGER` para `anon`/ `authenticated`.
- [ ] **SEC-057:** testar também views, RPCs adicionais, sequences e funções do schema public que possam expor dados por caminhos alternativos.

## Critérios de aprovação

1. Todos os casos negativos devem falhar sem alterar qualquer linha.
2. Todas as leituras permitidas devem retornar somente o conjunto esperado, comparado por UUID.
3. Admin deve manter os fluxos administrativos funcionais.
4. Nenhum erro deve revelar tokens, e-mails, CPF ou dados pessoais.
5. Guardar logs sanitizados, códigos HTTP/SQLSTATE e contagens de linhas; nunca guardar tokens ou chaves.
6. Rodar novamente a matriz após qualquer mudança em policies, grants, triggers, funções, views ou FKs.

## Limites e segurança operacional

- Esta matriz é um plano, não um resultado de teste.
- Executar somente em projeto Supabase descartável/isolado e gratuito, se disponível. Se houver custo, parar.
- Não aplicar o rascunho SQL no Supabase atual.
- Não usar contas, cadastros ou alunos reais.
- Não publicar em produção nem enviar convites.
- Não executar operações destrutivas sem snapshot e sem confirmar que o ambiente é descartável.


### F. RPCs/PostgREST e chamadas diretas

- [ ] **SEC-058:** Instrutor chama diretamente cada RPC `admin_*`; todas negam sem alterar dados.
- [ ] **SEC-059:** Aluno e anon tentam executar `create_instructor_sale`; negar.
- [ ] **SEC-060:** Instrutor A tenta vender usando UUID de aluno de B ou produto fora do escopo permitido; negar sem gravação parcial.
- [ ] **SEC-061:** Instrutor A tenta estornar ou excluir venda de B por RPC direta; negar.
- [ ] **SEC-062:** RPC de agenda não retorna aulas de outro aluno e não aceita UUID arbitrário como identidade.
- [ ] **SEC-063:** nenhuma RPC em schema exposto possui EXECUTE inadvertido para PUBLIC/anon.

Os novos casos estão pendentes de execução em ambiente isolado. A existência dos casos não significa que as RPCs foram testadas.


### G. Correção do cruzamento por e-mail — novos casos após a migration user_id

- [ ] **SEC-064:** preparar dois cadastros fictícios de instrutores diferentes com o mesmo e-mail normalizado e somente uma conta Auth; depois do vínculo explícito, a RPC da conta retorna somente aulas do cadastro cujo `students.user_id` corresponde ao `auth.uid()`.
- [ ] **SEC-065:** após a migration, a chamada direta de `private.get_my_scheduled_lessons_internal()` por `authenticated` falha por falta de EXECUTE; a RPC pública continua executável.
- [ ] **SEC-066:** confirmar que `public.get_my_scheduled_lessons()` é SECURITY DEFINER, owner postgres, `search_path` vazio, e que a função interna não é executável diretamente por PUBLIC/anon/authenticated.
- [ ] **SEC-067:** aluno autenticado sem `students.user_id` correspondente recebe `CONTA_SEM_VINCULO`, mesmo quando existe cadastro com e-mail idêntico.
- [ ] **SEC-068:** conta legada só conclui vínculo com e-mail confirmado, perfil `usuario`, tentativa válida, reserva dentro de 15 minutos e UPDATE condicional ao cadastro, owner, tentativa, timestamp e user_id NULL.
- [ ] **SEC-069:** convite novo com metadados ausentes, UUID inválido, e-mail divergente, tentativa errada, reserva expirada/futura ou cadastro pertencente a outro instrutor não vincula nenhuma linha.
- [ ] **SEC-070:** após a primeira consulta autenticada, a limpeza de `invited_at` e `invite_attempt_id` não remove nem troca `students.user_id`.

Esses casos são novos critérios de validação. Permanecem pendentes de execução com contas fictícias em ambiente isolado.


## Evidência de execução parcial — 21/11/2026

Ambiente: projeto Supabase isolado de testes `voyjssflroiwdyaacthh`, PostgreSQL 17.12. Nenhuma consulta ou gravação foi executada no projeto original. Foram usados dois perfis fictícios de instrutor com autorização ativa e seus registros sintéticos. Os testes usaram `SET LOCAL ROLE authenticated` e claims JWT simuladas com `request.jwt.claim.sub`/`request.jwt.claims`; **não são testes HTTP/PostgREST com JWT real**.

### Isolamento de leitura por owner — aprovado no escopo testado

Foram comparadas as contagens diretas por owner com as contagens visíveis sob RLS para cada identidade, nas seis tabelas:

- `students`: Instrutor A viu 2/2 registros; Instrutor B viu 1/1.
- `vehicles`: Instrutor A viu 2/2; Instrutor B viu 1/1.
- `lessons`: Instrutor A viu 2/2; Instrutor B viu 1/1.
- `sales`, `sale_items` e `financial_transactions`: ambas as contas viram zero, conforme fixtures disponíveis.
- Para as seis tabelas, cada identidade viu zero linhas pertencentes ao outro owner.

Resultado: **12 verificações de leitura aprovadas** (seis tabelas × duas identidades). A ausência de registros financeiros significa que ainda não houve validação positiva com dados de venda, itens e transações.

### Tentativas de escrita cruzada — aprovadas no escopo testado

Em transação com rollback, para cada instrutor:

- UPDATE de aluno de outro owner: 0 linhas afetadas.
- DELETE de aluno de outro owner: 0 linhas afetadas.
- UPDATE de veículo de outro owner: 0 linhas afetadas.
- DELETE de aula de outro owner: 0 linhas afetadas.
- INSERT de aluno com owner_id do outro instrutor: bloqueado com SQLSTATE `42501`.
- INSERT de veículo com owner_id do outro instrutor: bloqueado com SQLSTATE `42501`.
- INSERT de aula com owner próprio, mas aluno e veículo de outro owner: bloqueado com SQLSTATE `42501`.

Resultado: **14 verificações DML aprovadas** (sete casos × duas identidades). Todas as transações foram revertidas; nenhuma alteração de fixture permaneceu.

### Instrutor com autorização vencida — aprovado no escopo testado

Foi expirado temporariamente um perfil fictício dentro de transação e consultadas as seis tabelas operacionais/financeiras sob `authenticated`. O perfil não visualizou nenhuma linha em `students`, `vehicles`, `lessons`, `sales`, `sale_items` ou `financial_transactions`.

Resultado: **seis verificações aprovadas**. A alteração temporária de validade foi revertida.

### RPCs que exigem instrutor ativo — aprovado no escopo testado

As RPCs `remove_student_app_access(uuid)` e `delete_my_sale(uuid)` foram testadas em transações com claims simuladas:

- Instrutor expirado: ambas rejeitaram a chamada com `42501`.
- Instrutor ativo: ambas passaram pela checagem de papel/validade e chegaram à checagem de existência/escopo do registro inexistente (`P0002`).

Nenhum aluno, acesso, venda ou lançamento foi removido. As transações foram revertidas.

### Limitações explícitas

Não marcar como concluídos os casos SEC-001 a SEC-070 em bloco. Permanecem pendentes, entre outros:

- autenticação real via HTTP/PostgREST com JWT emitido pelo Auth;
- aluno autenticado e RPC de agenda com vínculo `students.user_id`;
- Admin e Edge Functions com JWT real;
- dados sintéticos de vendas, itens, produtos e transações para testes positivos e negativos completos;
- tentativa de escrita cruzada em vendas/itens/transações e validação de exclusão/estorno;
- confirmação administrativa da lista de schemas expostos pela Data API;
- privilégios de `TRUNCATE`, `REFERENCES`, `TRIGGER`, memberships e chamadas diretas a funções internas;
- cenários completos de vínculo/convite, concorrência e integridade financeira.

Esta evidência comprova somente os testes SQL transacionais descritos acima, com claims simuladas no projeto isolado. Não representa homologação funcional, teste HTTP real ou autorização para merge/deploy.


### Perfis: redução de privilégios e validação — 21/11/2026

A revisão de ACL identificou que `authenticated` ainda possuía grants de INSERT e DELETE em `public.profiles`, embora as policies existentes não oferecessem esses caminhos e o frontend não use escrita direta para criar/remover perfis. A criação é feita pelo trigger confiável de Auth e as operações administrativas são realizadas pela Edge Function com cliente administrativo.

Foi criada e aplicada somente no projeto isolado a migration:

`20261121260000_restrict_profile_insert_delete.sql`

A migration revoga INSERT em nível de tabela e de coluna e revoga DELETE de `authenticated`. Mantém SELECT e UPDATE somente da coluna `nome`, já restrita por RLS ao próprio instrutor.

Verificações transacionais com claims simuladas:

- UPDATE do próprio nome: 1 linha afetada — PASS.
- INSERT direto de perfil pelo usuário autenticado: negado, SQLSTATE `42501` — PASS.
- DELETE do próprio perfil: negado, SQLSTATE `42501` — PASS.

Consulta posterior de privilégios confirmou: SELECT permitido; INSERT negado; UPDATE de tabela negado; DELETE negado; UPDATE(nome) permitido; INSERT(role) e INSERT(instructor_access_until) negados.

### RPCs administrativas chamadas diretamente por instrutor — 21/11/2026

Com Instrutor autenticado por claims simuladas, as quatro RPCs abaixo foram chamadas diretamente, sem passar pelo frontend:

- `admin_create_sale`
- `admin_delete_sale`
- `admin_refund_sale_lessons`
- `admin_refund_sale_product`

Todas interromperam no guard de papel com a mensagem `Acesso administrativo obrigatório.` e SQLSTATE `P0001`. Resultado: **4/4 bloqueios aprovados**. As chamadas não chegaram às operações de negócio e a transação foi revertida.

### Observação sobre produtos e configurações por owner

A matriz inicial deste documento indicava que instrutores não deveriam ler produtos/configurações. A inspeção das policies atuais mostra, porém, que `products` e `app_settings` permitem acesso de instrutor somente aos registros cujo `owner_id = auth.uid()`; produtos também têm policies próprias para admin. Isso parece compatível com a separação de catálogo/configuração por conta e não foi alterado nesta etapa.

O projeto isolado não contém linhas de fixture em `products` nem `app_settings`, então ainda não houve teste positivo/negativo com registros nessas duas tabelas. A expectativa funcional da matriz deve ser alinhada a essa regra por owner antes de marcar SEC-017 como aprovado; não se deve interpretar a policy por owner como acesso global entre instrutores.


### Produtos e configurações por conta — teste positivo/negativo — 21/11/2026

Como as policies atuais permitem que o instrutor gerencie somente os próprios produtos e configurações, foram criadas linhas sintéticas temporárias para cada um dos dois instrutores dentro de uma única transação:

- uma linha em `products` por owner;
- uma linha em `app_settings` por owner.

Sob `SET LOCAL ROLE authenticated` e claims simuladas, cada conta viu exatamente uma linha própria em cada tabela e zero linhas do outro owner.

Resultado: **4 verificações aprovadas** (duas tabelas × duas contas). As linhas de fixture foram revertidas com `ROLLBACK`; nenhuma configuração ou produto persistiu no banco.


### Privilégios SQL de alto impacto — verificação de catálogo — 21/11/2026

Para as nove tabelas públicas operacionais e de configuração examinadas (`profiles`, `students`, `lessons`, `vehicles`, `sales`, `sale_items`, `financial_transactions`, `products`, `app_settings)), o catálogo confirmou:

- `anon` sem SELECT efetivo;
- `authenticated` sem `TRUNCATE`, `REFERENCES` ou `TRIGGER` em todas as nove tabelas;
- nenhuma membership de `anon` ou `authenticated` para papéis privilegiados na consulta de `pg_auth_members`.

Resultado: **36 verificações de privilégios aprovadas** (quatro verificações × nove tabelas), além da inspeção de memberships. Isso é evidência de catálogo do projeto isolado, não um teste HTTP.


## Auditoria financeira: venda, devolução e exclusão — 21/11/2026

Ambiente: projeto isolado `voyjssflroiwdyaacthh`, PostgreSQL 17.12. Todos os cenários usaram IDs e dados sintéticos em transações com `ROLLBACK`. A identidade de instrutor foi temporariamente promovida a admin somente dentro de transações de teste para alcançar as RPCs administrativas; a alteração de papel foi revertida. Claims foram simuladas com `request.jwt.claims`; não são testes HTTP/PostgREST com JWT real.

### Defeito encontrado e corrigido

O primeiro teste funcional da RPC `create_instructor_sale` mostrou que ela aumentava o saldo do aluno, mas gravava os campos `tipo_item`, `aulas_contratadas`, `valor_por_aula` e `valor_liquido` com valores default. Como `delete_my_sale` e `admin_refund_sale_lessons` dependem desses campos, a exclusão não retirava as aulas do saldo (o aluno mantinha cinco aulas após apagar a venda).

Foi criada a migration:

`20261121270000_fix_instructor_sale_item_lesson_tracking.sql`

Ela foi aplicada somente no projeto isolado. A RPC agora classifica o item como serviço/produto, valida preço e limites de quantidade, calcula aulas contratadas e grava os valores necessários para estorno e exclusão. Também mantém o owner scope, `FOR SHARE` no produto, `search_path TO ''`, e ACL restrita a `authenticated` e `service_role`.

### Venda e exclusão — aprovado após correção

- Venda de serviço próprio: saldo do aluno aumentou em cinco aulas.
- Item da venda: `aulas_contratadas=5`.
- Vendas, itens e transações do outro owner: zero linhas visíveis.
- Tentativa de vender para aluno de outro instrutor: bloqueada com `42501`.
- Tentativa de usar produto de outro instrutor: bloqueada com `42501`.
- Exclusão da venda não utilizada: saldo retornou a zero; venda e lançamento financeiro foram removidos.
- Repetição da mesma chamada com o mesmo `p_sale_id`: não duplicou item nem saldo.
- Após registrar uma aula como realizada, exclusão da venda foi recusada com `P0001`; venda permaneceu e saldo utilizado foi preservado.

### Devoluções administrativas — aprovado

Com uma venda sintética de cinco aulas a R$ 80,00 e outra venda de duas unidades de produto a R$ 30,00 cada:

- Devolução de duas aulas: `aulas_devolvidas=2`, saldo passou de cinco para três e gerou saída financeira de R$ 32,00.
- Devolução de uma unidade de produto: `quantidade_devolvida=1`, saída financeira de R$ 30,00.
- Total de saídas registradas pelas duas devoluções: R$ 62,00.
- Exclusão posterior da venda parcialmente devolvida: saldo retornou a zero e os lançamentos ligados à venda foram removidos.
- Tentativa de devolver quatro aulas quando só restavam três: bloqueada, sem alterar saldo ou transações.
- Tentativa de devolver duas unidades quando só restava uma: bloqueada, sem alterar saldo ou transações.

### Escrita cruzada em vendas e finanças — aprovado

Para as tabelas `sales`, `sale_items` e `financial_transactions`, sob instrutor A:

- UPDATE e DELETE de registros pertencentes ao instrutor B: zero linhas afetadas em cada tabela (6 verificações).
- INSERT de venda associada a aluno do instrutor B: bloqueado por RLS (`42501`).
- INSERT de item associado à venda/produto do instrutor B: bloqueado por RLS (`42501`).
- INSERT de transação associada a venda/aluno do instrutor B: bloqueado por RLS (`42501`).

Resultado: **39 verificações de fluxo financeiro aprovadas após a correção**, somando os cenários de venda, idempotência, exclusão, consumo de aula, devoluções, limites e isolamento cruzado descritos acima. Todos os dados e mudanças de papel foram revertidos.

### Limitações

- Ainda não foram realizados testes HTTP/PostgREST com JWT real.
- Não foram testados concorrência real entre transações independentes, pagamentos externos, conciliação bancária ou notificações.
- Não houve validação de UI no navegador/app após a migration.
- Não houve operação no Supabase original, deploy ou merge.


### Regras de pacotes e RPC de exclusão cruzada — aprovado

- Pacote com faixa mínima/máxima: venda de seis unidades dentro da faixa e serviço de duas aulas × três unidades adicionaram 12 aulas no total.
- Os itens persistiram as 12 aulas contratadas.
- Quantidade abaixo do mínimo do pacote foi bloqueada com SQLSTATE `22023`.
- Chamada direta de `delete_my_sale` por Instrutor A usando ID de venda de Instrutor B foi bloqueada com `P0002`, sem apagar a venda de B.

Esses quatro casos completam o total de **39 verificações aprovadas** após a correção.


## Agenda do aluno e vínculo Auth — 21/11/2026

Projeto isolado `voyjssflroiwdyaacthh`. Foram criadas três identidades Auth sintéticas e revertidas ao final: dois perfis `usuario` vinculados a cadastros de alunos de owners diferentes e um perfil `usuario` sem vínculo. As chamadas usaram claims simuladas; não houve login real nem emissão de JWT pelo Auth.

### RPC de agenda — aprovado

- Aluno A recebeu somente sua aula agendada, com nome do aluno e veículo da própria conta.
- Aluno A não recebeu a aula do aluno B.
- Aluno B recebeu somente sua aula agendada, com nome e veículo corretos.
- Aluno B não recebeu a aula do aluno A.
- Usuário sem cadastro de aluno vinculado recebeu `P0002 / CONTA_SEM_VINCULO`.
- Instrutor tentando chamar a RPC exclusiva de aluno recebeu `42501`.
- A chamada da RPC limpou `invited_at` e `invite_attempt_id` da reserva de convite pendente; essa confirmação foi feita como proprietário do banco após a chamada, pois o aluno não tem SELECT direto na tabela.
- Leitura direta das tabelas `students` e `lessons` pelo perfil de aluno retornou zero linhas; a agenda é disponibilizada pela RPC controlada.

### Proteção do vínculo — aprovado

- Instrutor tentou alterar `students.user_id` diretamente: trigger bloqueou com `42501`.
- Instrutor tentou inserir cadastro já vinculado a uma conta Auth: trigger bloqueou com `42501`.
- A Edge Function de convite também verifica se a conta Auth já está vinculada a outro cadastro antes de enviar convite; existe índice único parcial `students_user_id_unique` como segunda proteção.

Resultado: **14 verificações/asserções aprovadas** no escopo de agenda, visibilidade e proteção de vínculo. Todas as linhas Auth, perfis, alunos, veículos e aulas foram revertidas.

### Limitações

Não foi feito login real, fluxo de e-mail, convite via Edge Function em ambiente implantado, teste HTTP com JWT real ou validação visual da tela do aluno. O resultado confirma a lógica SQL com claims simuladas e revisão estática do código, não uma homologação ponta a ponta.


## Convite, vínculo automático e remoção de acesso — 21/11/2026

### Trigger de vínculo no Auth — aprovado

Em transação com dados sintéticos, a inserção em `auth.users` disparou `private.link_student_account_from_invite()`:

- reserva ativa + `student_id`, `instructor_id`, `invite_attempt_id` e e-mail correspondentes: vínculo criado;
- e-mail diferente do cadastro: vínculo não criado;
- reserva com mais de 15 minutos: vínculo não criado.

Resultado: **3 verificações aprovadas**. Não foi enviado e-mail nem criado usuário persistente; a transação foi revertida.

### Remoção de acesso de aluno — aprovado

Com dois usuários Auth e dois cadastros de aluno sintéticos:

- instrutor removeu o acesso do aluno pertencente à própria conta: identidade Auth removida, vínculo limpo pelo trigger e cadastro/histórico do aluno preservado;
- tentativa de remover acesso de aluno de outro instrutor: bloqueada com `P0002`;
- a identidade Auth do outro owner permaneceu intacta.

Resultado: **4 verificações aprovadas**. A exclusão de Auth e a limpeza do vínculo foram revertidas no fim da transação.

### Limitações

A validação acima executou triggers diretamente por inserção SQL em `auth.users` e RPCs no PostgreSQL isolado. Não substitui o fluxo real de convite, confirmação de e-mail, navegação pelo `claim-student.html`, SMTP ou chamadas HTTP autenticadas à Edge Function.
