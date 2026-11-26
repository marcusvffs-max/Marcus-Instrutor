alter table public.app_settings
  add column if not exists taxa_inscricao_detran_preco numeric(10,2) not null default 0,
  add column if not exists taxa_legislacao_detran_preco numeric(10,2) not null default 0,
  add column if not exists taxa_direcao_detran_preco numeric(10,2) not null default 0;

comment on column public.app_settings.taxa_inscricao_detran_preco is 'Preço do produto fixo Taxa de inscrição (Detran), por conta.';
comment on column public.app_settings.taxa_legislacao_detran_preco is 'Preço do produto fixo Taxa de Legislação (Detran), por conta.';
comment on column public.app_settings.taxa_direcao_detran_preco is 'Preço do produto fixo Taxa de direção (Detran), por conta.';