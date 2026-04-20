import crypto from 'node:crypto';
import { pool } from '../db/pool.js';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'nd_session';
const DAYS = Number(process.env.SESSION_DAYS || 30);

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export const COOKIE = COOKIE_NAME;

export async function createSession(userId, { mfaVerified }) {
  const id = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO sessions (id, user_id, mfa_verified, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, mfaVerified, expires]
  );
  return id;
}

export async function loadSession(id) {
  if (!id) return null;
  const { rows } = await pool.query(
    `SELECT s.id, s.user_id, s.mfa_verified, s.expires_at,
            u.email, u.display_name, u.role, u.totp_enabled
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [id]
  );
  if (!rows.length) return null;
  // Touch last_seen_at (best-effort, don't await)
  pool.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [id]).catch(() => {});
  const r = rows[0];
  return {
    sessionId: r.id,
    user: {
      id: r.user_id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      totpEnabled: r.totp_enabled,
    },
    mfaVerified: r.mfa_verified,
  };
}

export async function destroySession(id) {
  if (!id) return;
  await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
}

export async function markSessionMfaVerified(id) {
  await pool.query('UPDATE sessions SET mfa_verified = TRUE WHERE id = $1', [id]);
}
