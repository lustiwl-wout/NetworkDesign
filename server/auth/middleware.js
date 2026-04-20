import { loadSession, COOKIE } from './sessions.js';

export async function attachSession(req, _res, next) {
  try {
    const cookieId = req.cookies?.[COOKIE];
    req.auth = cookieId ? await loadSession(cookieId) : null;
  } catch (err) {
    console.error('[auth] session load failed:', err);
    req.auth = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'authentication required' });
  // If user has MFA enabled, require the session to have passed MFA
  if (req.auth.user.totpEnabled && !req.auth.mfaVerified) {
    return res.status(401).json({ error: 'mfa required', code: 'MFA_REQUIRED' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'authentication required' });
  if (req.auth.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  if (req.auth.user.totpEnabled && !req.auth.mfaVerified) {
    return res.status(401).json({ error: 'mfa required', code: 'MFA_REQUIRED' });
  }
  next();
}
