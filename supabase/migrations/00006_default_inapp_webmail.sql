-- ============================================================
-- 00006: Default in-app webmail — instant internal delivery
-- Emails to registered users are delivered straight into their
-- in-app Mailbox (mail_outbox doubles as the user mailbox).
-- No external provider required for internal mail.
-- ============================================================

-- Mailbox read tracking for users
ALTER TABLE public.mail_outbox
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- Users can read their own mailbox
DROP POLICY IF EXISTS "Users can read own mailbox" ON public.mail_outbox;
CREATE POLICY "Users can read own mailbox"
  ON public.mail_outbox FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can mark their own mail read
DROP POLICY IF EXISTS "Users can mark own mail read" ON public.mail_outbox;
CREATE POLICY "Users can mark own mail read"
  ON public.mail_outbox FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── Trigger: deliver notification emails instantly in-app ──────────────────
-- Notification recipients are always registered users, so the email is
-- delivered immediately (status 'sent') into their in-app Mailbox.
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

  INSERT INTO public.mail_outbox (user_id, to_email, subject, body_html, body_text, status, sent_at)
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
    'Dear ' || v_name || E',\n\n' || NEW.title || E'\n' || NEW.message || E'\n\nSign in to your dashboard for full details.\n\nWexfordfin · support@wexfordfin.com',
    'sent',
    now()
  );

  RETURN NEW;
END;
$$;

-- Backfill: any still-pending email addressed to a registered user counts as
-- delivered to their in-app mailbox.
UPDATE public.mail_outbox o
SET status = 'sent', sent_at = now()
FROM public.profiles p
WHERE o.status = 'pending'
  AND (o.user_id = p.id OR o.to_email = p.email);
