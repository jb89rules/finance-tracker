import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../lib/api.js';
import PageShell from '../../components/PageShell.jsx';
import formatCategory from '../../lib/formatCategory.js';
import { currencyFormatter, monthLabel } from '../../lib/format.js';
import useMonthNav from './hooks/useMonthNav.js';
import usePlanItems from './hooks/usePlanItems.js';
import PlanItemRow from './components/PlanItemRow.jsx';
import AddPlannedItemModal from './components/AddPlannedItemModal.jsx';
import LinkPaymentModal from './components/LinkPaymentModal.jsx';
import { UNCATEGORIZED_SENTINEL } from './components/CategoryCard.jsx';

function ChevronIcon({ dir }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export default function CategoryDetail() {
  const { category: categoryParam } = useParams();
  const isUncategorized = categoryParam === UNCATEGORIZED_SENTINEL;
  const category = isUncategorized ? null : decodeURIComponent(categoryParam);
  const { date, prev, next } = useMonthNav();
  const { items, error, reload, setItems } = usePlanItems({
    category,
    month: date.month,
    year: date.year,
  });
  const [categories, setCategories] = useState([]);
  const [formState, setFormState] = useState(null);
  const [linkItem, setLinkItem] = useState(null);
  const [pageError, setPageError] = useState(null);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/api/categories');
      setCategories(data.map((c) => c.name));
    } catch (e) {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const totals = useMemo(() => {
    const planned = items.reduce((s, i) => s + (i.amountForMonth ?? 0), 0);
    return {
      planned: Math.round(planned * 100) / 100,
      count: items.length,
    };
  }, [items]);

  const handleCreate = async (payload) => {
    await api.post('/api/plan/items', payload);
    setFormState(null);
    await reload();
  };

  const handleUpdate = async (id, payload) => {
    await api.patch(`/api/plan/items/${id}`, payload);
    setFormState(null);
    await reload();
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/plan/items/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setPageError('Failed to delete');
    }
  };

  const handleLinked = async () => {
    setLinkItem(null);
    await reload();
  };

  const handleUnlink = async (id) => {
    try {
      await api.delete(`/api/plan/items/${id}/link-transaction`);
      await reload();
    } catch (e) {
      setPageError('Failed to unlink');
    }
  };

  const handleRowUpdated = (updated) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const headerActions = (
    <div className="flex gap-2">
      <button
        onClick={() => setFormState({ mode: 'add' })}
        className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
      >
        Add item
      </button>
    </div>
  );

  return (
    <PageShell
      title={isUncategorized ? 'Uncategorized' : formatCategory(category)}
      subtitle={
        <Link to="/plan" className="text-accent-400 hover:text-accent-300">
          ← Back to all categories
        </Link>
      }
      action={headerActions}
      bare
    >
      {(error || pageError) && (
        <div className="mb-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error || pageError}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prev}
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
            onClick={next}
            className="rounded-md border border-surface-600/60 p-2 text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-100"
            title="Next month"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
        <div className="text-right text-sm">
          <div className="text-slate-100">{currencyFormatter.format(totals.planned)}</div>
          <div className="text-xs text-slate-500">
            {totals.count} item{totals.count === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-600/60 bg-surface-800/40 py-16 text-center">
          <div className="text-sm text-slate-400">No items in this category yet.</div>
          <button
            onClick={() => setFormState({ mode: 'add' })}
            className="mt-4 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
          >
            Add an item
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-surface-600/60 bg-surface-800">
          <div className="hidden grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-3 border-b border-surface-600/60 px-4 py-2 text-xs uppercase tracking-wide text-slate-500 md:grid">
            <div className="w-[14px]" />
            <div>Name</div>
            <div>Timing</div>
            <div>Status</div>
            <div className="text-right">This month</div>
            <div />
          </div>
          {items.map((it) => (
            <PlanItemRow
              key={it.id}
              item={it}
              month={date.month}
              year={date.year}
              onItemUpdated={handleRowUpdated}
              onEdit={() => setFormState({ mode: 'edit', item: it })}
              onDelete={() => handleDelete(it.id)}
              onLinkPayment={() => setLinkItem(it)}
              onUnlinkPayment={() => handleUnlink(it.id)}
            />
          ))}
        </div>
      )}

      {formState && (
        <AddPlannedItemModal
          initial={formState.mode === 'edit' ? formState.item : null}
          defaultCategory={category}
          categories={categories}
          onClose={() => setFormState(null)}
          onSubmit={(payload) =>
            formState.mode === 'edit'
              ? handleUpdate(formState.item.id, payload)
              : handleCreate(payload)
          }
        />
      )}

      {linkItem && (
        <LinkPaymentModal
          item={linkItem}
          onClose={() => setLinkItem(null)}
          onLinked={handleLinked}
        />
      )}
    </PageShell>
  );
}
