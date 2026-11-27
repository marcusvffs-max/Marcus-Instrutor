-- Permite que o parceiro informe o e-mail do aluno indicado para o convite de acesso.
alter table public.partner_students
  add column if not exists email text;

-- Vincula cada orçamento aprovado do parceiro a um único orçamento administrativo.
alter table public.sales_quotes
  add column if not exists source_partner_quote_id uuid;

create unique index if not exists sales_quotes_source_partner_quote_id_uidx
  on public.sales_quotes (source_partner_quote_id)
  where source_partner_quote_id is not null;
