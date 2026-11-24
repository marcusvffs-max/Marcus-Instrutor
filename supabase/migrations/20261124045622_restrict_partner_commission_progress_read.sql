-- Progresso das comissões é servido pelo endpoint do parceiro, que oculta
-- a contagem de aulas depois do pagamento. Não permitir leitura direta que
-- contorne essa regra de apresentação.
DROP POLICY IF EXISTS partner_commissions_owner_or_self_select
  ON public.partner_commissions;
DROP POLICY IF EXISTS partner_commission_lessons_owner_or_self_select
  ON public.partner_commission_lessons;
