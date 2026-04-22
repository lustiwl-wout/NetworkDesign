import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const UNFILED = '__unfiled__';

export default function DesignsPage({ me }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [query, setQuery] = useState('');

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

  // Folder name autocompletes off the existing set, so the user can
  // tab between known folders without retyping. Empty string clears
  // the folder.
  const move = async (id, currentFolder) => {
    const existing = [...new Set(items.map((d) => d.folder).filter(Boolean))].sort();
    const hint = existing.length
      ? `Existing folders: ${existing.join(', ')}\n(leave blank to move to Unfiled)`
      : '(leave blank to move to Unfiled)';
    const next = prompt(`Move to folder?\n${hint}`, currentFolder ?? '');
    if (next === null) return; // cancelled
    try {
      await api.update(id, { folder: next.trim() || null });
      await load();
    } catch (e) { setErr(`Move failed: ${e.message}`); }
  };

  // Filter + group. Query matches name and folder label; groups keep
  // their order stable by sorted folder name, with Unfiled at the end.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((d) => {
      if (!q) return true;
      return (d.name ?? '').toLowerCase().includes(q)
        || (d.folder ?? '').toLowerCase().includes(q);
    });
    const map = new Map();
    for (const d of filtered) {
      const key = d.folder ?? UNFILED;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    const named = [...map.entries()]
      .filter(([k]) => k !== UNFILED)
      .sort(([a], [b]) => a.localeCompare(b));
    const unfiled = map.get(UNFILED) ?? [];
    const out = named.map(([name, designs]) => ({ name, designs }));
    if (unfiled.length) out.push({ name: UNFILED, designs: unfiled });
    return out;
  }, [items, query]);

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
        {groups.map((g) => (
          <section key={g.name} className="designs-group">
            <h2 className="designs-group-title">
              {g.name === UNFILED ? 'Unfiled' : g.name}
              <span className="designs-group-count">{g.designs.length}</span>
            </h2>
            <div className="designs-grid">
              {g.designs.map((d) => (
                <article key={d.id} className="design-card">
                  <header>
                    <h3>{d.name}</h3>
                    {d.description && <p className="sub">{d.description}</p>}
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
                        onClick={() => move(d.id, d.folder)}
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
        ))}
      </main>
    </div>
  );
}
