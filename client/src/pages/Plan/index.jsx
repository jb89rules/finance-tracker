import { useCallback, useEffect, useState } from 'react';
import api from '../../lib/api.js';
import PageShell from '../../components/PageShell.jsx';
import { monthLabel } from '../../lib/format.js';
import useMonthNav from './hooks/useMonthNav.js';
import usePlanRollup from './hooks/usePlanRollup.js';
import CategoryCard from './components/CategoryCard.jsx';
import AddPlannedItemModal from './components/AddPlannedItemModal.jsx';
import DetectItemsModal from './components/DetectItemsModal.jsx';

function ChevronIcon({ dir }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export default function Plan() {
  const { date, prev, next } = useMonthNav();
  const { rows, error, reload } = usePlanRollup(date.month, date.year);
  const [categories, setCategories] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [detectOpen, setDetectOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);

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

  const handleCreate = async (payload) => {
    await api.post('/api/plan/items', payload);
    setAddOpen(false);
    await reload();
  };

  const handleAddDetected = async (picks) => {
    for (const p of picks) {
      await api.post('/api/plan/items', {
        name: p.name,
        kind: 'recurring',
        frequency: 'monthly',
        amount: p.amount,
        dueDay: p.dueDay,
        matchKeyword: p.matchKeyword || p.name,
        category: p.txnCategory ?? null,
        isActive: true,
      });
    }
    setDetectOpen(false);
    await reload();
  };

  const headerActions = (
    <div className="flex gap-2">
      <button
        onClick={() => setDetectOpen(true)}
        className="rounded-md border border-surface-600/60 bg-surface-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-surface-600"
      >
        Detect
      </button>
      <button
        onClick={() => setAddOpen(true)}
        className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
      >
        Add item
      </button>
    </div>
  );

  return (
    <PageShell title="Plan" action={headerActions} bare>
      {(error || feedback) && (
        <div className="mb-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error || feedback}
        </div>
      )}

      <div className="mb-6 flex items-center gap-3">
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

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-600/60 bg-surface-800/40 py-16 text-center">
          <div className="text-sm text-slate-400">
            No planned items for {monthLabel(date.month, date.year)} yet.
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
            >
              Add an item
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <CategoryCard key={r.category ?? '__uncategorized'} row={r} />
          ))}
        </div>
      )}

      {addOpen && (
        <AddPlannedItemModal
          categories={categories}
          onSubmit={handleCreate}
          onClose={() => setAddOpen(false)}
        />
      )}

      {detectOpen && (
        <DetectItemsModal
          onClose={() => setDetectOpen(false)}
          onAddSelected={handleAddDetected}
        />
      )}
    </PageShell>
  );
}
