alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_ai_pause_reason_check;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_ai_pause_reason_check
  check (
    ai_pause_reason is null
    or ai_pause_reason in (
      'cliente_encerramento',
      'instrutor_encerramento',
      'instrutor_mensagem_manual',
      'instrutor_assumiu_atendimento',
      'ia_desativada_global',
      'instrutor_reativou_ia'
    )
  );

-- Closing the assistant globally ends the current transcript cycle.
-- When it is enabled again, the webhook creates a new conversation on the next message.
create or replace function public.close_whatsapp_cycles_when_ai_disabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.enabled is distinct from new.enabled and new.enabled = false then
    update public.whatsapp_conversations
       set status = 'encerrada',
           ai_paused_until = null,
           ai_pause_reason = 'ia_desativada_global',
           quote_state = null,
           updated_at = now()
     where owner_id = new.owner_id
       and status <> 'encerrada';
  end if;
  return new;
end;
$$;

revoke all on function public.close_whatsapp_cycles_when_ai_disabled() from public, anon, authenticated;

drop trigger if exists trg_close_whatsapp_cycles_when_ai_disabled on public.ai_runtime_settings;
create trigger trg_close_whatsapp_cycles_when_ai_disabled
after update of enabled on public.ai_runtime_settings
for each row
execute function public.close_whatsapp_cycles_when_ai_disabled();
