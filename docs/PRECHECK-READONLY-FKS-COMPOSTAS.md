# Pré-checagem somente leitura — FKs compostas

Data: 20/11/2026. Branch: `feature/relatorios-instrutor-app`.
Status: roteiro preparado, NÃO executado.

**Finalidade:** recolher evidências antes de qualquer migration. Execute somente no SQL Editor do ambiente de teste autorizado. Todas as instruções são SELECT; não contêm DDL/DML. Não cole o rascunho de migration. O resultado pode conter dados sensíveis: compartilhe somente totais e oculte identificadores.

## 1. Identificar o banco e a versão

```sql
select current_database() as database_name, current_user as sql_user,
       current_setting('server_version') as postgres_version,
       current_setting('server_version_num') as postgres_version_num,
       now() as checked_at;
```

Interrompa se não for o ambiente de teste esperado.

## 2. Tipos, nulidade e defaults

```sql
select n.nspname as schema_name, c.relname as table_name, a.attname as column_name,
       pg_catalog.format_type(a.atttypid,a.atttypmod) as data_type,
       a.attnotnull as is_not_null, pg_get_expr(d.adbin,d.adrelid) as column_default
from pg_attribute a
join pg_class c on c.oid=a.attrelid
join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public'
  and c.relname in ('students','vehicles','lessons','sales','sale_items','financial_transactions','app_settings')
  and a.attnum>0 and not a.attisdropped
  and a.attname in ('id','owner_id','student_id','vehicle_id','sale_id','product_id')
order by c.relname,a.attnum;
```

Conferir tipos compatíveis, `owner_id NOT NULL` e nulidade real dos vínculos opcionais. Não presumir.

## 3. Constraints atuais, nomes e ações referenciais

```sql
select ns.nspname as schema_name, tbl.relname as table_name, con.conname as constraint_name,
       con.contype as constraint_type, pg_get_constraintdef(con.oid,true) as definition,
       con.convalidated as is_validated, con.condeferrable as is_deferrable
from pg_constraint con
join pg_class tbl on tbl.oid=con.conrelid
join pg_namespace ns on ns.oid=tbl.relnamespace
where ns.nspname='public'
  and tbl.relname in ('students','vehicles','lessons','sales','sale_items','financial_transactions','app_settings')
order by tbl.relname,con.contype,con.conname;
```

Confirmar as sete FKs simples a substituir: `lessons_student_id_fkey`, `lessons_vehicle_id_fkey`, `sales_student_id_fkey`, `sale_items_sale_id_fkey`, `sale_items_product_id_fkey`, `financial_transactions_student_id_fkey` e `financial_transactions_sale_id_fkey`. Preservar FKs de owner para Auth e `app_settings.owner_id -> auth.users.id`.

## 4. Verificar colisões dos nove nomes propostos

```sql
select n.nspname,t.relname,c.conname,c.contype,pg_get_constraintdef(c.oid,true) as definition
from pg_constraint c
join pg_class t on t.oid=c.conrelid
join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public'
and c.conname in ('students_id_owner_key','vehicles_id_owner_key','sales_id_owner_key',
'lessons_student_owner_fkey','lessons_vehicle_owner_fkey','sales_student_owner_fkey',
'sale_items_sale_owner_fkey','financial_student_owner_fkey','financial_sale_owner_fkey')
order by c.conname;
```

Nomes devem estar livres, ou equivalências existentes devem ser analisadas antes. Não duplicar constraints.

## 5. Volume das tabelas

```sql
select 'students' table_name,count(*) row_count from public.students
union all select 'vehicles',count(*) from public.vehicles
union all select 'lessons',count(*) from public.lessons
union all select 'sales',count(*) from public.sales
union all select 'sale_items',count(*) from public.sale_items
union all select 'financial_transactions',count(*) from public.financial_transactions
union all select 'app_settings',count(*) from public.app_settings;
```

## 6. Órfãos e divergências de owner (resultado esperado: zero)

```sql
select 'lessons -> students' check_name,count(*) violations
from public.lessons l left join public.students s on s.id=l.student_id
where l.student_id is not null and (s.id is null or s.owner_id is distinct from l.owner_id)
union all
select 'lessons -> vehicles',count(*)
from public.lessons l left join public.vehicles v on v.id=l.vehicle_id
where l.vehicle_id is not null and (v.id is null or v.owner_id is distinct from l.owner_id)
union all
select 'sales -> students',count(*)
from public.sales x left join public.students s on s.id=x.student_id
where x.student_id is not null and (s.id is null or s.owner_id is distinct from x.owner_id)
union all
select 'sale_items -> sales',count(*)
from public.sale_items i left join public.sales x on x.id=i.sale_id
where i.sale_id is not null and (x.id is null or x.owner_id is distinct from i.owner_id)
union all
select 'sale_items -> products',count(*)
from public.sale_items i left join public.products p on p.id=i.product_id
where i.product_id is not null and (p.id is null or p.owner_id is distinct from i.owner_id)
union all
select 'financial_transactions -> students',count(*)
from public.financial_transactions f left join public.students s on s.id=f.student_id
where f.student_id is not null and (s.id is null or s.owner_id is distinct from f.owner_id)
union all
select 'financial_transactions -> sales',count(*)
from public.financial_transactions f left join public.sales x on x.id=f.sale_id
where f.sale_id is not null and (x.id is null or x.owner_id is distinct from f.owner_id);
```

Se qualquer total for maior que zero, parar. Não corrigir dados automaticamente.

## 7. owner_id nulo

```sql
select 'students' table_name,count(*) null_owner_rows from public.students where owner_id is null
union all select 'vehicles',count(*) from public.vehicles where owner_id is null
union all select 'lessons',count(*) from public.lessons where owner_id is null
union all select 'sales',count(*) from public.sales where owner_id is null
union all select 'sale_items',count(*) from public.sale_items where owner_id is null
union all select 'financial_transactions',count(*) from public.financial_transactions where owner_id is null;
```

Resultado esperado: zero; conferir também NOT NULL no catálogo.

## 8. Índices existentes

```sql
select schemaname,tablename,indexname,indexdef
from pg_indexes
where schemaname='public'
and tablename in ('students','vehicles','lessons','sales','sale_items','financial_transactions')
order by tablename,indexname;
```

Não criar índices nesta etapa. Avaliar os índices filhos com volume e consultas reais.

## 9. Atividade e possíveis locks atuais

```sql
select a.pid,a.usename,a.state,a.wait_event_type,a.wait_event,
       now()-a.query_start as query_duration,left(a.query,250) as query_preview
from pg_stat_activity a
where a.datname=current_database() and a.pid<>pg_backend_pid()
and (a.query ilike '%students%' or a.query ilike '%vehicles%' or a.query ilike '%lessons%'
or a.query ilike '%sales%' or a.query ilike '%sale_items%'
or a.query ilike '%financial_transactions%')
order by a.query_start;
```

É apenas uma fotografia do momento; não prevê locks de uma futura migration.

## 10. Checklist para sequer considerar DDL

- [ ] Projeto/banco e ambiente de teste confirmados.
- [ ] Versão PostgreSQL compatível.
- [ ] Tipos, nulidade e defaults conferidos.
- [ ] Sete FKs antigas e respectivas ações confirmadas.
- [ ] FKs de owner, produto e app_settings preservadas.
- [ ] Nove nomes novos livres ou equivalências analisadas.
- [ ] Sete consultas de divergência retornam zero.
- [ ] owner_id sem NULL e NOT NULL no catálogo.
- [ ] Índices, volume, sessões e janela operacional avaliados.

Se consulta falhar por coluna/tabela inexistente, não adaptar por suposição: consultar o schema real e atualizar o roteiro. Este arquivo não autoriza DDL. Nenhuma consulta foi executada no banco nesta etapa; nenhum dado, usuário, convite, índice ou recurso foi criado.
