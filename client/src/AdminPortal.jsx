import { useEffect, useState } from 'react';
import DeviceIcon, { ICON_KEYS } from './DeviceIcons.jsx';
import { deviceTypesApi, zoneTypesApi, edgeKindsApi } from './catalogApi.js';
import UsersAdmin from './UsersAdmin.jsx';
import AccessLogAdmin from './AccessLogAdmin.jsx';

const BLANK_DEVICE = {
  key: '',
  label: '',
  iconKey: 'router',
  defaultInputs: 1,
  defaultOutputs: 1,
  defaultCapacity: '',
  defaultRisk: '',
  description: '',
  sortOrder: 100,
};

const BLANK_ZONE = {
  key: '',
  label: '',
  color: '#38bdf8',
  description: '',
  defaultWidth: 360,
  defaultHeight: 240,
  sortOrder: 100,
};

export default function AdminPortal() {
  const [tab, setTab] = useState('devices');

  return (
    <div className="admin">
      <header className="admin-topbar">
        <h1>Admin</h1>
        <nav>
          <button
            className={`tab${tab === 'devices' ? ' active' : ''}`}
            onClick={() => setTab('devices')}
          >Devices</button>
          <button
            className={`tab${tab === 'zones' ? ' active' : ''}`}
            onClick={() => setTab('zones')}
          >Zones</button>
          <button
            className={`tab${tab === 'edges' ? ' active' : ''}`}
            onClick={() => setTab('edges')}
          >Edge kinds</button>
          <button
            className={`tab${tab === 'users' ? ' active' : ''}`}
            onClick={() => setTab('users')}
          >Users</button>
          <button
            className={`tab${tab === 'access' ? ' active' : ''}`}
            onClick={() => setTab('access')}
          >Access log</button>
        </nav>
        <div className="spacer" />
        <a className="btn secondary" href="/">← Back to editor</a>
      </header>

      <main className="admin-main">
        {tab === 'devices' && <DeviceAdmin />}
        {tab === 'zones'   && <ZoneAdmin />}
        {tab === 'edges'   && <EdgeKindAdmin />}
        {tab === 'users'   && <UsersAdmin />}
        {tab === 'access'  && <AccessLogAdmin />}
      </main>
    </div>
  );
}

function DeviceAdmin() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setItems(await deviceTypesApi.list()); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async (row) => {
    try {
      if (row.id) await deviceTypesApi.update(row.id, row);
      else await deviceTypesApi.create(row);
      setEditing(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  const remove = async (row) => {
    if (!confirm(`Delete device type "${row.label}"?`)) return;
    try { await deviceTypesApi.remove(row.id); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="admin-grid">
      <section className="admin-list">
        <div className="admin-list-header">
          <h2>Device types</h2>
          <button className="btn" onClick={() => setEditing({ ...BLANK_DEVICE })}>+ New device</button>
        </div>
        {err && <div className="admin-error">{err}</div>}
        <table>
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Label</th>
              <th>Key</th>
              <th>Ports</th>
              <th>Risk</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={editing?.id === it.id ? 'editing' : ''}>
                <td><DeviceIcon iconKey={it.iconKey} size={32} /></td>
                <td><strong>{it.label}</strong><div className="sub">{it.description}</div></td>
                <td><code>{it.key}</code></td>
                <td>{it.defaultInputs} / {it.defaultOutputs}</td>
                <td>{it.defaultRisk ?? '—'}</td>
                <td className="row-actions">
                  <button className="btn secondary small" onClick={() => setEditing({ ...it })}>Edit</button>
                  <button className="btn danger small" onClick={() => remove(it)}>Del</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="empty">No device types defined.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <section className="admin-form">
          <h2>{editing.id ? 'Edit device type' : 'New device type'}</h2>
          <DeviceForm
            value={editing}
            onChange={setEditing}
            onCancel={() => setEditing(null)}
            onSave={() => save(editing)}
          />
        </section>
      )}
    </div>
  );
}

function DeviceForm({ value, onChange, onSave, onCancel }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="form">
      <div className="form-preview">
        <DeviceIcon iconKey={value.iconKey} size={56} />
      </div>

      <div className="two-col">
        <div>
          <label>Key (stable ID, no spaces)</label>
          <input
            required
            value={value.key}
            onChange={(e) => set({ key: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
            placeholder="vpn-gateway"
          />
        </div>
        <div>
          <label>Label</label>
          <input
            required
            value={value.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="VPN Gateway"
          />
        </div>
      </div>

      <label>Icon</label>
      <div className="icon-picker">
        {ICON_KEYS.map((k) => (
          <button
            type="button"
            key={k}
            className={`icon-swatch${value.iconKey === k ? ' active' : ''}`}
            title={k}
            onClick={() => set({ iconKey: k })}
          >
            <DeviceIcon iconKey={k} size={32} />
          </button>
        ))}
      </div>

      <div className="two-col">
        <div>
          <label>Default input ports</label>
          <input type="number" min="0" max="64"
            value={value.defaultInputs}
            onChange={(e) => set({ defaultInputs: Number(e.target.value) })} />
        </div>
        <div>
          <label>Default output ports</label>
          <input type="number" min="0" max="64"
            value={value.defaultOutputs}
            onChange={(e) => set({ defaultOutputs: Number(e.target.value) })} />
        </div>
      </div>

      <div className="two-col">
        <div>
          <label>Default capacity</label>
          <input
            value={value.defaultCapacity ?? ''}
            onChange={(e) => set({ defaultCapacity: e.target.value })}
            placeholder="1 Gbps, 500 users…"
          />
        </div>
        <div>
          <label>Default risk</label>
          <select
            value={value.defaultRisk ?? ''}
            onChange={(e) => set({ defaultRisk: e.target.value || null })}
          >
            <option value="">—</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <label>Description</label>
      <textarea
        rows="3"
        value={value.description ?? ''}
        onChange={(e) => set({ description: e.target.value })}
      />

      <label>Sort order</label>
      <input type="number" value={value.sortOrder ?? 100}
        onChange={(e) => set({ sortOrder: Number(e.target.value) })} />

      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}

function ZoneAdmin() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setItems(await zoneTypesApi.list()); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async (row) => {
    try {
      if (row.id) await zoneTypesApi.update(row.id, row);
      else await zoneTypesApi.create(row);
      setEditing(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  const remove = async (row) => {
    if (!confirm(`Delete zone type "${row.label}"?`)) return;
    try { await zoneTypesApi.remove(row.id); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="admin-grid">
      <section className="admin-list">
        <div className="admin-list-header">
          <h2>Zone types</h2>
          <button className="btn" onClick={() => setEditing({ ...BLANK_ZONE })}>+ New zone</button>
        </div>
        {err && <div className="admin-error">{err}</div>}
        <table>
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Label</th>
              <th>Key</th>
              <th>Size</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={editing?.id === it.id ? 'editing' : ''}>
                <td><span className="zone-swatch lg" style={{ background: it.color }} /></td>
                <td><strong>{it.label}</strong><div className="sub">{it.description}</div></td>
                <td><code>{it.key}</code></td>
                <td>{it.defaultWidth} × {it.defaultHeight}</td>
                <td className="row-actions">
                  <button className="btn secondary small" onClick={() => setEditing({ ...it })}>Edit</button>
                  <button className="btn danger small" onClick={() => remove(it)}>Del</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="empty">No zone types defined.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <section className="admin-form">
          <h2>{editing.id ? 'Edit zone type' : 'New zone type'}</h2>
          <ZoneForm
            value={editing}
            onChange={setEditing}
            onCancel={() => setEditing(null)}
            onSave={() => save(editing)}
          />
        </section>
      )}
    </div>
  );
}

function ZoneForm({ value, onChange, onSave, onCancel }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="form">
      <div
        className="zone-preview"
        style={{ borderColor: value.color, background: `${value.color}14` }}
      >
        <span style={{ color: value.color, borderColor: value.color }}>
          {value.label || 'Preview'}
        </span>
      </div>

      <div className="two-col">
        <div>
          <label>Key</label>
          <input
            required
            value={value.key}
            onChange={(e) => set({ key: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
            placeholder="factory-floor"
          />
        </div>
        <div>
          <label>Label</label>
          <input
            required
            value={value.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="Factory Floor"
          />
        </div>
      </div>

      <div className="two-col">
        <div>
          <label>Color</label>
          <input type="color" value={value.color ?? '#38bdf8'}
            onChange={(e) => set({ color: e.target.value })} />
        </div>
        <div>
          <label>Sort order</label>
          <input type="number" value={value.sortOrder ?? 100}
            onChange={(e) => set({ sortOrder: Number(e.target.value) })} />
        </div>
      </div>

      <div className="two-col">
        <div>
          <label>Default width</label>
          <input type="number" min="120" value={value.defaultWidth}
            onChange={(e) => set({ defaultWidth: Number(e.target.value) })} />
        </div>
        <div>
          <label>Default height</label>
          <input type="number" min="80" value={value.defaultHeight}
            onChange={(e) => set({ defaultHeight: Number(e.target.value) })} />
        </div>
      </div>

      <label>Description</label>
      <textarea
        rows="3"
        value={value.description ?? ''}
        onChange={(e) => set({ description: e.target.value })}
      />

      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}

const BLANK_EDGE = {
  key: '',
  label: '',
  description: '',
  stroke: '#94a3b8',
  strokeWidth: 2,
  strokeDasharray: '',
  animated: false,
  curved: false,
  sortOrder: 100,
};

function EdgeKindAdmin() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setItems(await edgeKindsApi.list()); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async (row) => {
    try {
      const payload = { ...row };
      if (payload.strokeDasharray === '') payload.strokeDasharray = null;
      if (row.id) await edgeKindsApi.update(row.id, payload);
      else await edgeKindsApi.create(payload);
      setEditing(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  const remove = async (row) => {
    if (!confirm(`Delete edge kind "${row.label}"?`)) return;
    try { await edgeKindsApi.remove(row.id); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="admin-grid">
      <section className="admin-list">
        <div className="admin-list-header">
          <h2>Connection kinds</h2>
          <button className="btn" onClick={() => setEditing({ ...BLANK_EDGE })}>+ New kind</button>
        </div>
        {err && <div className="admin-error">{err}</div>}
        <table>
          <thead>
            <tr>
              <th style={{ width: 100 }}>Preview</th>
              <th>Label</th>
              <th>Key</th>
              <th>Animated</th>
              <th>Curved</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={editing?.id === it.id ? 'editing' : ''}>
                <td><EdgePreview kind={it} /></td>
                <td><strong>{it.label}</strong><div className="sub">{it.description}</div></td>
                <td><code>{it.key}</code></td>
                <td>{it.animated ? '✓' : '—'}</td>
                <td>{it.curved ? '✓' : '—'}</td>
                <td className="row-actions">
                  <button className="btn secondary small" onClick={() => setEditing({ ...it })}>Edit</button>
                  <button className="btn danger small" onClick={() => remove(it)}>Del</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="empty">No connection kinds defined.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <section className="admin-form">
          <h2>{editing.id ? 'Edit connection kind' : 'New connection kind'}</h2>
          <EdgeKindForm
            value={editing}
            onChange={setEditing}
            onSave={() => save(editing)}
            onCancel={() => setEditing(null)}
          />
        </section>
      )}
    </div>
  );
}

function EdgePreview({ kind }) {
  const { stroke, strokeWidth = 2, strokeDasharray, animated } = kind;
  return (
    <svg width="80" height="20" aria-hidden="true">
      <line
        x1="4" y1="10" x2="72" y2="10"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray || undefined}
      >
        {animated && (
          <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.1s" repeatCount="indefinite" />
        )}
      </line>
      <polygon points="76,10 70,6 70,14" fill={stroke} />
    </svg>
  );
}

function EdgeKindForm({ value, onChange, onSave, onCancel }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="form">
      <div className="form-preview">
        <EdgePreview kind={value} />
      </div>

      <div className="two-col">
        <div>
          <label>Key</label>
          <input required value={value.key}
            onChange={(e) => set({ key: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
            placeholder="ipsec-vpn" />
        </div>
        <div>
          <label>Label</label>
          <input required value={value.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="IPsec VPN" />
        </div>
      </div>

      <label>Description</label>
      <textarea rows="2"
        value={value.description ?? ''}
        onChange={(e) => set({ description: e.target.value })} />

      <div className="two-col">
        <div>
          <label>Stroke colour</label>
          <input type="color" value={value.stroke}
            onChange={(e) => set({ stroke: e.target.value })} />
        </div>
        <div>
          <label>Stroke width</label>
          <input type="number" step="0.5" min="1" max="8"
            value={value.strokeWidth}
            onChange={(e) => set({ strokeWidth: Number(e.target.value) })} />
        </div>
      </div>

      <div className="two-col">
        <div>
          <label>Dash pattern</label>
          <input value={value.strokeDasharray ?? ''}
            onChange={(e) => set({ strokeDasharray: e.target.value })}
            placeholder="6 4 (blank = solid)" />
        </div>
        <div>
          <label>Sort order</label>
          <input type="number" value={value.sortOrder ?? 100}
            onChange={(e) => set({ sortOrder: Number(e.target.value) })} />
        </div>
      </div>

      <label className="toggle-row">
        <input type="checkbox" checked={!!value.animated}
          onChange={(e) => set({ animated: e.target.checked })} />
        Animated flow (pulses along the line)
      </label>

      <label className="toggle-row">
        <input type="checkbox" checked={!!value.curved}
          onChange={(e) => set({ curved: e.target.checked })} />
        Curved path — bows off the direct line. Good for redundant / parallel links so they don't overlap the primary edge.
      </label>

      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}
