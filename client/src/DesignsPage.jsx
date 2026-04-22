import { useEffect, useState } from 'react';
import { api } from './api.js';

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

  // Duplicate fetches the full design (graph + metadata) then creates
  // a new one with a "Copy of …" name. The new design shows up in
  // the list immediately via reload.
  const duplicate = async (id, name) => {
    const suggested = `Copy of ${name}`.slice(0, 120);
    const newName = prompt('Name for the duplicate?', suggested);
    if (!newName) return;
    try {
      const full = await api.get(id);
      await api.create({
        name: newName.trim(),
        description: full.description ?? '',
        graph: full.graph ?? { nodes: [], edges: [] },
      });
      await load();
    } catch (e) { setErr(`Duplicate failed: ${e.message}`); }
  };

  const filtered = items.filter((d) =>
    !query || d.name.toLowerCase().includes(query.toLowerCase())
  );

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
            <a className="btn" href="/login">Sign in</a>
            <div style={{ height: 8 }} />
            <a className="btn secondary" href="/">Back to editor</a>
          </div>
        )}
        {me && !loading && filtered.length === 0 && (
          <div className="empty-state">
            <h2>No saved designs yet</h2>
            <p className="hint">
              Create one from a template or start from a blank canvas on the editor.
            </p>
            <a className="btn" href="/">Go to editor</a>
          </div>
        )}
        <div className="designs-grid">
          {filtered.map((d) => (
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
                    className="btn secondary small"
                    onClick={() => duplicate(d.id, d.name)}
                  >Duplicate</button>
                  <button
                    className="btn danger small"
                    onClick={() => remove(d.id, d.name)}
                  >Delete</button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
