import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/api.js';

// Fetches transactions that count toward a specific item for the given month.
// Lazy: only fetches when `enabled` is true.
export default function usePlanItemTransactions(itemId, month, year, enabled) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetched, setFetched] = useState(false);

  const reload = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/api/plan/items/${itemId}/transactions`, {
        params: { month, year },
      });
      setTransactions(data);
      setFetched(true);
    } catch (e) {
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [itemId, month, year]);

  useEffect(() => {
    if (enabled && !fetched && !loading) {
      reload();
    }
    // intentionally don't refetch on disable; we cache the result
  }, [enabled, fetched, loading, reload]);

  // Re-fetch if month/year change while expanded.
  useEffect(() => {
    if (enabled && fetched) {
      setFetched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  return { transactions, loading, error, reload };
}
