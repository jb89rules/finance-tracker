# Finance Tracker — Handoff

A personal finance web app: Plaid-powered account linking, transaction sync, budgets, bills with auto payment-detection, per-transaction and per-description overrides for merchant and category, rules-based automation, and a Settings page for tuning. Deployed client on Vercel, server on Railway (Postgres).

GitHub: <https://github.com/jb89rules/finance-tracker>

See [README.md](./README.md) for setup/run instructions. This document is the current-state snapshot for a developer picking up the project.

## Tech stack

- **Client**: React 18, Vite 5, React Router 6, Tailwind CSS (dark theme), Axios, react-plaid-link
- **Server**: Node.js, Express 4, Prisma 6 (PostgreSQL), Plaid Node SDK
- **Tests**: Vitest in both packages (`npm test` / `npm run test:watch`); covers pure helpers in `*/lib/` only — no DB/HTTP/UI tests yet
- **Database**: PostgreSQL on Railway (single shared DB for dev + prod)
- **Auth**: single-user password; bearer token = `sha256(APP_PASSWORD)` validated via timing-safe compare. All `/api/*` routes except `/health` and `/api/auth/login` require the header `Authorization: Bearer <token>`.
- **Deployment**: Vercel (client, root `client/`, framework Vite); Railway (server, root `server/`, start command `npx prisma migrate deploy && node src/index.js`)

## Project structure

```
/                         repo root
├── HANDOFF.md            this file
├── README.md             setup + deployment instructions
├── .gitignore
├── client/               React + Vite
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js, postcss.config.js, vite.config.js
│   └── src/
│       ├── main.jsx, App.jsx, index.css
│       ├── components/
│       │   ├── BottomNav.jsx     (mobile tab bar, md:hidden)
│       │   ├── PageShell.jsx     (title / subtitle / action / mobile gear)
│       │   ├── ProtectedRoute.jsx
│       │   └── Sidebar.jsx       (desktop nav, hidden md:flex)
│       ├── lib/
│       │   ├── api.js                 (axios instance + request/response interceptors for bearer + 401 redirect)
│       │   ├── excludedCategories.js  (EXCLUDED_CATEGORIES constant; isTransferTransaction(t, patterns) — patterns must be supplied by caller, typically from /api/settings)
│       │   └── formatCategory.js      (Plaid raw name → friendly label)
│       └── pages/
│           ├── Accounts.jsx
│           ├── Bills.jsx
│           ├── Budgets.jsx
│           ├── Dashboard.jsx
│           ├── Login.jsx
│           ├── Settings.jsx
│           └── Transactions.jsx
└── server/               Express + Prisma
    ├── package.json      (dev: nodemon src/index.js; start: node src/index.js)
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/   (10 applied migrations)
    └── src/
        ├── index.js      (Express app; mounts all routers; CORS from FRONTEND_URL)
        ├── middleware/
        │   └── auth.js   (authMiddleware, hashPassword)
        ├── lib/
        │   ├── billStatus.js          (computeBillStatus, enrichBillsWithPayments, descriptionMatchesBillName, findBillPayment)
        │   ├── dashboardAggregates.js (pure helpers extracted from routes/dashboard.js: pctChange, descriptionMatchesPatterns, descriptionContains, computeMonthTotals, computeTopCategories, computeBudgetSpent)
        │   ├── effectiveCategory.js   (loadCategoryRuleMap, effectiveCategoryOf, hasSplits)
        │   ├── excludedCategories.js  (EXCLUDED_CATEGORIES, default EXCLUDED_DESCRIPTIONS; getExcludedDescriptions(prisma) reads AppSetting.excludedDescriptions at query time; NON_TRANSFER_CATEGORY; buildNonTransferDescriptionFilter)
        │   ├── formatCategory.js      (server copy of the client formatter; used on sync)
        │   ├── plaid.js               (Plaid API client factory; PLAID_ENV + credentials)
        │   └── __tests__/             (Vitest unit tests for the pure helpers above)
        ├── routes/
        │   ├── auth.js, bills.js, budgets.js, categories.js, categoryRules.js,
        │   ├── dashboard.js, merchantRules.js, plaid.js, settings.js, transactions.js
        └── scripts/      (one-shot operational scripts, listed below)
```

## Database models

All timestamps are `@default(now())` except `updatedAt` which is `@updatedAt`.

### Account
Linked bank account (one row per Plaid account). `id` is set to Plaid's `account_id` on create so transactions can reference it directly.
- `id String @id`, `institution String`, `name String`, `type String`
- `source String` — `"plaid" | "finicity" | "manual"`
- `accessToken String?`, `itemId String?` — Plaid credentials (null after Disconnect)
- `balance Float?`, `availableBalance Float?`, `accountNumber String?` (last 4, from Plaid mask)
- `createdAt`, `transactions Transaction[]`

### Transaction
- `id String @id` — Plaid transaction_id when sourced from Plaid
- `accountId String`, `account Account`
- `date DateTime`, `description String`, `amount Float`
- Plaid convention: positive = outflow/spending, negative = inflow/income
- `merchantName String?` — from Plaid enrichment
- `merchantOverride String?` — user-set per-transaction override (wins over all rules)
- `logoUrl String?` — from Plaid
- `category String?` — raw Plaid personal_finance_category.primary, run through `formatCategory` on sync
- `categoryOverride String?` — user-set per-transaction override
- `pending Boolean @default(false)`
- `source String`
- `createdAt`, `splits TransactionSplit[]`

### TransactionSplit
User-defined breakdown of a single Transaction into multiple categories. Cascade-deletes with its parent.
- `id`, `transactionId String`, `transaction Transaction @relation(..., onDelete: Cascade)`
- `amount Float` — positive allocations; must sum to `abs(parent.amount)` within $0.01
- `category String` — always required
- `note String?`, `createdAt`

### Category
The single source of truth for the category dropdown used everywhere.
- `id`, `name String @unique`, `color String @default("#6366f1")`, `type String @default("expense")` — `"expense" | "income" | "transfer"`
- `createdAt`
- Seeded from existing distinct transaction categories by `seedCategories.js`.

### Budget
- `id`, `category String`, `limit Float`, `month Int` (1–12), `year Int`
- `spent` is computed at read time in `/api/budgets` — not stored.

### Bill
- `id`, `name String`, `amount Float`, `dueDay Int` (1–31, clamped to last day of short months)
- `matchKeyword String?` — used for payment detection; falls back to `name` if null
- `linkedTransactionId String?` — manual link; when set, overrides all auto-matching
- `budgetCategory String?` — links bill to a budget (transactions matching bill name contribute to that budget)
- `paymentWindowDays Int @default(3)` — ±days around most-recent due date where a matching payment counts
- `isActive Boolean @default(true)`, `createdAt`

Notes: No `category` column — was intentionally dropped in migration `drop_bill_category`. Use `budgetCategory` only.

### CategoryRule
Auto-applies a category to transactions whose description matches.
- `id`, `description String @unique`, `categoryOverride String`, `createdAt`, `updatedAt`
- Applied at sync time for new transactions and via `applyToAll` in PATCH endpoints.
- Never applied to transactions that have splits.

### MerchantRule
Same shape, but for merchant display name.
- `id`, `description String @unique`, `merchantOverride String`, `createdAt`, `updatedAt`

### PlaidItem
Per-Item state for incremental Plaid sync. One row per linked Plaid Item.
- `itemId String @id` — matches `Account.itemId`
- `cursor String?` — most recent `next_cursor` from `transactionsSync`. Null on first sync. Persisted only after the full pagination loop completes; if a sync fails mid-pagination, the next attempt resumes from the previous cursor.
- `createdAt`, `updatedAt`
- Created/upserted at the end of each successful per-Item sync; deleted on `disconnect-item`.

### AppSetting
Key/value store for mutable app configuration (user-editable from Settings).
- `key String @id`, `value String`, `updatedAt`
- Keys in use:
  - `paycheckAmount` (string of a number; default `"0"`)
  - `payFrequency` (`"weekly" | "bi-weekly" | "semi-monthly" | "monthly"`; default `"bi-weekly"`)
  - `lastPayDate` (ISO date string)
  - `defaultPaymentWindow` (`"1"`–`"14"`; default `"3"`)
  - `excludedDescriptions` (JSON array of strings; defaults to 5 SoFi patterns)

## API routes

All under `/api/*`, all require bearer auth **except** `POST /api/auth/login`. `GET /health` is also unauthenticated.

### Auth — `/api/auth`
- `POST /login` — body `{ password }` → `{ token }` or 401 `{ error: "Invalid password" }`

### Plaid — `/api/plaid`
- `POST /create-link-token` → `{ link_token }`
- `POST /create-link-token-update` — body `{ itemId }` → `{ link_token }` for Plaid Link update mode (reconnect a failed Item)
- `POST /exchange-token` — body `{ public_token, institution_name, accounts[] }` → exchanges public token, fetches initial balances + account masks, upserts Accounts. `{ success: true }`
- `POST /sync` — pulls transactions for every linked Item via `transactionsSync` using a per-Item cursor stored in `PlaidItem.cursor`. Loads cursor at start of pagination, processes `added` (upsert), `modified` (upsert, override-preserving), `removed` (delete), and persists `next_cursor` after the loop completes. Preloads MerchantRule + CategoryRule maps, applies them on create (split-aware), then refreshes balances. `{ added: N }`. N is new-only (existence-checked).
- `POST /refresh-balances` → `{ accounts, failed: [{ itemId, error_code }] }`. Per-item tolerant; one dead item doesn't fail the whole call.
- `GET /balances` → `{ total, institutions: [{ name, total, accounts: [...] }] }` — total is net worth (depository + investment minus credit + loan).
- `GET /accounts` — flat list of all Plaid accounts.
- `POST /disconnect-item` — body `{ itemId }` → best-effort `itemRemove` on Plaid + clears local `accessToken`/`itemId` + deletes the `PlaidItem` cursor row. Keeps Account row + history. `{ success: true }`

### Transactions — `/api/transactions`
- `GET /` — query `?category`, `?account`, `?search`. Joins `MerchantRule` and `CategoryRule` in-memory and returns each txn with computed `displayName` and `effectiveCategory` (null for split txns). The `category` query filter uses `effectiveCategory`.
- `GET /categories` — proxies Category table names (replaced the old distinct-transactions query).
- `PATCH /:id` — body `{ category }` (legacy; still writes raw `category`; not used by the UI anymore).
- `PATCH /:id/category` — body `{ categoryOverride, applyToAll }`. **Rejects split txns with 400.** `applyToAll` upserts a CategoryRule and `updateMany`s non-split siblings.
- `PATCH /:id/merchant` — body `{ merchantOverride, applyToAll }`. `applyToAll` upserts a MerchantRule and updates all siblings.
- `POST /:id/splits` — body `{ splits: [{ amount, category, note? }] }`. Validates sum within $0.01 of `abs(transaction.amount)`; at least 2 items. Replaces existing splits atomically.
- `DELETE /:id/splits` — clears all splits on a transaction.

### Budgets — `/api/budgets`
- `GET ?month&year` (defaults to current) — returns budgets with computed `spent`. Spent is computed in-memory: per budget, sums matching unsplit transactions by `effectiveCategory` OR bill-description match (for bills linked to this budget via `budgetCategory`), plus matching `TransactionSplit.category`. Transfers excluded by category and by `AppSetting.excludedDescriptions`.
- `POST /` — body `{ category, limit, month, year }`
- `PATCH /:id` — body `{ limit }`
- `DELETE /:id`

### Bills — `/api/bills`
- `GET /detect` — last 90 days of transactions, groups by normalized description, requires ≥2 occurrences with amounts within 15% of median, returns `[{ name, matchKeyword, amount, dueDay, txnCategory }]` sorted by amount desc.
- `GET /` — bills enriched with `daysUntilDue`, `daysOverdue`, `status` (`upcoming | due-soon | overdue | paid`), and if paid: `paidDate`, `paidAmount`. Uses `linkedTransactionId` if set, otherwise a window match (±`paymentWindowDays`, ±10% amount, description match via `matchKeyword || name`).
- `POST /`, `PATCH /:id` — standard CRUD validated in `validateBillInput`
- `DELETE /:id`
- `POST /:id/link-transaction` — body `{ transactionId }`. Overrides detection.
- `DELETE /:id/link-transaction` — clears the link.

### Dashboard — `/api/dashboard`
- `GET /` — one-shot payload:
  - `spending: { thisMonth, lastMonth, percentChange }`, `income: { thisMonth, lastMonth, percentChange }` — computed in-memory from enriched transactions. Respects `effectiveCategory`, EXCLUDED_CATEGORIES, and AppSetting-backed description patterns. For split txns, uses split amounts/categories; transfers excluded.
  - `recentTransactions` — last 5 with account info.
  - `budgets` — current month's budgets with `spent`.
  - `bills` — active bills with status + payment detection.
  - `topCategories` — top 5 spending categories this month with `amount` and `percent` of total spending.

### Categories — `/api/categories`
- `GET /` — all categories sorted by name.
- `POST /` — body `{ name, color, type }` (409 on duplicate name).
- `PATCH /:id` — name changes cascade into `transaction.category`, `transactionSplit.category`, `bill.budgetCategory`, `budget.category` in one `$transaction`.
- `DELETE /:id` — body `{ reassignTo }` (category name). Updates all references then deletes. Returns `{ success, transactionsUpdated }`.
- `POST /merge` — body `{ sourceId, targetId }`. Updates all references from source to target then deletes source.

### Category rules — `/api/category-rules`
- `GET /`, `POST /` (upsert on description), `DELETE /:id`

### Merchant rules — `/api/merchant-rules`
- `GET /`, `POST /` (upsert on description), `DELETE /:id`

### Settings — `/api/settings`
- `GET /` — returns DB rows merged with defaults as `{ key: value }`.
- `POST /` — body `{ key, value }` upsert. `value` is always coerced to string.

## Environment variables

### Server (`server/.env`, gitignored; see `server/.env.example`)
- `DATABASE_URL` — Postgres connection string (use Railway's public proxy URL for local dev, e.g. `mainline.proxy.rlwy.net:53639`)
- `FRONTEND_URL` — exact origin allowed by CORS (no trailing slash). Must match the Vercel URL in production.
- `PORT` — default `3001`. Railway sets this automatically.
- `HOST` — interface to bind. Default: `0.0.0.0` when `NODE_ENV=production` (Railway), `127.0.0.1` otherwise (local dev — keeps the dev server off the LAN). Override only when you need to test from another device on the same network.
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (`sandbox | development | production`). Local is currently on `development`.
- `APP_PASSWORD` — the single-user login password. Local value: `password` (placeholder; change anytime). Production must have its own set in Railway.

### Client (`client/.env`, gitignored; see `client/.env.example`)
- `VITE_API_URL` — backend base URL. Local: `http://localhost:3001`. Prod: the Railway URL of the server service.

## Frontend pages

- **Login** (`/login`) — centered card, password field. On success stores `auth_token` in localStorage and navigates to `/`. Axios interceptors auto-attach the bearer and hard-redirect to `/login` on any 401.
- **Dashboard** (`/`) — 4 stat cards (Total balance from `/api/plaid/balances`, Spending, Income, Active bills), Budgets overview + Recent transactions row, Top spending categories + Bills due soon row.
- **Accounts** (`/accounts`) — accounts listed grouped by institution with Connect/Refresh buttons. Includes a "Manage connections → Settings" link; full management UI also lives in Settings.
- **Transactions** (`/transactions`) — summary cards, filter bar (search, category, account) + "Show transfers" toggle, dual mobile/desktop rendering: desktop 6-col table (Date / Description / Merchant / Account / Category / Amount), mobile stacked card rows. Inline category badge opens `CategoryOverrideModal`; split txns show `SplitBadge` instead and do NOT open the category popover. Merchant cell opens `MerchantOverrideModal`. Scissors icon opens `SplitEditorModal`.
- **Budgets** (`/budgets`) — month nav, budget cards with progress bars, Add Budget modal with native `<select>` from `/api/categories`.
- **Bills** (`/bills`) — summary cards (Monthly / Due this week / Paid this month / Active), bill rows with status dot, category/budget-category badges, Active toggle, Edit/Delete. Detect Bills modal, Link payment modal (pick a transaction to mark as paid), paid bills visually dimmed.
- **Settings** (`/settings`) — Income & pay / Categories (add, rename inline, color picker, type, delete with reassignment, merge) / Merchant rules / Category rules / Transfer exclusion rules / Bill defaults / Connected accounts (Refresh + Reconnect via update mode + Disconnect).

Navigation:
- Desktop: `Sidebar` with primary routes + a gear icon at the bottom for Settings.
- Mobile: `BottomNav` fixed at the bottom with Dashboard / Transactions / Budgets / Bills / Accounts. `PageShell` renders a gear icon in the top-right on mobile that links to `/settings`.

## Migration history

Applied in `server/prisma/migrations/` (ordered):

1. `20260423001749_init` — Account, Transaction, Budget, Bill
2. `20260423232520_drop_bill_category` — dropped `Bill.category` (manually authored SQL because Prisma flagged data loss)
3. `20260424003600_add_bill_budget_category` — `Bill.budgetCategory`
4. `20260424010023_add_transaction_splits` — TransactionSplit model + Transaction.splits relation
5. `20260424011836_add_bill_payment_window` — `Bill.paymentWindowDays`
6. `20260424015013_enhance_plaid_data` — Account balance fields, Transaction merchant/logo/pending fields
7. `20260424030843_add_bill_match_keyword` — `Bill.matchKeyword` + `Bill.linkedTransactionId`
8. `20260424033509_add_settings` — Category, AppSetting
9. `20260424144349_add_merchant_rules` — MerchantRule + `Transaction.merchantOverride`
10. `20260424213405_add_category_rules` — CategoryRule + `Transaction.categoryOverride`
11. `20260424220000_add_plaid_item_cursor` — PlaidItem (per-Item cursor for incremental Plaid sync)

Railway's Start Command is `npx prisma migrate deploy && node src/index.js`, so each deploy auto-applies any pending migrations.

## Migration / one-shot scripts (`server/src/scripts/`)

Run with `cd server && node src/scripts/<name>.js`. All read `DATABASE_URL` from `.env`. All are idempotent and safe to re-run.

- **`seedCategories.js`** — reads distinct non-null values from `Transaction.category`, upserts `Category` rows (skipping existing). Type rule: `Income → income`, `Transfer In/Out → transfer`, else `expense`. Color deterministically picked from 10-color palette hashed from the name.
- **`normalizeCategories.js`** — generic string normalizer. For each distinct value in `transaction.category`, `bill.category` (now removed), `bill.budgetCategory`, and `budget.category`, runs it through `formatCategory()` and updates all matching rows. Skips rows that are already formatted.
- **`recategorizeTransferDescriptions.js`** — seeds a hardcoded list of `{pattern → target category}` mappings (SoFi Round Ups etc.) and updates every transaction whose description contains the pattern.
- **`backfillMatchKeyword.js`** — sets `Bill.matchKeyword = Bill.name` for any bill where `matchKeyword` is null. Intended to run once after the `add_bill_match_keyword` migration.
- **`applyCategoryRules.js`** — seeds a hardcoded `{description → categoryOverride}` rule list into `CategoryRule` and applies the override to all matching non-split transactions. Currently seeds just `"To Round Ups Vault" → "Transfer Out"`. Intended to run once after the `add_category_rules` migration.

If you point `DATABASE_URL` at a fresh production DB (not the Railway one currently shared with local), run `seedCategories.js` + `backfillMatchKeyword.js` + `applyCategoryRules.js` once in that order.

## Recent changes (most recent first)

- **Pending-issues sweep** (uncommitted) — worked through every entry in the old "Known issues" list:
  - Removed dead `netWorth: { totalBalance: 0 }` field from `/api/dashboard` payload (client was already ignoring it and calling `/api/plaid/balances` directly).
  - Removed the hardcoded `EXCLUDED_DESCRIPTIONS` constant + default-arg fallback from `client/src/lib/excludedCategories.js`. `isTransferTransaction(t, patterns)` now requires the caller to pass patterns explicitly; only consumer (Transactions page) already does.
  - **Plaid cursor persistence**: new `PlaidItem` model (migration `20260424220000_add_plaid_item_cursor`) with `itemId` PK + `cursor`. `/api/plaid/sync` now loads cursor at the start of each Item's pagination loop, persists `next_cursor` only after the loop completes successfully, and handles `transactionsSync` `modified` (upsert, override-preserving) and `removed` (delete) — not just `added`. `/api/plaid/disconnect-item` cleans up the `PlaidItem` row.
  - **Bill payment matcher tightened** (`server/src/lib/billStatus.js`): `descriptionMatchesBillName` now requires every bill-name token to appear as a *whole word* in the transaction description. Stops `"sofi"`-in-`"soficity"` substring leaks and shared-common-word false positives (e.g., bill `"Credit Card"` previously matched any txn description containing `"credit"`). Heads-up: bills with very abbreviated `matchKeyword` like `"Net"` no longer match `"NETFLIX"` — set `matchKeyword` to the full token.
  - **Vitest test suite added** in both packages: `npm test` / `npm run test:watch`. 65 unit tests covering pure helpers in `server/src/lib/` (billStatus, effectiveCategory, excludedCategories, formatCategory, dashboardAggregates) and `client/src/lib/` (formatCategory, excludedCategories). Extracted dashboard's pure aggregation helpers into a new `server/src/lib/dashboardAggregates.js` so they're testable independently of the route's DB calls.
  - **Prisma upgrade 5.22 → 6.19.3**. Prisma 7 was attempted and rolled back: 7 removed `url` from `schema.prisma` and requires a driver-adapter rewrite of every `new PrismaClient()` site. Stayed on 6.x as a low-risk single-major bump. Schema validates, all 54 server tests pass, smoke-tested every Prisma-backed endpoint (dashboard/transactions/bills/categories/budgets/merchant-rules/settings) — all return correct data.
  - **Dev server now binds to `127.0.0.1` by default** (`server/src/index.js`): production keeps `0.0.0.0` via `NODE_ENV=production`. `HOST` env var added as opt-in escape hatch for LAN testing. Closes the LAN-exposure compounding-risk with the local `APP_PASSWORD="password"` + shared Railway DB.
  - Several "pending issue" entries that turned out not to be real bugs were verified-and-removed from the list (Dashboard Transfer In/Out grouping, Category delete/merge UI formatting).
- **Transactions summary count fix** (`85a28fc`) — the count tile now uses `nonTransfer.length`, matching the spending/income filter. The client `SummaryCards` also loads `excludedDescriptions` from `/api/settings` so user-edited patterns apply on both pages. `isTransferTransaction(t, patterns?)` gained an optional patterns arg.
- **Category override system** (`addd6c0`) — `CategoryRule` model + per-transaction `Transaction.categoryOverride` + `effectiveCategory` computed server-side. `PATCH /api/transactions/:id/category` with `applyToAll`. Dashboard + Budgets aggregates refactored from SQL to in-memory to honor `effectiveCategory`. Split transactions are guarded everywhere: PATCH rejects them with 400; Plaid sync won't auto-apply a rule to a split txn; `effectiveCategory` is null for splits; aggregations use `split.category` for splits.
- **Merchant override system** (`11558d5`) — same shape, for merchant display name. `displayName` computed server-side with precedence `merchantOverride > rule > merchantName > description`.
- **Settings system** (`bc7b76e`) — Category + AppSetting models, the whole Settings page, category management (rename/delete/merge with cascade), excluded descriptions editable and dynamic, bill defaults, accounts section duplicated here.
- **Description-based transfer exclusion** (`17d866e`) — `EXCLUDED_DESCRIPTIONS` constant + SoFi Round Ups recategorization script.
- **Bills feature** — payment detection window + status enrichment + Link payment modal + match keyword / linked transaction / budget-category linkage.
- **Transaction splits** — `SplitEditorModal`, sum-must-equal-total validation, budget aggregation uses splits.
- **Plaid enhancement** — balances, merchant names, logos, pending flag. Reconnect flow via Plaid Link update mode for `ITEM_LOGIN_REQUIRED`.
- **Mobile redesign** — `BottomNav`, responsive layouts, `PageShell` mobile Settings gear.

## Known issues / pending items

- **Prisma 7 upgrade deferred** — currently on `^6.19.3`. Prisma 7 removed `url` from `schema.prisma`; connection URLs now live in `prisma.config.ts` and `PrismaClient` requires a driver adapter (`@prisma/adapter-pg` + `pg`). That refactor touches every `new PrismaClient()` site (10 route files) and needs full per-page verification. Stay on 6.x until there's a feature-driven reason to take it on.
- **Test coverage limited to pure helpers** — Vitest is wired up in both packages with `npm test` (one-shot) and `npm run test:watch`. Current coverage is unit tests on pure money/aggregation logic in `server/src/lib/` (billStatus, effectiveCategory, excludedCategories, formatCategory, dashboardAggregates) and client `lib/` (formatCategory, excludedCategories) — 65 tests total. No DB-backed integration tests, HTTP endpoint tests, or React component tests yet.
- **Local `.env` uses password `password`** — explicit throwaway for local dev; production must set a strong value in Railway. The dev server now binds to `127.0.0.1` only (see `HOST` env var) so the weak local password isn't reachable from the LAN, but if you ever set `HOST=0.0.0.0` for cross-device testing, change `APP_PASSWORD` first.

## Local development quick-reference

```bash
# Server
cd server
npm install
# First-time setup for a new DB:
npx prisma migrate dev
# Normal dev:
npm run dev          # nodemon src/index.js

# Client (separate terminal)
cd client
npm install
npm run dev          # Vite on 5173
```

Health check: `curl http://localhost:3001/health` → `{"status":"ok"}`.

Login: `curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"password":"password"}'`.

## Deployment quick-reference

- Client deploys to Vercel on every push to `main`. Root: `client/`. Set `VITE_API_URL` in Vercel env to the Railway server URL.
- Server deploys to Railway on every push to `main`. Root: `server/`. Start command `npx prisma migrate deploy && node src/index.js`. Env vars: all of the server vars listed above.
- After adding a new Plaid institution via `exchange-token` on production, run `POST /api/plaid/sync` once to pull transactions. Existing rules apply automatically.
- After adding a new category rule or merchant rule, existing transactions remain untouched — the rule is only auto-applied to newly synced transactions. To apply retroactively, use `applyToAll: true` on a `PATCH /:id/category` (or `/merchant`) call from the UI, or write a small one-off script.
