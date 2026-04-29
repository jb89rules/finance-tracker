import { useState } from 'react';
import api from '../../../lib/api.js';
import { SHORT_MONTH_LABELS } from '../../../lib/format.js';

export default function MonthlyAmountsEditor({ item, onSaved, onCancel }) {
  const [draft, setDraft] = useState(() =>
    Array.isArray(item.monthlyAmounts) && item.monthlyAmounts.length === 12
      ? item.monthlyAmounts.map((a) => String(a))
      : Array(12).fill(String(item.amount ?? 0))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const setMonth = (i, value) => {
    setDraft((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  };

  const handleSave = async () => {
    const parsed = draft.map((s) => Number.parseFloat(s) || 0);
    if (parsed.some((a) => !Number.isFinite(a) || a < 0)) {
      setError('Each amount must be 0 or greater');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch(`/api/plan/items/${item.id}/monthly-amounts`, {
        monthlyAmounts: parsed,
      });
      onSaved(data);
    } catch (e) {
      setError('Failed to save');
      setSaving(false);
    }
  };

  const currentMonth0 = new Date().getMonth();

  return (
    <div className="border-t border-surface-600/60 bg-surface-700/40 px-4 py-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
        Per-month amounts
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {SHORT_MONTH_LABELS.map((label, i) => (
          <div key={label}>
            <div
              className={`mb-0.5 text-[10px] uppercase tracking-wide ${
                i === currentMonth0 ? 'text-accent-400' : 'text-slate-500'
              }`}
            >
              {label}
              {i === currentMonth0 ? ' (now)' : ''}
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={draft[i]}
              onChange={(e) => setMonth(i, e.target.value)}
              className="w-full rounded-md border border-surface-600/60 bg-surface-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-700/50 bg-red-900/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-surface-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
