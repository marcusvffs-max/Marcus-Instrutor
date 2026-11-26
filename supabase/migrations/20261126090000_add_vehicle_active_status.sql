alter table public.vehicles
  add column if not exists ativo boolean not null default true;

comment on column public.vehicles.ativo is 'Indica se o veículo está disponível para novos agendamentos; registros e aulas existentes são preservados.';
