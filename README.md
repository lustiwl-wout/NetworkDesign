# Network Design

Browser-based tool for drawing network infrastructure diagrams. Drag router / switch / firewall / server / cloud nodes onto a canvas, connect them, and save designs to Postgres.

## Stack
- **Frontend**: React + Vite + [React Flow](https://reactflow.dev/)
- **Backend**: Node.js / Express, serves the built client and a REST API
- **Database**: PostgreSQL (Neon-friendly; SSL enabled by default)
- **Deploy**: Render web service (see `render.yaml`)

## Local development

```bash
# one-time
npm install
cp .env.example .env          # then paste your Neon DATABASE_URL
npm run db:init                # creates the designs table

# run server + client with hot reload
npm run dev
```

- Client: http://localhost:5173 (proxies `/api` to the server)
- Server: http://localhost:3000

## Production build

```bash
npm run build   # builds the client into client/dist
npm start       # serves the API + the built client on $PORT
```

## Deployment (Render + Neon)

1. Create a Postgres database on [neon.tech](https://neon.tech) and copy the connection string.
2. On Render, create a new **Blueprint** from this repo (uses `render.yaml`).
3. In the Render dashboard, set `DATABASE_URL` to the Neon connection string (include `?sslmode=require`).
4. Deploy. The server auto-runs the schema bootstrap on first start.

## API

| Method | Path                 | Description                    |
|--------|----------------------|--------------------------------|
| GET    | `/api/health`        | Server + DB health             |
| GET    | `/api/designs`       | List designs                   |
| GET    | `/api/designs/:id`   | Get one design (with graph)    |
| POST   | `/api/designs`       | Create `{ name, description?, graph? }` |
| PUT    | `/api/designs/:id`   | Update any of `{ name, description, graph }` |
| DELETE | `/api/designs/:id`   | Delete                         |

`graph` is a React Flow `{ nodes, edges }` JSON blob stored as `JSONB`.
