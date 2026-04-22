import { useEffect, useState } from 'react';
import UserCombobox from './UserCombobox.jsx';

// Generic "share by email" dialog used for both per-design and
// per-folder sharing. The caller supplies the target label plus
// three async ops (list / add / remove) so this component stays
// free of the API shape.
export default function ShareDialog({
  title,
  subtitle,
  loader,          // () => Promise<Array<{ id, email, displayName? }>>
  onAdd,           // (email) => Promise<void>
  onRemove,        // (userId) => Promise<void>
  onClose,
}) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setShares(await loader()); setErr(''); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await onAdd(email.trim());
      setEmail('');
      await load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  const remove = async (userId) => {
    try { await onRemove(userId); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {subtitle && <p className="hint">{subtitle}</p>}

        <form onSubmit={add} className="form" style={{ marginTop: 6 }}>
          <label>Add a user</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <div style={{ flex: 1 }}>
              <UserCombobox
                value={email}
                onChange={setEmail}
                autoFocus
                onSelect={async (u) => {
                  // Picking a suggestion fires the share immediately
                  // so the user doesn't have to click Share after
                  // selecting — matches the rhythm of Move-to-folder.
                  setEmail('');
                  setBusy(true);
                  setErr('');
                  try { await onAdd(u.email); await load(); }
                  catch (e) { setErr(e.message); setEmail(u.email); }
                  finally { setBusy(false); }
                }}
              />
            </div>
            <button type="submit" className="btn" disabled={busy}>{busy ? '…' : 'Share'}</button>
          </div>
        </form>

        {err && <div className="admin-error" style={{ marginTop: 10 }}>{err}</div>}

        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 6 }}>
            Shared with
          </label>
          {loading ? (
            <div className="hint">Loading…</div>
          ) : shares.length === 0 ? (
            <div className="hint">No one yet.</div>
          ) : (
            <ul className="design-list" style={{ margin: 0 }}>
              {shares.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.displayName || s.email}</strong>
                    {s.displayName && <div className="meta">{s.email}</div>}
                  </div>
                  <button className="btn danger small" onClick={() => remove(s.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-actions">
          <button className="btn secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
