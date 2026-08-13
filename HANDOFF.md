# Finance Tracker — Handoff

A personal finance web app: Plaid-powered account linking, transaction sync, a unified Plan (budgets + bills in one model), per-transaction and per-description overrides for merchant and category, rules-based automation, and a Settings page for tuning. Deployed client on Vercel, server on Railway (Postgres).

GitHub: <https://github.com/jb89rules/finance-tracker>

See [README.md](./README.md) for setup/run instructions. This document is the current-state snapshot for a developer picking up the project.

## Tech stack

- **Client**: React 18, Vite 5, React Router 6, Tailwind CSS (dark theme), Axios, react-plaid-link
- **Server**: Node.js, Express 4, Prisma 6 (PostgreSQL), Plaid Node SDK
- **Tests**: Vitest in both packages (`npm test` / `npm run test:watch`); covers pure helpers in `*/lib/` only — no DB/HTTP/UI tests yet. 99 server + 11 client = 110 tests.
- **Database**: PostgreSQL on Railway (single shared DB for dev + prod)
- **Auth**: single-user password; bearer token = `sha256(APP_PASSWORD)` validated via timing-safe compare. All `/api/*` routes except `/health` and `/api/auth/login` require the header `Authorization: Bearer <token>`.
- **Deployment**: Vercel (client, root `client/`, framework Vite); Railway (server, root `server/`, start command `npx prisma migrate deploy && node src/index.js`)

## The Plan model — read this first

The single most important thing to understand about this codebase: **budgets and bills are the same thing.** There is no `Bill` table and no `Budget` table; both were dropped. Everything lives in one `PlannedItem` table, and the `/plan` page is the only UI for it.

The unifying idea is that a planned item is *money you expect to spend in a category*, and the only real variable is **whether it has a date attached**:

- An item **with** a `dueDay` (or a `oneTimeDate`) behaves like a bill — it has a due date, a status (`upcoming` / `due-soon` / `overdue` / `paid`), and gets matched against a real transaction to decide whether it's been paid.
- An item **without** a date (`dueDay: null`) behaves like a budget buffer — it "spreads" across the month, and its spend is whatever transactions in that category add up to.

`monthlyAmounts` (a 12-element `Float[]`) is the single source of truth for cost in both cases. A monthly bill is the same amount twelve times; an annual bill is the amount once and `0` eleven times; a variable utility differs each month. Any code doing money math should read `amountForMonth(item, month0, year)` — never the legacy scalar `amount` field.

A category's total for a month is the sum of `amountForMonth` across every active item in that category. That's what `/api/plan/rollup` returns, and it's what the Plan page cards show.

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
│       │   ├── BottomNav.jsx        (mobile tab bar, md:hidden — 4 tabs)
│       │   ├── CategoryCombobox.jsx (shared searchable category picker)
│       │   ├── Modal.jsx            (shared modal shell)
│       │   ├── PageShell.jsx        (title / subtitle / action / mobile gear)
│       │   ├── ProtectedRoute.jsx
│       │   └── Sidebar.jsx          (desktop nav, hidden md:flex — 4 links + gear)
│       ├── lib/
│       │   ├── api.js                 (axios instance + bearer / 401-redirect interceptors)
│       │   ├── excludedCategories.js  (EXCLUDED_CATEGORIES; isTransferTransaction(t, patterns) — patterns must be supplied by caller)
│       │   ├── format.js              (shared currency / date formatters)
│       │   └── formatCategory.js      (Plaid raw name → friendly label)
│       └── pages/
│           ├── Accounts.jsx
│           ├── Dashboard.jsx
│           ├── Login.jsx
│           ├── Settings.jsx
│           ├── Transactions.jsx
│           └── Plan/
│               ├── index.jsx              (category cards + month nav)
│               ├── CategoryDetail.jsx     (drill-in: item table + 12-month editor)
│               ├── components/
│               │   ├── AddPlannedItemModal.jsx
│               │   ├── CategoryCard.jsx
│               │   ├── DetectItemsModal.jsx
│               │   ├── LinkPaymentModal.jsx
│               │   ├── MonthlyAmountsEditor.jsx
│               │   ├── PlanItemRow.jsx
│               │   ├── PlanItemTransactions.jsx
│               │   └── StatusPill.jsx
│               └── hooks/
│                   ├── useMonthNav.js
│                   ├── usePlanItems.js
│                   ├── usePlanItemTransactions.js
│                   └── usePlanRollup.js
└── server/               Express + Prisma
    ├── package.json      (dev: nodemon src/index.js; start: node src/index.js)
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/   (14 applied migrations)
    └── src/
        ├── index.js      (Express app; mounts all routers; CORS from FRONTEND_URL)
        ├── middleware/
        │   └── auth.js   (authMiddleware, hashPassword)
        ├── lib/
        │   ├── dashboardAggregates.js  (pure helpers for routes/dashboard.js)
        │   ├── effectiveCategory.js    (loadCategoryRuleMap, effectiveCategoryOf, hasSplits)
        │   ├── excludedCategories.js   (EXCLUDED_CATEGORIES, getExcludedDescriptions(prisma), NON_TRANSFER_CATEGORY, buildNonTransferDescriptionFilter)
        │   ├── formatCategory.js       (server copy of the client formatter; used on sync)
        │   ├── itemStatus.js           (the PlannedItem engine — see below)
        │   ├── plaid.js                (Plaid API client factory)
        │   ├── plannedItemValidation.js (validatePlannedItemInput, shared by route + scripts)
        │   └── __tests__/              (Vitest unit tests for the pure helpers above)
        ├── routes/
        │   ├── auth.js, categories.js, categoryRules.js, dashboard.js,
        │   ├── merchantRules.js, plaid.js, plan.js, settings.js, transactions.js
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

### PlannedItem
**The unified budget + bill model.** Replaced the old `Bill` and `Budget` tables.
- `id`, `name String`, `category String?` (null = the "Uncategorized" rollup group)
- `kind String` — `"recurring" | "one_time"`
- `frequency String?` — `"monthly" | "annual" | "semi-annual" | "custom"`. **Drives the entry UI only.** All math reads `monthlyAmounts`.
- `dueDay Int?` — 1–31, clamped to the last day of short months. **`null` means the item spreads across the month** (a discretionary buffer) rather than landing on a date.
- `oneTimeDate DateTime?` — set instead of `dueDay` when `kind = "one_time"`
- `amount Float` — **legacy scalar**, derived server-side as `max(monthlyAmounts)`. Kept so payment-detection match windows still work. Do not use it for totals.
- `monthlyAmounts Float[] @default([])` — 12 elements, the source of truth for per-month cost
- `matchKeyword String?` — used for payment detection; falls back to `name` if null
- `linkedTransactionId String?` — manual link; when set, overrides all auto-matching
- `paymentWindowDays Int @default(3)` — ±days around the due date where a matching payment counts
- `isActive Boolean @default(true)`, `createdAt`, `updatedAt`
- Indexes: `[category, isActive]`, `[kind, isActive]`, `[oneTimeDate]`

### Category
The single source of truth for the category dropdown used everywhere.
- `id`, `name String @unique`, `color String @default("#6366f1")`, `type String @default("expense")` — `"expense" | "income" | "transfer"`
- `createdAt`

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
- `cursor String?` — most recent `next_cursor` from `transactionsSync`. Persisted only after the full pagination loop completes; a mid-pagination failure resumes from the previous cursor.
- `createdAt`, `updatedAt`

### AppSetting
Key/value store for mutable app configuration (user-editable from Settings).
- `key String @id`, `value String`, `updatedAt`
- Keys in use: `paycheckAmount`, `payFrequency` (`weekly | bi-weekly | semi-monthly | monthly`), `lastPayDate`, `defaultPaymentWindow` (`"1"`–`"14"`), `excludedDescriptions` (JSON array of strings)

## `lib/itemStatus.js` — the PlannedItem engine

The renamed and extended successor to the old `billStatus.js`. Everything date- and payment-related lives here.

- `amountForMonth(item, month0, year)` — the dollar figure for a given month. Returns `0` for months an annual item doesn't hit. **Use this, not `item.amount`.**
- `computeItemStatus(item)` — `{ status, daysUntilDue, daysOverdue }`, where status is `upcoming | due-soon | overdue | paid`
- `computeMostRecentDue(item)` / `resolveDueDate(...)` — due-date resolution with short-month clamping
- `findItemPayment(...)` — window match (±`paymentWindowDays`, ±10% of the *per-month* amount, description match). Skips entirely when `monthlyAmounts[month0]` is `0`, so annual bills don't false-match in off months.
- `enrichItemsWithPayments(prisma, items)` — attaches `paidDate` / `paidAmount`
- `descriptionMatchesItemName(...)` — requires every name token to appear as a **whole word** in the description. Stops `"sofi"`-in-`"soficity"` leaks. Heads-up: a very abbreviated `matchKeyword` like `"Net"` will not match `"NETFLIX"` — use the full token.
- `categoryRollup(items, category, month0, year)` — `{ planned, billsTotal, discretionaryTotal, oneTimeTotal }`
- `formatDueLabel(item)` — server-formatted string (`"the 19th"`, a date for one-offs) so the client never branches on `dueDay` vs `oneTimeDate`
- `hasDate(item)` — dated (bill-like) vs spread (buffer-like)

Legacy aliases (`computeBillStatus`, `descriptionMatchesBillName`, `findBillPayment`, `enrichBillsWithPayments`, `billsTotalForCategoryMonth`) are still exported so older call sites and tests keep working.

## API routes

All under `/api/*`, all require bearer auth **except** `POST /api/auth/login`. `GET /health` is also unauthenticated.

> `/api/budgets` and `/api/bills` **no longer exist** — both return 404. Use `/api/plan`.

### Auth — `/api/auth`
- `POST /login` — body `{ password }` → `{ token }` or 401 `{ error: "Invalid password" }`

### Plan — `/api/plan`
- `GET /items?month&year&category&kind&isActive&hasDate` — planned items, each decorated with `status`, `daysUntilDue`, `daysOverdue`, `dueLabel`, `amountForMonth`, plus `paidDate` / `paidAmount` when matched. `hasDate=true|false` filters dated vs spread items.
- `GET /rollup?month&year` — per-category monthly rollup: `{ category, planned, billsTotal, discretionaryTotal, oneTimeTotal, spent, remaining, month, year }`. Only categories with at least one active item contributing a non-zero amount that month appear. `category` is `null` for the Uncategorized group.
- `GET /items/:id/transactions?month&year` — the transactions counting toward this item for that month. For dated items, the matched payment (month-scoped, so historical drill-ins return the right transaction). For spread items, every category-matching transaction in the month **minus** those owned by dated siblings, so buffers don't double-count.
- `GET /detect` — last 90 days, groups by normalized description, requires ≥2 occurrences with amounts within 15% of median. Returns suggestions sorted by amount desc.
- `POST /items` — create; validated by `validatePlannedItemInput`
- `PATCH /items/:id` — partial update, same validator with `{ partial: true }`
- `PATCH /items/:id/monthly-amounts` — dedicated 12-month editor endpoint
- `PATCH /items/:id/active` — toggle `isActive`
- `DELETE /items/:id`
- `POST /items/:id/link-transaction` — body `{ transactionId }`. Overrides auto-detection.
- `DELETE /items/:id/link-transaction` — clears the link.

### Transactions — `/api/transactions`
- `GET /` — query `?category`, `?account`, `?search`. Joins `MerchantRule` and `CategoryRule` in-memory and returns each txn with computed `displayName` and `effectiveCategory` (null for split txns). The `category` filter uses `effectiveCategory`.
- `GET /categories` — proxies Category table names.
- `PATCH /:id` — body `{ category }` (legacy; writes raw `category`; unused by the UI).
- `PATCH /:id/category` — body `{ categoryOverride, applyToAll }`. **Rejects split txns with 400.** `applyToAll` upserts a CategoryRule and `updateMany`s non-split siblings.
- `PATCH /:id/merchant` — body `{ merchantOverride, applyToAll }`.
- `POST /:id/splits` — body `{ splits: [{ amount, category, note? }] }`. Sum must be within $0.01 of `abs(transaction.amount)`; ≥2 items. Replaces existing splits atomically.
- `DELETE /:id/splits` — clears all splits.

### Plaid — `/api/plaid`
- `POST /create-link-token` → `{ link_token }`
- `POST /create-link-token-update` — body `{ itemId }` → link token for Plaid Link update mode (reconnect a failed Item)
- `POST /exchange-token` — body `{ public_token, institution_name, accounts[] }` → exchanges, fetches balances + masks, upserts Accounts
- `POST /sync` — `transactionsSync` per Item using `PlaidItem.cursor`. Processes `added` (upsert), `modified` (upsert, override-preserving), `removed` (delete); persists `next_cursor` after the loop. Preloads Merchant + Category rule maps and applies them on create (split-aware), then refreshes balances. `{ added: N }`.
- `POST /refresh-balances` → `{ accounts, failed: [{ itemId, error_code }] }`. Per-item tolerant.
- `GET /balances` → `{ total, institutions: [...] }` — total is net worth (depository + investment minus credit + loan).
- `GET /accounts` — flat list of all Plaid accounts.
- `POST /disconnect-item` — body `{ itemId }` → best-effort `itemRemove` + clears local `accessToken`/`itemId` + deletes the `PlaidItem` row. Keeps Account row + history.

### Dashboard — `/api/dashboard`
- `GET /` — one-shot payload:
  - `spending: { thisMonth, lastMonth, percentChange }`, `income: { ... }` — computed in-memory from enriched transactions; respects `effectiveCategory`, `EXCLUDED_CATEGORIES`, and AppSetting description patterns. Splits use split amounts/categories.
  - `recentTransactions` — last 5 with account info.
  - `budgets` — current-month rollup rows, mirroring `/api/plan/rollup`. **These are derived rows: `id` is `null` on every row and `category` is `null` for the Uncategorized group.** Clients must not use `id` as a React key or assume `category` is a string.
  - `bills` — active planned items with status + payment detection + server-formatted `dueLabel`. Real UUID `id`s.
  - `topCategories` — top 5 spending categories this month with `amount` and `percent`. Null categories are skipped.

### Categories — `/api/categories`
- `GET /` — all categories sorted by name.
- `POST /` — body `{ name, color, type }` (409 on duplicate name).
- `PATCH /:id` — name changes cascade into `transaction.category`, `transactionSplit.category`, and `plannedItem.category` in one `$transaction`.
- `DELETE /:id` — body `{ reassignTo }` (category name). Updates all references then deletes.
- `POST /merge` — body `{ sourceId, targetId }`.

### Category rules — `/api/category-rules`
- `GET /`, `POST /` (upsert on description), `DELETE /:id`

### Merchant rules — `/api/merchant-rules`
- `GET /`, `POST /` (upsert on description), `DELETE /:id`

### Settings — `/api/settings`
- `GET /` — DB rows merged with defaults as `{ key: value }`.
- `POST /` — body `{ key, value }` upsert. `value` coerced to string.

## Environment variables

### Server (`server/.env`, gitignored; see `server/.env.example`)
- `DATABASE_URL` — Postgres connection string (use Railway's public proxy URL for local dev, e.g. `mainline.proxy.rlwy.net:53639`)
- `FRONTEND_URL` — exact origin allowed by CORS (no trailing slash). Must match the Vercel URL in production.
- `PORT` — default `3001`. Railway sets this automatically.
- `HOST` — interface to bind. Default `0.0.0.0` when `NODE_ENV=production`, `127.0.0.1` otherwise (keeps the dev server off the LAN). Override only to test from another device.
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (`sandbox | development | production`). Local is on `development`.
- `APP_PASSWORD` — single-user login password. Local value: `password` (throwaway). Production must set its own in Railway.

### Client (`client/.env`, gitignored; see `client/.env.example`)
- `VITE_API_URL` — backend base URL. Falls back to `http://localhost:3001` if the file is absent, so local dev works without it.

## Frontend pages

- **Login** (`/login`) — centered card, password field. Stores `auth_token` in localStorage. Axios interceptors attach the bearer and hard-redirect to `/login` on any 401.
- **Dashboard** (`/`) — 4 stat cards (Total balance from `/api/plaid/balances`, Spending, Income, Active bills), Budgets overview + Recent transactions row, Top spending categories + Upcoming items row. Budget rows link to `/plan`; upcoming items render the server's `dueLabel`.
- **Accounts** (`/accounts`) — accounts grouped by institution with Connect/Refresh. Full management UI also lives in Settings.
- **Transactions** (`/transactions`) — summary cards, filter bar (search, category, account) + "Show transfers" toggle, dual mobile/desktop rendering. Category badge opens the override modal; split txns show a split badge instead and don't open the popover. Merchant cell opens the merchant override modal. Scissors icon opens the split editor.
- **Plan** (`/plan`) — the unified budgets + bills page.
  - Index: month nav + one `CategoryCard` per category showing `spent of planned`, a bills/buffer breakdown, percent used, and remaining. The `null` category renders as **"Uncategorized"**.
  - `CategoryDetail` (`/plan/category/:category`) — drill-in table of that category's items. Each row has a caret expanding the transactions that count toward it for the visible month, a status pill, and an inline 12-month amounts editor. The Uncategorized group uses a sentinel path segment.
  - Modals: Add planned item, Detect items, Link payment.
- **Settings** (`/settings`) — Income & pay / Categories (add, rename inline, color, type, delete with reassignment, merge) / Merchant rules / Category rules / Transfer exclusion rules / Bill defaults / Connected accounts (Refresh + Reconnect via update mode + Disconnect).

Legacy routes `/budgets` and `/bills` `<Navigate>`-redirect to `/plan`.

Navigation:
- Desktop `Sidebar`: Dashboard / Accounts / Transactions / Plan, plus a gear at the bottom for Settings.
- Mobile `BottomNav`: Dashboard / Transactions / Plan / Accounts. `PageShell` renders a gear top-right linking to `/settings`.

## Migration history

Applied in `server/prisma/migrations/` (ordered):

1. `20260423001749_init` — Account, Transaction, Budget, Bill
2. `20260423232520_drop_bill_category` — dropped `Bill.category`
3. `20260424003600_add_bill_budget_category` — `Bill.budgetCategory`
4. `20260424010023_add_transaction_splits` — TransactionSplit
5. `20260424011836_add_bill_payment_window` — `Bill.paymentWindowDays`
6. `20260424015013_enhance_plaid_data` — Account balance fields, Transaction merchant/logo/pending
7. `20260424030843_add_bill_match_keyword` — `Bill.matchKeyword` + `Bill.linkedTransactionId`
8. `20260424033509_add_settings` — Category, AppSetting
9. `20260424144349_add_merchant_rules` — MerchantRule + `Transaction.merchantOverride`
10. `20260424213405_add_category_rules` — CategoryRule + `Transaction.categoryOverride`
11. `20260424220000_add_plaid_item_cursor` — PlaidItem
12. `20260425003000_add_bill_frequency_and_budget_discretionary` — `Bill.frequency`, `Bill.monthlyAmounts`, `Budget.discretionary`; backfilled existing rows
13. `20260428210000_add_planned_item` — PlannedItem, added additively alongside Bill/Budget
14. `20260428220000_drop_budget_and_bill` — dropped both legacy tables after the data migration verified

Railway's Start Command is `npx prisma migrate deploy && node src/index.js`, so each deploy auto-applies pending migrations.

## Migration / one-shot scripts (`server/src/scripts/`)

Run with `cd server && node src/scripts/<name>.js`. All read `DATABASE_URL` from `.env`.

**Live:**
- **`seedCategories.js`** — upserts `Category` rows from distinct `Transaction.category` values. Type rule: `Income → income`, `Transfer In/Out → transfer`, else `expense`. Color hashed from the name.
- **`recategorizeTransferDescriptions.js`** — seeds hardcoded `{pattern → category}` mappings (SoFi Round Ups etc.) and updates matching transactions.
- **`applyCategoryRules.js`** — seeds a hardcoded rule list into `CategoryRule` and applies it to matching non-split transactions.

**Dead — do not run:**
- **`backfillMatchKeyword.js`** and **`normalizeCategories.js`** both call `prisma.bill` / `prisma.budget`, which no longer exist. They will throw immediately. They survived the `d2f1d81` cleanup by oversight and should be deleted or ported.

The PlannedItem data-migration scripts (`migratePlannedItems.js`, `verifyPlanMigration.js`) were removed in `d2f1d81` after the migration was applied and verified against production.

## Recent changes (most recent first)

- **Dashboard derived-row fixes** (`727c65f`) — the Plan refactor made `/api/dashboard` return rollup rows with `id: null` on every row and `category: null` for the uncategorized group. `key={b.id}` gave all rows the identical React key (duplicate-key warning, possible row duplication/omission); `formatCategory(budget.category)` rendered a blank label. Both guarded. `6e96abd` had fixed the Plan page but missed this widget.
- **Plan unification** (`61fbc5e` → `b624ac9`) — replaced `Bill` + `Budget` with a single `PlannedItem`; collapsed `/budgets` and `/bills` into the `/plan` tree; `billStatus.js` → `itemStatus.js` with `one_time` support; new `/api/plan` routes replacing `/api/budgets` and `/api/bills`; shared `Modal`, `format`, and `CategoryCombobox` extracted; sidebar 5 → 4 tabs; per-item transaction drill-in.
- **Bill frequency + per-month amounts** (`92adcf9`) — introduced `monthlyAmounts[12]` as the source of truth for cost, `frequency` to drive the entry UI, and budgets computed as linked-items total + discretionary buffer. The foundation the Plan unification built on.
- **Pending-issues sweep** (`c7a7f50`) — Prisma 5.22 → 6.19.3; Plaid cursor persistence via `PlaidItem` with `modified`/`removed` handling; bill matcher tightened to whole-word token matching; Vitest suites added to both packages; dev server bound to `127.0.0.1` by default.
- **Category override system** (`addd6c0`) — `CategoryRule` + `Transaction.categoryOverride` + server-computed `effectiveCategory`. Split transactions guarded everywhere.
- **Merchant override system** (`11558d5`) — same shape for merchant display name; `displayName` precedence `merchantOverride > rule > merchantName > description`.
- **Settings system** (`bc7b76e`) — Category + AppSetting models, the Settings page, category management with cascade, editable exclusion patterns.

## Known issues / pending items

- **Two dead scripts** — `backfillMatchKeyword.js` and `normalizeCategories.js` reference the dropped `Bill`/`Budget` tables and will throw. Delete or port them.
- **`npm audit` — triaged, remainder deliberately deferred.** `npm audit fix` (non-breaking) was applied in `658e3ab`, taking the server 13 → 5 and the client 13 → 7. What's left needs breaking majors for no production benefit:
  - **`vitest` / `vite` / `vite-node` / `@vitest/mocker` / `esbuild`** — the dev toolchain, and the source of both "critical" headline counts. `vitest` is a devDependency that never ships, and the `esbuild` advisory is about its dev server being reachable from a browser. Clearing them needs vitest 3 → 4 and vite 5 → 8. Take it on when upgrading the toolchain for its own sake, not for this.
  - **`react-router` / `react-router-dom`** (client, moderate) — the open-redirect advisory GHSA-2j2x-hqr9-3h42 lives in `@remix-run/router`, which is now at `1.23.3`, outside the stated vulnerable range `1.3.0 - 1.23.2`. npm still flags the wrapper packages because the advisory lists `react-router-dom <= 7.17.0` and treats only `7.18+` as clean — which from `^6.28.0` is a React Router 6 → 7 migration.
- **Prisma 7 upgrade deferred** — currently `^6.19.3`. Prisma 7 removed `url` from `schema.prisma`; connection URLs move to `prisma.config.ts` and `PrismaClient` requires a driver adapter (`@prisma/adapter-pg` + `pg`). That touches every `new PrismaClient()` site. Stay on 6.x until a feature demands otherwise.
- **Test coverage limited to pure helpers** — 110 tests across both packages, all unit tests on pure money/aggregation logic. No DB-backed integration tests, HTTP endpoint tests, or React component tests.
- **Legacy scalar fields still present** — `PlannedItem.amount` is derived from `max(monthlyAmounts)` and exists only for payment-window matching. It is not a total and must not be summed.
- **Local `.env` uses password `password`** — explicit throwaway. The dev server binds `127.0.0.1` only; if you ever set `HOST=0.0.0.0`, change `APP_PASSWORD` first.

## Operational notes

A few behaviors that aren't bugs but are easy to forget:

- After adding a new Plaid institution via `exchange-token` on production, run `POST /api/plaid/sync` once to pull transactions. Existing rules apply automatically.
- After adding a category or merchant rule, existing transactions stay untouched — the rule only auto-applies to newly synced transactions. To apply retroactively, use `applyToAll: true` on a `PATCH /:id/category` (or `/merchant`) call from the UI.
- A category disappears from the Plan page when no active item contributes a non-zero amount that month. That's intended: an annual bill only shows up in the month it lands.
- Both Vercel and Railway deploy on every push to `main`. There is no staging environment.
