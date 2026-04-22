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
  // Non-admins see:
  //   * their own designs, OR
  //   * any design scoped to a team they're a member of, OR
  //   * any design explicitly shared with them, OR
  //   * any design in a folder its owner has shared with them.
  return {
    clause: `
      WHERE ${alias}.owner_id = $1
         OR ${alias}.team_id IN (
              SELECT team_id FROM team_members WHERE user_id = $1
            )
         OR EXISTS (
              SELECT 1 FROM design_shares ds
               WHERE ds.design_id = ${alias}.id AND ds.user_id = $1
            )
         OR EXISTS (
              SELECT 1 FROM folder_shares fs
               WHERE fs.owner_id    = ${alias}.owner_id
                 AND fs.folder      = ${alias}.folder
                 AND fs.shared_with = $1
            )
    `,
    params: [user.id],
  };
}

async function canAccess(designId, user) {
  const { rows } = await pool.query(
    'SELECT owner_id, team_id, folder FROM designs WHERE id = $1',
    [designId]
  );
  if (!rows.length) return { status: 404 };
  if (user.role === 'admin') return { status: 200 };
  const { owner_id, team_id, folder } = rows[0];
  if (owner_id === user.id) return { status: 200 };
  if (team_id != null) {
    const { rows: m } = await pool.query(
      'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
      [team_id, user.id]
    );
    if (m.length) return { status: 200 };
  }
  const { rows: ds } = await pool.query(
    'SELECT 1 FROM design_shares WHERE design_id = $1 AND user_id = $2',
    [designId, user.id]
  );
  if (ds.length) return { status: 200 };
  if (folder != null) {
    const { rows: fs } = await pool.query(
      'SELECT 1 FROM folder_shares WHERE owner_id = $1 AND folder = $2 AND shared_with = $3',
      [owner_id, folder, user.id]
    );
    if (fs.length) return { status: 200 };
  }
  return { status: 403 };
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
              d.team_id, d.narrative, d.updated_at,
              u.email        AS owner_email,
              u.display_name AS owner_name,
              t.name         AS team_name
         FROM designs d
         LEFT JOIN users u ON u.id = d.owner_id
         LEFT JOIN teams t ON t.id = d.team_id
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
      `SELECT d.id, d.name, d.description, d.folder, d.graph, d.narrative,
              d.owner_id, d.team_id, d.created_at, d.updated_at,
              t.name AS team_name
         FROM designs d
         LEFT JOIN teams t ON t.id = d.team_id
        WHERE d.id = $1`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Sanity-check that the caller is allowed to assign a design to the
// given team — admins can pick any, non-admins must be a member.
async function canUseTeam(user, teamId) {
  if (teamId == null) return true;
  if (user.role === 'admin') return true;
  const { rows } = await pool.query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, user.id]
  );
  return rows.length > 0;
}

designsRouter.post('/', rejectViewerWrites, async (req, res, next) => {
  try {
    const { name, description = '', folder, teamId = null, graph = EMPTY_GRAPH, narrative = {} } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
    if (!(await canUseTeam(req.auth.user, teamId))) {
      return res.status(403).json({ error: 'not a member of that team' });
    }
    const { rows } = await pool.query(
      `INSERT INTO designs (name, description, folder, team_id, graph, narrative, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, folder, team_id, graph, narrative, owner_id, created_at, updated_at`,
      [name, description, normalizeFolder(folder), teamId, graph, narrative, req.auth.user.id]
    );
    await snapshotVersion(rows[0].id, req.auth.user);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

designsRouter.put('/:id', rejectViewerWrites, async (req, res, next) => {
  try {
    const chk = await canAccess(req.params.id, req.auth.user);
    if (chk.status !== 200) return res.status(chk.status).json({ error: 'not found' });

    const body = req.body ?? {};
    const { name, description, folder, teamId, graph, narrative } = body;
    // Folder + teamId both use a tri-state: omitted = don't touch,
    // null / empty = clear, value = set. COALESCE can't distinguish
    // "null meaning clear" from "null meaning omitted", hence the
    // provided-flags.
    const folderProvided = Object.prototype.hasOwnProperty.call(body, 'folder');
    const teamProvided   = Object.prototype.hasOwnProperty.call(body, 'teamId');
    if (teamProvided && !(await canUseTeam(req.auth.user, teamId))) {
      return res.status(403).json({ error: 'not a member of that team' });
    }
    const { rows } = await pool.query(
      `UPDATE designs
         SET name        = COALESCE($2, name),
             description = COALESCE($3, description),
             folder      = CASE WHEN $6::boolean THEN $7 ELSE folder END,
             team_id     = CASE WHEN $8::boolean THEN $9 ELSE team_id END,
             graph       = COALESCE($4, graph),
             narrative   = COALESCE($5, narrative)
       WHERE id = $1
       RETURNING id, name, description, folder, team_id, graph, narrative, owner_id, created_at, updated_at`,
      [
        req.params.id,
        name ?? null,
        description ?? null,
        graph ?? null,
        narrative ?? null,
        folderProvided,
        folderProvided ? normalizeFolder(folder) : null,
        teamProvided,
        teamProvided ? (teamId ?? null) : null,
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

// --- Ad-hoc shares (design + folder) ---
// Design shares: only the owner (or an admin) can manage them.
// Folder shares: always keyed to the CALLER's own folders.

async function requireOwner(req, res) {
  const { rows } = await pool.query(
    'SELECT owner_id FROM designs WHERE id = $1',
    [req.params.id]
  );
  if (!rows.length) { res.status(404).json({ error: 'not found' }); return null; }
  const { owner_id } = rows[0];
  if (req.auth.user.role !== 'admin' && owner_id !== req.auth.user.id) {
    res.status(403).json({ error: 'only the owner can manage shares' });
    return null;
  }
  return { ownerId: owner_id };
}

designsRouter.get('/:id/shares', async (req, res, next) => {
  try {
    const owner = await requireOwner(req, res);
    if (!owner) return;
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name AS "displayName"
         FROM design_shares ds
         JOIN users u ON u.id = ds.user_id
        WHERE ds.design_id = $1
        ORDER BY u.email`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

designsRouter.post('/:id/shares', rejectViewerWrites, async (req, res, next) => {
  try {
    const owner = await requireOwner(req, res);
    if (!owner) return;
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const { rows: users } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [String(email).toLowerCase()]
    );
    if (!users.length) return res.status(404).json({ error: 'no user with that email' });
    if (users[0].id === owner.ownerId) {
      return res.status(400).json({ error: 'already the owner' });
    }
    try {
      await pool.query(
        'INSERT INTO design_shares (design_id, user_id) VALUES ($1, $2)',
        [req.params.id, users[0].id]
      );
    } catch (err) {
      if (err.code === '23505') return res.json({ ok: true, alreadyShared: true });
      throw err;
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

designsRouter.delete('/:id/shares/:userId', rejectViewerWrites, async (req, res, next) => {
  try {
    const owner = await requireOwner(req, res);
    if (!owner) return;
    await pool.query(
      'DELETE FROM design_shares WHERE design_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// Folder-level shares. All endpoints are scoped to the caller's
// owned folders — you can only share a folder you own.
designsRouter.get('/folders/:name/shares', async (req, res, next) => {
  try {
    const folder = normalizeFolder(req.params.name);
    if (folder === null) return res.status(400).json({ error: 'folder name required' });
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name AS "displayName"
         FROM folder_shares fs
         JOIN users u ON u.id = fs.shared_with
        WHERE fs.owner_id = $1 AND fs.folder = $2
        ORDER BY u.email`,
      [req.auth.user.id, folder]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

designsRouter.post('/folders/:name/shares', rejectViewerWrites, async (req, res, next) => {
  try {
    const folder = normalizeFolder(req.params.name);
    if (folder === null) return res.status(400).json({ error: 'folder name required' });
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const { rows: users } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [String(email).toLowerCase()]
    );
    if (!users.length) return res.status(404).json({ error: 'no user with that email' });
    if (users[0].id === req.auth.user.id) {
      return res.status(400).json({ error: 'already the owner' });
    }
    try {
      await pool.query(
        'INSERT INTO folder_shares (owner_id, folder, shared_with) VALUES ($1, $2, $3)',
        [req.auth.user.id, folder, users[0].id]
      );
    } catch (err) {
      if (err.code === '23505') return res.json({ ok: true, alreadyShared: true });
      throw err;
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

designsRouter.delete('/folders/:name/shares/:userId', rejectViewerWrites, async (req, res, next) => {
  try {
    const folder = normalizeFolder(req.params.name);
    if (folder === null) return res.status(400).json({ error: 'folder name required' });
    await pool.query(
      'DELETE FROM folder_shares WHERE owner_id = $1 AND folder = $2 AND shared_with = $3',
      [req.auth.user.id, folder, req.params.userId]
    );
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
