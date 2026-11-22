-- Allow multiple archived WhatsApp conversation cycles per contact.
-- Keep fast owner/contact lookups without forcing a single row per phone.
drop index if exists public.whatsapp_conversations_owner_id_telefone_key;

create index if not exists whatsapp_conversations_owner_phone_created_idx
  on public.whatsapp_conversations (owner_id, telefone, created_at desc);

create index if not exists whatsapp_messages_conversation_created_idx
  on public.whatsapp_messages (conversation_id, created_at desc);
