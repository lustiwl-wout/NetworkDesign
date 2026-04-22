import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.warn('[db] DATABASE_URL not set — API calls that hit the DB will fail.');
}

// Strip sslmode= from the connection string. pg-connection-string
// v2 treats 'require' / 'prefer' / 'verify-ca' as full verification,
// but warns that v3 will switch to libpq semantics (weaker). We set
// `ssl` explicitly below, so the sslmode param is redundant and
// silencing it also clears the future-breakage warning.
function stripSslMode(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

const isLocal = raw?.includes('localhost') || raw?.includes('127.0.0.1');
export const pool = new Pool({
  connectionString: stripSslMode(raw),
  // Local dev: no TLS. Cloud: TLS without cert verification.
  // rejectUnauthorized: true would be stricter but risks breaking
  // on providers whose cert chain isn't in node's default bundle;
  // leave that as a deliberate, separately-tested upgrade.
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
