import { Link } from 'react-router-dom';
import formatCategory from '../../../lib/formatCategory.js';
import { currencyFormatter } from '../../../lib/format.js';

export default function CategoryCard({ row }) {
  const total = row.planned ?? 0;
  const spent = row.spent ?? 0;
  const pct = total > 0 ? (spent / total) * 100 : 0;
  const remaining = total - spent;
  const over = remaining < 0;
  const barColor =
    pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  const href = `/plan/category/${encodeURIComponent(row.category ?? '')}`;

  return (
    <Link
      to={href}
      className="block rounded-lg border border-surface-600/60 bg-surface-800 p-5 transition-colors hover:bg-surface-800/80"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="font-medium text-slate-100">{formatCategory(row.category)}</div>
      </div>

      <div className="mb-3">
        <div className="text-sm text-slate-400">
          <span className="text-slate-100">{currencyFormatter.format(spent)}</span>
          <span className="text-slate-500"> of </span>
          <span className="text-slate-200">{currencyFormatter.format(total)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2 text-xs text-slate-500">
          {row.billsTotal > 0 && (
            <span>
              {currencyFormatter.format(row.billsTotal)}{' '}
              <span className="text-slate-600">(bills)</span>
            </span>
          )}
          {row.discretionaryTotal > 0 && (
            <span>
              {currencyFormatter.format(row.discretionaryTotal)}{' '}
              <span className="text-slate-600">(buffer)</span>
            </span>
          )}
          {row.oneTimeTotal > 0 && (
            <span>
              {currencyFormatter.format(row.oneTimeTotal)}{' '}
              <span className="text-slate-600">(one-time)</span>
            </span>
          )}
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-600/50">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between text-xs">
        <span className="text-slate-500">{Math.round(pct)}% used</span>
        <span className={over ? 'font-medium text-red-400' : 'text-slate-400'}>
          {over
            ? `${currencyFormatter.format(Math.abs(remaining))} over`
            : `${currencyFormatter.format(remaining)} left`}
        </span>
      </div>
    </Link>
  );
}
