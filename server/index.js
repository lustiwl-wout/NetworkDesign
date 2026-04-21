import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { designsRouter } from './routes/designs.js';
import { deviceTypesRouter, zoneTypesRouter, edgeKindsRouter } from './routes/catalog.js';
import { authRouter } from './routes/auth.js';
import { adminUsersRouter } from './routes/adminUsers.js';
import { visitsRouter, adminVisitsRouter } from './routes/visits.js';
import { attachSession } from './auth/middleware.js';
import { pool } from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1); // secure cookies behind Render's proxy
app.use(cors({ credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(attachSession);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    res.status(500).json({ ok: false, db: 'down', error: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/visits', visitsRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/visits', adminVisitsRouter);
app.use('/api/designs', designsRouter);
app.use('/api/device-types', deviceTypesRouter);
app.use('/api/zone-types', zoneTypesRouter);
app.use('/api/edge-kinds', edgeKindsRouter);

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
