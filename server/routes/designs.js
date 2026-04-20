import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';

export const designsRouter = Router();

designsRouter.use(requireAuth);

const EMPTY_GRAPH = { nodes: [], edges: [] };

function whereVisibleToUser(user) {
  // Admins see everything; users see their own designs.
  return user.role === 'admin' ? { clause: '', params: [] } : { clause: 'WHERE owner_id = $1', params: [user.id] };
}

designsRouter.get('/', async (req, res, next) => {
  try {
    const { clause, params } = whereVisibleToUser(req.auth.user);
    const { rows } = await pool.query(
      `SELECT id, name, description, owner_id, updated_at
         FROM designs ${clause}
        ORDER BY updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

designsRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, graph, owner_id, created_at, updated_at
         FROM designs WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const row = rows[0];
    if (req.auth.user.role !== 'admin' && row.owner_id && row.owner_id !== req.auth.user.id) {
      return res.status(403).json({ error: 'not your design' });
    }
    res.json(row);
  } catch (err) { next(err); }
});

designsRouter.post('/', async (req, res, next) => {
  try {
    const { name, description = '', graph = EMPTY_GRAPH } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO designs (name, description, graph, owner_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, graph, owner_id, created_at, updated_at`,
      [name, description, graph, req.auth.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

designsRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, description, graph } = req.body ?? {};
    // First, ensure visibility
    const { rows: own } = await pool.query('SELECT owner_id FROM designs WHERE id = $1', [req.params.id]);
    if (!own.length) return res.status(404).json({ error: 'Not found' });
    if (req.auth.user.role !== 'admin' && own[0].owner_id && own[0].owner_id !== req.auth.user.id) {
      return res.status(403).json({ error: 'not your design' });
    }
    const { rows } = await pool.query(
      `UPDATE designs
         SET name        = COALESCE($2, name),
             description = COALESCE($3, description),
             graph       = COALESCE($4, graph)
       WHERE id = $1
       RETURNING id, name, description, graph, owner_id, created_at, updated_at`,
      [req.params.id, name ?? null, description ?? null, graph ?? null]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

designsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { rows: own } = await pool.query('SELECT owner_id FROM designs WHERE id = $1', [req.params.id]);
    if (!own.length) return res.status(404).json({ error: 'Not found' });
    if (req.auth.user.role !== 'admin' && own[0].owner_id && own[0].owner_id !== req.auth.user.id) {
      return res.status(403).json({ error: 'not your design' });
    }
    await pool.query('DELETE FROM designs WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});
