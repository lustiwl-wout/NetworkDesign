import { Router } from 'express';
import { pool } from '../db/pool.js';

export const designsRouter = Router();

const EMPTY_GRAPH = { nodes: [], edges: [] };

designsRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, description, updated_at FROM designs ORDER BY updated_at DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

designsRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, description, graph, created_at, updated_at FROM designs WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

designsRouter.post('/', async (req, res, next) => {
  try {
    const { name, description = '', graph = EMPTY_GRAPH } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO designs (name, description, graph)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, graph, created_at, updated_at`,
      [name, description, graph]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

designsRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, description, graph } = req.body ?? {};
    const { rows } = await pool.query(
      `UPDATE designs
         SET name        = COALESCE($2, name),
             description = COALESCE($3, description),
             graph       = COALESCE($4, graph)
       WHERE id = $1
       RETURNING id, name, description, graph, created_at, updated_at`,
      [req.params.id, name ?? null, description ?? null, graph ?? null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

designsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM designs WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
