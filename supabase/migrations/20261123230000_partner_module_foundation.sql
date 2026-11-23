-- Fundacao do modulo Parceiros.
-- Esta migration e entregue no branch de desenvolvimento e NAO foi aplicada
-- a nenhum projeto Supabase. Aplicacao exige revisao e validacao em QA.
begin;

-- Perfil proprio para parceiro; as politicas antigas de alunos, vendas,
-- aulas e financeiro continuam restritas a admin/instrutor.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['admin'::text,'instrutor'::text,'usuario'::text,'parceiro'::text]));

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  nome text not null check (char_length(btrim(nome)) between 2 and 160),
  email text not null check (char_length(email) <= 254),
  telefone text,
  cpf_cnpj text,
  endereco text,
  pix_key text,
  commission_percent numeric(5,2) not null default 0
    check (commission_percent >= 0 and commission_percent <= 100),
  status text not null default 'pendente'
    check (status in ('pendente','aprovado','reprovado','suspenso')),
  observacoes_admin text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, email)
);

create index if not exists partners_owner_status_idx
  on public.partners(owner_id,status,created_at desc);
create index if not exists partners_user_id_idx
  on public.partners(user_id) where user_id is not null;

alter table public.students
  add column if not exists partner_id uuid;

-- Chaves compostas mantem a integridade entre registros e o respectivo proprietario.
alter table public.sale_items
  add constraint sale_items_id_owner_partner_key unique (id,owner_id);
alter table public.lessons
  add constraint lessons_id_owner_partner_key unique (id,owner_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='students_partner_owner_fk'
      and conrelid='public.students'::regclass
  ) then
    alter table public.students
      add constraint students_partner_owner_fk
      foreign key (partner_id, owner_id)
      references public.partners(id, owner_id)
      on delete set null (partner_id);
  end if;
end $$;

create index if not exists students_partner_owner_idx
  on public.students(owner_id,partner_id) where partner_id is not null;

create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null,
  student_id uuid not null,
  sale_id uuid not null,
  sale_item_id uuid not null unique,
  descricao text not null,
  base_amount numeric(12,2) not null check (base_amount >= 0),
  commission_percent numeric(5,2) not null check (commission_percent between 0 and 100),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  lessons_required integer not null default 0 check (lessons_required >= 0),
  lessons_completed integer not null default 0 check (lessons_completed >= 0),
  status text not null default 'pendente'
    check (status in ('pendente','disponivel','pago','cancelado')),
  payout_id uuid,
  created_at timestamptz not null default now(),
  available_at timestamptz,
  paid_at timestamptz,
  unique (id,owner_id),
  foreign key (partner_id,owner_id) references public.partners(id,owner_id) on delete restrict,
  foreign key (student_id,owner_id) references public.students(id,owner_id) on delete restrict,
  foreign key (sale_id,owner_id) references public.sales(id,owner_id) on delete restrict,
  foreign key (sale_item_id,owner_id) references public.sale_items(id,owner_id) on delete restrict
);

create index if not exists partner_commissions_partner_status_idx
  on public.partner_commissions(owner_id,partner_id,status,created_at desc);
create index if not exists partner_commissions_student_idx
  on public.partner_commissions(owner_id,student_id,status);

create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'pix',
  pix_key_snapshot text,
  reference text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (partner_id,owner_id) references public.partners(id,owner_id) on delete restrict,
  unique (id,owner_id)
);

alter table public.partner_commissions
  add constraint partner_commissions_payout_fk
  foreign key (payout_id,owner_id)
  references public.partner_payouts(id,owner_id)
  on delete restrict;

create table if not exists public.partner_commission_lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  commission_id uuid not null,
  lesson_id uuid not null unique,
  created_at timestamptz not null default now(),
  foreign key (commission_id,owner_id)
    references public.partner_commissions(id,owner_id) on delete cascade,
  foreign key (lesson_id,owner_id)
    references public.lessons(id,owner_id) on delete cascade
);

create index if not exists partner_commission_lessons_commission_idx
  on public.partner_commission_lessons(owner_id,commission_id);

create table if not exists public.partner_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  assunto text not null check (char_length(btrim(assunto)) between 1 and 160),
  mensagem text not null check (char_length(btrim(mensagem)) between 1 and 5000),
  publico text not null default 'selecionados'
    check (publico in ('todos_aprovados','selecionados')),
  created_at timestamptz not null default now(),
  unique (id,owner_id)
);

create table if not exists public.partner_message_recipients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null,
  partner_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id,partner_id),
  foreign key (message_id,owner_id)
    references public.partner_messages(id,owner_id) on delete cascade,
  foreign key (partner_id,owner_id)
    references public.partners(id,owner_id) on delete cascade
);

create index if not exists partner_message_recipients_partner_idx
  on public.partner_message_recipients(owner_id,partner_id,created_at desc);

-- Contagem de aulas vinculadas: a liberacao so ocorre quando todas as aulas
-- contratadas daquele item/servico forem marcadas como realizadas.
create or replace function private.sync_partner_commission_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commission_id uuid;
  v_owner_id uuid;
  v_completed integer;
  v_required integer;
begin
  if tg_op='DELETE' then
    v_commission_id := old.commission_id;
    v_owner_id := old.owner_id;
  else
    v_commission_id := new.commission_id;
    v_owner_id := new.owner_id;
  end if;
  select count(*)::integer into v_completed
    from public.partner_commission_lessons l
    where l.commission_id=v_commission_id and l.owner_id=v_owner_id;
  select lessons_required into v_required
    from public.partner_commissions
    where id=v_commission_id and owner_id=v_owner_id
    for update;
  if not found then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  update public.partner_commissions
    set lessons_completed=v_completed,
        status=case
          when status in ('pago','cancelado') then status
          when v_completed >= v_required then 'disponivel'
          else 'pendente'
        end,
        available_at=case
          when v_completed >= v_required and status not in ('pago','cancelado')
            then coalesce(available_at,now())
          else null
        end
    where id=v_commission_id and owner_id=v_owner_id;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_sync_partner_commission_progress
  on public.partner_commission_lessons;
create trigger trg_sync_partner_commission_progress
after insert or delete on public.partner_commission_lessons
for each row execute function private.sync_partner_commission_progress();

create or replace function private.allocate_partner_commission_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commission public.partner_commissions%rowtype;
begin
  if new.status='realizada' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if not exists (
      select 1 from public.partner_commission_lessons
      where lesson_id=new.id and owner_id=new.owner_id
    ) then
      select c.* into v_commission
      from public.partner_commissions c
      join public.sales s on s.id=c.sale_id and s.owner_id=c.owner_id
      where c.owner_id=new.owner_id
        and c.student_id=new.student_id
        and c.status='pendente'
        and c.lessons_completed < c.lessons_required
        and s.data_venda <= new.data_aula
      order by s.data_venda,c.created_at,c.id
      limit 1
      for update of c;
      if found then
        insert into public.partner_commission_lessons(owner_id,commission_id,lesson_id)
        values(new.owner_id,v_commission.id,new.id)
        on conflict (lesson_id) do nothing;
      end if;
    end if;
  elsif tg_op='UPDATE' and old.status='realizada' and new.status<>'realizada' then
    delete from public.partner_commission_lessons
    where owner_id=old.owner_id and lesson_id=old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_allocate_partner_commission_lesson on public.lessons;
create trigger trg_allocate_partner_commission_lesson
after insert or update of status on public.lessons
for each row execute function private.allocate_partner_commission_lesson();

-- Gera comissao somente para itens de servico vendidos a aluno indicado.
-- Produtos e itens fixos (aluguel/cartao) ficam explicitamente excluidos.
create or replace function private.create_partner_commission_for_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_partner public.partners%rowtype;
  v_base numeric(12,2);
  v_required integer;
  v_amount numeric(12,2);
  v_lesson public.lessons%rowtype;
begin
  select * into v_sale from public.sales
    where id=new.sale_id and owner_id=new.owner_id;
  if not found or v_sale.student_id is null or v_sale.status<>'confirmada' then
    return new;
  end if;
  if coalesce(new.tipo_item,'servico')<>'servico'
     or new.fixed_item_key is not null then
    return new;
  end if;
  select p.* into v_partner
    from public.students s
    join public.partners p on p.id=s.partner_id and p.owner_id=s.owner_id
    where s.id=v_sale.student_id and s.owner_id=new.owner_id;
  if not found or v_partner.commission_percent<=0 then return new; end if;
  if v_partner.status<>'aprovado' and not exists (
    select 1 from public.partner_commissions c
    where c.sale_item_id=new.id and c.owner_id=new.owner_id
  ) then
    return new;
  end if;
  v_base := greatest(0,coalesce(new.valor_liquido,new.subtotal,0));
  v_required := greatest(0,coalesce(new.aulas_contratadas,0)-coalesce(new.aulas_devolvidas,0));
  v_amount := round(v_base*v_partner.commission_percent/100,2);

  insert into public.partner_commissions(
    owner_id,partner_id,student_id,sale_id,sale_item_id,descricao,
    base_amount,commission_percent,commission_amount,lessons_required,
    status,available_at
  ) values (
    new.owner_id,v_partner.id,v_sale.student_id,v_sale.id,new.id,new.descricao,
    v_base,v_partner.commission_percent,v_amount,v_required,
    case when v_base<=0 then 'cancelado' when v_required=0 then 'disponivel' else 'pendente' end,
    case when v_base>0 and v_required=0 then now() else null end
  )
  on conflict (sale_item_id) do update set
    base_amount=excluded.base_amount,
    commission_percent=partner_commissions.commission_percent,
    commission_amount=round(excluded.base_amount*partner_commissions.commission_percent/100,2),
    lessons_required=excluded.lessons_required,
    status=case
      when partner_commissions.status in ('pago','cancelado') then partner_commissions.status
      when excluded.status='cancelado' then 'cancelado'
      when partner_commissions.lessons_completed>=excluded.lessons_required then 'disponivel'
      else 'pendente'
    end,
    available_at=case
      when partner_commissions.status in ('pago','cancelado') then partner_commissions.available_at
      when excluded.status='cancelado' then null
      when partner_commissions.lessons_completed>=excluded.lessons_required
        then coalesce(partner_commissions.available_at,now())
      else null
    end
  where partner_commissions.status <> 'pago';

  -- Vincula aulas já concluídas após a data da venda, sem reutilizar aulas.
  if v_required > 0 then
    for v_lesson in
      select l.* from public.lessons l
      where l.owner_id=new.owner_id
        and l.student_id=v_sale.student_id
        and l.status='realizada'
        and l.data_aula >= v_sale.data_venda
        and not exists (
          select 1 from public.partner_commission_lessons cl
          where cl.lesson_id=l.id and cl.owner_id=l.owner_id
        )
      order by l.data_aula,l.horario,l.created_at,l.id
      limit v_required
    loop
      insert into public.partner_commission_lessons(owner_id,commission_id,lesson_id)
      select new.owner_id,c.id,v_lesson.id
      from public.partner_commissions c
      where c.sale_item_id=new.id and c.owner_id=new.owner_id
        and c.status<>'cancelado'
      on conflict (lesson_id) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_partner_commission_for_service on public.sale_items;
create trigger trg_create_partner_commission_for_service
after insert or update of valor_liquido,aulas_devolvidas on public.sale_items
for each row execute function private.create_partner_commission_for_service();

-- Registra o pagamento e quita as comissões em uma única transação.
-- A Edge Function valida o administrador antes de chamar esta rotina.
create or replace function public.record_partner_payout(
  p_owner_id uuid,
  p_partner_id uuid,
  p_commission_ids uuid[],
  p_payment_method text default 'pix',
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare
  v_count integer;
  v_total numeric(12,2);
  v_payout_id uuid;
  v_pix text;
begin
  if p_owner_id is null or p_partner_id is null
     or p_commission_ids is null or cardinality(p_commission_ids)=0
     or cardinality(p_commission_ids)>100 then
    raise exception 'Seleção de comissões inválida.' using errcode='22023';
  end if;

  perform 1 from public.partner_commissions c
   where c.owner_id=p_owner_id
     and c.partner_id=p_partner_id
     and c.id=any(p_commission_ids)
     and c.status='disponivel'
   for update;

  select count(*)::integer,coalesce(sum(c.commission_amount),0)
    into v_count,v_total
    from public.partner_commissions c
   where c.owner_id=p_owner_id
     and c.partner_id=p_partner_id
     and c.id=any(p_commission_ids)
     and c.status='disponivel';

  if v_count<>cardinality(p_commission_ids) or v_total<=0 then
    raise exception 'Uma ou mais comissões não estão disponíveis para pagamento.' using errcode='23514';
  end if;

  select p.pix_key into v_pix
    from public.partners p
   where p.id=p_partner_id and p.owner_id=p_owner_id;
  if not found then
    raise exception 'Parceiro não encontrado.' using errcode='P0002';
  end if;

  insert into public.partner_payouts(
    owner_id,partner_id,amount,payment_method,pix_key_snapshot,reference
  ) values (
    p_owner_id,p_partner_id,v_total,
    coalesce(nullif(left(btrim(p_payment_method),40),''),'pix'),
    v_pix,nullif(left(btrim(coalesce(p_reference,'')),160),'')
  ) returning id into v_payout_id;

  update public.partner_commissions
     set status='pago',payout_id=v_payout_id,paid_at=now()
   where owner_id=p_owner_id
     and partner_id=p_partner_id
     and id=any(p_commission_ids)
     and status='disponivel';

  return jsonb_build_object(
    'id',v_payout_id,'partner_id',p_partner_id,
    'amount',v_total,'commission_count',v_count,
    'paid_at',now(),'payment_method',coalesce(nullif(btrim(p_payment_method),''),'pix')
  );
end;
$$;

revoke all on function public.record_partner_payout(uuid,uuid,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.record_partner_payout(uuid,uuid,uuid[],text,text) to service_role;

-- RLS: admin/proprietario ve seus registros; parceiro ve somente seu cadastro,
-- suas comissoes/pagamentos e mensagens enderecadas a ele.
alter table public.partners enable row level security;
alter table public.partner_commissions enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.partner_commission_lessons enable row level security;
alter table public.partner_messages enable row level security;
alter table public.partner_message_recipients enable row level security;

drop policy if exists partners_owner_or_self_select on public.partners;
create policy partners_owner_or_self_select on public.partners
for select to authenticated
using (
  (owner_id=(select auth.uid()) and private.current_app_role()='admin')
  or user_id=(select auth.uid())
);

drop policy if exists partner_commissions_owner_or_self_select on public.partner_commissions;
create policy partner_commissions_owner_or_self_select on public.partner_commissions
for select to authenticated
using (
  (owner_id=(select auth.uid()) and private.current_app_role()='admin')
  or exists(select 1 from public.partners p
    where p.id=partner_commissions.partner_id
      and p.owner_id=partner_commissions.owner_id
      and p.user_id=(select auth.uid()) and p.status='aprovado')
);

drop policy if exists partner_payouts_owner_or_self_select on public.partner_payouts;
create policy partner_payouts_owner_or_self_select on public.partner_payouts
for select to authenticated
using (
  (owner_id=(select auth.uid()) and private.current_app_role()='admin')
  or exists(select 1 from public.partners p
    where p.id=partner_payouts.partner_id
      and p.owner_id=partner_payouts.owner_id
      and p.user_id=(select auth.uid()) and p.status='aprovado')
);

drop policy if exists partner_commission_lessons_owner_or_self_select on public.partner_commission_lessons;
create policy partner_commission_lessons_owner_or_self_select on public.partner_commission_lessons
for select to authenticated
using (
  (owner_id=(select auth.uid()) and private.current_app_role()='admin')
  or exists(select 1 from public.partner_commissions c
    join public.partners p on p.id=c.partner_id and p.owner_id=c.owner_id
    where c.id=partner_commission_lessons.commission_id
      and c.owner_id=partner_commission_lessons.owner_id
      and p.user_id=(select auth.uid()) and p.status='aprovado')
);

drop policy if exists partner_messages_owner_or_recipient_select on public.partner_messages;
create policy partner_messages_owner_or_recipient_select on public.partner_messages
for select to authenticated
using (
  (owner_id=(select auth.uid()) and private.current_app_role()='admin')
  or exists(select 1 from public.partner_message_recipients r
    join public.partners p on p.id=r.partner_id and p.owner_id=r.owner_id
    where r.message_id=partner_messages.id
      and r.owner_id=partner_messages.owner_id
      and p.user_id=(select auth.uid()) and p.status='aprovado')
);

drop policy if exists partner_message_recipients_owner_or_self_select on public.partner_message_recipients;
create policy partner_message_recipients_owner_or_self_select on public.partner_message_recipients
for select to authenticated
using (
  (owner_id=(select auth.uid()) and private.current_app_role()='admin')
  or exists(select 1 from public.partners p
    where p.id=partner_message_recipients.partner_id
      and p.owner_id=partner_message_recipients.owner_id
      and p.user_id=(select auth.uid()) and p.status='aprovado')
);

drop policy if exists partner_message_recipients_self_update_read on public.partner_message_recipients;
create policy partner_message_recipients_self_update_read on public.partner_message_recipients
for update to authenticated
using (exists(select 1 from public.partners p
  where p.id=partner_message_recipients.partner_id
    and p.owner_id=partner_message_recipients.owner_id
    and p.user_id=(select auth.uid()) and p.status='aprovado'))
with check (exists(select 1 from public.partners p
  where p.id=partner_message_recipients.partner_id
    and p.owner_id=partner_message_recipients.owner_id
    and p.user_id=(select auth.uid()) and p.status='aprovado'));

grant select on public.partners,public.partner_commissions,public.partner_payouts,
  public.partner_commission_lessons,public.partner_messages,
  public.partner_message_recipients to authenticated;
grant update(read_at) on public.partner_message_recipients to authenticated;

commit;
