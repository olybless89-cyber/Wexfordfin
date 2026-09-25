import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { makeToken, requireAuth, type AuthedRequest } from '../auth.js';

const router = Router();

function toPublicProfile(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    phone: row.phone,
    role: row.role,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.post('/auth/register', async (req, res) => {
  const { email, password, full_name } = req.body || {};
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
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, created_at',
      [normalizedEmail, passwordHash]
    );
    const userId = userRes.rows[0].id;

    await client.query(
      'INSERT INTO profiles (id, email, full_name, role) VALUES ($1, $2, $3, $4)',
      [userId, normalizedEmail, full_name || null, 'user']
    );

    const accountTypes = ['checking', 'savings', 'business'] as const;
    for (const type of accountTypes) {
      const numRes = await client.query('SELECT generate_account_number($1) AS num', [type]);
      await client.query(
        'INSERT INTO accounts (user_id, account_type, account_number, balance, available_balance) VALUES ($1, $2, $3, 0, 0)',
        [userId, type, numRes.rows[0].num]
      );
    }

    await client.query('COMMIT');

    const token = makeToken(userId);
    const profile = await pool.query('SELECT * FROM profiles WHERE id = $1', [userId]);
    res.json({ token, user: toPublicProfile(profile.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('register failed', err);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// One-time bootstrap: creates the very first account as an admin. Refuses to
// run once any user already exists, so it's safe to leave in place — it can
// never be used to escalate privileges on a live system, only to get the
// first admin in on a brand-new database.
router.post('/auth/bootstrap-admin', async (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const normalizedEmail = String(email).toLowerCase().trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM users');
    if (Number(countRows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Already initialized — an account already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userRes = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [normalizedEmail, passwordHash]
    );
    const userId = userRes.rows[0].id;

    await client.query(
      'INSERT INTO profiles (id, email, full_name, role) VALUES ($1, $2, $3, $4)',
      [userId, normalizedEmail, full_name || null, 'admin']
    );

    const accountTypes = ['checking', 'savings', 'business'] as const;
    for (const type of accountTypes) {
      const numRes = await client.query('SELECT generate_account_number($1) AS num', [type]);
      await client.query(
        'INSERT INTO accounts (user_id, account_type, account_number, balance, available_balance) VALUES ($1, $2, $3, 0, 0)',
        [userId, type, numRes.rows[0].num]
      );
    }

    await client.query('COMMIT');

    const token = makeToken(userId);
    const profile = await pool.query('SELECT * FROM profiles WHERE id = $1', [userId]);
    res.json({ token, user: toPublicProfile(profile.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('bootstrap-admin failed', err);
    res.status(500).json({ error: 'Bootstrap failed' });
  } finally {
    client.release();
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const normalizedEmail = String(email).toLowerCase().trim();
  const { rows } = await pool.query(
    `SELECT u.id, u.password_hash, p.role, p.is_active
     FROM users u JOIN profiles p ON p.id = u.id
     WHERE u.email = $1`,
    [normalizedEmail]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
  if (!user.is_active) return res.status(403).json({ error: 'Account suspended. Contact support.' });

  const token = makeToken(user.id);
  const profile = await pool.query('SELECT * FROM profiles WHERE id = $1', [user.id]);
  res.json({ token, user: toPublicProfile(profile.rows[0]) });
});

router.get('/auth/me', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [req.userId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ user: toPublicProfile(rows[0]) });
});

router.post('/auth/logout', requireAuth, async (_req, res) => {
  // Stateless JWT — logout is a client-side token discard. Kept for API symmetry.
  res.json({ success: true });
});

router.post('/auth/change-password', requireAuth, async (req: AuthedRequest, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  if (current_password) {
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = await bcrypt.hash(new_password, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId]);
  res.json({ success: true });
});

export default router;
