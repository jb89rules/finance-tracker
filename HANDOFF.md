# Finance Tracker — Handoff

A personal finance web app: Plaid-powered account linking, transaction sync, budgets, bills with auto payment-detection, per-transaction and per-description overrides for merchant and category, rules-based automation, and a Settings page for tuning. Deployed client on Vercel, server on Railway (Postgres).

GitHub: <https://github.com/jb89rules/finance-tracker>

See [README.md](./README.md) for setup/run instructions. This document is the current-state snapshot for a developer picking up the project.

## Tech stack

- **Client**: React 18, Vite 5, React Router 6, Tailwind CSS (dark theme), Axios, react-plaid-link
- **Server**: Node.js, Express 4, Prisma 5 (PostgreSQL), Plaid Node SDK
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
│       │   ├── excludedCategories.js  (static EXCLUDED_CATEGORIES + EXCLUDED_DESCRIPTIONS defaults; isTransferTransaction(t, patterns?))
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
        │   ├── billStatus.js         (computeBillStatus, enrichBillsWithPayments, descriptionMatchesBillName, findBillPayment)
        │   ├── effectiveCategory.js  (loadCategoryRuleMap, effectiveCategoryOf, hasSplits)
        │   ├── excludedCategories.js (EXCLUDED_CATEGORIES, default EXCLUDED_DESCRIPTIONS; getExcludedDescriptions(prisma) reads AppSetting.excludedDescriptions at query time; NON_TRANSFER_CATEGORY; buildNonTransferDescriptionFilter)
        │   ├── formatCategory.js     (server copy of the client formatter; used on sync)
        │   └── plaid.js              (Plaid API client factory; PLAID_ENV + credentials)
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
- `POST /sync` — pulls transactions for every linked Item (via `transactionsSync` cursor=null every time; idempotent via upsert), preloads MerchantRule + CategoryRule maps, applies them on create (split-aware), then refreshes balances. `{ added: N }`. N is new-only (existence-checked).
- `POST /refresh-balances` → `{ accounts, failed: [{ itemId, error_code }] }`. Per-item tolerant; one dead item doesn't fail the whole call.
- `GET /balances` → `{ total, institutions: [{ name, total, accounts: [...] }] }` — total is net worth (depository + investment minus credit + loan).
- `GET /accounts` — flat list of all Plaid accounts.
- `POST /disconnect-item` — body `{ itemId }` → best-effort `itemRemove` on Plaid + clears local `accessToken`/`itemId`. Keeps Account row + history. `{ success: true }`

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
  - `netWorth: { totalBalance }` — currently hardcoded 0 in the payload; the real number lives in `GET /api/plaid/balances.total`. Dashboard.jsx fetches that directly.
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

- **`ITEM_LOGIN_REQUIRED` on Dell Pay** — one existing Plaid Item is in this state and has been since before Development-mode switch. Balances won't refresh for it. User can click **Reconnect** on the Accounts row or in Settings to re-auth; we won't be able to clear it from the DB without that.
- **Dashboard `netWorth.totalBalance` payload is hardcoded `0`** — Dashboard.jsx works around this by calling `/api/plaid/balances` directly. Not a bug; just an artifact of the initial spec. Could be cleaned up.
- **Client `EXCLUDED_DESCRIPTIONS` defaults are still hardcoded** — Transactions page now fetches from Settings at runtime, but the module-level defaults in `client/src/lib/excludedCategories.js` aren't wired anywhere else. If a new page in the future uses `isTransferTransaction` without passing `patterns`, it'll silently use the static list.
- **`topCategories` on Dashboard groups `Transfer In` and `Transfer Out` separately pre-formatter** — formatter maps them to distinct labels now, so they appear as distinct entries in Top Categories if the user removes the transfer exclusion (unlikely in normal use).
- **Plaid sync cursor is not persisted** — `transactionsSync` is always called with `cursor=null`, so every sync fetches full history and pages through `has_more`. Idempotent via upsert, but wastes API calls. A future change should add a `PlaidItem` model with a cursor field per Item.
- **Bill payment detection confidence is loose** — matches require description overlap (`contains` or word intersection) + amount within ±10% + date within window. False positives possible if multiple similar-amount transactions exist in the window.
- **Category delete/merge UI currently formats names in the picker** — if a category has a legacy un-normalized name in the DB, editing it in Settings normalizes it through the cascade.
- **Prisma client version (5.22)** — Prisma 7.x is out. Upgrade not yet attempted; breaking changes likely in filter syntax.
- **No test suite** — no unit/integration tests. All verification has been ad-hoc curl smoke tests.
- **Local `.env` uses password `password`** — explicit throwaway for local dev; production must set a strong value in Railway. See `README.md`.

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
