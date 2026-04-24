import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api.js';
import formatCategory from '../lib/formatCategory.js';
import PageShell from '../components/PageShell.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function CategoryPicker({ value, categories, onChange }) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setCustomMode(false);
        setCustomValue('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const commit = (next) => {
    setOpen(false);
    setCustomMode(false);
    setCustomValue('');
    if (next !== value) onChange(next);
  };

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-surface-600 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-surface-500"
      >
        {value ? formatCategory(value) : 'Uncategorized'}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-md border border-surface-600/60 bg-surface-700 shadow-lg">
          {customMode ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = customValue.trim();
                if (v) commit(v);
              }}
              className="flex gap-1 p-2"
            >
              <input
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="Category name"
                className="flex-1 rounded bg-surface-800 px-2 py-1 text-xs text-slate-100 outline-none ring-1 ring-surface-600 focus:ring-accent-500"
              />
              <button
                type="submit"
                className="rounded bg-accent-500 px-2 text-xs font-medium text-white hover:bg-accent-600"
              >
                Save
              </button>
            </form>
          ) : (
            <>
              <div className="max-h-56 overflow-y-auto py-1">
                {categories.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">
                    No categories yet
                  </div>
                ) : (
                  categories.map((c) => (
                    <button
                      key={c}
                      onClick={() => commit(c)}
                      className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-600 ${
                        c === value ? 'text-accent-400' : 'text-slate-200'
                      }`}
                    >
                      {formatCategory(c)}
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => setCustomMode(true)}
                className="block w-full border-t border-surface-600/60 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-surface-600"
              >
                Custom…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MerchantAvatar({ logoUrl, name }) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setBroken(true)}
        className="h-5 w-5 shrink-0 rounded-full bg-surface-600 object-cover"
      />
    );
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-600 text-[10px] font-medium text-slate-400">
      {initial}
    </div>
  );
}

function PendingBadge() {
  return (
    <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
      Pending
    </span>
  );
}

function displayNameFor(t) {
  return t.merchantName || t.description;
}

function ScissorsIcon() {
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
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
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

function SplitBadge({ splits }) {
  return (
    <div className="group/split relative">
      <span className="rounded-full bg-accent-500/20 px-2.5 py-1 text-xs font-medium text-accent-300">
        Split ({splits.length})
      </span>
      <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-64 rounded-md border border-surface-600/60 bg-surface-700 py-1 shadow-lg group-hover/split:block">
        {splits.map((s, i) => (
          <div
            key={s.id || i}
            className="border-b border-surface-600/60 px-3 py-1.5 last:border-0"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-slate-200">
                {formatCategory(s.category)}
              </span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-300">
                {currencyFormatter.format(s.amount)}
              </span>
            </div>
            {s.note && (
              <div className="truncate text-[10px] text-slate-500">{s.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScissorsButton({ active, onClick }) {
  const base =
    'shrink-0 rounded p-1 transition-all hover:bg-surface-700';
  const visibility = active
    ? 'text-accent-400 opacity-100 hover:text-accent-300'
    : 'text-slate-500 hover:text-slate-200 opacity-100 md:opacity-0 md:group-hover:opacity-100';
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? 'Edit splits' : 'Split transaction'}
      className={`${base} ${visibility}`}
    >
      <ScissorsIcon />
    </button>
  );
}

function SplitEditorModal({ transaction, categories, onClose, onSaved, onRemoved }) {
  const total = Math.abs(transaction.amount);
  const hadSplits = Array.isArray(transaction.splits) && transaction.splits.length > 0;

  const [splits, setSplits] = useState(() => {
    if (hadSplits) {
      return transaction.splits.map((s) => ({
        amount: s.amount.toFixed(2),
        category: s.category,
        note: s.note || '',
      }));
    }
    return [
      { amount: '0.00', category: transaction.category || '', note: '' },
      { amount: total.toFixed(2), category: '', note: '' },
    ];
  });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const allocated = splits.reduce(
    (sum, s) => sum + (Number.parseFloat(s.amount) || 0),
    0
  );
  const remaining = total - allocated;
  const balanced = Math.abs(remaining) < 0.01;

  const rebalanceLast = (arr) => {
    if (arr.length < 2) return arr;
    const others = arr
      .slice(0, -1)
      .reduce((sum, s) => sum + (Number.parseFloat(s.amount) || 0), 0);
    const rem = Math.max(0, total - others);
    const copy = [...arr];
    copy[copy.length - 1] = { ...copy[copy.length - 1], amount: rem.toFixed(2) };
    return copy;
  };

  const updateSplit = (i, field, value) => {
    setSplits((prev) => {
      const next = prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s));
      if (field === 'amount' && i !== next.length - 1) {
        return rebalanceLast(next);
      }
      return next;
    });
  };

  const addSplit = () => {
    setSplits((prev) => rebalanceLast([...prev, { amount: '0.00', category: '', note: '' }]));
  };

  const removeSplit = (i) => {
    if (splits.length <= 2) return;
    setSplits((prev) => rebalanceLast(prev.filter((_, idx) => idx !== i)));
  };

  const handleSave = async () => {
    for (const s of splits) {
      if (!s.category || !s.category.trim()) {
        return setError('Each split needs a category');
      }
      const n = Number.parseFloat(s.amount);
      if (!Number.isFinite(n) || n <= 0) {
        return setError('Each split needs a positive amount');
      }
    }
    if (!balanced) return setError('Splits must equal total amount');

    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post(
        `/api/transactions/${transaction.id}/splits`,
        {
          splits: splits.map((s) => ({
            amount: Number.parseFloat(s.amount),
            category: s.category.trim(),
            note: s.note.trim() || null,
          })),
        }
      );
      onSaved(data);
    } catch (e) {
      setError('Failed to save splits');
      setSaving(false);
    }
  };

  const handleRemoveAll = async () => {
    setRemoving(true);
    setError(null);
    try {
      await api.delete(`/api/transactions/${transaction.id}/splits`);
      onRemoved();
    } catch (e) {
      setError('Failed to remove splits');
      setRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex bg-black/60 md:items-center md:justify-center md:p-4">
      <div className="flex h-full w-full flex-col bg-surface-800 md:h-auto md:max-h-[90vh] md:w-full md:max-w-2xl md:rounded-lg md:border md:border-surface-600/60 md:shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-surface-600/60 px-5 py-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-100">
              Split Transaction
            </div>
            <div className="mt-1 truncate text-sm text-slate-300">
              {transaction.description}
            </div>
            <div className="text-xs text-slate-500">
              {formatDate(transaction.date)} · {currencyFormatter.format(total)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-2xl leading-none text-slate-500 hover:bg-surface-700 hover:text-slate-200"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            {splits.map((split, i) => (
              <div
                key={i}
                className="rounded-md border border-surface-600/60 bg-surface-700/40 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={split.amount}
                    onChange={(e) => updateSplit(i, 'amount', e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded bg-surface-800 px-3 py-2 text-sm tabular-nums text-slate-100 outline-none ring-1 ring-surface-600 focus:ring-accent-500 sm:w-28"
                  />
                  <select
                    value={split.category}
                    onChange={(e) => updateSplit(i, 'category', e.target.value)}
                    className="w-full min-w-0 flex-1 rounded bg-surface-800 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-surface-600 focus:ring-accent-500"
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {formatCategory(c)}
                      </option>
                    ))}
                    {split.category && !categories.includes(split.category) && (
                      <option value={split.category}>
                        {formatCategory(split.category)}
                      </option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSplit(i)}
                    disabled={splits.length <= 2}
                    title="Remove split"
                    className="shrink-0 rounded p-2 text-slate-500 transition-colors hover:bg-surface-700 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <TrashIcon />
                  </button>
                </div>
                <input
                  type="text"
                  value={split.note}
                  onChange={(e) => updateSplit(i, 'note', e.target.value)}
                  placeholder="Note (optional)"
                  className="mt-2 w-full rounded bg-surface-800 px-3 py-1.5 text-xs text-slate-100 outline-none ring-1 ring-surface-600 focus:ring-accent-500"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addSplit}
            className="mt-4 w-full rounded-md border border-dashed border-surface-500 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-surface-400 hover:bg-surface-700/40 hover:text-slate-200"
          >
            + Add Split
          </button>
        </div>

        <div className="sticky bottom-0 border-t border-surface-600/60 bg-surface-800 px-5 py-4">
          <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-slate-500">Total</div>
              <div className="tabular-nums text-slate-200">
                {currencyFormatter.format(total)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Allocated</div>
              <div className="tabular-nums text-slate-200">
                {currencyFormatter.format(allocated)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Remaining</div>
              <div
                className={`font-medium tabular-nums ${
                  balanced ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {currencyFormatter.format(remaining)}
              </div>
            </div>
          </div>

          {!balanced && (
            <div className="mb-3 rounded-md border border-red-700/50 bg-red-900/40 px-3 py-2 text-xs text-red-200">
              Splits must equal total amount
            </div>
          )}
          {error && (
            <div className="mb-3 rounded-md border border-red-700/50 bg-red-900/40 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            {hadSplits ? (
              <button
                type="button"
                onClick={handleRemoveAll}
                disabled={removing}
                className="text-sm text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
              >
                {removing ? 'Removing…' : 'Remove splits'}
              </button>
            ) : (
              <span />
            )}
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
                onClick={handleSave}
                disabled={!balanced || saving}
                className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCards({ transactions }) {
  const stats = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const thisMonth = transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const spending = thisMonth
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const income = thisMonth
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { spending, income, count: thisMonth.length };
  }, [transactions]);

  const cards = [
    {
      label: 'Spending this month',
      value: currencyFormatter.format(stats.spending),
      color: 'text-red-400',
    },
    {
      label: 'Income this month',
      value: currencyFormatter.format(stats.income),
      color: 'text-emerald-400',
    },
    {
      label: 'Transactions this month',
      value: stats.count.toString(),
      color: 'text-slate-100',
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-surface-600/60 bg-surface-800 px-4 py-3"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {c.label}
          </div>
          <div className={`mt-1 text-xl font-semibold ${c.color}`}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [splitEditorTxn, setSplitEditorTxn] = useState(null);

  const loadTransactions = useCallback(async () => {
    try {
      const { data } = await api.get('/api/transactions');
      setTransactions(data);
    } catch (e) {
      setError('Failed to load transactions');
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

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get('/api/plaid/accounts');
      setAccounts(data);
    } catch (e) {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadTransactions();
    loadCategories();
    loadAccounts();
  }, [loadTransactions, loadCategories, loadAccounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (category && t.category !== category) return false;
      if (account && t.accountId !== account) return false;
      if (q) {
        const hay = `${t.description} ${t.merchantName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, search, category, account]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.post('/api/plaid/sync');
      await Promise.all([loadTransactions(), loadCategories()]);
    } catch (e) {
      setError('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleCategoryChange = async (id, next) => {
    try {
      await api.patch(`/api/transactions/${id}`, { category: next });
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, category: next } : t))
      );
      setCategories((prev) =>
        prev.includes(next) ? prev : [...prev, next].sort()
      );
    } catch (e) {
      setError('Failed to update category');
    }
  };

  const handleSplitsSaved = (updatedTxn) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === updatedTxn.id ? { ...t, ...updatedTxn } : t))
    );
    setSplitEditorTxn(null);
  };

  const handleSplitsRemoved = () => {
    if (!splitEditorTxn) return;
    const id = splitEditorTxn.id;
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, splits: [] } : t))
    );
    setSplitEditorTxn(null);
  };

  const syncButton = (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {syncing ? 'Syncing…' : 'Sync'}
    </button>
  );

  return (
    <PageShell
      title="Transactions"
      subtitle="Recent activity across accounts"
      action={syncButton}
      bare
    >
      {error && (
        <div className="mb-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <SummaryCards transactions={transactions} />

      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          placeholder="Search description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
        />
        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500 md:flex-none"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {formatCategory(c)}
              </option>
            ))}
          </select>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500 md:flex-none"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.institution}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="md:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-surface-600/60 bg-surface-800 px-4 py-10 text-center text-sm text-slate-500">
            {transactions.length === 0
              ? 'No transactions yet. Click Sync to pull from Plaid.'
              : 'No transactions match your filters.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-surface-600/60 bg-surface-800">
            {filtered.map((t, i) => (
              <div
                key={t.id}
                className={`flex flex-col gap-2 border-b border-surface-600/60 px-4 py-3 last:border-0 ${
                  i % 2 === 0 ? 'bg-surface-800' : 'bg-surface-700/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <MerchantAvatar
                      logoUrl={t.logoUrl}
                      name={displayNameFor(t)}
                    />
                    <div className="min-w-0 flex-1 truncate text-sm text-slate-100">
                      {displayNameFor(t)}
                    </div>
                    {t.pending && <PendingBadge />}
                  </div>
                  <div
                    className={`shrink-0 text-sm font-medium tabular-nums ${
                      t.amount >= 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {currencyFormatter.format(-t.amount)}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">{formatDate(t.date)}</div>
                  <div className="flex items-center gap-2">
                    {t.splits && t.splits.length > 0 ? (
                      <SplitBadge splits={t.splits} />
                    ) : (
                      <CategoryPicker
                        value={t.category}
                        categories={categories}
                        onChange={(next) => handleCategoryChange(t.id, next)}
                      />
                    )}
                    <ScissorsButton
                      active={t.splits && t.splits.length > 0}
                      onClick={() => setSplitEditorTxn(t)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-surface-600/60 bg-surface-800 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-600/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  {transactions.length === 0
                    ? 'No transactions yet. Click Sync to pull from Plaid.'
                    : 'No transactions match your filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((t, i) => (
                <tr
                  key={t.id}
                  className={`group ${
                    i % 2 === 0 ? 'bg-surface-800' : 'bg-surface-700/40'
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {formatDate(t.date)}
                  </td>
                  <td className="px-4 py-3 text-slate-100">
                    <div className="flex items-center gap-2">
                      <MerchantAvatar
                        logoUrl={t.logoUrl}
                        name={displayNameFor(t)}
                      />
                      <span className="truncate">{displayNameFor(t)}</span>
                      {t.pending && <PendingBadge />}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {t.account
                      ? `${t.account.name} — ${t.account.institution}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {t.splits && t.splits.length > 0 ? (
                        <SplitBadge splits={t.splits} />
                      ) : (
                        <CategoryPicker
                          value={t.category}
                          categories={categories}
                          onChange={(next) => handleCategoryChange(t.id, next)}
                        />
                      )}
                      <ScissorsButton
                        active={t.splits && t.splits.length > 0}
                        onClick={() => setSplitEditorTxn(t)}
                      />
                    </div>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${
                      t.amount >= 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {currencyFormatter.format(-t.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {splitEditorTxn && (
        <SplitEditorModal
          transaction={splitEditorTxn}
          categories={categories}
          onClose={() => setSplitEditorTxn(null)}
          onSaved={handleSplitsSaved}
          onRemoved={handleSplitsRemoved}
        />
      )}
    </PageShell>
  );
}
