# Pré-checagem atual da migration de segurança

Data da consulta: 20/11/2026
Projeto Supabase: `ydyqagqsuqntuibzgwzd`
Branch documental: `feature/relatorios-instrutor-app`

## Resultado da consulta read-only

A consulta foi executada somente com SELECT em catálogos e tabelas. Nenhuma escrita, DDL, policy, grant, trigger, convite ou deploy foi realizado.

### Dados e perfis

| Tabela | Registros |
|---|---:|
| profiles | 1 |
| students | 0 |
| lessons | 0 |
| vehicles | 0 |
| app_settings | 0 |
| products | 5 |
| sales | 0 |
| sale_items | 0 |
| financial_transactions | 0 |

O único perfil existente tem `role='admin'`.

### Integridade de propriedade

- `owner_id` é NOT NULL em students, lessons, vehicles, sales, sale_items e financial_transactions.
- Contagem de owner_id nulo: zero em todas as seis tabelas.
- Divergências de owner entre lessons/students, lessons/vehicles, sales/students, sale_items/sales, financial_transactions/students e financial_transactions/sales: zero.
- Nenhuma das nove constraints compostas previstas na migration já existe.
- Os dados atuais não apresentam bloqueio por inconsistência para as FKs compostas propostas. Repetir estas verificações imediatamente antes de eventual execução, pois os dados podem mudar.

### Perfis e triggers

- Colunas de profiles: id UUID NOT NULL, nome TEXT NOT NULL, role TEXT NOT NULL, created_at timestamp nullable.
- CHECK atual limita role a `admin` ou `instrutor`.
- Nenhum trigger não interno foi encontrado em auth.users ou public.profiles.
- `postgres` possui privilégio TRIGGER em auth.users; a tabela auth.users pertence a `supabase_auth_admin`.
- A política atual `profiles_update_own` continua permitindo UPDATE do próprio perfil com `id = auth.uid()`, sem restringir a alteração de role. O grant atual também permite UPDATE em profiles. A proteção ainda não foi instalada.

### Grants e RLS

- As políticas atuais em profiles, students, lessons, vehicles e app_settings ainda permitem acesso próprio, sem a separação admin/instrutor pretendida.
- products tem policies admin que verificam role consultando profiles.
- sales, sale_items e financial_transactions continuam sem policies.
- service_role mantém os privilégios necessários, inclusive privilégios elevados; a migration proposta não deve revogá-los.
- A migration propõe revogar privilégios de PUBLIC/anon/authenticated, inclusive grants por coluna, e reconstruir grants mínimos. Isso ainda não foi aplicado.

### Security Advisor

Resultado atual:
- 3 tabelas financeiras sem policies: sales, sale_items e financial_transactions.
- 2 tabelas WhatsApp sem policies: whatsapp_conversations e whatsapp_messages. Permanecem fora do escopo desta migration.
- 1 aviso: proteção contra senhas vazadas desabilitada. Não alterar Auth sem decisão separada.

### Schema private / PostgREST

A consulta SQL não conseguiu obter o valor de `pgrst.db_schemas` por `current_setting` (retornou NULL). Isso não comprova se `private` está ou não exposto. Conferir manualmente em Dashboard → API/Data API → Exposed schemas antes de aplicar a migration. O schema `private` não deve ser exposto.

## Conclusão

A pré-checagem de dados e integridade está limpa: não foram encontrados owner_id nulos nem vínculos entre proprietários diferentes. Os dados atuais também não contêm constraints compostas duplicadas.

Ainda assim, a migration NÃO está autorizada nem pronta para aplicação automática. Permanecem pré-condições:
1. Conferir no Dashboard que `private` não está em Exposed schemas.
2. Confirmar que todos os novos usuários Auth do projeto devem receber papel inicial `instrutor`, pois o trigger será global.
3. Finalizar e revisar o fluxo backend de gerenciamento de perfis/admin com service_role.
4. Definir janela e backup/recuperação para alteração de policies, grants, triggers e FKs.
5. Obter autorização explícita do usuário antes de qualquer DDL em produção.
6. Após autorização, validar com contas separadas de instrutor A, instrutor B e admin, sem liberar instrutores antes dos testes.

## Estado operacional

- Somente SELECTs executados.
- Nenhuma alteração no banco.
- Nenhum recurso pago criado.
- Nenhum usuário ou convite criado.
- Nenhum deploy ou merge realizado.

### Verificação complementar de configuração PostgREST

Também foi consultado `pg_db_role_setting` para localizar uma configuração persistida `pgrst.db_schemas` associada a roles PostgreSQL. A consulta não retornou configuração. Isso não comprova a lista efetiva de schemas expostos em runtime; a conferência no Dashboard continua obrigatória.
