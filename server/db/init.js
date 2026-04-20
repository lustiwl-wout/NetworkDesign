import { pool } from './pool.js';
import initSchema from './bootstrap.js';

async function main() {
  await initSchema();
  await pool.end();
}

main().catch((err) => {
  console.error('[db] init failed:', err);
  process.exit(1);
});
