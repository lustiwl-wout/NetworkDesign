import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';

function camel(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}
const toSnake = (k) => k.replace(/([A-Z])/g, '_$1').toLowerCase();

export function catalogRouter({ table, allowedFields, required }) {
  const router = Router();

  router.get('/', requireAuth, async (_req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ${table} ORDER BY sort_order ASC, label ASC`
      );
      res.json(rows.map(camel));
    } catch (err) { next(err); }
  });

  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(camel(rows[0]));
    } catch (err) { next(err); }
  });

  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const body = req.body ?? {};
      for (const f of required) {
        if (body[f] == null || body[f] === '') {
          return res.status(400).json({ error: `${f} is required` });
        }
      }
      const cols = Object.keys(body).filter((k) => allowedFields.includes(k));
      if (!cols.length) return res.status(400).json({ error: 'No valid fields' });
      const dbCols = cols.map(toSnake);
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${dbCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        cols.map((c) => body[c])
      );
      res.status(201).json(camel(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'key already exists' });
      next(err);
    }
  });

  router.put('/:id', requireAdmin, async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const cols = Object.keys(body).filter((k) => allowedFields.includes(k));
      if (!cols.length) return res.status(400).json({ error: 'No valid fields' });
      const set = cols.map((c, i) => `${toSnake(c)} = $${i + 2}`).join(', ');
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${set} WHERE id = $1 RETURNING *`,
        [req.params.id, ...cols.map((c) => body[c])]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(camel(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'key already exists' });
      next(err);
    }
  });

  router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}

export const deviceTypesRouter = catalogRouter({
  table: 'device_types',
  required: ['key', 'label'],
  allowedFields: [
    'key', 'label', 'iconKey', 'defaultInputs', 'defaultOutputs',
    'defaultCapacity', 'defaultRisk', 'description', 'sortOrder',
  ],
});

export const zoneTypesRouter = catalogRouter({
  table: 'zone_types',
  required: ['key', 'label'],
  allowedFields: [
    'key', 'label', 'color', 'description', 'defaultWidth', 'defaultHeight', 'sortOrder',
  ],
});

export const edgeKindsRouter = catalogRouter({
  table: 'edge_kinds',
  required: ['key', 'label'],
  allowedFields: [
    'key', 'label', 'description', 'stroke', 'strokeWidth',
    'strokeDasharray', 'animated', 'sortOrder',
  ],
});
