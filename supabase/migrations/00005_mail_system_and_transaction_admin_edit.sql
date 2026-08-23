-- ============================================================
-- 00005: Full admin mail system + transactional email notifications
-- ============================================================

-- ─── Extend admin_messages into a full mailbox ──────────────────────────────
ALTER TABLE public.admin_messages
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS to_email text,
  ADD COLUMN IF NOT EXISTS to_name text,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.admin_messages(id),
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Anyone (even logged-out visitors) can send a message to the admin inbox
DROP POLICY IF EXISTS "Anyone can contact admin" ON public.admin_messages;
CREATE POLICY "Anyone can contact admin"
  ON public.admin_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (direction = 'inbound');

-- Only admins can read or update (mark read) the mailbox
DROP POLICY IF EXISTS "Admins can read mailbox" ON public.admin_messages;
CREATE POLICY "Admins can read mailbox"
  ON public.admin_messages FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update mailbox" ON public.admin_messages;
CREATE POLICY "Admins can update mailbox"
  ON public.admin_messages FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── Outbound mail queue (written by trigger, sent by send-email fn) ────────
CREATE TABLE IF NOT EXISTS public.mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id),
  to_email text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  status text NOT NULL DEFAULT 'pending',      -- pending | sent | failed | skipped
  error text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE public.mail_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read outbox" ON public.mail_outbox;
CREATE POLICY "Admins can read outbox"
  ON public.mail_outbox FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── Mail settings (SMTP relay credentials etc., admin-only) ────────────────
CREATE TABLE IF NOT EXISTS public.mail_settings (
  id int PRIMARY KEY DEFAULT 1,
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_pass text,
  from_name text NOT NULL DEFAULT 'Wexfordfin Support',
  from_email text NOT NULL DEFAULT 'support@wexfordfin.com',
  forward_enabled boolean NOT NULL DEFAULT false,
  forward_to text,
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.mail_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.mail_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage mail settings" ON public.mail_settings;
CREATE POLICY "Admins manage mail settings"
  ON public.mail_settings FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── Transactional notification trigger ─────────────────────────────────────
-- Every important banking event inserts a notification row; this trigger
-- mirrors it into the mail_outbox so the user also gets an email.
CREATE OR REPLACE FUNCTION public.queue_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name  text;
  v_enabled boolean;
BEGIN
  SELECT notifications_enabled INTO v_enabled FROM public.mail_settings WHERE id = 1;
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN NEW;
  END IF;

  SELECT email, COALESCE(NULLIF(full_name, ''), 'Valued Customer')
    INTO v_email, v_name
    FROM public.profiles WHERE id = NEW.user_id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.mail_outbox (user_id, to_email, subject, body_html, body_text)
  VALUES (
    NEW.user_id,
    v_email,
    NEW.title || ' — Wexfordfin',
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">'
      || '<div style="background:#0a1628;padding:20px 24px"><span style="color:#ffffff;font-size:20px;font-weight:bold">Wexford</span><span style="color:#c9a227;font-size:20px;font-weight:bold">fin</span></div>'
      || '<div style="padding:24px">'
      || '<p style="color:#111827;font-size:15px;margin:0 0 12px">Dear ' || v_name || ',</p>'
      || '<h2 style="color:#111827;font-size:18px;margin:0 0 8px">' || NEW.title || '</h2>'
      || '<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px">' || NEW.message || '</p>'
      || '<p style="color:#9ca3af;font-size:12px;margin:16px 0 0">Sign in to your dashboard for full details. If you did not perform this action, contact support immediately.</p>'
      || '</div>'
      || '<div style="background:#f9fafb;padding:12px 24px;color:#9ca3af;font-size:11px">Wexfordfin · support@wexfordfin.com · This is an automated message, please do not reply.</div>'
      || '</div>',
    'Dear ' || v_name || E',\n\n' || NEW.title || E'\n' || NEW.message || E'\n\nSign in to your dashboard for full details.\n\nWexfordfin · support@wexfordfin.com'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_notification_email ON public.notifications;
CREATE TRIGGER trg_queue_notification_email
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_notification_email();

-- ─── Admin RPC: edit any transaction field A-Z ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_edit_transaction(
  p_id uuid,
  p_transaction_type text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_from_account_id uuid DEFAULT NULL,
  p_to_account_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL,
  p_performed_by_admin uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  UPDATE public.transactions SET
    transaction_type   = COALESCE(p_transaction_type::public.transaction_type, transaction_type),
    amount             = COALESCE(p_amount, amount),
    status             = COALESCE(p_status::public.transaction_status, status),
    description        = COALESCE(p_description, description),
    reference_number   = COALESCE(p_reference_number, reference_number),
    from_account_id    = COALESCE(p_from_account_id, from_account_id),
    to_account_id      = COALESCE(p_to_account_id, to_account_id),
    user_id            = COALESCE(p_user_id, user_id),
    created_at         = COALESCE(p_created_at, created_at),
    performed_by_admin = COALESCE(p_performed_by_admin, performed_by_admin)
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_edit_transaction(uuid, text, numeric, text, text, text, uuid, uuid, uuid, timestamptz, uuid) TO authenticated;
