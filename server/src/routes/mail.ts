import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin, type AuthedRequest } from '../auth.js';

const router = Router();

function brandedMailHtml(replyText: string, fromName: string, fromEmail: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#0a1628;padding:20px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">Wexford</span><span style="color:#c9a227;font-size:20px;font-weight:bold">fin</span></div>
      <div style="padding:24px"><p style="color:#4b5563;font-size:14px;line-height:1.7;white-space:pre-wrap">${replyText.replace(/</g, '&lt;')}</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px">— ${fromName} · ${fromEmail}</p></div></div>`;
}

async function queueOutboundMail(toEmail: string, subject: string, text: string) {
  const settingsRes = await pool.query('SELECT from_name, from_email FROM mail_settings WHERE id = 1');
  const settings = settingsRes.rows[0];
  const recipientRes = await pool.query('SELECT id FROM profiles WHERE email = $1', [toEmail]);
  const recipient = recipientRes.rows[0];
  const internal = !!recipient;

  await pool.query(
    `INSERT INTO mail_outbox (user_id, to_email, subject, body_html, body_text, status, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      recipient?.id ?? null, toEmail, subject,
      brandedMailHtml(text, settings?.from_name || 'Wexfordfin Support', settings?.from_email || 'support@wexfordfin.com'),
      text, internal ? 'sent' : 'pending', internal ? new Date() : null,
    ]
  );
  return internal;
}

// ─── Contact / support messages ──────────────────────────────────────────────

router.post('/messages/contact', async (req, res) => {
  const { from_name, from_email, subject, message } = req.body || {};
  if (!from_email || !subject || !message) return res.status(400).json({ error: 'Missing fields' });
  await pool.query(
    'INSERT INTO admin_messages (from_name, from_email, subject, message) VALUES ($1,$2,$3,$4)',
    [from_name || null, from_email, subject, message]
  );
  res.json({ success: true });
});

router.post('/messages/support', requireAuth, async (req: AuthedRequest, res) => {
  const { subject, message } = req.body || {};
  if (!subject || !message) return res.status(400).json({ error: 'Missing fields' });
  const profileRes = await pool.query('SELECT full_name, email FROM profiles WHERE id = $1', [req.userId]);
  const profile = profileRes.rows[0];
  await pool.query(
    'INSERT INTO admin_messages (from_user_id, from_name, from_email, subject, message) VALUES ($1,$2,$3,$4,$5)',
    [req.userId, profile?.full_name || profile?.email, profile?.email, subject, message]
  );
  res.json({ success: true });
});

router.get('/admin/messages', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM admin_messages ORDER BY created_at DESC LIMIT 100');
  res.json(rows);
});

router.patch('/admin/messages/:id/read', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('UPDATE admin_messages SET is_read = true WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

router.post('/admin/messages/:id/reply', requireAuth, requireAdmin, async (req, res) => {
  const parentRes = await pool.query('SELECT * FROM admin_messages WHERE id = $1', [req.params.id]);
  const parent = parentRes.rows[0];
  if (!parent) return res.status(404).json({ error: 'Message not found' });
  if (!parent.from_email) return res.status(400).json({ error: 'Original sender has no email address' });

  const { reply } = req.body || {};
  const subject = `Re: ${String(parent.subject).replace(/^Re:\s*/i, '')}`;
  const internal = await queueOutboundMail(parent.from_email, subject, reply);

  await pool.query(
    `INSERT INTO admin_messages (direction, to_email, to_name, parent_id, subject, message, is_read, delivery_status, sent_at)
     VALUES ('outbound',$1,$2,$3,$4,$5,true,$6,now())`,
    [parent.from_email, parent.from_name, parent.id, subject, reply, internal ? 'delivered' : 'queued']
  );
  res.json({ success: true });
});

router.post('/admin/messages/compose', requireAuth, requireAdmin, async (req, res) => {
  const { to_email, to_name, subject, message } = req.body || {};
  if (!to_email || !subject || !message) return res.status(400).json({ error: 'Missing fields' });
  const internal = await queueOutboundMail(to_email, subject, message);
  await pool.query(
    `INSERT INTO admin_messages (direction, to_email, to_name, subject, message, is_read, delivery_status, sent_at)
     VALUES ('outbound',$1,$2,$3,$4,true,$5,now())`,
    [to_email, to_name || to_email, subject, message, internal ? 'delivered' : 'queued']
  );
  res.json({ success: true });
});

// ─── User mailbox ────────────────────────────────────────────────────────────

router.get('/mail/inbox', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM mail_outbox WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.userId]
  );
  res.json(rows);
});

router.get('/mail/unread-count', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    'SELECT COUNT(*) FROM mail_outbox WHERE user_id = $1 AND is_read = false',
    [req.userId]
  );
  res.json({ count: Number(rows[0].count) });
});

router.patch('/mail/inbox/:id/read', requireAuth, async (req: AuthedRequest, res) => {
  await pool.query('UPDATE mail_outbox SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ success: true });
});

// ─── Mail settings (admin) ───────────────────────────────────────────────────

router.get('/admin/mail-settings', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM mail_settings WHERE id = 1');
  res.json(rows[0] || null);
});

router.patch('/admin/mail-settings', requireAuth, requireAdmin, async (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, forward_enabled, forward_to, notifications_enabled } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE mail_settings SET
       smtp_host = COALESCE($1, smtp_host),
       smtp_port = COALESCE($2, smtp_port),
       smtp_user = COALESCE($3, smtp_user),
       smtp_pass = COALESCE($4, smtp_pass),
       from_name = COALESCE($5, from_name),
       from_email = COALESCE($6, from_email),
       forward_enabled = COALESCE($7, forward_enabled),
       forward_to = COALESCE($8, forward_to),
       notifications_enabled = COALESCE($9, notifications_enabled),
       updated_at = now()
     WHERE id = 1 RETURNING *`,
    [smtp_host ?? null, smtp_port ?? null, smtp_user ?? null, smtp_pass ?? null, from_name ?? null,
      from_email ?? null, forward_enabled ?? null, forward_to ?? null, notifications_enabled ?? null]
  );
  res.json(rows[0]);
});

// ─── Outbound mail queue flush (external recipients only) ──────────────────

async function sendViaProvider(settings: any, to: string, subject: string, html: string, text: string | null) {
  const host = (settings.smtp_host || '').toLowerCase();
  const key = settings.smtp_pass || '';

  if (host.includes('brevo')) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: settings.from_name, email: settings.from_email }, to: [{ email: to }], subject, htmlContent: html, textContent: text || undefined }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (host.includes('resend')) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${settings.from_name} <${settings.from_email}>`, to: [to], subject, html, text: text || undefined }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  throw new Error('Unsupported provider — set smtp_host to "brevo" or "resend"');
}

router.post('/admin/mail/flush', requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const settingsRes = await pool.query('SELECT * FROM mail_settings WHERE id = 1');
  const settings = settingsRes.rows[0];
  if (!settings) return res.status(500).json({ error: 'No mail settings row' });

  const providerConfigured = !!settings.smtp_host && !!settings.smtp_pass;
  const pendingRes = await pool.query(
    "SELECT * FROM mail_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1",
    [limit]
  );

  let deliveredInternal = 0, sent = 0, failed = 0, awaitingProvider = 0;

  for (const mail of pendingRes.rows) {
    const recipientRes = await pool.query(
      'SELECT id FROM profiles WHERE id = $1 OR email = $2 LIMIT 1',
      [mail.user_id, mail.to_email]
    );
    if (recipientRes.rows[0]) {
      await pool.query(
        "UPDATE mail_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, error = NULL WHERE id = $1",
        [mail.id]
      );
      deliveredInternal++;
      continue;
    }

    if (!providerConfigured) { awaitingProvider++; continue; }

    try {
      await sendViaProvider(settings, mail.to_email, mail.subject, mail.body_html, mail.body_text);
      if (settings.forward_enabled && settings.forward_to && settings.forward_to !== mail.to_email) {
        try { await sendViaProvider(settings, settings.forward_to, `[FWD] ${mail.subject}`, mail.body_html, mail.body_text); } catch { /* best-effort */ }
      }
      await pool.query(
        "UPDATE mail_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, error = NULL WHERE id = $1",
        [mail.id]
      );
      sent++;
    } catch (e) {
      const attempts = mail.attempts + 1;
      await pool.query(
        "UPDATE mail_outbox SET status = $1, attempts = $2, error = $3 WHERE id = $4",
        [attempts >= 3 ? 'failed' : 'pending', attempts, String((e as Error).message || e).slice(0, 500), mail.id]
      );
      failed++;
    }
  }

  res.json({ delivered_internal: deliveredInternal, sent_external: sent, failed, awaiting_provider: awaitingProvider });
});

export default router;
