# Plano de testes — convite e vínculo exclusivo do aluno

Escopo: branch `feature/relatorios-instrutor-app`. Este roteiro não autoriza alterações em produção nem uso de contas reais de alunos.

## Pré-condições

- [ ] Preview Vercel criado a partir do commit mais recente da branch.
- [ ] Conferir que o preview usa o projeto Supabase de teste, nunca o ambiente de produção.
- [ ] Revisar e aplicar a migration `20261121120000_student_account_link.sql` somente no banco de teste.
- [ ] Publicar a Edge Function `admin-manage-instructors` somente no projeto Supabase de teste.
- [ ] Confirmar o `APP_ORIGIN` da Edge Function e o redirect de autenticação para o domínio exato do preview.
- [ ] Preparar instrutor autorizado, aluno fictício com e-mail controlado e dados de aula fictícios.
- [ ] Não reutilizar ou excluir contas reais durante os testes.

## Testes funcionais

| ID | Cenário | Resultado esperado |
|---|---|---|
| INV-01 | Instrutor autorizado convida aluno de sua própria lista | Convite enviado; cadastro recebe `user_id` da conta criada e `invited_at` preenchido. |
| INV-02 | Instrutor tenta convidar cadastro pertencente a outro instrutor | HTTP 404; nenhuma conta criada e nenhum vínculo alterado. |
| INV-03 | Instrutor solicita novo acesso para cadastro já vinculado | O servidor valida a conta vinculada e envia link de recuperação; não cria outro usuário nem altera o vínculo. |
| INV-04 | Instrutor tenta reenviar convite enquanto `invited_at` está preenchido | HTTP 409; nenhum convite duplicado. |
| INV-05 | Instrutor sem autorização ou com autorização vencida tenta convidar | HTTP 403; nenhuma alteração. |
| INV-06 | Instrutor tenta executar ação administrativa diferente de `invite_student` | HTTP 403. |
| INV-07 | Aluno aceita convite e entra pela primeira vez | Perfil permanece `usuario`; consulta RPC limpa `invited_at` e mantém o `user_id` correto. |
| INV-08 | Aluno consulta a área do aluno | Recebe somente aulas agendadas do cadastro associado à sua própria conta. |
| INV-09 | Conta de aluno A tenta consultar dados do aluno B | Nenhuma aula ou cadastro de B é retornado. |
| INV-10 | E-mail já cadastrado no Auth tenta receber novo convite | HTTP 409; nenhum vínculo indevido. |
| INV-11 | Envio SMTP falha depois da criação da conta em um convite novo | A conta criada nessa tentativa é removida e vínculo/estado pendente são limpos. Em recuperação de conta já vinculada, a conta e o vínculo são preservados. |
| INV-12 | Duas solicitações de convite simultâneas para o mesmo cadastro | No máximo uma solicitação conclui o vínculo; a outra falha sem deixar conta órfã. |
| INV-13 | Conta antiga sem vínculo tenta acessar a área do aluno, mesmo com e-mail confirmado igual ao de um cadastro | Não ocorre associação automática; a conta não recebe aulas desse cadastro. |
| INV-14 | Conta antiga sem vínculo tem e-mail não confirmado, duplicado ou único | Em todos os casos, nenhum vínculo automático por e-mail é feito. |
| INV-15 | Conta de aluno de teste é excluída pelo fluxo administrativo | Trigger limpa `user_id`, `invited_at` e `invite_attempt_id`, permitindo novo convite posterior. |
| INV-16 | A conta Auth é criada e a Edge Function é interrompida antes de vincular o aluno | O trigger vincula o usuário ao cadastro na mesma transação de criação do Auth, desde que token, cadastro, instrutor e e-mail correspondam. |
| INV-17 | Metadados do usuário são alterados depois da criação da conta | A associação já registrada pelo trigger não muda; metadados editáveis não são usados para reautorizar o vínculo. |
| INV-18 | Duas tentativas usam o mesmo identificador de reserva | Índice único impede que o mesmo identificador fique reservado em dois cadastros. |
| INV-19 | O papel do perfil é alterado administrativamente durante uma recuperação de acesso | A recuperação não redefine o papel; a atualização condicional falha sem sobrescrever o papel alterado. A conta e o vínculo são preservados. |

## Verificações de banco

- [ ] Índice único parcial impede que uma conta fique associada a mais de um cadastro.
- [ ] Índice único parcial impede reutilização do mesmo identificador de tentativa em cadastros diferentes.
- [ ] Trigger AFTER INSERT em `auth.users` confere identificador aleatório reservado, ID do cadastro, ID do instrutor e e-mail normalizado antes de vincular.
- [ ] O vínculo de contas novas acontece na transação de criação da conta Auth, antes de qualquer edição posterior de `user_metadata`.
- [ ] Contas antigas sem `user_id` não são associadas por e-mail, independentemente de confirmação ou unicidade.
- [ ] Chave estrangeira de `students.user_id` referencia `auth.users(id)`.
- [ ] RPC exige usuário autenticado e perfil `usuario`.
- [ ] RPC filtra aulas por `students.user_id = auth.uid()`.
- [ ] Junção das aulas também confere `owner_id` do cadastro.
- [ ] Junção do veículo também confere `owner_id`.
- [ ] Retorno da RPC preserva os sete campos esperados pelo frontend.
- [ ] Funções e permissões não concedem acesso anônimo aos dados do aluno.

## Risco de segurança pendente — associação automática por e-mail

A compatibilidade com contas antigas associa automaticamente uma conta autenticada com e-mail confirmado quando encontra exatamente um cadastro com o mesmo e-mail normalizado. A unicidade evita ambiguidades entre cadastros, mas não comprova que o e-mail foi digitado corretamente no cadastro nem que pertence ao aluno pretendido.

- [x] **INV-20 — E-mail único incorreto ou pertencente a terceiro:** associação automática por e-mail foi removida da migration na branch de testes. Validar que a conta de terceiro não recebe acesso ao cadastro.
- [x] A proteção implementada é não associar contas antigas automaticamente por e-mail, mesmo quando o endereço está confirmado e aparece em um único cadastro. O vínculo passa a depender exclusivamente do fluxo de convite validado pelo servidor e pelo trigger.
- [ ] Não usar dados reais nem executar esse teste em produção.

## Tratamento de conta antiga sem vínculo

- [ ] **INV-21 — Conta antiga com perfil `usuario`, mas sem `students.user_id`:** login é permitido, mas a RPC retorna o código controlado `P0002` e não retorna dados de alunos; a tela mostra orientação para falar com o instrutor, conferir o e-mail e solicitar convite.
- [ ] A mensagem não informa se existe cadastro correspondente, não revela nome, e-mail ou aulas e não tenta vincular a conta.
- [ ] **INV-22 — Conta vinculada sem aulas agendadas:** a RPC retorna lista vazia normalmente e a tela mostra “Nenhuma aula agendada”; não deve exibir a mensagem de conta sem vínculo.
- [ ] O botão “Atualizar” mantém o comportamento e permite repetir a consulta sem sair da tela.
- [ ] O aluno não recebe botão ou fluxo para criar vínculo por conta própria.
- [ ] Se o e-mail da conta antiga já existir no Auth, o convite novo pode ser recusado como e-mail já cadastrado. Não excluir a conta antiga nem fazer vínculo manual no banco; tratar como caso pendente de fluxo seguro de recuperação/regularização. A tela deve orientar o aluno a informar ao instrutor que já possuía uma conta.


## Critério para concluir

A funcionalidade só será considerada validada depois de todos os testes aplicáveis passarem no ambiente isolado, incluindo isolamento entre dois alunos diferentes e falha SMTP. Registrar os resultados sem expor e-mails, tokens ou dados pessoais.

## Fora do escopo

Não executar migration no Supabase atual, não enviar convites a alunos reais, não alterar contas existentes e não publicar em produção sem autorização explícita.


## Recuperação de convite interrompido

- [ ] Se a conta Auth foi criada e o cadastro ficou vinculado, o instrutor consegue solicitar **Reenviar acesso** sem criar outra conta.
- [ ] Contas antigas que ainda não possuem vínculo não recebem acesso automaticamente; devem passar pelo fluxo de convite autorizado para criar vínculo.
- [ ] O servidor confere que o ID da conta vinculada existe e que o e-mail Auth corresponde exatamente ao e-mail do cadastro.
- [ ] Se o perfil ficou no papel inicial `instrutor`, só é corrigido para `usuario` quando o e-mail ainda não foi confirmado e a reserva de convite original continua registrada.
- [ ] Para conta já vinculada, o servidor gera link de recuperação; não executa `deleteUser`, não cria outra conta e não altera o vínculo se o envio falhar.
- [ ] Se `generateLink({ type: "recovery" })` falhar para uma conta já vinculada, a conta Auth e `students.user_id` permanecem intactos; nenhuma segunda conta é criada.
- [ ] Se o SMTP falhar depois da geração do link de recuperação, a conta Auth e `students.user_id` permanecem intactos; nenhuma exclusão ou limpeza de vínculo é executada.
- [ ] Se a recuperação reparar um perfil inicial `instrutor` para `usuario` e o envio falhar, o perfil corrigido permanece `usuario`, sem apagar a conta ou o vínculo.
- [ ] Conta com e-mail divergente, perfil administrativo ou perfil incompatível é recusada sem alteração.



- [ ] Confirmar em ambiente isolado se o Supabase aceita `generateLink({ type: "recovery" })` para conta ainda não confirmada criada por convite. Se não aceitar, registrar o erro e não alterar nem excluir a conta.
