# Revisão dos avisos SECURITY DEFINER e exclusão de identidade Auth — 21/11/2026

## Ambiente e limites

Projeto Supabase isolado de testes: `voyjssflroiwdyaacthh`, PostgreSQL 17.12.
Esta revisão consultou definições de funções, ACLs, triggers, chaves estrangeiras e Advisors. Não executou DDL, não alterou configurações Auth e não acessou o projeto original `ydyqagqsuqntuibzgwzd`.

## Avisos SECURITY DEFINER

O Security Advisor reportou duas funções públicas executáveis por `authenticated`:

- `public.get_my_scheduled_lessons()`
- `public.remove_student_app_access(uuid)`

A consulta de privilégios confirmou:

| Função | anon EXECUTE | authenticated EXECUTE | SECURITY DEFINER |
|---|---:|---:|---:|
| `get_my_scheduled_lessons()` | Não | Sim | Sim |
| `remove_student_app_access(uuid)` | Não | Sim | Sim |

Ambas têm `SET search_path TO ''`. Não foi encontrada concessão de execução a `anon`.

### get_my_scheduled_lessons

A função pública delega para `private.get_my_scheduled_lessons_internal()`. O helper interno:

1. exige `auth.uid()`;
2. exige perfil existente com papel `usuario`;
3. exige vínculo do usuário com um cadastro de aluno;
4. retorna somente aulas agendadas vinculadas ao `user_id` autenticado, relacionando aulas e veículos pelo mesmo `owner_id`;
5. limpa os metadados de convite pendente do próprio cadastro.

O helper interno não concede EXECUTE a `anon` nem a `authenticated`; o wrapper público SECURITY DEFINER permite a delegação sem abrir execução direta do helper.

**Avaliação:** o aviso é esperado para o desenho atual de RPC pública que delega a um helper privado com privilégios elevados. Não mudar para SECURITY INVOKER sem redesenhar e testar os privilégios do helper e a exposição do schema `private`.

### remove_student_app_access

A função:

1. exige sessão autenticada;
2. consulta `private.current_app_role()`, que só retorna `instrutor` quando a autorização está vigente;
3. localiza o aluno por `student_id` e pelo `owner_id = auth.uid()`;
4. exige vínculo Auth existente;
5. exclui somente a identidade correspondente em `auth.users`.

A função tem `search_path` vazio e não concede EXECUTE a `anon`. A exclusão Auth é uma operação privilegiada, justificando o uso de SECURITY DEFINER neste desenho.

### Efeitos referenciais da exclusão Auth

A inspeção de constraints confirmou:

- `public.profiles.id → auth.users.id ON DELETE CASCADE`;
- `auth.sessions.user_id → auth.users.id ON DELETE CASCADE`;
- `public.students.user_id → auth.users.id ON DELETE SET NULL`.

Também existe um trigger `BEFORE DELETE ON auth.users` que limpa `students.user_id`, `invited_at` e `invite_attempt_id`. A exclusão da identidade remove o perfil e as sessões associados e preserva a linha do aluno, conforme as constraints observadas.

**Limitação importante:** tokens JWT já emitidos não são necessariamente invalidados imediatamente apenas pela exclusão da identidade. A RPC de agenda volta a exigir um perfil `usuario` existente e vínculo ativo, o que bloqueia a consulta pelo helper após a exclusão; isso não substitui testes HTTP com token real e não permite afirmar que todos os endpoints do sistema rejeitam imediatamente um token antigo.

## Outros avisos Security Advisor

- Duas tabelas backend-only do WhatsApp têm RLS habilitado e nenhuma policy (`whatsapp_conversations`, `whatsapp_messages`). O aviso é INFO; a revisão anterior confirmou que não há grants de cliente para essas tabelas. Não adicionar policies genéricas.
- Proteção contra senhas vazadas está desabilitada. Mantida como pendência de configuração no projeto isolado; nenhuma alteração foi feita.
- Não foi possível confirmar por SQL a lista de schemas expostos no PostgREST. O privilégio `USAGE` em `private` existe para `authenticated`, mas isso não prova que o schema esteja exposto. Confirmar em Project Settings → API → Exposed schemas antes de qualquer ajuste.

## Performance Advisor

O Advisor também reportou:

- 16 grupos de policies permissivas múltiplas, em especial em `financial_transactions`, `products`, `sale_items` e `sales`. É alerta de otimização, não prova de falha de isolamento. Não consolidar policies sem comparar a lógica combinada e repetir a matriz RLS.
- 10 índices sem uso no banco de testes. O volume baixo e a duração curta do ambiente isolado não justificam removê-los agora.

## Conclusão e próximos passos

Nenhuma alteração de segurança foi aplicada nesta revisão. A recomendação é manter os dois wrappers SECURITY DEFINER enquanto não houver redesenho com equivalência de privilégios e testes de regressão. Próximas validações necessárias:

1. confirmar no Dashboard se `private` está ou não exposto ao PostgREST;
2. revisar/habilitar proteção contra senhas vazadas somente no projeto isolado, após verificar impacto e disponibilidade;
3. executar testes HTTP com JWTs reais de contas sintéticas para a agenda e remoção de acesso;
4. revisar policies permissivas por tabela, sem alterar a semântica de acesso;
5. não remover índices apenas por estarem sem uso no banco de testes.

Esta revisão não representa teste funcional do aplicativo, não inclui deploy de Edge Functions e não altera produção.
