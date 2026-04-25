# Finance Tracker

Personal finance web app. Monorepo: a React/Vite client and an Express/Prisma server backed by PostgreSQL. Single-user, password-protected.

What it does:

- Plaid-powered account linking and incremental transaction sync (cursor-based, override-preserving)
- Transactions list with per-row category and merchant overrides, rule-based automation, and multi-category splits
- Monthly budgets that aggregate over the effective category (overrides + rules + splits)
- Bills with auto payment-detection (window match by description + amount), manual transaction linking, and budget-category linkage
- Dashboard with spending/income trend tiles, top categories, recent transactions, and bills due
- Settings page for categories, rules, transfer-exclusion patterns, pay schedule, bill defaults, and account management

Deployed: client on Vercel, server on Railway. Postgres lives on Railway.

For the full architectural snapshot — DB models, API surface, page catalog, migration history, known issues — see [HANDOFF.md](./HANDOFF.md).

## Structure

```
.
├── client/   # React 18 + Vite 5 + Tailwind (deploys to Vercel)
└── server/   # Express 4 + Prisma 6 + PostgreSQL (deploys to Railway)
```

## Prerequisites

- Node.js 18+ and npm
- A PostgreSQL database (local Postgres, Docker, or Railway)
- A Plaid account for `PLAID_CLIENT_ID` / `PLAID_SECRET` (sandbox is free)

## Environment Variables

### `server/.env`

| Name | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string, e.g. `postgresql://user:pass@host:5432/finance` |
| `FRONTEND_URL` | Origin allowed by CORS, e.g. `http://localhost:5173` or your Vercel URL (no trailing slash) |
| `PORT` | HTTP port (default `3001`; Railway sets this automatically) |
| `HOST` | Interface to bind. Defaults to `0.0.0.0` when `NODE_ENV=production`, `127.0.0.1` otherwise. Override only to test from another device on the LAN — and set a strong `APP_PASSWORD` first |
| `APP_PASSWORD` | The single-user login password. Bearer token = `sha256(APP_PASSWORD)`. Required — without it set, you can't sign in |
| `PLAID_CLIENT_ID` | Plaid client ID |
| `PLAID_SECRET` | Plaid secret matching `PLAID_ENV` |
| `PLAID_ENV` | `sandbox`, `development`, or `production` |

Copy `server/.env.example` to `server/.env` and fill in values.

### `client/.env`

| Name | Description |
| --- | --- |
| `VITE_API_URL` | Base URL of the backend, e.g. `http://localhost:3001` or your Railway URL |

Copy `client/.env.example` to `client/.env` and fill in values.

## Run Locally

Open two terminals.

**Server**

```bash
cd server
npm install
npx prisma migrate dev   # first run only — applies all migrations to a fresh DB
npm run dev              # nodemon src/index.js, binds 127.0.0.1:3001 by default
```

The API exposes `GET /health` (unauthenticated). All other `/api/*` routes require a bearer token. Get one by `POST`ing your `APP_PASSWORD` to `/api/auth/login`:

```bash
curl http://localhost:3001/health
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<APP_PASSWORD>"}'
```

**Client**

```bash
cd client
npm install
npm run dev              # Vite on http://localhost:5173
```

Sign in at `/login` with the password you set in `APP_PASSWORD`. The token is stored in localStorage and auto-attached by the axios interceptor.

Tests in both packages use Vitest: `npm test` (one-shot) and `npm run test:watch`.

## Deployment

### Server → Railway

1. Create a new Railway project and provision a PostgreSQL database.
2. Create a new service from this repo and set the root directory to `server`.
3. Set environment variables on the service:
   - `DATABASE_URL` — inject from the Railway Postgres plugin
   - `FRONTEND_URL` — your Vercel URL (e.g. `https://finance-tracker.vercel.app`), no trailing slash
   - `APP_PASSWORD` — a strong password you'll use to sign in
   - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
   - `NODE_ENV=production` — the server uses this to bind `0.0.0.0` instead of `127.0.0.1`
   - `PORT` — Railway sets this automatically; the server respects it
4. Set the start command to `npx prisma migrate deploy && node src/index.js`. This applies any pending Prisma migrations on every deploy before starting the server. (`prisma generate` runs automatically via the server's `postinstall` script.)
5. Deploy. Verify `https://<your-railway-url>/health` returns `{ "status": "ok" }`.

### Client → Vercel

1. Import this repo into Vercel.
2. Set the project root to `client`.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Environment variables:
   - `VITE_API_URL` — your Railway backend URL (e.g. `https://finance-tracker.up.railway.app`)
5. Deploy. After the first deploy, copy the Vercel URL back into the server's `FRONTEND_URL` and redeploy the server so CORS allows it.
