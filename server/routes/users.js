import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';

// Non-admin, auth-only directory used by the share pickers. Returns
// enough info to render the combobox (id, email, display name) and
// nothing more. A small enterprise tool where every user can see
// every teammate is the intended register here — don't expose this
// for an open SaaS without thinking about privacy.
export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    // Exclude the caller from their own share-picker results.
    const self = req.auth.user.id;
    if (q) {
      const { rows } = await pool.query(
        `SELECT id, email, display_name AS "displayName"
           FROM users
          WHERE id <> $1
            AND (LOWER(email) LIKE $2 OR LOWER(COALESCE(display_name, '')) LIKE $2)
          ORDER BY email
          LIMIT $3`,
        [self, `%${q}%`, limit]
      );
      res.json(rows);
    } else {
      const { rows } = await pool.query(
        `SELECT id, email, display_name AS "displayName"
           FROM users
          WHERE id <> $1
          ORDER BY email
          LIMIT $2`,
        [self, limit]
      );
      res.json(rows);
    }
  } catch (err) { next(err); }
});
