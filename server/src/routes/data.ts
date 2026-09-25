import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin, type AuthedRequest } from '../auth.js';

const router = Router();

// Allows a request through when the caller is either the record's own owner
// (req.params.id matches req.userId) or an admin. Used for the handful of
// "view a specific user's data" endpoints the admin console needs, which
// double as the user's own "view my data" endpoints.
function requireSelfOrAdmin(req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction) {
  if (req.userId === req.params.id || req.userRole === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

// ─── Profiles ───────────────────────────────────────────────────────────────

router.get('/profiles/me', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [req.userId]);
  res.json(rows[0] || null);
});

router.get('/profiles/:id', requireAuth, requireSelfOrAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [req.params.id]);
  res.json(rows[0] || null);
});

router.patch('/profiles/me', requireAuth, async (req: AuthedRequest, res) => {
  const { full_name, phone, transaction_pin } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE profiles SET
       full_name = COALESCE($1, full_name),
       phone = COALESCE($2, phone),
       transaction_pin = COALESCE($3, transaction_pin),
       updated_at = now()
     WHERE id = $4 RETURNING *`,
    [full_name ?? null, phone ?? null, transaction_pin ?? null, req.userId]
  );
  res.json(rows[0]);
});

router.get('/profiles', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM profiles ORDER BY created_at DESC LIMIT 500');
  res.json(rows);
});

router.patch('/profiles/:id', requireAuth, requireAdmin, async (req, res) => {
  const { full_name, phone, role, is_active } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE profiles SET
       full_name = COALESCE($1, full_name),
       phone = COALESCE($2, phone),
       role = COALESCE($3, role),
       is_active = COALESCE($4, is_active),
       updated_at = now()
     WHERE id = $5 RETURNING *`,
    [full_name ?? null, phone ?? null, role ?? null, is_active ?? null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ─── Accounts ───────────────────────────────────────────────────────────────

router.get('/accounts', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query('SELECT * FROM accounts WHERE user_id = $1 ORDER BY account_type', [req.userId]);
  res.json(rows);
});

router.get('/accounts/by-number/:number', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM accounts WHERE account_number = $1', [req.params.number]);
  res.json(rows[0] || null);
});

router.get('/accounts/user/:id', requireAuth, requireSelfOrAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM accounts WHERE user_id = $1 ORDER BY account_type', [req.params.id]);
  res.json(rows);
});

router.get('/admin/accounts', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM accounts ORDER BY created_at DESC LIMIT 1000');
  res.json(rows);
});

router.patch('/admin/accounts/:id', requireAuth, requireAdmin, async (req, res) => {
  const { balance, available_balance, is_active, account_type } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE accounts SET
       balance = COALESCE($1, balance),
       available_balance = COALESCE($2, available_balance),
       is_active = COALESCE($3, is_active),
       account_type = COALESCE($4, account_type),
       updated_at = now()
     WHERE id = $5 RETURNING *`,
    [balance ?? null, available_balance ?? null, is_active ?? null, account_type ?? null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ─── Transactions ───────────────────────────────────────────────────────────

router.get('/transactions', requireAuth, async (req: AuthedRequest, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
  const offset = (page - 1) * pageSize;
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [req.userId, pageSize, offset]
  );
  res.json(rows);
});

router.get('/transactions/user/:id', requireAuth, requireSelfOrAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
  const offset = (page - 1) * pageSize;
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [req.params.id, pageSize, offset]
  );
  res.json(rows);
});

router.get('/admin/transactions', requireAuth, requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Number(req.query.pageSize) || 50);
  const offset = (page - 1) * pageSize;
  const { rows } = await pool.query(
    `SELECT t.*, p.email AS user_email, p.full_name AS user_full_name
     FROM transactions t JOIN profiles p ON p.id = t.user_id
     ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );
  res.json(rows);
});

router.patch('/admin/transactions/:id', requireAuth, requireAdmin, async (req, res) => {
  const {
    transaction_type, amount, status, description, reference_number,
    from_account_id, to_account_id, user_id, created_at, performed_by_admin,
  } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE transactions SET
       transaction_type = COALESCE($1, transaction_type),
       amount = COALESCE($2, amount),
       status = COALESCE($3, status),
       description = COALESCE($4, description),
       reference_number = COALESCE($5, reference_number),
       from_account_id = COALESCE($6, from_account_id),
       to_account_id = COALESCE($7, to_account_id),
       user_id = COALESCE($8, user_id),
       created_at = COALESCE($9, created_at),
       performed_by_admin = COALESCE($10, performed_by_admin)
     WHERE id = $11 RETURNING *`,
    [transaction_type ?? null, amount ?? null, status ?? null, description ?? null, reference_number ?? null,
      from_account_id ?? null, to_account_id ?? null, user_id ?? null, created_at ?? null, performed_by_admin ?? null,
      req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });
  res.json(rows[0]);
});

router.delete('/admin/transactions/:id', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ─── Holds ──────────────────────────────────────────────────────────────────

router.get('/holds', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT h.*, a.account_type, a.account_number
     FROM holds h JOIN accounts a ON a.id = h.account_id
     WHERE h.user_id = $1 AND h.is_released = false
     ORDER BY h.placed_at DESC`,
    [req.userId]
  );
  res.json(rows);
});

router.get('/holds/user/:id', requireAuth, requireSelfOrAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT h.*, a.account_type, a.account_number
     FROM holds h JOIN accounts a ON a.id = h.account_id
     WHERE h.user_id = $1 AND h.is_released = false
     ORDER BY h.placed_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

router.get('/admin/holds', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT h.*, a.account_type, a.account_number, p.email, p.full_name
     FROM holds h
     JOIN accounts a ON a.id = h.account_id
     JOIN profiles p ON p.id = h.user_id
     ORDER BY h.placed_at DESC LIMIT 500`
  );
  res.json(rows);
});

// ─── Deposit / Withdrawal requests ──────────────────────────────────────────

router.get('/deposit-requests', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, a.account_type, a.account_number
     FROM deposit_requests d JOIN accounts a ON a.id = d.account_id
     WHERE d.user_id = $1 ORDER BY d.created_at DESC LIMIT 50`,
    [req.userId]
  );
  res.json(rows);
});

router.post('/deposit-requests', requireAuth, async (req: AuthedRequest, res) => {
  const { account_id, amount } = req.body || {};
  if (!account_id || !amount) return res.status(400).json({ error: 'Missing fields' });
  const { rows } = await pool.query(
    'INSERT INTO deposit_requests (user_id, account_id, amount) VALUES ($1, $2, $3) RETURNING *',
    [req.userId, account_id, amount]
  );
  res.json(rows[0]);
});

router.patch('/admin/deposit-requests/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { rows } = await pool.query(
    "UPDATE deposit_requests SET status = $1, reviewed_by = $2, updated_at = now() WHERE id = $3 RETURNING *",
    [status, req.userId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.get('/admin/deposit-requests', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, a.account_type, a.account_number, p.email, p.full_name
     FROM deposit_requests d
     JOIN accounts a ON a.id = d.account_id
     JOIN profiles p ON p.id = d.user_id
     ORDER BY d.created_at DESC LIMIT 200`
  );
  res.json(rows);
});

router.get('/withdrawal-requests', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT w.*, a.account_type, a.account_number
     FROM withdrawal_requests w JOIN accounts a ON a.id = w.account_id
     WHERE w.user_id = $1 ORDER BY w.created_at DESC LIMIT 50`,
    [req.userId]
  );
  res.json(rows);
});

router.post('/withdrawal-requests', requireAuth, async (req: AuthedRequest, res) => {
  const { account_id, amount } = req.body || {};
  if (!account_id || !amount) return res.status(400).json({ error: 'Missing fields' });
  const { rows } = await pool.query(
    'INSERT INTO withdrawal_requests (user_id, account_id, amount) VALUES ($1, $2, $3) RETURNING *',
    [req.userId, account_id, amount]
  );
  res.json(rows[0]);
});

router.patch('/admin/withdrawal-requests/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { rows } = await pool.query(
    "UPDATE withdrawal_requests SET status = $1, reviewed_by = $2, updated_at = now() WHERE id = $3 RETURNING *",
    [status, req.userId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.get('/admin/withdrawal-requests', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT w.*, a.account_type, a.account_number, p.email, p.full_name
     FROM withdrawal_requests w
     JOIN accounts a ON a.id = w.account_id
     JOIN profiles p ON p.id = w.user_id
     ORDER BY w.created_at DESC LIMIT 200`
  );
  res.json(rows);
});

// ─── Notifications ──────────────────────────────────────────────────────────

router.get('/notifications', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.userId]
  );
  res.json(rows);
});

router.patch('/notifications/:id/read', requireAuth, async (req: AuthedRequest, res) => {
  await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ success: true });
});

// Admin sends a notification to a customer (funding, holds, approvals, broadcasts, etc.)
router.post('/admin/notifications', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, title, message } = req.body || {};
  if (!user_id || !title || !message) return res.status(400).json({ error: 'Missing fields' });
  await pool.query(
    'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
    [user_id, title, message]
  );
  res.json({ success: true });
});

// ─── Security codes (PIN / IMF / COT / TAC) ─────────────────────────────────

router.get('/security-codes', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM security_codes WHERE user_id = $1 ORDER BY created_at DESC',
    [req.userId]
  );
  res.json(rows);
});

router.post('/security-codes/validate', requireAuth, async (req: AuthedRequest, res) => {
  const { code_type, code } = req.body || {};
  if (!code_type || !code) return res.status(400).json({ valid: false, error: 'Missing fields' });

  const { rows } = await pool.query(
    `SELECT * FROM security_codes
     WHERE user_id = $1 AND code_type = $2 AND code = $3 AND is_used = false
     LIMIT 1`,
    [req.userId, code_type, code]
  );
  const row = rows[0];
  if (!row) return res.json({ valid: false, error: 'Invalid or already used code' });
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return res.json({ valid: false, error: 'Code has expired' });
  }
  await pool.query('UPDATE security_codes SET is_used = true, used_at = now() WHERE id = $1', [row.id]);
  res.json({ valid: true });
});

router.get('/security-codes/user/:id', requireAuth, requireSelfOrAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM security_codes WHERE user_id = $1 ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(rows);
});

router.post('/admin/security-codes', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { user_id, code_type, code, expires_at } = req.body || {};
  if (!user_id || !code_type || !code) return res.status(400).json({ success: false, error: 'Missing fields' });
  await pool.query(
    'INSERT INTO security_codes (user_id, code_type, code, issued_by, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [user_id, code_type, code, req.userId, expires_at || null]
  );
  res.json({ success: true });
});

router.delete('/admin/security-codes/:id', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM security_codes WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

export default router;
