-- Wexfordfin backend schema — Railway Postgres (replaces Supabase Auth + RLS)
-- Authorization is enforced in application code (Express middleware), not
-- Postgres RLS, since there is no auth.uid()/auth.users here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('checking', 'savings', 'business');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'hold', 'release', 'admin_credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'held');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- USERS (replaces Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  transaction_pin text,
  phone text,
  role user_role NOT NULL DEFAULT 'user',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_type account_type NOT NULL,
  account_number text UNIQUE NOT NULL,
  balance numeric(15,2) NOT NULL DEFAULT 0.00,
  available_balance numeric(15,2) NOT NULL DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id uuid REFERENCES accounts(id),
  to_account_id uuid REFERENCES accounts(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  transaction_type transaction_type NOT NULL,
  amount numeric(15,2) NOT NULL,
  status transaction_status NOT NULL DEFAULT 'completed',
  description text,
  reference_number text UNIQUE NOT NULL DEFAULT 'TXN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  performed_by_admin uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- HOLDS
-- ============================================================
CREATE TABLE IF NOT EXISTS holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  amount numeric(15,2) NOT NULL,
  reason text NOT NULL,
  is_released boolean NOT NULL DEFAULT false,
  placed_by_admin uuid NOT NULL REFERENCES profiles(id),
  released_by_admin uuid REFERENCES profiles(id),
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

-- ============================================================
-- DEPOSIT / WITHDRAWAL REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  amount numeric(15,2) NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  notes text,
  reviewed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  amount numeric(15,2) NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  notes text,
  reviewed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ADMIN MESSAGES (mailbox, inbound + outbound)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES profiles(id),
  from_name text,
  from_email text,
  subject text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  direction text NOT NULL DEFAULT 'inbound',
  to_email text,
  to_name text,
  parent_id uuid REFERENCES admin_messages(id),
  delivery_status text NOT NULL DEFAULT 'received',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SECURITY CODES (PIN, IMF, COT, TAC)
-- ============================================================
CREATE TABLE IF NOT EXISTS security_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_type text NOT NULL CHECK (code_type IN ('PIN','IMF','COT','TAC')),
  code text NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  issued_by uuid REFERENCES profiles(id),
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- MAIL OUTBOX / SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  to_email text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  attempts int NOT NULL DEFAULT 0,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS mail_settings (
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
INSERT INTO mail_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ACCOUNT NUMBER GENERATOR
-- ============================================================
CREATE OR REPLACE FUNCTION generate_account_number(acct_type account_type)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  prefix text;
BEGIN
  prefix := CASE acct_type
    WHEN 'checking' THEN 'CHK'
    WHEN 'savings'  THEN 'SAV'
    WHEN 'business' THEN 'BIZ'
  END;
  RETURN prefix || '-' || lpad(floor(random() * 9000000000 + 1000000000)::text, 10, '0');
END;
$$;

-- ============================================================
-- NOTIFICATION -> IN-APP MAILBOX TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION queue_notification_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_email text;
  v_name  text;
  v_enabled boolean;
BEGIN
  SELECT notifications_enabled INTO v_enabled FROM mail_settings WHERE id = 1;
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN NEW;
  END IF;

  SELECT email, COALESCE(NULLIF(full_name, ''), 'Valued Customer')
    INTO v_email, v_name
    FROM profiles WHERE id = NEW.user_id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO mail_outbox (user_id, to_email, subject, body_html, body_text, status, sent_at)
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

DROP TRIGGER IF EXISTS trg_queue_notification_email ON notifications;
CREATE TRIGGER trg_queue_notification_email
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION queue_notification_email();

-- ============================================================
-- PUBLIC PROFILES VIEW
-- ============================================================
CREATE OR REPLACE VIEW public_profiles AS
  SELECT id, full_name, role FROM profiles;
