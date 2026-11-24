-- Estrutura persistente do módulo de parceiros, com isolamento por proprietário.
CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NULL UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 160),
  email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 254),
  telefone text NULL,
  cpf_cnpj text NULL,
  endereco text NULL,
  pix_key text NULL CHECK (pix_key IS NULL OR length(pix_key) <= 120),
  commission_percent numeric(5,2) NOT NULL DEFAULT 5 CHECK (commission_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','reprovado','suspenso')),
  approved_at timestamptz NULL,
  rejected_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partners_id_owner_key UNIQUE (id, owner_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS partners_owner_email_lower_uidx
  ON public.partners(owner_id, lower(email));
CREATE INDEX IF NOT EXISTS partners_owner_status_created_idx
  ON public.partners(owner_id, status, created_at DESC);

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS partner_id uuid NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_partner_owner_fk') THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_partner_owner_fk
      FOREIGN KEY (partner_id, owner_id)
      REFERENCES public.partners(id, owner_id)
      ON DELETE SET NULL (partner_id);
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS students_owner_partner_idx ON public.students(owner_id, partner_id);

CREATE TABLE IF NOT EXISTS public.partner_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 160),
  telefone text NULL,
  cpf text NULL,
  endereco text NULL,
  categoria text NULL,
  observacoes text NULL,
  status text NOT NULL DEFAULT 'pendente_aprovacao'
    CHECK (status IN ('pendente_aprovacao','aprovado','reprovado')),
  student_id uuid NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_students_partner_owner_fk
    FOREIGN KEY (partner_id, owner_id) REFERENCES public.partners(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_students_student_owner_fk
    FOREIGN KEY (student_id, owner_id) REFERENCES public.students(id, owner_id) ON DELETE SET NULL (student_id),
  CONSTRAINT partner_students_id_owner_key UNIQUE (id, owner_id)
);
CREATE INDEX IF NOT EXISTS partner_students_owner_partner_status_idx
  ON public.partner_students(owner_id, partner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  partner_student_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','reprovado','cancelado')),
  subtotal numeric(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  desconto numeric(10,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  total numeric(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  observacoes text NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sale_id uuid NULL REFERENCES public.sales(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_quotes_partner_owner_fk
    FOREIGN KEY (partner_id, owner_id) REFERENCES public.partners(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_quotes_student_owner_fk
    FOREIGN KEY (partner_student_id, owner_id) REFERENCES public.partner_students(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_quotes_id_owner_key UNIQUE (id, owner_id)
);
CREATE INDEX IF NOT EXISTS partner_quotes_owner_status_created_idx
  ON public.partner_quotes(owner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  tipo_item text NOT NULL CHECK (tipo_item IN ('produto','servico')),
  quantidade numeric(10,2) NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric(10,2) NOT NULL CHECK (valor_unitario >= 0),
  subtotal numeric(10,2) NOT NULL CHECK (subtotal >= 0),
  aulas_contratadas integer NOT NULL DEFAULT 0 CHECK (aulas_contratadas >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_quote_items_quote_owner_fk
    FOREIGN KEY (quote_id, owner_id) REFERENCES public.partner_quotes(id, owner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_quote_items_owner_quote_idx ON public.partner_quote_items(owner_id, quote_id);

CREATE TABLE IF NOT EXISTS public.partner_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assunto text NOT NULL CHECK (length(btrim(assunto)) BETWEEN 1 AND 160),
  mensagem text NOT NULL CHECK (length(btrim(mensagem)) BETWEEN 1 AND 5000),
  publico text NOT NULL DEFAULT 'selecionados' CHECK (publico IN ('todos_aprovados','selecionados')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_messages_id_owner_key UNIQUE (id, owner_id)
);
CREATE TABLE IF NOT EXISTS public.partner_message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_message_recipients_message_owner_fk
    FOREIGN KEY (message_id, owner_id) REFERENCES public.partner_messages(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_message_recipients_partner_owner_fk
    FOREIGN KEY (partner_id, owner_id) REFERENCES public.partners(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_message_recipients_unique UNIQUE (message_id, partner_id)
);
CREATE INDEX IF NOT EXISTS partner_message_recipients_owner_partner_idx
  ON public.partner_message_recipients(owner_id, partner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  student_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  sale_item_id uuid NOT NULL UNIQUE REFERENCES public.sale_items(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  base_amount numeric(10,2) NOT NULL CHECK (base_amount >= 0),
  commission_percent numeric(5,2) NOT NULL CHECK (commission_percent BETWEEN 0 AND 100),
  commission_amount numeric(10,2) NOT NULL CHECK (commission_amount >= 0),
  lessons_required integer NOT NULL CHECK (lessons_required > 0),
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','disponivel','pago')),
  available_at timestamptz NULL,
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_commissions_partner_owner_fk
    FOREIGN KEY (partner_id, owner_id) REFERENCES public.partners(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_commissions_student_owner_fk
    FOREIGN KEY (student_id, owner_id) REFERENCES public.students(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_commissions_sale_owner_fk
    FOREIGN KEY (sale_id, owner_id) REFERENCES public.sales(id, owner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_commissions_owner_partner_status_idx
  ON public.partner_commissions(owner_id, partner_id, status, created_at);
CREATE INDEX IF NOT EXISTS partner_commissions_owner_student_fifo_idx
  ON public.partner_commissions(owner_id, student_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (length(btrim(payment_method)) BETWEEN 1 AND 40),
  reference text NULL CHECK (reference IS NULL OR length(reference) <= 160),
  pix_key_snapshot text NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NULL,
  CONSTRAINT partner_payouts_partner_owner_fk
    FOREIGN KEY (partner_id, owner_id) REFERENCES public.partners(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_payouts_id_owner_key UNIQUE (id, owner_id)
);
CREATE TABLE IF NOT EXISTS public.partner_payout_commissions (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payout_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  PRIMARY KEY (payout_id, commission_id),
  CONSTRAINT partner_payout_commissions_payout_owner_fk
    FOREIGN KEY (payout_id, owner_id) REFERENCES public.partner_payouts(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_payout_commissions_commission_fk
    FOREIGN KEY (commission_id) REFERENCES public.partner_commissions(id) ON DELETE RESTRICT
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partners, public.partner_students, public.partner_quotes,
  public.partner_quote_items, public.partner_messages, public.partner_message_recipients,
  public.partner_commissions, public.partner_payouts, public.partner_payout_commissions
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.partners, public.partner_commissions TO authenticated;
CREATE POLICY partners_owner_select ON public.partners
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND private.current_app_role() IN ('admin','instrutor'));
CREATE POLICY partner_commissions_owner_select ON public.partner_commissions
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND private.current_app_role() IN ('admin','instrutor'));

CREATE OR REPLACE FUNCTION public.record_partner_payout(
  p_owner_id uuid,
  p_partner_id uuid,
  p_commission_ids uuid[],
  p_payment_method text DEFAULT 'pix',
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_partner public.partners%rowtype;
  v_amount numeric(10,2);
  v_count integer;
  v_payout_id uuid;
BEGIN
  IF v_uid IS NULL OR private.current_app_role() IS DISTINCT FROM 'admin' OR p_owner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Somente o administrador desta conta pode registrar pagamentos.';
  END IF;
  IF p_partner_id IS NULL OR coalesce(array_length(p_commission_ids, 1), 0) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Selecione comissões válidas para pagamento.';
  END IF;
  IF p_payment_method NOT IN ('pix','dinheiro','transferencia','outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;
  SELECT * INTO v_partner FROM public.partners
  WHERE id = p_partner_id AND owner_id = v_uid AND status = 'aprovado'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parceiro aprovado não encontrado.'; END IF;

  SELECT count(*), coalesce(sum(c.commission_amount),0)
    INTO v_count, v_amount
  FROM public.partner_commissions c
  WHERE c.owner_id = v_uid AND c.partner_id = p_partner_id
    AND c.status = 'disponivel' AND c.id = ANY(p_commission_ids)
  FOR UPDATE;
  IF v_count <> (SELECT count(DISTINCT x) FROM unnest(p_commission_ids) AS x) THEN
    RAISE EXCEPTION 'Uma ou mais comissões não estão disponíveis para este parceiro.';
  END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'O total do pagamento deve ser maior que zero.'; END IF;

  INSERT INTO public.partner_payouts(owner_id, partner_id, amount, payment_method, reference, pix_key_snapshot)
  VALUES(v_uid, p_partner_id, v_amount, p_payment_method, nullif(btrim(p_reference),''), v_partner.pix_key)
  RETURNING id INTO v_payout_id;

  INSERT INTO public.partner_payout_commissions(owner_id, payout_id, commission_id)
  SELECT v_uid, v_payout_id, c.id
  FROM public.partner_commissions c
  WHERE c.owner_id = v_uid AND c.partner_id = p_partner_id
    AND c.status = 'disponivel' AND c.id = ANY(p_commission_ids);

  UPDATE public.partner_commissions
  SET status = 'pago', paid_at = now()
  WHERE owner_id = v_uid AND partner_id = p_partner_id
    AND status = 'disponivel' AND id = ANY(p_commission_ids);

  RETURN jsonb_build_object('payout_id', v_payout_id, 'amount', v_amount, 'commission_count', v_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_partner_payout(uuid,uuid,uuid[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_payout(uuid,uuid,uuid[],text,text) TO authenticated;

-- Cria uma comissão somente para serviço vendido a aluno indicado por parceiro.
CREATE OR REPLACE FUNCTION private.sync_partner_commission_from_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sale public.sales%rowtype;
  v_student public.students%rowtype;
  v_partner public.partners%rowtype;
  v_lessons integer;
BEGIN
  IF NEW.tipo_item IS DISTINCT FROM 'servico' OR coalesce(NEW.aulas_contratadas,0) <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_sale FROM public.sales
  WHERE id = NEW.sale_id AND owner_id = NEW.owner_id AND status = 'confirmada';
  IF NOT FOUND OR v_sale.student_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_student FROM public.students
  WHERE id = v_sale.student_id AND owner_id = NEW.owner_id;
  IF NOT FOUND OR v_student.partner_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_partner FROM public.partners
  WHERE id = v_student.partner_id AND owner_id = NEW.owner_id AND status = 'aprovado';
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_lessons := NEW.aulas_contratadas;
  INSERT INTO public.partner_commissions(
    owner_id, partner_id, student_id, sale_id, sale_item_id, descricao,
    base_amount, commission_percent, commission_amount, lessons_required
  ) VALUES (
    NEW.owner_id, v_partner.id, v_student.id, v_sale.id, NEW.id, NEW.descricao,
    coalesce(NEW.valor_liquido, NEW.subtotal, 0), v_partner.commission_percent,
    round(coalesce(NEW.valor_liquido, NEW.subtotal, 0) * v_partner.commission_percent / 100, 2),
    v_lessons
  )
  ON CONFLICT (sale_item_id) DO UPDATE SET
    descricao = EXCLUDED.descricao,
    base_amount = EXCLUDED.base_amount,
    commission_percent = EXCLUDED.commission_percent,
    commission_amount = EXCLUDED.commission_amount,
    lessons_required = EXCLUDED.lessons_required;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_partner_commission_from_sale_item() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_partner_commission_from_sale_item ON public.sale_items;
CREATE TRIGGER sync_partner_commission_from_sale_item
AFTER INSERT OR UPDATE OF tipo_item, aulas_contratadas, valor_liquido, subtotal
ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION private.sync_partner_commission_from_sale_item();

-- Recalcula o progresso por aluno, distribuindo aulas concluídas em FIFO entre pacotes.
CREATE OR REPLACE FUNCTION private.refresh_partner_commissions_for_student(p_owner_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_completed integer;
BEGIN
  SELECT count(*)::integer INTO v_completed
  FROM public.lessons
  WHERE owner_id = p_owner_id AND student_id = p_student_id
    AND lower(coalesce(status,'')) IN ('realizada','realizado');

  WITH ordered AS (
    SELECT c.id, c.lessons_required,
      coalesce(sum(c.lessons_required) OVER (
        ORDER BY c.created_at, c.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),0)::integer AS lessons_before
    FROM public.partner_commissions c
    WHERE c.owner_id = p_owner_id AND c.student_id = p_student_id
  )
  UPDATE public.partner_commissions c
  SET lessons_completed = least(c.lessons_required, greatest(0, v_completed - ordered.lessons_before)),
      status = CASE
        WHEN c.status = 'pago' THEN 'pago'
        WHEN least(c.lessons_required, greatest(0, v_completed - ordered.lessons_before)) >= c.lessons_required THEN 'disponivel'
        ELSE 'pendente'
      END,
      available_at = CASE
        WHEN c.status = 'pago' THEN c.available_at
        WHEN least(c.lessons_required, greatest(0, v_completed - ordered.lessons_before)) >= c.lessons_required THEN coalesce(c.available_at, now())
        ELSE NULL
      END
  FROM ordered
  WHERE c.id = ordered.id;
END;
$function$;
REVOKE ALL ON FUNCTION private.refresh_partner_commissions_for_student(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_partner_commission_lesson_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.refresh_partner_commissions_for_student(OLD.owner_id, OLD.student_id);
    RETURN OLD;
  END IF;
  PERFORM private.refresh_partner_commissions_for_student(NEW.owner_id, NEW.student_id);
  IF TG_OP = 'UPDATE' AND (OLD.owner_id, OLD.student_id) IS DISTINCT FROM (NEW.owner_id, NEW.student_id) THEN
    PERFORM private.refresh_partner_commissions_for_student(OLD.owner_id, OLD.student_id);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_partner_commission_lesson_progress() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_partner_commission_lesson_progress ON public.lessons;
CREATE TRIGGER sync_partner_commission_lesson_progress
AFTER INSERT OR UPDATE OF status, student_id, owner_id OR DELETE
ON public.lessons
FOR EACH ROW EXECUTE FUNCTION private.sync_partner_commission_lesson_progress();

-- Recalcula também se uma venda for editada ou se o vínculo de indicação mudar.
CREATE OR REPLACE FUNCTION private.refresh_partner_commissions_for_student_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.refresh_partner_commissions_for_student(NEW.owner_id, NEW.id);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.refresh_partner_commissions_for_student_trigger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS refresh_partner_commissions_after_student_update ON public.students;
CREATE TRIGGER refresh_partner_commissions_after_student_update
AFTER UPDATE OF partner_id ON public.students
FOR EACH ROW EXECUTE FUNCTION private.refresh_partner_commissions_for_student_trigger();

-- Garante que comissões já geradas acompanhem alterações nos itens de serviço.
CREATE OR REPLACE FUNCTION private.refresh_partner_commission_after_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_student_id uuid;
BEGIN
  SELECT student_id INTO v_student_id FROM public.sales
  WHERE id = NEW.sale_id AND owner_id = NEW.owner_id;
  IF v_student_id IS NOT NULL THEN
    PERFORM private.refresh_partner_commissions_for_student(NEW.owner_id, v_student_id);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.refresh_partner_commission_after_sale_item() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS refresh_partner_commission_after_sale_item ON public.sale_items;
CREATE TRIGGER refresh_partner_commission_after_sale_item
AFTER INSERT OR UPDATE OF tipo_item, aulas_contratadas, valor_liquido, subtotal
ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION private.refresh_partner_commission_after_sale_item();

-- Todas as demais tabelas do módulo são acessadas somente pelas Edge Functions
-- que validam o usuário, papel, parceiro e proprietário antes de cada operação.
