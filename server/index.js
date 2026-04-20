import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { designsRouter } from './routes/designs.js';
import { deviceTypesRouter, zoneTypesRouter } from './routes/catalog.js';
import { pool } from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    res.status(500).json({ ok: false, db: 'down', error: err.message });
  }
});

app.use('/api/designs', designsRouter);
app.use('/api/device-types', deviceTypesRouter);
app.use('/api/zone-types', zoneTypesRouter);

const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: err.message ?? 'server error' });
});

const port = process.env.PORT ?? 3000;
app.listen(port, async () => {
  console.log(`[server] http://localhost:${port}`);
  if (process.env.DATABASE_URL) {
    try {
      const { default: initSchema } = await import('./db/bootstrap.js');
      await initSchema();
    } catch (err) {
      console.error('[server] schema bootstrap failed:', err.message);
    }
  }
});
