import { useEffect, useState } from 'react';
import api from '../lib/api.js';
import formatCategory from '../lib/formatCategory.js';
import PageShell from '../components/PageShell.jsx';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const SOURCE_LABELS = {
  budget: 'budget',
  'standing-budget': 'standing budget',
  avg: '3-mo avg',
  none: '—',
};

const SOURCE_COLORS = {
  budget: 'bg-accent-500/20 text-accent-300',
  'standing-budget': 'bg-amber-500/20 text-amber-300',
  avg: 'bg-slate-500/20 text-slate-300',
  none: 'bg-slate-700/40 text-slate-500',
};

function StatCard({ label, value, valueColor = 'text-slate-100' }) {
  return (
    <div className="rounded-lg border border-surface-600/60 bg-surface-800 px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}

function SourceBadge({ source }) {
  const cls = SOURCE_COLORS[source] || SOURCE_COLORS.none;
  return (
    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

function MonthCard({ month, expanded, onToggle }) {
  const netColor = month.net >= 0 ? 'text-emerald-400' : 'text-red-400';
  const netBarColor = month.net >= 0 ? 'bg-emerald-500' : 'bg-red-500';
  const monthLabel = `${MONTH_NAMES[month.month - 1]} ${month.year}`;

  return (
    <div className="rounded-lg border border-surface-600/60 bg-surface-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-800/80 md:px-5"
      >
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-slate-100">{monthLabel}</div>
          <div className="text-xs text-slate-500">
            {month.paycheckCount} paycheck{month.paycheckCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Net</div>
            <div className={`text-sm font-semibold tabular-nums ${netColor}`}>
              {currencyFormatter.format(month.net)}
            </div>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      <div className="px-4 pb-2 md:px-5">
        <div className="h-1 overflow-hidden rounded-full bg-surface-600/50">
          <div
            className={`h-full ${netBarColor}`}
            style={{
              width: `${Math.min(Math.abs(month.net) / Math.max(month.income, 1) * 100, 100)}%`,
            }}
          />
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-surface-600/60 px-4 py-4 md:px-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Income</div>
              <div className="text-sm font-medium tabular-nums text-emerald-400">
                {currencyFormatter.format(month.income)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Bills</div>
              <div className="text-sm font-medium tabular-nums text-red-400">
                {currencyFormatter.format(month.billsTotal)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Spending</div>
              <div className="text-sm font-medium tabular-nums text-red-400">
                {currencyFormatter.format(month.spending.total)}
              </div>
            </div>
          </div>

          {month.bills.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Bills
              </div>
              <div className="rounded-md border border-surface-600/60">
                {month.bills.map((b, i) => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                      i > 0 ? 'border-t border-surface-600/60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-200">{b.name}</div>
                      <div className="text-xs text-slate-500">
                        Due {new Date(b.dueDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-medium tabular-nums text-slate-100">
                      {currencyFormatter.format(b.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {month.spending.byCategory.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Spending by category
              </div>
              <div className="rounded-md border border-surface-600/60">
                {month.spending.byCategory.map((c, i) => (
                  <div
                    key={c.category}
                    className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                      i > 0 ? 'border-t border-surface-600/60' : ''
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center">
                      <span className="truncate text-slate-200">
                        {formatCategory(c.category)}
                      </span>
                      <SourceBadge source={c.source} />
                    </div>
                    <div className="shrink-0 text-sm font-medium tabular-nums text-slate-100">
                      {currencyFormatter.format(c.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Projection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    api
      .get('/api/projection?months=12')
      .then((r) => setData(r.data))
      .catch(() => setError('Failed to load projection'));
  }, []);

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (error) {
    return (
      <PageShell title="Projection" bare>
        <div className="rounded-md border border-red-700/50 bg-red-900/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell title="Projection" bare>
        <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
      </PageShell>
    );
  }

  const subtitle =
    data.meta.lastPayDate
      ? `Next ${data.meta.monthsCount} months · paycheck $${data.meta.paycheckAmount.toLocaleString()} ${data.meta.payFrequency}`
      : `Next ${data.meta.monthsCount} months · set lastPayDate in Settings to project income`;

  return (
    <PageShell title="Projection" subtitle={subtitle} bare>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total income"
          value={currencyFormatter.format(data.summary.totalIncome)}
          valueColor="text-emerald-400"
        />
        <StatCard
          label="Total bills"
          value={currencyFormatter.format(data.summary.totalBills)}
          valueColor="text-red-400"
        />
        <StatCard
          label="Total spending"
          value={currencyFormatter.format(data.summary.totalSpending)}
          valueColor="text-red-400"
        />
        <StatCard
          label="Net"
          value={currencyFormatter.format(data.summary.totalNet)}
          valueColor={data.summary.totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>

      <div className="space-y-2">
        {data.months.map((m) => {
          const key = `${m.year}-${m.month}`;
          return (
            <MonthCard
              key={key}
              month={m}
              expanded={expanded.has(key)}
              onToggle={() => toggle(key)}
            />
          );
        })}
      </div>
    </PageShell>
  );
}
