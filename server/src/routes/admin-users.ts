import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

router.post('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { email, password, full_name, phone, role = 'user' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const normalizedEmail = String(email).toLowerCase().trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userRes = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [normalizedEmail, passwordHash]
    );
    const userId = userRes.rows[0].id;

    await client.query(
      'INSERT INTO profiles (id, email, full_name, phone, role) VALUES ($1, $2, $3, $4, $5)',
      [userId, normalizedEmail, full_name || null, phone || null, role === 'admin' ? 'admin' : 'user']
    );

    const numRes = await client.query('SELECT generate_account_number($1) AS num', ['checking']);
    await client.query(
      'INSERT INTO accounts (user_id, account_type, account_number, balance, available_balance) VALUES ($1, $2, $3, 0, 0)',
      [userId, 'checking', numRes.rows[0].num]
    );

    await client.query('COMMIT');
    res.json({ success: true, user_id: userId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('admin create user failed', err);
    res.status(500).json({ error: 'Failed to create user' });
  } finally {
    client.release();
  }
});

router.post('/admin/users/manage', requireAuth, requireAdmin, async (req, res) => {
  const { action, user_id } = req.body || {};
  if (!action || !user_id) return res.status(400).json({ error: 'action and user_id required' });

  if (action === 'delete_user') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM notifications WHERE user_id = $1', [user_id]);
      await client.query('DELETE FROM admin_messages WHERE from_user_id = $1', [user_id]);
      await client.query('DELETE FROM holds WHERE user_id = $1', [user_id]);
      await client.query('DELETE FROM deposit_requests WHERE user_id = $1', [user_id]);
      await client.query('DELETE FROM withdrawal_requests WHERE user_id = $1', [user_id]);
      await client.query('DELETE FROM security_codes WHERE user_id = $1', [user_id]);
      await client.query('DELETE FROM transactions WHERE user_id = $1', [user_id]);
      await client.query('DELETE FROM accounts WHERE user_id = $1', [user_id]);
      await client.query('DELETE FROM profiles WHERE id = $1', [user_id]);
      await client.query('DELETE FROM users WHERE id = $1', [user_id]);
      await client.query('COMMIT');
      return res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('delete user failed', err);
      return res.status(500).json({ error: 'Failed to delete user' });
    } finally {
      client.release();
    }
  }

  if (action === 'update_credentials') {
    const { email, password } = req.body || {};
    if (!email && !password) return res.status(400).json({ error: 'No fields to update' });
    if (password && String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user_id]);
    }
    if (email) {
      const normalizedEmail = String(email).toLowerCase().trim();
      await pool.query('UPDATE users SET email = $1 WHERE id = $2', [normalizedEmail, user_id]);
      await pool.query('UPDATE profiles SET email = $1, updated_at = now() WHERE id = $2', [normalizedEmail, user_id]);
    }
    return res.json({ success: true });
  }

  if (action === 'set_active') {
    const { is_active } = req.body || {};
    await pool.query('UPDATE profiles SET is_active = $1, updated_at = now() WHERE id = $2', [!!is_active, user_id]);
    return res.json({ success: true });
  }

  if (action === 'set_role') {
    const { role } = req.body || {};
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    await pool.query('UPDATE profiles SET role = $1, updated_at = now() WHERE id = $2', [role, user_id]);
    return res.json({ success: true });
  }

  res.status(400).json({ error: 'Unknown action' });
});

export default router;
