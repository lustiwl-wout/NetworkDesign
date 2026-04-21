import { useEffect, useState } from 'react';
import { usersAdminApi } from './authApi.js';

const BLANK = { email: '', password: '', displayName: '', role: 'user' };

export default function UsersAdmin() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);   // existing user object, or "new" shape
  const [mode, setMode]       = useState(null);   // 'create' | 'edit' | null
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try { setItems(await usersAdminApi.list()); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };

  const startCreate = () => { setEditing({ ...BLANK }); setMode('create'); setErr(null); };
  const startEdit   = (u) => { setEditing({ ...u, password: '' }); setMode('edit'); setErr(null); };
  const cancel      = () => { setEditing(null); setMode(null); setErr(null); };

  const save = async () => {
    setErr(null);
    try {
      if (mode === 'create') {
        await usersAdminApi.create({
          email: editing.email,
          password: editing.password,
          displayName: editing.displayName,
          role: editing.role,
        });
        flash('User created');
      } else {
        await usersAdminApi.update(editing.id, {
          displayName: editing.displayName,
          role: editing.role,
        });
        flash('User updated');
      }
      setEditing(null); setMode(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  const resetMfa = async () => {
    if (!editing?.id) return;
    if (!confirm(`Reset MFA for ${editing.email}? All their sessions will be terminated.`)) return;
    try {
      await usersAdminApi.resetMfa(editing.id);
      flash('MFA reset — user must re-enrol.');
      await load();
      const refreshed = (await usersAdminApi.list()).find((u) => u.id === editing.id);
      if (refreshed) setEditing({ ...refreshed, password: '' });
    } catch (e) { setErr(e.message); }
  };

  const resetPassword = async () => {
    if (!editing?.id) return;
    const pw = prompt(`New password for ${editing.email} (min 8 chars):`);
    if (!pw) return;
    try {
      await usersAdminApi.resetPassword(editing.id, pw);
      flash('Password reset. Share it securely.');
    } catch (e) { setErr(e.message); }
  };

  const remove = async (u) => {
    if (!confirm(`Delete ${u.email}? This is permanent.`)) return;
    try { await usersAdminApi.remove(u.id); flash('Deleted'); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="admin-grid">
      <section className="admin-list">
        <div className="admin-list-header">
          <h2>Users</h2>
          <button className="btn" onClick={startCreate}>+ New user</button>
        </div>
        {err && !editing && <div className="admin-error">{err}</div>}
        {msg && !editing && <div className="admin-ok">{msg}</div>}
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>MFA</th>
              <th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className={editing?.id === u.id ? 'editing' : ''}>
                <td><strong>{u.email}</strong></td>
                <td>{u.displayName ?? '—'}</td>
                <td><span className={`role-pill ${u.role}`}>{u.role}</span></td>
                <td>{u.totpEnabled ? '✓' : '—'}</td>
                <td className="row-actions">
                  <button className="btn secondary small" onClick={() => startEdit(u)}>Edit</button>
                  <button className="btn danger small"    onClick={() => remove(u)}>Del</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="empty">No users.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <section className="admin-form">
          <h2>{mode === 'create' ? 'New user' : `Edit ${editing.email}`}</h2>
          {err && <div className="admin-error">{err}</div>}
          {msg && <div className="admin-ok">{msg}</div>}

          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="form">
            <label>Email</label>
            <input
              type="email"
              required
              value={editing.email}
              disabled={mode === 'edit'}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })}
            />

            <label>Display name</label>
            <input
              value={editing.displayName ?? ''}
              onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
              placeholder="Jane Doe"
            />

            <label>Role</label>
            <select
              value={editing.role}
              onChange={(e) => setEditing({ ...editing, role: e.target.value })}
            >
              <option value="user">User</option>
              <option value="admin">Administrator</option>
            </select>
            <p className="hint small">
              Admins can edit the catalog, manage users, and see every design.
              Users see only their own designs.
            </p>

            {mode === 'create' && (
              <>
                <label>Temporary password (min 8)</label>
                <input
                  type="text"
                  required
                  minLength={8}
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  placeholder="Shared with the user once"
                />
              </>
            )}

            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={cancel}>Cancel</button>
              <button type="submit" className="btn">
                {mode === 'create' ? 'Create user' : 'Save changes'}
              </button>
            </div>
          </form>

          {mode === 'edit' && (
            <>
              <hr className="form-divider" />
              <h2 style={{ marginTop: 12 }}>Security</h2>

              <div className="sec-row">
                <div>
                  <div className="sec-label">Two-factor auth</div>
                  <div className="sec-sub">
                    {editing.totpEnabled
                      ? 'Enabled. User must provide a TOTP code on every sign-in.'
                      : 'Not enabled. User will be prompted to enrol after next sign-in (recommended).'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={resetMfa}
                  disabled={!editing.totpEnabled}
                  title={editing.totpEnabled ? 'Clear the user\'s MFA secret and sign them out' : 'User has no MFA to reset'}
                >Reset MFA</button>
              </div>

              <div className="sec-row">
                <div>
                  <div className="sec-label">Password</div>
                  <div className="sec-sub">Set a new password and share it with the user securely.</div>
                </div>
                <button type="button" className="btn secondary small" onClick={resetPassword}>
                  Reset password
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
