import { useEffect, useState } from 'react';
import { usersAdminApi } from './authApi.js';

const BLANK = { email: '', password: '', displayName: '', role: 'user' };

export default function UsersAdmin() {
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setItems(await usersAdminApi.list()); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await usersAdminApi.create(creating); setCreating(null); await load(); }
    catch (e) { setErr(e.message); }
  };

  const toggleRole = async (u) => {
    try { await usersAdminApi.update(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }); await load(); }
    catch (e) { setErr(e.message); }
  };

  const resetMfa = async (u) => {
    if (!confirm(`Reset MFA for ${u.email}? All their sessions will be terminated.`)) return;
    try { await usersAdminApi.resetMfa(u.id); await load(); }
    catch (e) { setErr(e.message); }
  };

  const resetPassword = async (u) => {
    const pw = prompt(`New password for ${u.email} (min 8 chars):`);
    if (!pw) return;
    try { await usersAdminApi.resetPassword(u.id, pw); await load(); alert('Password reset. Share it securely.'); }
    catch (e) { setErr(e.message); }
  };

  const remove = async (u) => {
    if (!confirm(`Delete ${u.email}? This is permanent.`)) return;
    try { await usersAdminApi.remove(u.id); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="admin-grid">
      <section className="admin-list">
        <div className="admin-list-header">
          <h2>Users</h2>
          <button className="btn" onClick={() => setCreating({ ...BLANK })}>+ New user</button>
        </div>
        {err && <div className="admin-error">{err}</div>}
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>MFA</th>
              <th style={{ width: 280 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.email}</strong></td>
                <td>{u.displayName ?? '—'}</td>
                <td>
                  <span className={`role-pill ${u.role}`}>{u.role}</span>
                </td>
                <td>{u.totpEnabled ? '✓' : '—'}</td>
                <td className="row-actions">
                  <button className="btn secondary small" onClick={() => toggleRole(u)}>
                    {u.role === 'admin' ? 'Demote' : 'Promote'}
                  </button>
                  <button className="btn secondary small" onClick={() => resetMfa(u)}>Reset MFA</button>
                  <button className="btn secondary small" onClick={() => resetPassword(u)}>Reset pw</button>
                  <button className="btn danger small" onClick={() => remove(u)}>Del</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="empty">No users.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {creating && (
        <section className="admin-form">
          <h2>New user</h2>
          <form onSubmit={(e) => { e.preventDefault(); create(); }} className="form">
            <label>Email</label>
            <input type="email" required value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} />
            <label>Display name</label>
            <input value={creating.displayName} onChange={(e) => setCreating({ ...creating, displayName: e.target.value })} />
            <label>Temporary password (min 8)</label>
            <input type="text" required minLength={8} value={creating.password} onChange={(e) => setCreating({ ...creating, password: e.target.value })} />
            <label>Role</label>
            <select value={creating.role} onChange={(e) => setCreating({ ...creating, role: e.target.value })}>
              <option value="user">User</option>
              <option value="admin">Administrator</option>
            </select>
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={() => setCreating(null)}>Cancel</button>
              <button type="submit" className="btn">Create</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
