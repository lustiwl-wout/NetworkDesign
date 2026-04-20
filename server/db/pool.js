import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL not set — API calls that hit the DB will fail.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});
