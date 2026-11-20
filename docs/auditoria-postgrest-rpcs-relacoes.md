# Auditoria estática — PostgREST, RPCs e relacionamentos

Data: 20/11/2026  
Branch: `feature/relatorios-instrutor-app`  
HEAD examinado: `7988906173206458651cdc4267ecbaeaecf71ed0`  
Status: análise do repositório; catálogo remoto não consultado.

## Escopo e limites

Foram examinados os arquivos atuais `instrutor.js`, `script.js`, `index.html`, as migrations versionadas e os documentos de auditoria. Não existe `supabase/config.toml` nesta branch. As migrations versionadas são apenas:

- `20261121090000_instructor_access_expiration.sql`
- `20261121120000_student_account_link.sql`

Portanto, não é possível provar pelo repositório quais schemas estão expostos na Data API nem obter as definições/ACLs das RPCs administrativas e financeiras já existentes no banco. Não foi feita conexão nem consulta ao Supabase.

## 1. Chamadas RPC encontradas no frontend

| RPC | Chamador | Ação |
|---|---|---|
| `get_my_scheduled_lessons()` | fluxo de aluno | consultar aulas do próprio aluno |
| `create_instructor_sale(...)` | painel do instrutor | registrar venda, movimentação e saldo |
| `admin_create_sale(...)` | painel administrativo | criar venda |
| `admin_refund_sale_product(...)` | painel administrativo | devolver produto |
| `admin_refund_sale_lessons(...)` | painel administrativo | devolver aulas |
| `admin_delete_sale(...)` | painel administrativo | excluir venda e lançamentos |

A chamada do frontend não comprova autorização no servidor. Ocultar botão, validar papel em JavaScript ou usar uma página administrativa não protege a RPC. Cada função administrativa precisa validar no próprio PostgreSQL a identidade autenticada e o papel consultado em fonte confiável. Cada RPC do instrutor precisa validar `auth.uid()`, o papel permitido e o `owner_id` de todos os registros envolvidos.

## 2. Bloqueio de auditoria: definições SQL ausentes

As definições de `create_instructor_sale`, `admin_create_sale`, `admin_refund_sale_product`, `admin_refund_sale_lessons` e `admin_delete_sale` não aparecem nas migrations versionadas desta branch. Não há evidência estática suficiente para verificar:

- `SECURITY INVOKER` versus `SECURITY DEFINER`;
- proprietário e `search_path`;
- ACL EXECUTE efetiva, inclusive PUBLIC e memberships;
- validação de role no corpo da função;
- validação de propriedade do aluno, venda, item e produto;
- se IDs enviados pelo cliente podem atravessar owners;
- se SQL dinâmico ou tabelas sem schema qualificado são usados;
- atomicidade e consistência entre venda, itens, saldo e transações.

**Classificação: pendência crítica de evidência, não vulnerabilidade confirmada.** Não chamar essas RPCs de seguras até obter suas definições e ACLs reais. Não revogar EXECUTE antes de mapear dependências e testar os fluxos.

## 3. Consultas PostgREST e relacionamentos

O frontend do instrutor lê separadamente `students`, `lessons`, `vehicles`, `products`, `sales` e `financial_transactions`; não foi encontrada sintaxe de relacionamento aninhado PostgREST (`select(...,relacao(...))`) nos trechos consultados. Isso reduz os joins implícitos no cliente, mas não substitui RLS.

Os filtros `.eq("owner_id", ...)` presentes em algumas consultas do frontend são defesa complementar e não uma fronteira de segurança. A autorização real deve continuar no RLS e nas funções SQL. Consultas sem filtro explícito de owner só são aceitáveis quando as policies filtram de forma comprovada cada linha.

## 4. Critérios para aprovar as RPCs

Para cada RPC listada, coletar no ambiente isolado:

1. definição integral e assinatura;
2. owner, `prosecdef`, `proconfig` e ACL;
3. resultado de `has_function_privilege` para anon, authenticated e service_role;
4. ACL expandida incluindo PUBLIC;
5. papel e owner_id validados dentro da função;
6. testes negativos com Instrutor A tentando UUIDs de Instrutor B;
7. testes com aluno e anon;
8. confirmação de que falhas não deixam gravações parciais.

As funções `admin_*` devem negar instrutor/aluno mesmo se forem chamadas diretamente por REST. `create_instructor_sale` deve negar admin/aluno se a regra do produto for exclusiva ao instrutor, e deve impedir referências a aluno/produto de outro owner conforme o modelo aprovado.

## 5. Casos adicionados à matriz

- **SEC-058:** Instrutor chama diretamente cada RPC `admin_*`; todas devem negar sem alteração de dados.
- **SEC-059:** Aluno e anon tentam executar `create_instructor_sale`; negar.
- **SEC-060:** Instrutor A tenta vender usando UUID de aluno de B ou item/produto não pertencente ao escopo permitido; negar sem gravação parcial.
- **SEC-061:** Instrutor A tenta estornar ou excluir venda de B chamando RPC diretamente; negar.
- **SEC-062:** RPC pública de agenda não retorna aulas de outro aluno e não aceita UUID arbitrário como identidade.
- **SEC-063:** confirmar que nenhuma função RPC em schema exposto possui EXECUTE inadvertido para PUBLIC/anon.

## Decisão

Não alterar código funcional, grants, migrations, schemas ou configuração da Data API nesta etapa. A prioridade é obter as definições e ACLs reais das cinco RPCs não versionadas e confirmar os schemas expostos. Não executar migrations nem usar o Supabase atual para testes destrutivos. Nenhuma ação paga foi realizada.


## Coleta segura das definições reais

Foi criado `docs/PRECHECK-READONLY-RPCS-POSTGREST.md`, com sete consultas SELECT para obter definições completas, sobrecargas, owner, SECURITY DEFINER, configurações, EXECUTE efetivo, ACL incluindo PUBLIC, schemas, triggers e memberships. Nenhuma consulta chama RPC de negócio.

A falta das definições das cinco RPCs financeiras permanece uma pendência crítica de evidência, não vulnerabilidade confirmada. A documentação financeira existente registra uma consulta prévia ao projeto, mas esta etapa não acessou o Supabase e não reutiliza esse registro como prova das definições atuais. A coleta deve ocorrer apenas em ambiente autorizado, gratuito e com resultados sanitizados.
