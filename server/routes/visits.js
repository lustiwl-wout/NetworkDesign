import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdmin } from '../auth/middleware.js';

// Public: anyone (authed or not) can record a visit. Fire-and-forget:
// errors are swallowed so this endpoint never blocks page load.
export const visitsRouter = Router();

visitsRouter.post('/', async (req, res) => {
  try {
    const ip = req.ip ?? null;
    const ua = String(req.get('user-agent') ?? '').slice(0, 500);
    const userId = req.auth?.user?.id ?? null;
    const email  = req.auth?.user?.email ?? null;
    const path   = String(req.body?.path ?? '').slice(0, 200);
    await pool.query(
      `INSERT INTO access_log (ip, user_agent, user_id, email, path)
       VALUES ($1, $2, $3, $4, $5)`,
      [ip, ua, userId, email, path]
    );
  } catch (err) {
    console.error('[visit]', err.message);
  }
  res.status(204).end();
});

// Admin: read the most recent entries.
export const adminVisitsRouter = Router();
adminVisitsRouter.use(requireAdmin);

adminVisitsRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ip, user_agent AS "userAgent", user_id AS "userId",
              email, path, created_at AS "createdAt"
         FROM access_log
         ORDER BY created_at DESC
         LIMIT 500`
    );
    res.json(rows);
  } catch (err) { next(err); }
});
