import { useEffect, useState } from 'react';
import { visitsAdminApi } from './authApi.js';

function formatAgent(ua) {
  if (!ua) return '—';
  // Coarse heuristic to keep the column readable.
  const m = ua.match(/(Chrome|Firefox|Safari|Edg|Edge|OPR|Opera)\/[\d.]+/);
  return m ? m[0] : ua.slice(0, 40);
}

export default function AccessLogAdmin() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setItems(await visitsAdminApi.list()); setErr(null); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="admin-grid">
      <section className="admin-list">
        <div className="admin-list-header">
          <h2>Access log</h2>
          <button className="btn secondary small" onClick={load}>Refresh</button>
        </div>
        {err && <div className="admin-error">{err}</div>}
        {loading && items.length === 0 && <div className="hint">Loading…</div>}
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>IP</th>
              <th>User</th>
              <th>Path</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id}>
                <td>
                  {new Date(v.createdAt).toLocaleString(undefined, {
                    dateStyle: 'short', timeStyle: 'medium',
                  })}
                </td>
                <td><code>{v.ip ?? '—'}</code></td>
                <td>{v.email ?? <span className="meta">guest</span>}</td>
                <td><code>{v.path || '/'}</code></td>
                <td className="meta">{formatAgent(v.userAgent)}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} className="empty">No visits recorded yet.</td></tr>
            )}
          </tbody>
        </table>
        <p className="hint small">
          Showing the 500 most recent visits. Each page load records one row.
        </p>
      </section>
    </div>
  );
}
