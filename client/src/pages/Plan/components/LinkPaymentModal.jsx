import { useEffect, useState } from 'react';
import api from '../../../lib/api.js';
import Modal from '../../../components/Modal.jsx';
import { currencyFormatter, formatShortDate } from '../../../lib/format.js';

export default function LinkPaymentModal({ item, onClose, onLinked }) {
  const [txns, setTxns] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/transactions');
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        setTxns(data.filter((t) => new Date(t.date) >= cutoff && t.amount > 0));
      } catch (e) {
        setError('Failed to load transactions');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = txns.filter((t) => {
    if (!q) return true;
    const hay = `${t.description} ${t.merchantName || ''}`.toLowerCase();
    return hay.includes(q);
  });

  const handleSelect = async (txn) => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/plan/items/${item.id}/link-transaction`, {
        transactionId: txn.id,
      });
      onLinked();
    } catch (e) {
      setError('Failed to link');
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} variant="mobileSheet" size="lg">
      <header className="border-b border-surface-600/60 px-5 py-4">
        <div className="text-lg font-semibold text-slate-100">Link payment</div>
        <div className="mt-1 truncate text-sm text-slate-400">for {item.name}</div>
      </header>

      <div className="border-b border-surface-600/60 px-5 py-3">
        <input
          type="text"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions…"
          className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
        ) : error ? (
          <div className="m-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {txns.length === 0 ? 'No spending transactions in the last 30 days.' : 'No matches.'}
          </div>
        ) : (
          <ul className="divide-y divide-surface-600/60">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(t)}
                  disabled={saving}
                  className="w-full px-5 py-3 text-left transition-colors hover:bg-surface-700 disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-100">
                        {t.merchantName || t.description}
                      </div>
                      <div className="text-xs text-slate-500">{formatShortDate(t.date)}</div>
                    </div>
                    <div className="shrink-0 text-sm font-medium tabular-nums text-slate-100">
                      {currencyFormatter.format(t.amount)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end border-t border-surface-600/60 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-700"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
