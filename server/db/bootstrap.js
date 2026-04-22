import { pool } from './pool.js';
import bcrypt from 'bcryptjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  display_name   TEXT,
  role           TEXT NOT NULL DEFAULT 'user',
  default_view   TEXT NOT NULL DEFAULT 'management',
  totp_secret    TEXT,
  totp_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_view TEXT NOT NULL DEFAULT 'management';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mfa_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS designs (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  folder      TEXT,
  graph       JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  narrative   JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columns added on older installs
ALTER TABLE designs ADD COLUMN IF NOT EXISTS owner_id  INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS narrative JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS folder    TEXT;

CREATE TABLE IF NOT EXISTS design_versions (
  id          SERIAL PRIMARY KEY,
  design_id   INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  graph       JSONB NOT NULL,
  narrative   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_versions_design_idx ON design_versions (design_id, created_at DESC);

CREATE TABLE IF NOT EXISTS device_types (
  id               SERIAL PRIMARY KEY,
  key              TEXT NOT NULL UNIQUE,
  label            TEXT NOT NULL,
  icon_key         TEXT NOT NULL DEFAULT 'router',
  default_inputs   INTEGER NOT NULL DEFAULT 1,
  default_outputs  INTEGER NOT NULL DEFAULT 1,
  default_capacity TEXT DEFAULT '',
  default_risk     TEXT,
  description      TEXT DEFAULT '',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_log (
  id          SERIAL PRIMARY KEY,
  ip          TEXT,
  user_agent  TEXT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT,
  path        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_log_time_idx ON access_log (created_at DESC);

CREATE TABLE IF NOT EXISTS edge_kinds (
  id                SERIAL PRIMARY KEY,
  key               TEXT NOT NULL UNIQUE,
  label             TEXT NOT NULL,
  description       TEXT DEFAULT '',
  stroke            TEXT NOT NULL DEFAULT '#94a3b8',
  stroke_width      NUMERIC NOT NULL DEFAULT 2,
  stroke_dasharray  TEXT,
  animated          BOOLEAN NOT NULL DEFAULT FALSE,
  curved            BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE edge_kinds ADD COLUMN IF NOT EXISTS curved BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS zone_types (
  id              SERIAL PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#38bdf8',
  description     TEXT DEFAULT '',
  default_width   INTEGER NOT NULL DEFAULT 360,
  default_height  INTEGER NOT NULL DEFAULT 240,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS designs_touch_updated_at ON designs;
CREATE TRIGGER designs_touch_updated_at
  BEFORE UPDATE ON designs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS device_types_touch_updated_at ON device_types;
CREATE TRIGGER device_types_touch_updated_at
  BEFORE UPDATE ON device_types FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS zone_types_touch_updated_at ON zone_types;
CREATE TRIGGER zone_types_touch_updated_at
  BEFORE UPDATE ON zone_types FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS edge_kinds_touch_updated_at ON edge_kinds;
CREATE TRIGGER edge_kinds_touch_updated_at
  BEFORE UPDATE ON edge_kinds FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS users_touch_updated_at ON users;
CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
`;

const SEED_DEVICES = [
  { key: 'router',        label: 'Router',            icon_key: 'router',        default_inputs: 2, default_outputs: 4, sort_order: 10, description: 'Layer-3 forwarding between networks.' },
  { key: 'switch',        label: 'Switch',            icon_key: 'switch',        default_inputs: 1, default_outputs: 8, sort_order: 20, description: 'Layer-2 port aggregation for devices on the same VLAN.' },
  { key: 'firewall',      label: 'Firewall',          icon_key: 'firewall',      default_inputs: 1, default_outputs: 1, sort_order: 30, description: 'Traffic filtering between security zones.' },
  { key: 'server',        label: 'Server (hardware)', icon_key: 'server',        default_inputs: 1, default_outputs: 1, sort_order: 40, description: 'Bare-metal / physical server hardware.' },
  { key: 'hypervisor',    label: 'Hypervisor',        icon_key: 'hypervisor',    default_inputs: 1, default_outputs: 1, sort_order: 42, description: 'Virtualization host (ESXi, Hyper-V, KVM, Proxmox).' },
  { key: 'vm',            label: 'Virtual Machine',   icon_key: 'vm',            default_inputs: 1, default_outputs: 1, sort_order: 44, description: 'Guest VM running on a hypervisor.' },
  { key: 'container',     label: 'Container / Pod',   icon_key: 'container',     default_inputs: 1, default_outputs: 1, sort_order: 46, description: 'Containerized workload (Docker, Kubernetes pod).' },
  { key: 'database',      label: 'Database',          icon_key: 'database',      default_inputs: 1, default_outputs: 0, sort_order: 50, description: 'Persistent data store (RDBMS, NoSQL, object storage).' },
  { key: 'load-balancer', label: 'Load Balancer',     icon_key: 'load-balancer', default_inputs: 1, default_outputs: 4, sort_order: 60, description: 'Distributes traffic across backend pools.' },
  { key: 'client',        label: 'Client',            icon_key: 'client',        default_inputs: 1, default_outputs: 1, sort_order: 70, description: 'End-user workstation or laptop.' },
  { key: 'ap',            label: 'Access Point',      icon_key: 'ap',            default_inputs: 1, default_outputs: 4, sort_order: 80, description: 'Wi-Fi access point.' },
  { key: 'cloud',         label: 'Cloud',             icon_key: 'cloud',         default_inputs: 1, default_outputs: 1, sort_order: 90, description: 'Public cloud region or external SaaS.' },
  { key: 'boundary-input',  label: 'Input boundary',  icon_key: 'boundary-input',  default_inputs: 0, default_outputs: 1, sort_order: 5,  description: 'External source entering this design (internet, other site, customers).' },
  { key: 'boundary-output', label: 'Output boundary', icon_key: 'boundary-output', default_inputs: 1, default_outputs: 0, sort_order: 7,  description: 'External destination leaving this design (other site, cloud, customers).' },
];

const SEED_EDGE_KINDS = [
  { key: 'network',    label: 'Network link',     description: 'Standard physical or logical network connection.',         stroke: '#94a3b8', stroke_width: 2,   stroke_dasharray: null,     animated: false, curved: false, sort_order: 10 },
  { key: 'management', label: 'Management / OOB', description: 'Out-of-band administrative or control-plane link.',        stroke: '#94a3b8', stroke_width: 1.5, stroke_dasharray: '4 4',    animated: false, curved: false, sort_order: 20 },
  { key: 'logs',       label: 'Log / telemetry',  description: 'One-way forward of logs or telemetry (e.g., to SIEM).',    stroke: '#a78bfa', stroke_width: 1.5, stroke_dasharray: '4 4',    animated: false, curved: false, sort_order: 30 },
  { key: 'replication',label: 'Data replication', description: 'Active data movement — curved to visually distinguish from primary links.', stroke: '#22c55e', stroke_width: 2,   stroke_dasharray: '6 4',    animated: true,  curved: true,  sort_order: 40 },
  { key: 'wan',        label: 'WAN / Internet',   description: 'Wide-area / public Internet link.',                        stroke: '#38bdf8', stroke_width: 2.5, stroke_dasharray: null,     animated: false, curved: false, sort_order: 50 },
  { key: 'planned',    label: 'Planned / future', description: 'Proposed future connection, not yet in place.',            stroke: '#64748b', stroke_width: 1.5, stroke_dasharray: '2 6',    animated: false, curved: false, sort_order: 60 },
  { key: 'redundant',  label: 'Redundant / backup', description: 'Parallel / failover path. Curved so it bows off the primary link.', stroke: '#94a3b8', stroke_width: 1.5, stroke_dasharray: '8 4', animated: false, curved: true,  sort_order: 70 },
];

const SEED_ZONES = [
  { key: 'production', label: 'Production',                    color: '#3b82f6', sort_order: 10, description: 'Live business-serving environment.' },
  { key: 'dmz',        label: 'DMZ',                           color: '#f59e0b', sort_order: 20, description: 'Perimeter network for externally exposed services.' },
  { key: 'cloud',      label: 'Cloud',                         color: '#8b5cf6', sort_order: 30, description: 'Public cloud region (AWS/Azure/GCP).' },
  { key: 'ire',        label: 'Isolated Recovery Environment', color: '#22c55e', sort_order: 40, description: 'Air-gapped vault for cyber-resilient recovery.' },
  { key: 'airgap',     label: 'Air Gap',                       color: '#64748b', sort_order: 50, description: 'Controlled, typically one-way transfer channel.' },
  { key: 'branch',     label: 'Branch',                        color: '#06b6d4', sort_order: 60, description: 'Remote office or site.' },
  { key: 'management', label: 'Management',                    color: '#94a3b8', sort_order: 70, description: 'Out-of-band administrative plane.' },
  { key: 'generic',    label: 'Zone',                          color: '#38bdf8', sort_order: 80, description: 'Generic labeled container.' },
];

async function seed(table, rows) {
  let inserted = 0;
  for (const r of rows) {
    const cols = Object.keys(r);
    const vals = cols.map((_, i) => `$${i + 1}`);
    const { rowCount } = await pool.query(
      `INSERT INTO ${table} (${cols.join(', ')})
       VALUES (${vals.join(', ')})
       ON CONFLICT (key) DO NOTHING`,
      cols.map((c) => r[c])
    );
    inserted += rowCount;
  }
  if (inserted > 0) console.log(`[db] inserted ${inserted} new rows into ${table}`);
}

async function seedInitialAdmin() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('[auth] no users yet. Set INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD to seed the first admin.');
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'admin')`,
    [email.toLowerCase(), hash, 'Administrator']
  );
  console.log(`[auth] seeded initial admin: ${email}`);
}

export default async function initSchema() {
  await pool.query(SCHEMA);
  await seed('device_types', SEED_DEVICES);
  await seed('zone_types', SEED_ZONES);
  await seed('edge_kinds', SEED_EDGE_KINDS);
  await seedInitialAdmin();
  console.log('[db] schema ensured');
}
