import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { pool } from './db.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const JWT_SECRET: string = requireEnv('JWT_SECRET');

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: 'user' | 'admin';
}

export function makeToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const { rows } = await pool.query('SELECT id, role, is_active FROM profiles WHERE id = $1', [payload.sub]);
    const profile = rows[0];
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });
    if (!profile.is_active) return res.status(403).json({ error: 'Account suspended. Contact support.' });
    req.userId = profile.id;
    req.userRole = profile.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: admin only' });
  next();
}
