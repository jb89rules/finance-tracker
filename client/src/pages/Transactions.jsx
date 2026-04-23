import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api.js';
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
        {value || 'Uncategorized'}
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
                      {c}
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
      if (q && !t.description.toLowerCase().includes(q)) return false;
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
                {c}
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
                  <div className="min-w-0 flex-1 text-sm text-slate-100">
                    {t.description}
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
                  <CategoryPicker
                    value={t.category}
                    categories={categories}
                    onChange={(next) => handleCategoryChange(t.id, next)}
                  />
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
                  className={i % 2 === 0 ? 'bg-surface-800' : 'bg-surface-700/40'}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {formatDate(t.date)}
                  </td>
                  <td className="px-4 py-3 text-slate-100">{t.description}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {t.account
                      ? `${t.account.name} — ${t.account.institution}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <CategoryPicker
                      value={t.category}
                      categories={categories}
                      onChange={(next) => handleCategoryChange(t.id, next)}
                    />
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
    </PageShell>
  );
}
