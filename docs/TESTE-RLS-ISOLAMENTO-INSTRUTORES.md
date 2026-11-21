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
