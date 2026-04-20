import { pool } from './pool.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS designs (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  graph       JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS designs_touch_updated_at ON designs;
CREATE TRIGGER designs_touch_updated_at
  BEFORE UPDATE ON designs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
`;

async function main() {
  await pool.query(SCHEMA);
  console.log('[db] schema ready');
  await pool.end();
}

main().catch((err) => {
  console.error('[db] init failed:', err);
  process.exit(1);
});
