import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';

// Teams are administered by admins; normal users just see the team
// designs they have access to via membership.
export const adminTeamsRouter = Router();
adminTeamsRouter.use(requireAdmin);

adminTeamsRouter.get('/', async (_req, res, next) => {
  try {
    // Each team with its member emails for the admin UI.
    const { rows } = await pool.query(`
      SELECT t.id, t.name, t.created_at,
             COALESCE(
               json_agg(
                 json_build_object('id', u.id, 'email', u.email, 'displayName', u.display_name)
                 ORDER BY u.email
               ) FILTER (WHERE u.id IS NOT NULL),
               '[]'::json
             ) AS members
        FROM teams t
        LEFT JOIN team_members tm ON tm.team_id = t.id
        LEFT JOIN users u ON u.id = tm.user_id
       GROUP BY t.id
       ORDER BY t.name ASC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

adminTeamsRouter.post('/', async (req, res, next) => {
  try {
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    try {
      const { rows } = await pool.query(
        'INSERT INTO teams (name) VALUES ($1) RETURNING *',
        [name.trim().slice(0, 120)]
      );
      res.status(201).json({ ...rows[0], members: [] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'team name already exists' });
      throw err;
    }
  } catch (err) { next(err); }
});

adminTeamsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    const { rows } = await pool.query(
      'UPDATE teams SET name = $1 WHERE id = $2 RETURNING *',
      [name.trim().slice(0, 120), id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'team name already exists' });
    next(err);
  }
});

adminTeamsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // Designs that were scoped to this team become personal
    // (team_id goes null via ON DELETE SET NULL).
    const { rowCount } = await pool.query('DELETE FROM teams WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// Add a user (by email) to a team.
adminTeamsRouter.post('/:id/members', async (req, res, next) => {
  try {
    const teamId = Number(req.params.id);
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const { rows: users } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [String(email).toLowerCase()]
    );
    if (!users.length) return res.status(404).json({ error: 'no user with that email' });
    try {
      await pool.query(
        'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)',
        [teamId, users[0].id]
      );
    } catch (err) {
      if (err.code === '23505') return res.json({ ok: true, alreadyMember: true });
      throw err;
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminTeamsRouter.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const teamId = Number(req.params.id);
    const userId = Number(req.params.userId);
    await pool.query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// User-facing: "my teams" — the list the design-save picker uses.
export const teamsRouter = Router();
teamsRouter.use(requireAuth);

teamsRouter.get('/mine', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.name
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = $1
        ORDER BY t.name ASC`,
      [req.auth.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});
