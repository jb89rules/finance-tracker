import { useState } from 'react';
import { currencyFormatter, formatShortDate, dueText } from '../../../lib/format.js';
import StatusPill from './StatusPill.jsx';
import MonthlyAmountsEditor from './MonthlyAmountsEditor.jsx';
import PlanItemTransactions from './PlanItemTransactions.jsx';

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CaretIcon({ open }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function PlanItemRow({
  item,
  month,
  year,
  onItemUpdated,
  onEdit,
  onDelete,
  onLinkPayment,
  onUnlinkPayment,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [txnsOpen, setTxnsOpen] = useState(false);
  const dimmed = !item.isActive ? 'opacity-50' : item.status === 'paid' ? 'opacity-75' : '';
  const isRecurring = item.kind === 'recurring';

  const timing = item.dueLabel
    ? `Due ${item.dueLabel}`
    : item.kind === 'one_time'
      ? 'One-time'
      : 'Spread across month';

  const handleSavedFromEditor = (updated) => {
    setEditorOpen(false);
    onItemUpdated(updated);
  };

  return (
    <div className={`border-b border-surface-600/60 last:border-0 ${dimmed}`}>
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 md:grid-cols-[auto_2fr_1fr_1fr_1fr_auto]">
        <button
          type="button"
          onClick={() => setTxnsOpen((o) => !o)}
          title={txnsOpen ? 'Hide transactions' : 'Show contributing transactions'}
          className="rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-slate-200"
        >
          <CaretIcon open={txnsOpen} />
        </button>

        <div className="min-w-0">
          <div className="truncate font-medium text-slate-100">{item.name}</div>
          {item.matchKeyword && item.matchKeyword !== item.name && (
            <div className="truncate text-xs text-slate-500">{item.matchKeyword}</div>
          )}
        </div>

        <div className="hidden text-sm text-slate-300 md:block">{timing}</div>

        <div className="hidden md:block">
          {item.status === 'paid' ? (
            <div className="text-xs">
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-medium text-emerald-400">
                Paid
              </span>
              {item.paidDate && (
                <div className="mt-0.5 text-slate-500">{formatShortDate(item.paidDate)}</div>
              )}
            </div>
          ) : item.status ? (
            <div>
              <StatusPill status={item.status} />
              <div className="mt-0.5 text-xs text-slate-500">{dueText(item)}</div>
            </div>
          ) : (
            <span className="text-xs text-slate-500">—</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => isRecurring && setEditorOpen((e) => !e)}
          disabled={!isRecurring}
          title={isRecurring ? 'Edit per-month amounts' : null}
          className={`text-right font-medium tabular-nums ${
            isRecurring ? 'cursor-pointer text-accent-400 hover:text-accent-300' : 'text-slate-100'
          }`}
        >
          {currencyFormatter.format(item.amountForMonth ?? item.amount)}
        </button>

        <div className="flex items-center gap-1">
          {item.status && item.status !== 'paid' && (
            <button
              type="button"
              onClick={onLinkPayment}
              title="Link payment"
              className="hidden rounded p-1 text-xs text-accent-400 hover:bg-surface-700 md:inline-block"
            >
              Link
            </button>
          )}
          {item.linkedTransactionId && (
            <button
              type="button"
              onClick={onUnlinkPayment}
              title="Unlink payment"
              className="hidden rounded p-1 text-xs text-slate-500 hover:bg-surface-700 md:inline-block"
            >
              Unlink
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            title="Edit"
            className="rounded p-1 text-slate-500 hover:bg-surface-700 hover:text-slate-200"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="rounded p-1 text-slate-500 hover:bg-surface-700 hover:text-red-400"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 text-xs text-slate-500 md:hidden">
        <span>{timing}</span>
        {item.status && (
          <span className="ml-2">
            <StatusPill status={item.status} />
          </span>
        )}
        {item.status && item.status !== 'paid' && (
          <span className="ml-2">{dueText(item)}</span>
        )}
      </div>

      <PlanItemTransactions
        item={item}
        month={month}
        year={year}
        expanded={txnsOpen}
      />

      {editorOpen && isRecurring && (
        <MonthlyAmountsEditor
          item={item}
          onSaved={handleSavedFromEditor}
          onCancel={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
