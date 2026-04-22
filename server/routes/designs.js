import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';

export const designsRouter = Router();

designsRouter.use(requireAuth);

// Viewer role is a read-only / demo role: can load templates, build a
// canvas, export PNGs, but cannot persist anything.
function rejectViewerWrites(req, res, next) {
  if (req.auth.user.role === 'viewer') {
    return res.status(403).json({
      error: 'demo mode — saving is disabled for viewer accounts. Use Export PNG to keep your work.',
      code: 'VIEWER_READONLY',
    });
  }
  next();
}

const EMPTY_GRAPH = { nodes: [], edges: [] };
const MAX_VERSIONS = 50;

function whereVisibleToUser(user, alias = 'designs') {
  if (user.role === 'admin') return { clause: '', params: [] };
  return { clause: `WHERE ${alias}.owner_id = $1`, params: [user.id] };
}

async function canAccess(designId, user) {
  const { rows } = await pool.query('SELECT owner_id FROM designs WHERE id = $1', [designId]);
  if (!rows.length) return { status: 404 };
  if (user.role !== 'admin' && rows[0].owner_id && rows[0].owner_id !== user.id) {
    return { status: 403 };
  }
  return { status: 200 };
}

async function snapshotVersion(designId, user) {
  // Copy current state into design_versions, then prune older than MAX_VERSIONS.
  await pool.query(
    `INSERT INTO design_versions (design_id, name, description, graph, narrative, created_by)
     SELECT id, name, description, graph, narrative, $2 FROM designs WHERE id = $1`,
    [designId, user.id]
  );
  await pool.query(
    `DELETE FROM design_versions
       WHERE design_id = $1
         AND id NOT IN (
           SELECT id FROM design_versions
             WHERE design_id = $1
             ORDER BY created_at DESC
             LIMIT $2
         )`,
    [designId, MAX_VERSIONS]
  );
}

// Folder is stored as plain text on the design; an empty/null folder
// means "unfiled". Callers can pass an empty string or null to move a
// design out of a folder. We trim whitespace so "  Prod " and "Prod"
// don't render as separate folders.
function normalizeFolder(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s.slice(0, 120) : null;
}

designsRouter.get('/', async (req, res, next) => {
  try {
    const { clause, params } = whereVisibleToUser(req.auth.user, 'd');
    // Join the owner so the Designs page can show who a design
    // belongs to and can group by (owner, folder) — each user's
    // "Clients" folder is its own space.
    const { rows } = await pool.query(
      `SELECT d.id, d.name, d.description, d.folder, d.owner_id,
              d.narrative, d.updated_at,
              u.email        AS owner_email,
              u.display_name AS owner_name
         FROM designs d
         LEFT JOIN users u ON u.id = d.owner_id
         ${clause}
        ORDER BY d.updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

designsRouter.get('/:id', async (req, res, next) => {
  try {
    const chk = await canAccess(req.params.id, req.auth.user);
    if (chk.status !== 200) return res.status(chk.status).json({ error: 'not found' });
    const { rows } = await pool.query(
      `SELECT id, name, description, folder, graph, narrative, owner_id, created_at, updated_at
         FROM designs WHERE id = $1`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

designsRouter.post('/', rejectViewerWrites, async (req, res, next) => {
  try {
    const { name, description = '', folder, graph = EMPTY_GRAPH, narrative = {} } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO designs (name, description, folder, graph, narrative, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, description, folder, graph, narrative, owner_id, created_at, updated_at`,
      [name, description, normalizeFolder(folder), graph, narrative, req.auth.user.id]
    );
    await snapshotVersion(rows[0].id, req.auth.user);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

designsRouter.put('/:id', rejectViewerWrites, async (req, res, next) => {
  try {
    const chk = await canAccess(req.params.id, req.auth.user);
    if (chk.status !== 200) return res.status(chk.status).json({ error: 'not found' });

    const { name, description, folder, graph, narrative } = req.body ?? {};
    // Folder uses a tri-state: `undefined` means "don't touch", `null`
    // or empty string means "unfile", any non-empty string sets the
    // folder. `COALESCE` won't work here because null is a valid
    // assignment, so we pass a flag column.
    const folderProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'folder');
    const { rows } = await pool.query(
      `UPDATE designs
         SET name        = COALESCE($2, name),
             description = COALESCE($3, description),
             folder      = CASE WHEN $6::boolean THEN $7 ELSE folder END,
             graph       = COALESCE($4, graph),
             narrative   = COALESCE($5, narrative)
       WHERE id = $1
       RETURNING id, name, description, folder, graph, narrative, owner_id, created_at, updated_at`,
      [
        req.params.id,
        name ?? null,
        description ?? null,
        graph ?? null,
        narrative ?? null,
        folderProvided,
        folderProvided ? normalizeFolder(folder) : null,
      ]
    );
    await snapshotVersion(rows[0].id, req.auth.user);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

designsRouter.delete('/:id', rejectViewerWrites, async (req, res, next) => {
  try {
    const chk = await canAccess(req.params.id, req.auth.user);
    if (chk.status !== 200) return res.status(chk.status).json({ error: 'not found' });
    await pool.query('DELETE FROM designs WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// --- Bulk folder ops (scoped to the caller) ---
// Folders aren't a first-class entity; they're just a text column on
// each design. Rename / delete operate by updating every row the
// caller owns in the named folder.

designsRouter.post('/folders/rename', rejectViewerWrites, async (req, res, next) => {
  try {
    const { from, to } = req.body ?? {};
    if (from == null) return res.status(400).json({ error: 'from folder is required' });
    const target = normalizeFolder(to);
    const fromVal = normalizeFolder(from);
    const whereClause = fromVal === null
      ? 'folder IS NULL AND owner_id = $1'
      : 'folder = $2 AND owner_id = $1';
    const params = fromVal === null ? [req.auth.user.id] : [req.auth.user.id, fromVal];
    const { rowCount } = await pool.query(
      `UPDATE designs SET folder = $${params.length + 1} WHERE ${whereClause}`,
      [...params, target]
    );
    res.json({ updated: rowCount });
  } catch (err) { next(err); }
});

designsRouter.delete('/folders/:name', rejectViewerWrites, async (req, res, next) => {
  try {
    const fromVal = normalizeFolder(req.params.name);
    if (fromVal === null) return res.status(400).json({ error: 'folder name is required' });
    const { rowCount } = await pool.query(
      'UPDATE designs SET folder = NULL WHERE folder = $1 AND owner_id = $2',
      [fromVal, req.auth.user.id]
    );
    res.json({ unfiled: rowCount });
  } catch (err) { next(err); }
});

// --- Versions ---

designsRouter.get('/:id/versions', async (req, res, next) => {
  try {
    const chk = await canAccess(req.params.id, req.auth.user);
    if (chk.status !== 200) return res.status(chk.status).json({ error: 'not found' });
    const { rows } = await pool.query(
      `SELECT v.id, v.name, v.description, v.created_at, v.created_by,
              u.email   AS created_by_email
         FROM design_versions v
    LEFT JOIN users u ON u.id = v.created_by
        WHERE v.design_id = $1
        ORDER BY v.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

designsRouter.get('/:id/versions/:vid', async (req, res, next) => {
  try {
    const chk = await canAccess(req.params.id, req.auth.user);
    if (chk.status !== 200) return res.status(chk.status).json({ error: 'not found' });
    const { rows } = await pool.query(
      `SELECT id, name, description, graph, narrative, created_at
         FROM design_versions
        WHERE id = $1 AND design_id = $2`,
      [req.params.vid, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'version not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

designsRouter.post('/:id/versions/:vid/restore', rejectViewerWrites, async (req, res, next) => {
  try {
    const chk = await canAccess(req.params.id, req.auth.user);
    if (chk.status !== 200) return res.status(chk.status).json({ error: 'not found' });
    const { rows: v } = await pool.query(
      `SELECT name, description, graph, narrative
         FROM design_versions
        WHERE id = $1 AND design_id = $2`,
      [req.params.vid, req.params.id]
    );
    if (!v.length) return res.status(404).json({ error: 'version not found' });
    const { rows } = await pool.query(
      `UPDATE designs
         SET name = $2, description = $3, graph = $4, narrative = $5
       WHERE id = $1
       RETURNING id, name, description, graph, narrative, owner_id, created_at, updated_at`,
      [req.params.id, v[0].name, v[0].description, v[0].graph, v[0].narrative]
    );
    await snapshotVersion(req.params.id, req.auth.user);
    res.json(rows[0]);
  } catch (err) { next(err); }
});
