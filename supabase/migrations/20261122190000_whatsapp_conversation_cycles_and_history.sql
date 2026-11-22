-- Allow multiple archived WhatsApp conversation cycles per contact.
-- Keep fast owner/contact lookups without forcing a single row per phone.
alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_owner_id_telefone_key;

create index if not exists whatsapp_conversations_owner_phone_created_idx
  on public.whatsapp_conversations (owner_id, telefone, created_at desc);

create index if not exists whatsapp_messages_conversation_created_idx
  on public.whatsapp_messages (conversation_id, created_at desc);

-- At most one active AI cycle per contact, while preserving any number of
-- completed/paused history rows. This also makes concurrent webhook retries safe.
create unique index if not exists whatsapp_conversations_one_active_cycle_idx
  on public.whatsapp_conversations (owner_id, telefone)
  where status not in ('atendimento_humano', 'encerrada');
