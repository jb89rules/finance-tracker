import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api.js';
import formatCategory from '../lib/formatCategory.js';
import PageShell from '../components/PageShell.jsx';
import Modal from '../components/Modal.jsx';
import { currencyFormatter, monthLabel } from '../lib/format.js';

function ChevronIcon({ dir }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dir === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
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

function BudgetCard({ budget, onSaveBuffer, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(budget.discretionary ?? 0));

  useEffect(() => {
    setDraft(String(budget.discretionary ?? 0));
  }, [budget.discretionary]);

  const total = budget.total ?? budget.limit ?? 0;
  const pct = total > 0 ? (budget.spent / total) * 100 : 0;
  const remaining = total - budget.spent;
  const over = remaining < 0;
  const billsTotal = budget.billsTotal ?? 0;
  const discretionary = budget.discretionary ?? 0;

  const barColor =
    pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  const commit = async () => {
    const n = Number.parseFloat(draft);
    if (Number.isFinite(n) && n >= 0 && n !== discretionary) {
      await onSaveBuffer(n);
    }
    setEditing(false);
  };

  return (
    <div className="rounded-lg border border-surface-600/60 bg-surface-800 p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="font-medium text-slate-100">{formatCategory(budget.category)}</div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Edit buffer"
            className="rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-slate-200"
          >
            <PencilIcon />
          </button>
          {budget.id && (
            <button
              type="button"
              onClick={onDelete}
              title="Reset buffer to 0"
              className="rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-red-400"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm text-slate-400">
          <span className="text-slate-100">{currencyFormatter.format(budget.spent)}</span>
          <span className="text-slate-500"> of </span>
          <span className="text-slate-200">{currencyFormatter.format(total)}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2 text-xs text-slate-500">
          <span>
            {currencyFormatter.format(billsTotal)} <span className="text-slate-600">(bills)</span>
          </span>
          <span className="text-slate-600">+</span>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commit();
              }}
              className="inline-flex items-center gap-1"
            >
              <span className="text-slate-500">$</span>
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                className="w-20 rounded bg-surface-700 px-2 py-0.5 text-xs text-slate-100 outline-none ring-1 ring-surface-600 focus:ring-accent-500"
              />
              <span className="text-slate-600">(buffer)</span>
            </form>
          ) : (
            <span>
              {currencyFormatter.format(discretionary)}{' '}
              <span className="text-slate-600">(buffer)</span>
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
    </div>
  );
}

function AddBudgetModal({ categories, existingCategories, billsByCategory, month, year, onSubmit, onClose }) {
  const [category, setCategory] = useState('');
  const [buffer, setBuffer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const billsForSelected = category ? billsByCategory.get(category) || 0 : 0;
  const bufferNum = Number.parseFloat(buffer) || 0;
  const previewTotal = billsForSelected + bufferNum;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!category.trim()) return setError('Category is required');
    if (!Number.isFinite(bufferNum) || bufferNum < 0) {
      return setError('Buffer must be 0 or greater');
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        category: category.trim(),
        discretionary: bufferNum,
        month,
        year,
      });
    } catch (err) {
      setError('Failed to save budget');
      setSaving(false);
    }
  };

  const availableCategories = categories.filter((c) => !existingCategories.has(c));

  return (
    <Modal onClose={onClose} size="md" panelClassName="p-6">
      <div className="mb-1 text-lg font-semibold text-slate-100">Add Budget</div>
      <div className="mb-5 text-sm text-slate-500">For {monthLabel(month, year)}</div>

      <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="">Select a category</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {formatCategory(c)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Discretionary buffer
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
            />
            {category && (
              <p className="mt-1 text-xs text-slate-500">
                {currencyFormatter.format(billsForSelected)} bills +{' '}
                {currencyFormatter.format(bufferNum)} buffer ={' '}
                <span className="text-slate-300">{currencyFormatter.format(previewTotal)}</span> total
              </p>
            )}
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
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Budgets() {
  const now = useMemo(() => new Date(), []);
  const [date, setDate] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState(null);

  const loadBudgets = useCallback(async () => {
    try {
      const { data } = await api.get('/api/budgets', {
        params: { month: date.month, year: date.year },
      });
      setBudgets(data);
    } catch (e) {
      setError('Failed to load budgets');
    }
  }, [date.month, date.year]);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/api/categories');
      setCategories(data.map((c) => c.name));
    } catch (e) {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const prevMonth = () =>
    setDate((d) =>
      d.month === 1 ? { month: 12, year: d.year - 1 } : { month: d.month - 1, year: d.year }
    );
  const nextMonth = () =>
    setDate((d) =>
      d.month === 12 ? { month: 1, year: d.year + 1 } : { month: d.month + 1, year: d.year }
    );

  const handleCreate = async (payload) => {
    await api.post('/api/budgets', payload);
    setModalOpen(false);
    await loadBudgets();
  };

  const handleSaveBuffer = async (budget, discretionary) => {
    try {
      if (budget.id) {
        await api.patch(`/api/budgets/${budget.id}`, { discretionary });
      } else {
        await api.post('/api/budgets', {
          category: budget.category,
          discretionary,
          month: date.month,
          year: date.year,
        });
      }
      await loadBudgets();
    } catch (e) {
      setError('Failed to update budget');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/budgets/${id}`);
      await loadBudgets();
    } catch (e) {
      setError('Failed to delete budget');
    }
  };

  const existingCategories = useMemo(
    () => new Set(budgets.map((b) => b.category)),
    [budgets]
  );

  const billsByCategory = useMemo(() => {
    const map = new Map();
    for (const b of budgets) {
      if (b.billsTotal) map.set(b.category, b.billsTotal);
    }
    return map;
  }, [budgets]);

  const addButton = (
    <button
      onClick={() => setModalOpen(true)}
      className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
    >
      Add Budget
    </button>
  );

  return (
    <PageShell title="Budgets" action={addButton} bare>
      {error && (
        <div className="mb-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-md border border-surface-600/60 p-2 text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-100"
          title="Previous month"
        >
          <ChevronIcon dir="left" />
        </button>
        <div className="min-w-[160px] text-center text-base font-medium text-slate-100">
          {monthLabel(date.month, date.year)}
        </div>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-md border border-surface-600/60 p-2 text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-100"
          title="Next month"
        >
          <ChevronIcon dir="right" />
        </button>
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-600/60 bg-surface-800/40 py-16 text-center">
          <div className="text-sm text-slate-400">
            No budgets for {monthLabel(date.month, date.year)} yet.
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
          >
            Add your first budget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {budgets.map((b) => (
            <BudgetCard
              key={b.id ?? `derived:${b.category}`}
              budget={b}
              onSaveBuffer={(discretionary) => handleSaveBuffer(b, discretionary)}
              onDelete={() => handleDelete(b.id)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <AddBudgetModal
          categories={categories}
          existingCategories={existingCategories}
          billsByCategory={billsByCategory}
          month={date.month}
          year={date.year}
          onSubmit={handleCreate}
          onClose={() => setModalOpen(false)}
        />
      )}
    </PageShell>
  );
}
