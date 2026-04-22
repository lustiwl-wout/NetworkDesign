import { useEffect, useState } from 'react';
import { teamsAdminApi } from './authApi.js';

// Teams admin — create / rename / delete teams and manage their
// membership. Pretty minimal on purpose: one list on the left,
// membership editor for the selected team on the right.
export default function TeamsAdmin() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setItems(await teamsAdminApi.list()); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    // Keep `selected` in sync with the reloaded list so member changes
    // show up without a manual refresh.
    if (selected) {
      const match = items.find((t) => t.id === selected.id);
      if (match) setSelected(match);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    const name = prompt('Team name?');
    if (!name || !name.trim()) return;
    try {
      const t = await teamsAdminApi.create(name.trim());
      await load();
      setSelected(t);
    } catch (e) { setErr(e.message); }
  };

  const rename = async (team) => {
    const name = prompt('Rename team', team.name);
    if (!name || !name.trim() || name === team.name) return;
    try { await teamsAdminApi.rename(team.id, name.trim()); await load(); }
    catch (e) { setErr(e.message); }
  };

  const remove = async (team) => {
    if (!confirm(`Delete team "${team.name}"?\nDesigns scoped to it will become personal.`)) return;
    try {
      await teamsAdminApi.remove(team.id);
      if (selected?.id === team.id) setSelected(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="admin-grid">
      <section className="admin-list">
        <div className="admin-list-header">
          <h2>Teams</h2>
          <button className="btn" onClick={create}>+ New team</button>
        </div>
        {err && <div className="admin-error">{err}</div>}
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Members</th>
              <th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className={selected?.id === t.id ? 'editing' : ''}>
                <td><strong>{t.name}</strong></td>
                <td>{t.members.length}</td>
                <td className="row-actions">
                  <button className="btn secondary small" onClick={() => setSelected(t)}>Members</button>
                  <button className="btn secondary small" onClick={() => rename(t)}>Rename</button>
                  <button className="btn danger small" onClick={() => remove(t)}>Del</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={3} className="empty">No teams yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {selected && (
        <TeamMembersPanel
          team={selected}
          onClose={() => setSelected(null)}
          onChange={load}
          setErr={setErr}
        />
      )}
    </div>
  );
}

function TeamMembersPanel({ team, onClose, onChange, setErr }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await teamsAdminApi.addMember(team.id, email.trim());
      setEmail('');
      await onChange();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (!confirm(`Remove ${m.email} from ${team.name}?`)) return;
    try { await teamsAdminApi.removeMember(team.id, m.id); await onChange(); }
    catch (e2) { setErr(e2.message); }
  };

  return (
    <section className="admin-form">
      <h2>{team.name} · members</h2>
      <form onSubmit={add} className="form" style={{ marginBottom: 12 }}>
        <label>Add member by email</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn" disabled={busy}>{busy ? '…' : 'Add'}</button>
        </div>
      </form>
      <ul className="design-list">
        {team.members.map((m) => (
          <li key={m.id}>
            <div>
              <strong>{m.displayName || m.email}</strong>
              <div className="meta">{m.email}</div>
            </div>
            <button className="btn danger small" onClick={() => remove(m)}>Remove</button>
          </li>
        ))}
        {team.members.length === 0 && <li><span className="meta">No members yet.</span></li>}
      </ul>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}
