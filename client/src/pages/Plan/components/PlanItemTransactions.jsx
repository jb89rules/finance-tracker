import { currencyFormatter, formatShortDate } from '../../../lib/format.js';
import usePlanItemTransactions from '../hooks/usePlanItemTransactions.js';

export default function PlanItemTransactions({ item, month, year, expanded }) {
  const { transactions, loading, error } = usePlanItemTransactions(
    item.id,
    month,
    year,
    expanded
  );

  if (!expanded) return null;

  const total = transactions.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="border-t border-surface-600/60 bg-surface-700/30 px-4 py-3">
      {loading ? (
        <div className="py-2 text-center text-xs text-slate-500">Loading…</div>
      ) : error ? (
        <div className="rounded-md border border-red-700/50 bg-red-900/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : transactions.length === 0 ? (
        <div className="py-2 text-center text-xs text-slate-500">
          {item.kind === 'one_time' || item.dueDay
            ? 'No matching payment found yet for this month.'
            : 'No transactions in this category yet for this month.'}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-baseline justify-between text-xs">
            <span className="uppercase tracking-wide text-slate-500">
              {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
            </span>
            <span className="font-medium tabular-nums text-slate-200">
              {currencyFormatter.format(total)}
            </span>
          </div>
          <ul className="divide-y divide-surface-600/40">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200">
                    {t.merchantName || t.description}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatShortDate(t.date)}
                    {t.account ? ` · ${t.account.name}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-medium tabular-nums text-slate-100">
                  {currencyFormatter.format(t.amount)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
