// send-email Edge Function: flushes the mail_outbox queue.
// Default behaviour (no provider needed): mail addressed to a registered
// Wexfordfin user is delivered instantly into their in-app Mailbox.
// If an external provider (Brevo/Resend) is configured in mail_settings,
// mail is additionally sent out over the internet (e.g. to Gmail).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface MailSettings {
  smtp_host: string | null;
  smtp_user: string | null;
  smtp_pass: string | null; // stores API key when provider is brevo/resend
  from_name: string;
  from_email: string;
  forward_enabled: boolean;
  forward_to: string | null;
  notifications_enabled: boolean;
}

async function sendViaProvider(settings: MailSettings, to: string, subject: string, html: string, text: string | null) {
  const host = (settings.smtp_host || '').toLowerCase();
  const key = settings.smtp_pass || '';

  if (host.includes('brevo')) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: settings.from_name, email: settings.from_email },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || undefined,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  if (host.includes('resend')) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${settings.from_name} <${settings.from_email}>`, to: [to], subject, html, text: text || undefined }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  throw new Error('Unsupported provider — set smtp_host to "brevo" or "resend"');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') || '20'), 100);

  const { data: settings } = await supabase.from('mail_settings').select('*').eq('id', 1).single();
  if (!settings) return json({ error: 'No mail settings row' }, 500);

  const providerConfigured = !!settings.smtp_host && !!settings.smtp_pass;

  const { data: pending, error } = await supabase
    .from('mail_outbox').select('*').eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(limit);
  if (error) return json({ error: error.message }, 500);

  let deliveredInternal = 0, sent = 0, failed = 0, awaitingProvider = 0;

  for (const mail of pending) {
    // 1) Default in-app delivery: recipient is a registered user → Mailbox
    const { data: recipient } = await supabase
      .from('profiles').select('id').or(`id.eq.${mail.user_id ?? '00000000-0000-0000-0000-000000000000'},email.eq.${mail.to_email}`).limit(1).maybeSingle();

    if (recipient) {
      await supabase.from('mail_outbox').update({
        status: 'sent', sent_at: new Date().toISOString(), attempts: mail.attempts + 1, error: null,
      }).eq('id', mail.id);
      deliveredInternal++;
      continue;
    }

    // 2) External recipient: needs a provider to leave the platform
    if (!providerConfigured) { awaitingProvider++; continue; }

    try {
      await sendViaProvider(settings, mail.to_email, mail.subject, mail.body_html, mail.body_text);
      // Optional forward to external mailbox (e.g. Gmail) for record
      if (settings.forward_enabled && settings.forward_to && settings.forward_to !== mail.to_email) {
        try {
          await sendViaProvider(settings, settings.forward_to, `[FWD] ${mail.subject}`, mail.body_html, mail.body_text);
        } catch { /* forwarding is best-effort */ }
      }
      await supabase.from('mail_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: mail.attempts + 1, error: null }).eq('id', mail.id);
      sent++;
    } catch (e) {
      const attempts = mail.attempts + 1;
      await supabase.from('mail_outbox').update({
        status: attempts >= 3 ? 'failed' : 'pending',
        attempts,
        error: String((e as Error).message || e).slice(0, 500),
      }).eq('id', mail.id);
      failed++;
    }
  }

  return json({ delivered_internal: deliveredInternal, sent_external: sent, failed, awaiting_provider: awaitingProvider });
});
