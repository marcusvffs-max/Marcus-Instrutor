# Revisão técnica do rascunho RLS financeiro e por instrutor

Data: 20/11/2026  
Arquivo revisado: `docs/rascunho-seguranca-relatorios-instrutor-revisado.sql`  
Blob SHA consultado: `deb9441d0e7b178d502fe945634ecfe16d6c18d4`.

## Estado real confirmado no banco

### Policies
- `profiles`: SELECT próprio, INSERT próprio e UPDATE próprio.
- `students`, `lessons`, `vehicles`, `app_settings`: SELECT/INSERT/UPDATE/DELETE próprios por `owner_id = auth.uid()`.
- `products`: políticas admin próprias, com verificação direta em `profiles`.
- `sales`, `sale_items`, `financial_transactions`: nenhuma policy.
- Os resultados foram consultados diretamente em `pg_policies`; não houve alteração.

### Privilégios
Consulta de `information_schema.role_table_grants` confirmou que `authenticated` tem privilégios excessivos nas tabelas `profiles`, `students`, `lessons`, `vehicles` e `app_settings`, incluindo `TRUNCATE`, `REFERENCES` e `TRIGGER`. A role também tem INSERT/UPDATE/SELECT em `products`, sem DELETE. Não foram encontrados grants diretos a `authenticated` nas três tabelas financeiras.

O rascunho remove privilégios diretos de PUBLIC/anon/authenticated nas tabelas cobertas e concede apenas SELECT em profiles e CRUD às tabelas de dados, sem TRUNCATE/REFERENCES/TRIGGER. A direção é coerente com o princípio de menor privilégio. Deve-se validar também privilégios herdados de outras roles e grants por coluna antes da execução.

### Integridade referencial confirmada
- `sales.student_id -> students.id`
- `sale_items.sale_id -> sales.id`
- `sale_items.product_id -> products.id`
- `financial_transactions.student_id -> students.id`
- `financial_transactions.sale_id -> sales.id`
- `lessons.student_id -> students.id`
- `lessons.vehicle_id -> vehicles.id`

As FKs garantem existência do registro referenciado, mas não garantem igualdade de `owner_id` entre tabelas relacionadas.

## Revisão do SQL proposto

Pontos positivos:
1. Remove os privilégios amplos e o risco de TRUNCATE fora do controle de RLS.
2. Retira INSERT/UPDATE/DELETE de profiles pelo cliente.
3. Protege a coluna role com trigger e exige JWT cuja claim `role` seja `service_role` para a exceção administrativa.
4. Usa função `SECURITY DEFINER` com `search_path` vazio para consultar o papel sem recursão de RLS.
5. Separa admin global de instrutor somente leitura.
6. Restringe leitura de aulas e financeiro por ownership e validações de relações.

Pendências antes de considerar o SQL pronto:
1. **Cliente service_role isolado:** a Edge Function precisa criar cliente administrativo separado e garantir que não encaminhe o JWT do usuário final no cabeçalho Authorization desse cliente. Caso a sessão do usuário substitua a credencial service_role, o trigger deve rejeitar a operação, como defesa. Nunca expor a chave no frontend.
2. **Relações entre registros:** as FKs atuais não impedem, por si, que uma linha tenha `owner_id` de um instrutor e referência a aluno/venda/veículo de outro. As policies de SELECT propostas filtram várias dessas relações, mas não substituem validação na escrita administrativa/servidor. Antes da carga de dados, definir e validar regras de consistência para:
   - `lessons.owner_id = students.owner_id` e, quando preenchido, `vehicles.owner_id`;
   - `sales.owner_id = students.owner_id`, quando houver aluno;
   - `sale_items.owner_id = sales.owner_id`;
   - `financial_transactions.owner_id` coerente com aluno e venda referenciados.
3. **Produtos em itens de venda:** `products` será admin-only no primeiro desenho. Decidir se `sale_items.product_id` pode referenciar catálogo central do administrador ou se produtos devem pertencer ao instrutor. Não restringir essa relação automaticamente antes de decidir o modelo de catálogo.
4. **Admin e app_settings:** a policy administrativa global permite ao admin gerenciar configurações de qualquer owner. Confirmar que essa é a intenção; no app, as configurações do instrutor não devem ser alteradas sem regra explícita.
5. **Índices:** avaliar índices em `owner_id`, `student_id`, `vehicle_id`, `sale_id` e `product_id` usados nas policies e consultas. Não criar índices neste passo.
6. **Teste de papéis:** o script não pode ser considerado validado sem testes com anon, admin e dois instrutores distintos. Como o usuário recusou criar branch Supabase paga, não criar projeto/branch de teste nem executar o SQL em produção como substituto de teste isolado.

## Conclusão
O rascunho é uma base mais segura que as policies atuais, mas ainda não está aprovado para execução. As três tabelas financeiras estão sem policies, e a concessão atual de privilégios é excessiva. O script continua documental e não foi executado. Nenhuma conta foi criada e nenhum dado foi modificado.

## Fontes
- Supabase — Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase — Security Advisors / Database Linter: https://supabase.com/docs/guides/database/database-linter
