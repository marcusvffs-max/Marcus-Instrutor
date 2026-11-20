# Revisão de segurança — vínculo de aluno e consulta de agenda

Data: 20/11/2026  
Branch: `feature/relatorios-instrutor-app`  
Projeto consultado em modo somente leitura: `ydyqagqsuqntuibzgwzd`

## 1. Achado confirmado no banco atualmente ativo

A função `private.get_my_scheduled_lessons_internal()` atualmente implantada:

- pertence a `postgres`;
- é `SECURITY DEFINER`;
- tem `search_path=""`;
- verifica sessão autenticada e `profiles.role = 'usuario'`;
- seleciona aulas usando igualdade entre o e-mail do JWT e `students.email`;
- não restringe o resultado a um único `owner_id` nem usa `students.user_id`.

O catálogo real confirmou `USAGE` no schema `private` e `EXECUTE` da função interna para `authenticated`. O usuário `anon` não possui USAGE no schema.

As policies reais de `students` e `lessons` permitem SELECT a admin/instrutor com `owner_id = auth.uid()`; não dão SELECT a perfil `usuario`. A função SECURITY DEFINER executa com privilégios do owner e, portanto, a leitura por e-mail contorna essa separação RLS.

### Verificação agregada de dados existentes

Consulta somente SELECT, sem retornar e-mails, UUIDs, nomes ou outros identificadores:

- 1 endereço normalizado aparece em cadastros de alunos pertencentes a 2 instrutores;
- existe 1 conta Auth cujo e-mail corresponde a esse grupo;
- o grupo contém 2 cadastros de aluno;
- há 2 aulas agendadas associadas a esses cadastros.

**Conclusão:** a condição necessária para cruzamento de agenda existe nos dados atuais. A função antiga pode devolver à mesma conta aulas associadas a cadastros de dois instrutores diferentes. A consulta foi agregada e não simulou login nem chamou a RPC; portanto, o vazamento pela função é fortemente sustentado pela definição SQL e pelos dados, mas não foi realizado teste de exploração autenticado.

Classificação: **vulnerabilidade de isolamento confirmada por análise estática + condição de dados existente; exploração REST direta ainda não verificada**.

## 2. Revisão da migration planejada na branch

Arquivo: `supabase/migrations/20261121120000_student_account_link.sql`

A migration contém os controles necessários para corrigir o caminho de agenda:

1. adiciona `students.user_id` como FK para `auth.users(id)`, com índice único parcial;
2. exige vínculo por `user_id = auth.uid()` na função interna;
3. remove o fallback de busca por e-mail na consulta da agenda;
4. retorna `CONTA_SEM_VINCULO` quando a conta não tem vínculo explícito;
5. mantém a verificação do perfil `usuario`;
6. mantém joins compostos por `student_id + owner_id` e `vehicle_id + owner_id`;
7. revoga EXECUTE da função interna para `PUBLIC`, `anon` e `authenticated`;
8. mantém EXECUTE da RPC pública apenas para `authenticated`;
9. mantém o wrapper público como `SECURITY DEFINER`, owner `postgres`, com `search_path=""`; o owner do wrapper pode chamar a função interna apesar do REVOKE ao cliente;
10. o trigger de convite vincula por identificadores de tentativa, cadastro e instrutor, além de validar e-mail e janela de 15 minutos. Essa validação de e-mail do convite não é fallback para consulta da agenda.

O schema `private` continua com USAGE para `authenticated`, necessário para policies RLS chamarem `private.current_app_role()`. A proteção correta aqui é o REVOKE EXECUTE da função interna específica, não remover indiscriminadamente USAGE do schema.

## 3. Compatibilidade com o banco atual

O histórico real de migrations ainda não contém `20261121120000_student_account_link`. A consulta de colunas confirmou que `public.students.user_id` ainda não existe no banco consultado.

Logo, a correção está preparada na branch, mas ainda não está ativa no banco.

## 4. Roteiro de validação depois de uma aplicação autorizada

Executar somente em ambiente de teste autorizado, sem custo:

- confirmar coluna, FK e índice de `students.user_id`;
- confirmar que `authenticated` não tem EXECUTE em `private.get_my_scheduled_lessons_internal()`;
- confirmar que `authenticated` tem EXECUTE em `public.get_my_scheduled_lessons()` e `anon` não;
- testar duas contas de aluno com e-mails iguais, cada uma vinculada a um cadastro diferente, e confirmar que cada uma recebe apenas suas próprias aulas;
- testar aluno sem vínculo e confirmar `CONTA_SEM_VINCULO`;
- testar admin/instrutor chamando a RPC de agenda e confirmar negação;
- confirmar que o fluxo de convite associa somente o cadastro reservado e não vincula outro cadastro com o mesmo e-mail.

Não chamar a função interna diretamente como authenticated em produção para “testar”; usar somente contas e ambiente isolados.

## 5. Decisão desta etapa

Nenhuma migration foi aplicada, nenhum dado foi alterado e nenhuma RPC de negócio foi chamada. A migration existente na branch já contém a correção necessária para a consulta da agenda; não foi criada uma segunda migration redundante.

A prioridade operacional é aplicar e validar a migration em ambiente de teste isolado e gratuito, depois planejar a implantação no projeto ativo com autorização explícita. Até lá, o fluxo de agenda por e-mail deve ser tratado como vulnerável a cruzamento entre instrutores.
