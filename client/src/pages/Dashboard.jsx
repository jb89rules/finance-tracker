import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import formatCategory from '../lib/formatCategory.js';
import PageShell from '../components/PageShell.jsx';
import {
  currencyFormatter,
  formatShortDate,
  ordinal,
  dueText,
} from '../lib/format.js';

const BILL_STATUS_STYLES = {
  upcoming: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  'due-soon': { dot: 'bg-amber-500', text: 'text-amber-400' },
  overdue: { dot: 'bg-red-500', text: 'text-red-400' },
};

function PercentChangeBadge({ value, mode }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-slate-500">— vs last month</span>;
  }
  const rounded = Math.abs(value).toFixed(1);
  const up = value > 0;
  const good = mode === 'spending' ? !up : up;
  const color = good ? 'text-emerald-400' : 'text-red-400';
  const arrow = up ? '↑' : value < 0 ? '↓' : '·';
  return (
    <span className="text-xs text-slate-500">
      <span className={`mr-1 font-medium ${color}`}>
        {arrow} {rounded}%
      </span>
      vs last month
    </span>
  );
}

function StatCard({ label, value, valueColor = 'text-slate-100', change }) {
  return (
    <div className="rounded-lg border border-surface-600/60 bg-surface-800 px-5 py-4 transition-colors hover:bg-surface-800/80">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</div>
      {change && <div className="mt-1">{change}</div>}
    </div>
  );
}

function SectionCard({ title, viewAll, children }) {
  return (
    <div className="rounded-lg border border-surface-600/60 bg-surface-800 p-5 transition-colors hover:bg-surface-800/80">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        {viewAll && (
          <Link
            to={viewAll}
            className="text-xs font-medium text-accent-400 transition-colors hover:text-accent-500"
          >
            View all →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function BudgetRow({ budget }) {
  const pct = budget.limit > 0 ? (budget.spent / budget.limit) * 100 : 0;
  const color =
    pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="border-b border-surface-600/60 py-2.5 last:border-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="truncate text-sm text-slate-200">{formatCategory(budget.category)}</div>
        <div className="shrink-0 text-xs text-slate-400 tabular-nums">
          {currencyFormatter.format(budget.spent)}
          <span className="text-slate-500"> / {currencyFormatter.format(budget.limit)}</span>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-600/50">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function TransactionRow({ txn }) {
  const negative = txn.amount < 0;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-600/60 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-100">{txn.description}</div>
        <div className="text-xs text-slate-500">
          {formatShortDate(txn.date)}
          {txn.account ? ` · ${txn.account.name}` : ''}
        </div>
      </div>
      <div
        className={`shrink-0 text-sm font-medium tabular-nums ${
          negative ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {currencyFormatter.format(-txn.amount)}
      </div>
    </div>
  );
}

function CategoryRow({ item }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="truncate text-sm text-slate-200">{formatCategory(item.category)}</div>
        <div className="shrink-0 text-xs tabular-nums text-slate-400">
          {currencyFormatter.format(item.amount)}
          <span className="ml-1 text-slate-500">
            · {Math.round(item.percent)}%
          </span>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-600/50">
        <div
          className="h-full bg-accent-500 transition-all duration-300"
          style={{ width: `${Math.min(item.percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function BillSoonRow({ bill }) {
  const style = BILL_STATUS_STYLES[bill.status] || BILL_STATUS_STYLES.upcoming;
  return (
    <div className="flex items-center gap-3 border-b border-surface-600/60 py-2.5 last:border-0">
      <div className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-100">{bill.name}</div>
        <div className="text-xs text-slate-500">Due on the {ordinal(bill.dueDay)}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-medium tabular-nums text-slate-100">
          {currencyFormatter.format(bill.amount)}
        </div>
        <div className={`text-xs font-medium ${style.text}`}>{dueText(bill)}</div>
      </div>
    </div>
  );
}

function EmptyLine({ children }) {
  return <div className="py-3 text-center text-xs text-slate-500">{children}</div>;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [balances, setBalances] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/api/dashboard')
      .then((r) => setData(r.data))
      .catch(() => setError('Failed to load dashboard'));
    api
      .get('/api/plaid/balances')
      .then((r) => setBalances(r.data))
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  const billsSummary = useMemo(() => {
    if (!data) return { count: 0, total: 0 };
    return {
      count: data.bills.length,
      total: data.bills.reduce((s, b) => s + b.amount, 0),
    };
  }, [data]);

  const billsDueSoon = useMemo(() => {
    if (!data) return [];
    return data.bills
      .filter(
        (b) =>
          b.status !== 'paid' &&
          (b.status === 'overdue' || b.daysUntilDue <= 14)
      )
      .slice(0, 5);
  }, [data]);

  if (error) {
    return (
      <PageShell title="Dashboard" bare>
        <div className="rounded-md border border-red-700/50 bg-red-900/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell title="Dashboard" bare>
        <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Dashboard" subtitle="Overview of your finances" bare>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total balance"
          value={
            balances
              ? currencyFormatter.format(balances.total)
              : currencyFormatter.format(0)
          }
          valueColor={
            balances && balances.total < 0 ? 'text-red-400' : 'text-slate-100'
          }
        />
        <StatCard
          label="Spending this month"
          value={currencyFormatter.format(data.spending.thisMonth)}
          valueColor="text-red-400"
          change={
            <PercentChangeBadge value={data.spending.percentChange} mode="spending" />
          }
        />
        <StatCard
          label="Income this month"
          value={currencyFormatter.format(data.income.thisMonth)}
          valueColor="text-emerald-400"
          change={
            <PercentChangeBadge value={data.income.percentChange} mode="income" />
          }
        />
        <StatCard
          label="Active bills"
          value={
            <>
              {billsSummary.count}
              <span className="ml-2 text-base font-normal text-slate-400">
                · {currencyFormatter.format(billsSummary.total)}
              </span>
            </>
          }
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Budgets" viewAll="/budgets">
          {data.budgets.length === 0 ? (
            <EmptyLine>No budgets for this month yet.</EmptyLine>
          ) : (
            <div>
              {data.budgets.slice(0, 5).map((b) => (
                <BudgetRow key={b.id} budget={b} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent transactions" viewAll="/transactions">
          {data.recentTransactions.length === 0 ? (
            <EmptyLine>No transactions yet.</EmptyLine>
          ) : (
            <div>
              {data.recentTransactions.map((t) => (
                <TransactionRow key={t.id} txn={t} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Top spending categories">
          {data.topCategories.length === 0 ? (
            <EmptyLine>No spending this month.</EmptyLine>
          ) : (
            <div className="space-y-3">
              {data.topCategories.map((c) => (
                <CategoryRow key={c.category} item={c} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Bills due soon" viewAll="/bills">
          {billsDueSoon.length === 0 ? (
            <EmptyLine>No bills due in the next 14 days.</EmptyLine>
          ) : (
            <div>
              {billsDueSoon.map((b) => (
                <BillSoonRow key={b.id} bill={b} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}
