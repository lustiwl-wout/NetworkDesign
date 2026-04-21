import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { requireAdmin } from '../auth/middleware.js';

export const adminUsersRouter = Router();

function toPublic(r) {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    totpEnabled: r.totp_enabled,
    defaultView: r.default_view,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

adminUsersRouter.use(requireAdmin);

adminUsersRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, display_name, role, totp_enabled, created_at, updated_at
         FROM users ORDER BY created_at ASC`
    );
    res.json(rows.map(toPublic));
  } catch (err) { next(err); }
});

adminUsersRouter.post('/', async (req, res, next) => {
  try {
    const { email, password, displayName, role = 'user' } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
    if (!['user', 'admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'invalid role' });
    const hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [email.toLowerCase(), hash, displayName ?? null, role]
      );
      res.status(201).json(toPublic(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'email already registered' });
      throw err;
    }
  } catch (err) { next(err); }
});

adminUsersRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { displayName, role, defaultView } = req.body ?? {};
    const sets = [];
    const vals = [];
    if (displayName !== undefined) { sets.push(`display_name = $${sets.length + 2}`); vals.push(displayName); }
    if (role !== undefined) {
      if (!['user', 'admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'invalid role' });
      // Prevent removing the last admin
      if (role !== 'admin') {
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND id <> $1`, [id]);
        if (rows[0].n === 0) return res.status(400).json({ error: 'cannot demote the last admin' });
      }
      sets.push(`role = $${sets.length + 2}`); vals.push(role);
    }
    if (defaultView !== undefined) {
      if (!['management', 'engineering'].includes(defaultView)) {
        return res.status(400).json({ error: 'defaultView must be management or engineering' });
      }
      sets.push(`default_view = $${sets.length + 2}`); vals.push(defaultView);
    }
    if (!sets.length) return res.status(400).json({ error: 'no changes' });
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...vals]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(toPublic(rows[0]));
  } catch (err) { next(err); }
});

adminUsersRouter.post('/:id/reset-mfa', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1`, [id]);
    // Invalidate all sessions for safety
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminUsersRouter.post('/:id/reset-password', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body ?? {};
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const { rowCount } = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, id]
    );
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminUsersRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.auth.user.id) return res.status(400).json({ error: 'cannot delete yourself' });
    const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    if (rows[0].role === 'admin') {
      const { rows: c } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND id <> $1`, [id]);
      if (c[0].n === 0) return res.status(400).json({ error: 'cannot delete the last admin' });
    }
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.status(204).end();
  } catch (err) { next(err); }
});
