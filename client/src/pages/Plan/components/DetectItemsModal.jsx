import { useEffect, useState } from 'react';
import api from '../../../lib/api.js';
import formatCategory from '../../../lib/formatCategory.js';
import Modal from '../../../components/Modal.jsx';
import { currencyFormatter, ordinal } from '../../../lib/format.js';

export default function DetectItemsModal({ onClose, onAddSelected }) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [displayNames, setDisplayNames] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/plan/detect');
        setSuggestions(data);
        setSelected(new Set(data.map((_, i) => i)));
      } catch (e) {
        setError('Failed to detect recurring items');
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

  const setName = (i, value) => {
    setDisplayNames((prev) => ({ ...prev, [i]: value }));
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      const picks = [...selected].map((i) => {
        const s = suggestions[i];
        const displayName = (displayNames[i] ?? s.name).trim() || s.name;
        return { ...s, name: displayName, matchKeyword: s.matchKeyword || s.name };
      });
      await onAddSelected(picks);
    } catch (e) {
      setError('Failed to add items');
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} size="lg" panelClassName="flex max-h-[80vh] flex-col">
      <div className="border-b border-surface-600/60 p-6">
        <div className="text-lg font-semibold text-slate-100">Detect recurring items</div>
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
            No recurring charges detected. Try again after more transactions have synced.
          </div>
        ) : (
          <ul className="space-y-1">
            {suggestions.map((s, i) => (
              <li key={`${s.name}-${i}`} className="rounded-md px-3 py-2 transition-colors hover:bg-surface-700">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="h-4 w-4 rounded border-surface-500 bg-surface-700 text-accent-500 focus:ring-accent-500"
                  />
                  <input
                    type="text"
                    value={displayNames[i] ?? s.name}
                    onChange={(e) => setName(i, e.target.value)}
                    placeholder="Display name"
                    className="min-w-0 flex-1 rounded bg-surface-800 px-2 py-1 text-sm text-slate-100 outline-none ring-1 ring-surface-600 focus:ring-accent-500"
                  />
                  <div className="shrink-0 text-sm font-medium tabular-nums text-slate-200">
                    {currencyFormatter.format(s.amount)}
                  </div>
                </div>
                <div className="mt-1 pl-7 text-xs text-slate-500">
                  <span className="text-slate-400">{s.matchKeyword || s.name}</span>
                  {' · '}
                  {s.txnCategory ? formatCategory(s.txnCategory) : 'Uncategorized'}
                  {' · Due on the '}
                  {ordinal(s.dueDay)}
                </div>
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
    </Modal>
  );
}
