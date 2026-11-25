-- Pré-requisitos compostos exigidos pelas FKs multi-tenant abaixo.
-- A chave primária já garante unicidade de id; estes índices permitem validar também owner_id.
CREATE UNIQUE INDEX IF NOT EXISTS sale_items_id_owner_partner_key
  ON public.sale_items(id, owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS lessons_id_owner_partner_key
  ON public.lessons(id, owner_id);

-- O perfil parceiro é atribuído pela Edge Function administrativa via service_role.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'instrutor', 'usuario', 'parceiro'));

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
ALTER TABLE public.partners ALTER COLUMN commission_percent SET DEFAULT 5;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS nacionalidade text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS estado_civil text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS profissao text;
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
  sale_item_id uuid NOT NULL UNIQUE,
  descricao text NOT NULL,
  base_amount numeric(10,2) NOT NULL CHECK (base_amount >= 0),
  commission_percent numeric(5,2) NOT NULL CHECK (commission_percent BETWEEN 0 AND 100),
  commission_amount numeric(10,2) NOT NULL CHECK (commission_amount >= 0),
  lessons_required integer NOT NULL DEFAULT 0 CHECK (lessons_required >= 0),
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','disponivel','pago','cancelado')),
  payout_id uuid NULL,
  available_at timestamptz NULL,
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_commissions_partner_owner_fk
    FOREIGN KEY (partner_id, owner_id) REFERENCES public.partners(id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT partner_commissions_student_owner_fk
    FOREIGN KEY (student_id, owner_id) REFERENCES public.students(id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT partner_commissions_sale_owner_fk
    FOREIGN KEY (sale_id, owner_id) REFERENCES public.sales(id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT partner_commissions_sale_item_owner_fk
    FOREIGN KEY (sale_item_id, owner_id) REFERENCES public.sale_items(id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT partner_commissions_id_owner_key UNIQUE (id, owner_id)
);
ALTER TABLE public.partner_commissions ADD COLUMN IF NOT EXISTS payout_id uuid NULL;
ALTER TABLE public.partner_commissions ADD COLUMN IF NOT EXISTS available_at timestamptz NULL;
ALTER TABLE public.partner_commissions ADD COLUMN IF NOT EXISTS paid_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS partner_commissions_owner_partner_status_idx
  ON public.partner_commissions(owner_id, partner_id, status, created_at);
CREATE INDEX IF NOT EXISTS partner_commissions_owner_student_fifo_idx
  ON public.partner_commissions(owner_id, student_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'pix',
  reference text NULL,
  pix_key_snapshot text NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NULL,
  CONSTRAINT partner_payouts_partner_owner_fk
    FOREIGN KEY (partner_id, owner_id) REFERENCES public.partners(id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT partner_payouts_id_owner_key UNIQUE (id, owner_id)
);
ALTER TABLE public.partner_payouts ADD COLUMN IF NOT EXISTS received_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_commissions_payout_fk') THEN
    ALTER TABLE public.partner_commissions
      ADD CONSTRAINT partner_commissions_payout_fk
      FOREIGN KEY (payout_id, owner_id)
      REFERENCES public.partner_payouts(id, owner_id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.partner_commission_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL,
  lesson_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_commission_lessons_commission_owner_fk
    FOREIGN KEY (commission_id, owner_id)
    REFERENCES public.partner_commissions(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT partner_commission_lessons_lesson_owner_fk
    FOREIGN KEY (lesson_id, owner_id)
    REFERENCES public.lessons(id, owner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_commission_lessons_owner_commission_idx
  ON public.partner_commission_lessons(owner_id, commission_id);

-- Todas as tabelas do módulo ficam protegidas por RLS. As tabelas acessadas
-- exclusivamente pelas Edge Functions não recebem políticas para authenticated;
-- service_role mantém o acesso administrativo controlado no servidor.
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_lessons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partners, public.partner_students, public.partner_quotes,
  public.partner_quote_items, public.partner_messages, public.partner_message_recipients,
  public.partner_commissions, public.partner_payouts, public.partner_commission_lessons
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.partners, public.partner_commissions TO authenticated;
DROP POLICY IF EXISTS partners_owner_or_self_select ON public.partners;
DROP POLICY IF EXISTS partners_owner_select ON public.partners;
CREATE POLICY partners_owner_or_self_select ON public.partners
  FOR SELECT TO authenticated
  USING (
    (owner_id = (SELECT auth.uid()) AND private.current_app_role() IN ('admin','instrutor'))
    OR user_id = (SELECT auth.uid())
  );
DROP POLICY IF EXISTS partner_commissions_owner_select ON public.partner_commissions;
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
  v_count integer;
  v_total numeric(12,2);
  v_payout_id uuid;
  v_pix text;
BEGIN
  -- Esta RPC é chamada exclusivamente pela Edge Function, que autentica o
  -- administrador antes de usar a chave service_role.
  IF p_owner_id IS NULL OR p_partner_id IS NULL
     OR p_commission_ids IS NULL OR cardinality(p_commission_ids) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Seleção de comissões inválida.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.partner_commissions c
   WHERE c.owner_id = p_owner_id AND c.partner_id = p_partner_id
     AND c.id = ANY(p_commission_ids) AND c.status = 'disponivel'
   FOR UPDATE;

  SELECT count(*)::integer, coalesce(sum(c.commission_amount),0)
    INTO v_count, v_total
  FROM public.partner_commissions c
  WHERE c.owner_id = p_owner_id AND c.partner_id = p_partner_id
    AND c.id = ANY(p_commission_ids) AND c.status = 'disponivel';

  IF v_count <> cardinality(p_commission_ids) OR v_total <= 0 THEN
    RAISE EXCEPTION 'Uma ou mais comissões não estão disponíveis para pagamento.' USING ERRCODE = '23514';
  END IF;

  SELECT p.pix_key INTO v_pix
  FROM public.partners p
  WHERE p.id = p_partner_id AND p.owner_id = p_owner_id AND p.status = 'aprovado'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parceiro aprovado não encontrado.' USING ERRCODE = 'P0002'; END IF;

  IF coalesce(nullif(btrim(p_payment_method),''),'pix') NOT IN ('pix','dinheiro','transferencia','outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.partner_payouts(owner_id, partner_id, amount, payment_method, reference, pix_key_snapshot)
  VALUES(p_owner_id, p_partner_id, v_total, coalesce(nullif(btrim(p_payment_method),''),'pix'),
    nullif(left(btrim(coalesce(p_reference,'')),160),''), v_pix)
  RETURNING id INTO v_payout_id;

  UPDATE public.partner_commissions
  SET status = 'pago', payout_id = v_payout_id, paid_at = now()
  WHERE owner_id = p_owner_id AND partner_id = p_partner_id
    AND id = ANY(p_commission_ids) AND status = 'disponivel';

  RETURN jsonb_build_object('id',v_payout_id,'partner_id',p_partner_id,'amount',v_total,
    'commission_count',v_count,'paid_at',now(),'payment_method',p_payment_method);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_partner_payout(uuid,uuid,uuid[],text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_partner_payout(uuid,uuid,uuid[],text,text) TO service_role;

-- Comissão incide exclusivamente sobre serviços e somente depois da aprovação
-- do parceiro. Produtos e itens fixos nunca geram comissão.
CREATE OR REPLACE FUNCTION private.create_partner_commission_for_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sale public.sales%rowtype;
  v_partner public.partners%rowtype;
  v_base numeric(12,2);
  v_required integer;
  v_rate numeric(5,2);
  v_lesson public.lessons%rowtype;
  v_commission_id uuid;
BEGIN
  SELECT * INTO v_sale FROM public.sales
  WHERE id = NEW.sale_id AND owner_id = NEW.owner_id;
  IF NOT FOUND OR v_sale.student_id IS NULL OR v_sale.status <> 'confirmada' THEN RETURN NEW; END IF;
  IF coalesce(NEW.tipo_item,'servico') <> 'servico' OR NEW.fixed_item_key IS NOT NULL THEN RETURN NEW; END IF;

  SELECT p.* INTO v_partner
  FROM public.students s
  JOIN public.partners p ON p.id = s.partner_id AND p.owner_id = s.owner_id
  WHERE s.id = v_sale.student_id AND s.owner_id = NEW.owner_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT c.commission_percent INTO v_rate
  FROM public.partner_commissions c
  WHERE c.sale_item_id = NEW.id AND c.owner_id = NEW.owner_id;
  IF NOT FOUND THEN
    IF v_partner.status <> 'aprovado' OR v_partner.commission_percent <= 0 THEN RETURN NEW; END IF;
    v_rate := v_partner.commission_percent;
  END IF;

  v_base := greatest(0, coalesce(NEW.valor_liquido, NEW.subtotal, 0) - coalesce(NEW.valor_devolvido, 0));
  v_required := greatest(0, coalesce(NEW.aulas_contratadas, 0) - coalesce(NEW.aulas_devolvidas, 0));

  INSERT INTO public.partner_commissions(
    owner_id, partner_id, student_id, sale_id, sale_item_id, descricao,
    base_amount, commission_percent, commission_amount, lessons_required, status, available_at
  ) VALUES (
    NEW.owner_id, v_partner.id, v_sale.student_id, v_sale.id, NEW.id, NEW.descricao,
    v_base, v_rate, round(v_base * v_rate / 100, 2), v_required,
    CASE WHEN v_base <= 0 OR v_required = 0 THEN 'cancelado' ELSE 'pendente' END,
    NULL
  )
  ON CONFLICT (sale_item_id) DO UPDATE SET
    base_amount = EXCLUDED.base_amount,
    commission_percent = partner_commissions.commission_percent,
    commission_amount = round(EXCLUDED.base_amount * public.partner_commissions.commission_percent / 100, 2),
    lessons_required = EXCLUDED.lessons_required,
    status = CASE
      WHEN partner_commissions.status IN ('pago','cancelado') THEN public.partner_commissions.status
      WHEN EXCLUDED.status = 'cancelado' THEN 'cancelado'
      WHEN partner_commissions.lessons_completed >= EXCLUDED.lessons_required THEN 'disponivel'
      ELSE 'pendente'
    END,
    available_at = CASE
      WHEN public.partner_commissions.status IN ('pago','cancelado') THEN partner_commissions.available_at
      WHEN EXCLUDED.status = 'cancelado' THEN NULL
      WHEN public.partner_commissions.lessons_completed >= EXCLUDED.lessons_required
        THEN coalesce(public.partner_commissions.available_at, now())
      ELSE NULL
    END
  WHERE public.partner_commissions.status <> 'pago'
  RETURNING id INTO v_commission_id;

  IF v_commission_id IS NULL THEN
    SELECT id INTO v_commission_id FROM public.partner_commissions
    WHERE sale_item_id = NEW.id AND owner_id = NEW.owner_id;
  END IF;

  IF v_required > 0 AND v_base > 0 AND v_commission_id IS NOT NULL THEN
    FOR v_lesson IN
      SELECT l.* FROM public.lessons l
      WHERE l.owner_id = NEW.owner_id AND l.student_id = v_sale.student_id
        AND l.status = 'realizada' AND l.data_aula >= v_sale.data_venda
        AND NOT EXISTS (
          SELECT 1 FROM public.partner_commission_lessons cl
          WHERE cl.lesson_id = l.id AND cl.owner_id = l.owner_id
        )
      ORDER BY l.data_aula, l.horario, l.created_at, l.id
      LIMIT v_required
    LOOP
      INSERT INTO public.partner_commission_lessons(owner_id, commission_id, lesson_id)
      VALUES(NEW.owner_id, v_commission_id, v_lesson.id)
      ON CONFLICT (lesson_id) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.create_partner_commission_for_service() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_create_partner_commission_for_service ON public.sale_items;
DROP TRIGGER IF EXISTS sync_partner_commission_from_sale_item ON public.sale_items;
CREATE TRIGGER trg_create_partner_commission_for_service
AFTER INSERT OR UPDATE OF tipo_item, fixed_item_key, aulas_contratadas, aulas_devolvidas, valor_liquido, valor_devolvido, subtotal
ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION private.create_partner_commission_for_service();

CREATE OR REPLACE FUNCTION private.allocate_partner_commission_lesson()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_commission public.partner_commissions%rowtype;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.partner_commission_lessons
    WHERE lesson_id = OLD.id AND owner_id = OLD.owner_id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'realizada'
     AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.data_aula IS DISTINCT FROM OLD.data_aula) THEN
    DELETE FROM public.partner_commission_lessons
    WHERE lesson_id = OLD.id AND owner_id = OLD.owner_id;
  END IF;

  IF NEW.status = 'realizada' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_commission_lessons
      WHERE lesson_id = NEW.id AND owner_id = NEW.owner_id
    ) THEN
      SELECT c.* INTO v_commission
      FROM public.partner_commissions c
      JOIN public.sales s ON s.id = c.sale_id AND s.owner_id = c.owner_id
      WHERE c.owner_id = NEW.owner_id
        AND c.student_id = NEW.student_id
        AND c.status = 'pendente'
        AND c.lessons_completed < c.lessons_required
        AND s.data_venda <= NEW.data_aula
      ORDER BY s.data_venda, c.created_at, c.id
      LIMIT 1
      FOR UPDATE OF c;
      IF FOUND THEN
        INSERT INTO public.partner_commission_lessons(owner_id, commission_id, lesson_id)
        VALUES(NEW.owner_id, v_commission.id, NEW.id)
        ON CONFLICT (lesson_id) DO NOTHING;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.allocate_partner_commission_lesson() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_allocate_partner_commission_lesson ON public.lessons;
DROP TRIGGER IF EXISTS sync_partner_commission_lesson_progress ON public.lessons;
CREATE TRIGGER trg_allocate_partner_commission_lesson
AFTER INSERT OR UPDATE OF status, student_id, owner_id, data_aula OR DELETE
ON public.lessons
FOR EACH ROW EXECUTE FUNCTION private.allocate_partner_commission_lesson();

CREATE OR REPLACE FUNCTION private.sync_partner_commission_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_commission_id uuid;
  v_owner_id uuid;
  v_completed integer;
  v_required integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_commission_id := OLD.commission_id;
    v_owner_id := OLD.owner_id;
  ELSE
    v_commission_id := NEW.commission_id;
    v_owner_id := NEW.owner_id;
  END IF;

  SELECT count(*)::integer INTO v_completed
  FROM public.partner_commission_lessons
  WHERE commission_id = v_commission_id AND owner_id = v_owner_id;

  SELECT lessons_required INTO v_required
  FROM public.partner_commissions
  WHERE id = v_commission_id AND owner_id = v_owner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  UPDATE public.partner_commissions
  SET lessons_completed = v_completed,
      status = CASE
        WHEN status IN ('pago','cancelado') THEN status
        WHEN v_completed >= v_required THEN 'disponivel'
        ELSE 'pendente'
      END,
      available_at = CASE
        WHEN v_completed >= v_required AND status NOT IN ('pago','cancelado')
          THEN coalesce(available_at, now())
        ELSE NULL
      END
  WHERE id = v_commission_id AND owner_id = v_owner_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_partner_commission_progress() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_partner_commission_progress ON public.partner_commission_lessons;
CREATE TRIGGER trg_sync_partner_commission_progress
AFTER INSERT OR DELETE ON public.partner_commission_lessons
FOR EACH ROW EXECUTE FUNCTION private.sync_partner_commission_progress();

CREATE OR REPLACE FUNCTION private.guard_paid_partner_commission_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (coalesce(NEW.aulas_devolvidas,0) > coalesce(OLD.aulas_devolvidas,0)
      OR coalesce(NEW.valor_devolvido,0) > coalesce(OLD.valor_devolvido,0))
     AND EXISTS (
       SELECT 1 FROM public.partner_commissions c
       WHERE c.sale_item_id = OLD.id AND c.owner_id = OLD.owner_id AND c.status = 'pago'
     ) THEN
    RAISE EXCEPTION 'Não é possível devolver aulas: a comissão deste pacote já foi paga ao parceiro.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_paid_partner_commission_refund() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_paid_partner_commission_refund ON public.sale_items;
CREATE TRIGGER trg_guard_paid_partner_commission_refund
BEFORE UPDATE OF aulas_devolvidas, valor_devolvido ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION private.guard_paid_partner_commission_refund();
