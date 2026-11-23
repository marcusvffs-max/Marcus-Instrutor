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
      'instrutor_reativou_ia',
      'cliente_solicitou_atendimento_humano'
    )
  );
