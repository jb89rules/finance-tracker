import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api.js';
import formatCategory from '../lib/formatCategory.js';
import PageShell from '../components/PageShell.jsx';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function dueText(bill) {
  if (bill.status === 'overdue') {
    const n = bill.daysOverdue ?? 0;
    return `${n} day${n === 1 ? '' : 's'} overdue`;
  }
  if (bill.daysUntilDue === 0) return 'due today';
  if (bill.daysUntilDue === 1) return 'in 1 day';
  return `in ${bill.daysUntilDue} days`;
}

const STATUS_STYLES = {
  upcoming: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  'due-soon': { dot: 'bg-amber-500', text: 'text-amber-400' },
  overdue: { dot: 'bg-red-500', text: 'text-red-400' },
  paid: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
};

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function PencilIcon() {
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
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
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
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function Toggle({ value, onChange, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      title={title}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        value ? 'bg-accent-500' : 'bg-surface-600'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          value ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function BillRow({ bill, onToggleActive, onEdit, onDelete }) {
  const style = STATUS_STYLES[bill.status] || STATUS_STYLES.upcoming;
  const isPaid = bill.status === 'paid';
  const opacityClass = !bill.isActive ? 'opacity-50' : isPaid ? 'opacity-75' : '';

  const actions = (
    <div className="flex items-center shrink-0" style={{ gap: '20px', minWidth: '140px' }}>
      <Toggle
        value={bill.isActive}
        onChange={(next) => onToggleActive(next)}
        title={bill.isActive ? 'Active' : 'Inactive'}
      />
      <button
        type="button"
        onClick={onEdit}
        title="Edit bill"
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-slate-200"
      >
        <PencilIcon />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete bill"
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-red-400"
      >
        <TrashIcon />
      </button>
    </div>
  );

  return (
    <div
      className={`border-b border-surface-600/60 last:border-0 ${opacityClass}`}
    >
      <div className="flex flex-col gap-2 px-4 py-3 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
            <div className="truncate font-medium text-slate-100">{bill.name}</div>
          </div>
          <div className="shrink-0 text-sm font-medium tabular-nums text-slate-100">
            {currencyFormatter.format(bill.amount)}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs">
            {isPaid ? (
              <>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  Paid
                </span>
                {bill.paidDate && (
                  <span className="ml-2 text-slate-500">
                    Paid {formatShortDate(bill.paidDate)}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-slate-500">Due {ordinal(bill.dueDay)}</span>
                <span className={`ml-2 font-medium ${style.text}`}>{dueText(bill)}</span>
              </>
            )}
            {bill.category && (
              <span className="ml-2 rounded-full bg-surface-600 px-2 py-0.5 text-xs font-medium text-slate-300">
                {formatCategory(bill.category)}
              </span>
            )}
            {bill.budgetCategory && (
              <span className="ml-1 text-xs text-slate-500">
                → {formatCategory(bill.budgetCategory)}
              </span>
            )}
          </div>
          {actions}
        </div>
      </div>

      <div className="hidden items-center gap-4 px-4 py-3 md:flex">
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 truncate font-medium text-slate-100">{bill.name}</div>
          {bill.category && (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-600 px-2 py-0.5 text-xs font-medium text-slate-300">
              {formatCategory(bill.category)}
            </span>
          )}
          {bill.budgetCategory && (
            <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
              → {formatCategory(bill.budgetCategory)}
            </span>
          )}
        </div>
        <div className="shrink-0 whitespace-nowrap text-right font-medium tabular-nums text-slate-100">
          {currencyFormatter.format(bill.amount)}
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          {isPaid ? (
            <>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                Paid
              </span>
              {bill.paidDate && (
                <div className="mt-1 text-xs text-slate-500">
                  Paid {formatShortDate(bill.paidDate)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs text-slate-500">Due on the {ordinal(bill.dueDay)}</div>
              <div className={`text-xs font-medium ${style.text}`}>{dueText(bill)}</div>
            </>
          )}
        </div>
        {actions}
      </div>
    </div>
  );
}

function BillFormModal({ initial, categories, onSubmit, onClose }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(
    initial?.amount !== undefined ? String(initial.amount) : ''
  );
  const [dueDay, setDueDay] = useState(
    initial?.dueDay !== undefined ? String(initial.dueDay) : ''
  );
  const [category, setCategory] = useState(initial?.category ?? '');
  const [budgetCategory, setBudgetCategory] = useState(initial?.budgetCategory ?? '');
  const [budgetCategoryTouched, setBudgetCategoryTouched] = useState(
    Boolean(initial?.budgetCategory)
  );
  const [paymentWindowDays, setPaymentWindowDays] = useState(
    initial?.paymentWindowDays !== undefined ? String(initial.paymentWindowDays) : '3'
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const suggestBudgetCategory = (billName, fallback) => {
    const lower = billName.toLowerCase();
    const has = (term) => lower.includes(term);
    if (
      has('netflix') || has('spotify') || has('hulu') ||
      has('disney') || has('apple') || has('amazon prime')
    ) return 'Entertainment';
    if (
      has('electric') || has('gas') || has('water') ||
      has('internet') || has('phone') || has('utility')
    ) return 'Utilities';
    if (has('insurance')) return 'Insurance';
    if (has('loan') || has('payment') || has('mortgage')) return 'Loan Payments';
    if (has('gym') || has('fitness')) return 'Personal Care';
    return fallback || '';
  };

  const handleNameChange = (e) => {
    const next = e.target.value;
    setName(next);
    if (!budgetCategoryTouched) {
      setBudgetCategory(suggestBudgetCategory(next, category));
    }
  };

  const handleCategoryChange = (e) => {
    const next = e.target.value;
    setCategory(next);
    if (!budgetCategoryTouched) {
      setBudgetCategory(suggestBudgetCategory(name, next));
    }
  };

  const handleBudgetCategoryChange = (e) => {
    setBudgetCategory(e.target.value);
    setBudgetCategoryTouched(true);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amountNum = Number.parseFloat(amount);
    const dayNum = Number.parseInt(dueDay, 10);
    const windowNum = Number.parseInt(paymentWindowDays, 10);

    if (!name.trim()) return setError('Name is required');
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      return setError('Amount must be 0 or greater');
    }
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
      return setError('Due day must be 1-31');
    }
    if (!Number.isInteger(windowNum) || windowNum < 1 || windowNum > 14) {
      return setError('Payment window must be 1-14 days');
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        amount: amountNum,
        dueDay: dayNum,
        category: category.trim() || null,
        budgetCategory: budgetCategory.trim() || null,
        paymentWindowDays: windowNum,
        isActive,
      });
    } catch (err) {
      setError('Failed to save bill');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-surface-600/60 bg-surface-800 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 text-lg font-semibold text-slate-100">
          {initial ? 'Edit Bill' : 'Add Bill'}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Netflix"
              className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="15.99"
                className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                Due day
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="15"
                className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Payment detection window
            </label>
            <input
              type="number"
              min="1"
              max="14"
              value={paymentWindowDays}
              onChange={(e) => setPaymentWindowDays(e.target.value)}
              placeholder="3"
              className="w-24 rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Days before/after due date to look for a matching payment
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Category
            </label>
            <input
              list="bill-categories"
              value={category}
              onChange={handleCategoryChange}
              placeholder="Type or select a category"
              className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
            />
            <datalist id="bill-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Budget Category
            </label>
            <input
              list="bill-budget-categories"
              value={budgetCategory}
              onChange={handleBudgetCategoryChange}
              placeholder="Select or type a budget category"
              className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
            />
            <datalist id="bill-budget-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-slate-500">
              Transactions in this category will count toward this budget
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md bg-surface-700/50 px-3 py-2">
            <div className="text-sm text-slate-300">Active</div>
            <Toggle value={isActive} onChange={setIsActive} />
          </div>

          {error && (
            <div className="rounded-md border border-red-700/50 bg-red-900/40 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : initial ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetectBillsModal({ onClose, onAddSelected }) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/bills/detect');
        setSuggestions(data);
        setSelected(new Set(data.map((_, i) => i)));
      } catch (e) {
        setError('Failed to detect bills');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (i) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      const picks = [...selected].map((i) => suggestions[i]);
      await onAddSelected(picks);
    } catch (e) {
      setError('Failed to add bills');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-surface-600/60 bg-surface-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-surface-600/60 p-6">
          <div className="text-lg font-semibold text-slate-100">Detect Bills</div>
          <div className="mt-1 text-sm text-slate-500">
            Recurring charges found in the last 90 days of transactions
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Scanning…</div>
          ) : error ? (
            <div className="rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No recurring charges detected. Try again after more transactions have
              synced.
            </div>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s, i) => (
                <li key={`${s.name}-${i}`}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-700">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggle(i)}
                      className="h-4 w-4 rounded border-surface-500 bg-surface-700 text-accent-500 focus:ring-accent-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-100">{s.name}</div>
                      <div className="text-xs text-slate-500">
                        {s.category ? formatCategory(s.category) : 'Uncategorized'} · Due on the {ordinal(s.dueDay)}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-medium tabular-nums text-slate-200">
                      {currencyFormatter.format(s.amount)}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-surface-600/60 p-4">
          <div className="text-xs text-slate-500">
            {selected.size} of {suggestions.length} selected
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || selected.size === 0}
              className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add Selected (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [formState, setFormState] = useState(null);
  const [detectOpen, setDetectOpen] = useState(false);
  const [error, setError] = useState(null);

  const loadBills = useCallback(async () => {
    try {
      const { data } = await api.get('/api/bills');
      setBills(data);
    } catch (e) {
      setError('Failed to load bills');
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/api/transactions/categories');
      setCategories(data);
    } catch (e) {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadBills();
    loadCategories();
  }, [loadBills, loadCategories]);

  const summary = useMemo(() => {
    const active = bills.filter((b) => b.isActive);
    const monthly = active.reduce((s, b) => s + b.amount, 0);
    const dueThisWeek = active.filter(
      (b) => b.status !== 'paid' && (b.status === 'due-soon' || b.status === 'overdue')
    ).length;
    const now = new Date();
    const paidThisMonth = active.filter((b) => {
      if (b.status !== 'paid' || !b.paidDate) return false;
      const d = new Date(b.paidDate);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    return { monthly, dueThisWeek, paidThisMonth, activeCount: active.length };
  }, [bills]);

  const handleCreate = async (payload) => {
    await api.post('/api/bills', payload);
    setFormState(null);
    await loadBills();
  };

  const handleUpdate = async (id, payload) => {
    await api.patch(`/api/bills/${id}`, payload);
    setFormState(null);
    await loadBills();
  };

  const handleToggleActive = async (id, isActive) => {
    try {
      const { data } = await api.patch(`/api/bills/${id}`, { isActive });
      setBills((prev) => prev.map((b) => (b.id === id ? data : b)));
    } catch (e) {
      setError('Failed to update bill');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/bills/${id}`);
      setBills((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError('Failed to delete bill');
    }
  };

  const handleAddDetected = async (picks) => {
    for (const p of picks) {
      await api.post('/api/bills', {
        name: p.name,
        amount: p.amount,
        dueDay: p.dueDay,
        category: p.category || null,
        isActive: true,
      });
    }
    setDetectOpen(false);
    await loadBills();
  };

  const headerActions = (
    <div className="flex gap-2">
      <button
        onClick={() => setDetectOpen(true)}
        className="rounded-md border border-surface-600/60 bg-surface-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-surface-600"
      >
        Detect Bills
      </button>
      <button
        onClick={() => setFormState({ mode: 'add' })}
        className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
      >
        Add Bill
      </button>
    </div>
  );

  const summaryCards = [
    {
      label: 'Monthly total',
      value: currencyFormatter.format(summary.monthly),
      color: 'text-slate-100',
    },
    {
      label: 'Due this week',
      value: String(summary.dueThisWeek),
      color: 'text-amber-400',
    },
    {
      label: 'Paid this month',
      value: String(summary.paidThisMonth),
      color: 'text-emerald-400',
    },
    {
      label: 'Active bills',
      value: String(summary.activeCount),
      color: 'text-slate-100',
    },
  ];

  return (
    <PageShell title="Bills" action={headerActions} bare>
      {error && (
        <div className="mb-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {summaryCards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-surface-600/60 bg-surface-800 px-4 py-3"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {c.label}
            </div>
            <div className={`mt-1 text-xl font-semibold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {bills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-600/60 bg-surface-800/40 py-16 text-center">
          <div className="text-sm text-slate-400">No bills yet.</div>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => setFormState({ mode: 'add' })}
              className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
            >
              Add a bill
            </button>
            <button
              onClick={() => setDetectOpen(true)}
              className="rounded-md border border-surface-600/60 bg-surface-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-surface-600"
            >
              Detect from transactions
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-surface-600/60 bg-surface-800">
          {bills.map((b) => (
            <BillRow
              key={b.id}
              bill={b}
              onToggleActive={(next) => handleToggleActive(b.id, next)}
              onEdit={() => setFormState({ mode: 'edit', bill: b })}
              onDelete={() => handleDelete(b.id)}
            />
          ))}
        </div>
      )}

      {formState && (
        <BillFormModal
          initial={formState.mode === 'edit' ? formState.bill : null}
          categories={categories}
          onClose={() => setFormState(null)}
          onSubmit={(payload) =>
            formState.mode === 'edit'
              ? handleUpdate(formState.bill.id, payload)
              : handleCreate(payload)
          }
        />
      )}

      {detectOpen && (
        <DetectBillsModal
          onClose={() => setDetectOpen(false)}
          onAddSelected={handleAddDetected}
        />
      )}
    </PageShell>
  );
}
