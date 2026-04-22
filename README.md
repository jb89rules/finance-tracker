# Finance App

Personal finance web app scaffold. Monorepo with a React/Vite client and an Express/Prisma server backed by PostgreSQL.

## Structure

```
.
├── client/   # React + Vite + Tailwind (deploys to Vercel)
└── server/   # Express + Prisma + PostgreSQL (deploys to Railway)
```

## Prerequisites

- Node.js 18+ and npm
- A PostgreSQL database (local Postgres, Docker, or Railway)

## Environment Variables

### `server/.env`

| Name | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string, e.g. `postgresql://user:pass@host:5432/finance` |
| `FRONTEND_URL` | Origin allowed by CORS, e.g. `http://localhost:5173` or your Vercel URL |
| `PORT` | HTTP port (default `3001`) |

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
npx prisma migrate dev --name init   # first run only
npm run dev
```

The API listens on `http://localhost:3001` and exposes `GET /health`.

**Client**

```bash
cd client
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## Deployment

### Server → Railway

1. Create a new Railway project and provision a PostgreSQL database.
2. Create a new service from this repo and set the root directory to `server`.
3. Set environment variables on the service:
   - `DATABASE_URL` — inject from the Railway Postgres plugin
   - `FRONTEND_URL` — your Vercel URL (e.g. `https://finance-app.vercel.app`)
   - `PORT` — Railway sets this automatically; the server respects it
4. Set the build command to `npm install && npx prisma migrate deploy` and the start command to `npm start`.
5. Deploy. Verify `https://<your-railway-url>/health` returns `{ "status": "ok" }`.

### Client → Vercel

1. Import this repo into Vercel.
2. Set the project root to `client`.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Environment variables:
   - `VITE_API_URL` — your Railway backend URL (e.g. `https://finance-app.up.railway.app`)
5. Deploy. After the first deploy, copy the Vercel URL back into the server's `FRONTEND_URL` and redeploy the server so CORS allows it.

## Notes

- Plaid and Finicity integrations are intentionally not included in this scaffold; the schema leaves room for them via the `source`, `accessToken`, and `itemId` fields on `Account`.
- Prisma schema lives at `server/prisma/schema.prisma`.
