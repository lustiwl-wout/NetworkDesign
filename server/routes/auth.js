import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { pool } from '../db/pool.js';
import {
  COOKIE,
  cookieOptions,
  createSession,
  destroySession,
  markSessionMfaVerified,
} from '../auth/sessions.js';
import { requireAuth } from '../auth/middleware.js';

export const authRouter = Router();

const APP_NAME = process.env.APP_NAME || 'Network Design';

function publicUser(r) {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    totpEnabled: r.totp_enabled,
    defaultView: r.default_view,
    mustChangePassword: !!r.must_change_password,
  };
}

// Self-registration is disabled by design — accounts are created by an
// administrator via /api/admin/users. The very first admin is seeded on boot
// via INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD.

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const sid = await createSession(user.id, { mfaVerified: false });
    res.cookie(COOKIE, sid, cookieOptions());
    res.json({
      user: publicUser(user),
      mfaRequired: !!user.totp_enabled,
    });
  } catch (err) { next(err); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const sid = req.cookies?.[COOKIE];
    await destroySession(sid);
    res.clearCookie(COOKIE, { path: '/' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// Returns the current session if any, or { user: null } when anonymous.
// Anonymous is a first-class state now — the editor runs without login
// as a guest / viewer; authenticating unlocks saving.
authRouter.get('/me', async (req, res) => {
  if (!req.auth) return res.json({ user: null });
  res.json({
    user: req.auth.user,
    mfaVerified: req.auth.mfaVerified,
    mfaRequired: req.auth.user.totpEnabled && !req.auth.mfaVerified,
  });
});

// MFA — initial setup for the logged-in user
authRouter.post('/mfa/setup', async (req, res, next) => {
  try {
    if (!req.auth) return res.status(401).json({ error: 'authentication required' });
    const secret = authenticator.generateSecret();
    // Store as pending; only activates when the user confirms a code
    await pool.query(
      `UPDATE users SET totp_secret = $1, totp_enabled = FALSE WHERE id = $2`,
      [secret, req.auth.user.id]
    );
    const otpauth = authenticator.keyuri(req.auth.user.email, APP_NAME, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 240 });
    res.json({ otpauth, qrDataUrl, secret });
  } catch (err) { next(err); }
});

authRouter.post('/mfa/enable', async (req, res, next) => {
  try {
    if (!req.auth) return res.status(401).json({ error: 'authentication required' });
    const { code } = req.body ?? {};
    if (!code) return res.status(400).json({ error: 'code required' });
    const { rows } = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [req.auth.user.id]);
    const secret = rows[0]?.totp_secret;
    if (!secret) return res.status(400).json({ error: 'run /mfa/setup first' });
    if (!authenticator.check(code, secret)) return res.status(400).json({ error: 'invalid code' });
    await pool.query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.auth.user.id]);
    await markSessionMfaVerified(req.auth.sessionId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post('/mfa/verify', async (req, res, next) => {
  try {
    if (!req.auth) return res.status(401).json({ error: 'authentication required' });
    const { code } = req.body ?? {};
    if (!code) return res.status(400).json({ error: 'code required' });
    const { rows } = await pool.query(
      'SELECT totp_secret, totp_enabled FROM users WHERE id = $1',
      [req.auth.user.id]
    );
    const { totp_secret, totp_enabled } = rows[0] ?? {};
    if (!totp_enabled || !totp_secret) return res.status(400).json({ error: 'MFA not enabled' });
    if (!authenticator.check(code, totp_secret)) return res.status(400).json({ error: 'invalid code' });
    await markSessionMfaVerified(req.auth.sessionId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post('/mfa/disable', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body ?? {};
    if (!password) return res.status(400).json({ error: 'password required' });
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.auth.user.id]);
    const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
    if (!ok) return res.status(401).json({ error: 'invalid password' });
    await pool.query(
      `UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1`,
      [req.auth.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post('/preferences', requireAuth, async (req, res, next) => {
  try {
    const { defaultView } = req.body ?? {};
    if (defaultView && !['management', 'engineering'].includes(defaultView)) {
      return res.status(400).json({ error: 'defaultView must be management or engineering' });
    }
    const sets = [];
    const vals = [];
    if (defaultView !== undefined) {
      sets.push(`default_view = $${sets.length + 2}`);
      vals.push(defaultView);
    }
    if (!sets.length) return res.status(400).json({ error: 'no changes' });
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [req.auth.user.id, ...vals]
    );
    res.json({ user: publicUser(rows[0]) });
  } catch (err) { next(err); }
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'both passwords required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'new password must be at least 8 characters' });
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.auth.user.id]);
    const ok = rows[0] && (await bcrypt.compare(currentPassword, rows[0].password_hash));
    if (!ok) return res.status(401).json({ error: 'current password incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    // Clear the must-change flag once the user has chosen their own
    // password — the admin-seeded temporary is retired.
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [hash, req.auth.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});
