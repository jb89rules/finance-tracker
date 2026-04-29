import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/api.js';

export default function usePlanItems({ category, kind, month, year, isActive, hasDate } = {}) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (category !== undefined) params.category = category ?? '';
      if (kind !== undefined) params.kind = kind;
      if (month !== undefined) params.month = month;
      if (year !== undefined) params.year = year;
      if (isActive !== undefined) params.isActive = String(isActive);
      if (hasDate !== undefined) params.hasDate = String(hasDate);
      const { data } = await api.get('/api/plan/items', { params });
      setItems(data);
      setError(null);
    } catch (e) {
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [category, kind, month, year, isActive, hasDate]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, error, loading, reload, setItems };
}
