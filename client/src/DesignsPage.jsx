import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import FolderCombobox from './FolderCombobox.jsx';

const UNFILED = '__unfiled__';

export default function DesignsPage({ me }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [query, setQuery] = useState('');
  const [moveTarget, setMoveTarget] = useState(null); // { design, folder }

  const load = async () => {
    if (!me) { setLoading(false); return; } // anonymous — no fetch
    setLoading(true);
    try { setItems(await api.list()); setErr(null); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [me]);

  const remove = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try { await api.remove(id); await load(); }
    catch (e) { setErr(e.message); }
  };

  const duplicate = async (id, name) => {
    const suggested = `Copy of ${name}`.slice(0, 120);
    const newName = prompt('Name for the duplicate?', suggested);
    if (!newName) return;
    try {
      const full = await api.get(id);
      await api.create({
        name: newName.trim(),
        description: full.description ?? '',
        folder: full.folder ?? null,
        graph: full.graph ?? { nodes: [], edges: [] },
      });
      await load();
    } catch (e) { setErr(`Duplicate failed: ${e.message}`); }
  };

  const commitMove = async (design, folder) => {
    try {
      await api.update(design.id, { folder: folder.trim() || null });
      setMoveTarget(null);
      await load();
    } catch (e) { setErr(`Move failed: ${e.message}`); }
  };

  // Only the current user's own folders are offered as suggestions —
  // moving a design can only file it under one of your folders, not
  // someone else's.
  const myFolders = useMemo(() => (
    me ? items.filter((d) => d.owner_id === me.id).map((d) => d.folder).filter(Boolean) : []
  ), [items, me]);

  // Filter + group. A "group" is a (ownerId, folder) pair so each
  // person's Clients folder is its own section. Query matches name,
  // folder, and owner.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((d) => {
      if (!q) return true;
      return (d.name ?? '').toLowerCase().includes(q)
        || (d.folder ?? '').toLowerCase().includes(q)
        || (d.owner_email ?? '').toLowerCase().includes(q);
    });
    const map = new Map();
    for (const d of filtered) {
      const key = `${d.owner_id ?? 'x'}::${d.folder ?? UNFILED}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          ownerId: d.owner_id,
          ownerEmail: d.owner_email,
          ownerName: d.owner_name,
          folder: d.folder ?? UNFILED,
          designs: [],
        });
      }
      map.get(key).designs.push(d);
    }
    // Order: my own groups first (folder A-Z, Unfiled last),
    // then other owners alphabetically (same inner sort).
    const mine = me ? me.id : null;
    const all = [...map.values()];
    all.sort((a, b) => {
      const aMine = a.ownerId === mine ? 0 : 1;
      const bMine = b.ownerId === mine ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      const aOwner = (a.ownerEmail ?? '').toLowerCase();
      const bOwner = (b.ownerEmail ?? '').toLowerCase();
      if (aOwner !== bOwner) return aOwner.localeCompare(bOwner);
      const aU = a.folder === UNFILED ? 1 : 0;
      const bU = b.folder === UNFILED ? 1 : 0;
      if (aU !== bU) return aU - bU;
      return (a.folder ?? '').localeCompare(b.folder ?? '');
    });
    return all;
  }, [items, query, me]);

  return (
    <div className="designs-page">
      <header className="admin-topbar">
        <h1>Saved designs</h1>
        <div className="spacer" />
        <input
          className="designs-search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <a className="btn" href="/">+ New design</a>
      </header>

      <main className="admin-main">
        {err && <div className="admin-error">{err}</div>}
        {loading && <div className="hint">Loading…</div>}
        {!me && (
          <div className="empty-state">
            <h2>Sign in to save designs</h2>
            <p className="hint">
              Guest mode lets you build and export PNGs, but you need an
              account to save designs between sessions.
            </p>
            <div className="empty-actions">
              <a className="btn" href="/login">Sign in</a>
              <a className="btn secondary" href="/">Back to editor</a>
            </div>
          </div>
        )}
        {me && !loading && groups.length === 0 && (
          <div className="empty-state">
            <h2>No saved designs yet</h2>
            <p className="hint">
              Name a design in the editor and it will save automatically.
            </p>
            <a className="btn" href="/">Go to editor</a>
          </div>
        )}
        {groups.map((g) => {
          const isMine = g.ownerId === me?.id;
          const folderLabel = g.folder === UNFILED ? 'Unfiled' : g.folder;
          return (
            <section key={g.key} className="designs-group">
              <h2 className="designs-group-title">
                {folderLabel}
                {!isMine && (
                  <span className="designs-group-owner">
                    {g.ownerName || g.ownerEmail || 'Unknown'}
                  </span>
                )}
                <span className="designs-group-count">{g.designs.length}</span>
              </h2>
              <div className="designs-grid">
                {g.designs.map((d) => (
                  <article key={d.id} className="design-card">
                    <header>
                      <h3>{d.name}</h3>
                      {d.description && <p className="sub">{d.description}</p>}
                      {d.owner_id !== me?.id && (
                        <p className="owner-line">
                          by {d.owner_name || d.owner_email || 'unknown'}
                        </p>
                      )}
                    </header>
                    <footer>
                      <span className="meta">
                        Updated {new Date(d.updated_at).toLocaleString(undefined, {
                          dateStyle: 'medium', timeStyle: 'short',
                        })}
                      </span>
                      <div className="actions">
                        <a className="btn" href={`/?design=${d.id}`}>Open</a>
                        <button
                          className="btn secondary"
                          onClick={() => setMoveTarget({ design: d, folder: d.folder ?? '' })}
                        >Move</button>
                        <button
                          className="btn secondary"
                          onClick={() => duplicate(d.id, d.name)}
                        >Duplicate</button>
                        <button
                          className="btn danger"
                          onClick={() => remove(d.id, d.name)}
                        >Delete</button>
                      </div>
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {moveTarget && (
          <MoveDesignDialog
            design={moveTarget.design}
            initial={moveTarget.folder}
            folders={myFolders}
            onClose={() => setMoveTarget(null)}
            onSave={(f) => commitMove(moveTarget.design, f)}
          />
        )}
      </main>
    </div>
  );
}

function MoveDesignDialog({ design, initial, folders, onClose, onSave }) {
  const [val, setVal] = useState(initial ?? '');
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Move "{design.name}"</h2>
        <p className="hint">
          Pick an existing folder or type a new name. Leave blank to move
          to Unfiled.
        </p>
        <FolderCombobox
          value={val}
          onChange={setVal}
          options={folders}
          autoFocus
        />
        <div className="form-actions">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={() => onSave(val)}>Move</button>
        </div>
      </div>
    </div>
  );
}
