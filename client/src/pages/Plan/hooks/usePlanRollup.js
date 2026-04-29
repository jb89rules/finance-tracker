import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/api.js';

export default function usePlanRollup(month, year) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/plan/rollup', { params: { month, year } });
      setRows(data);
      setError(null);
    } catch (e) {
      setError('Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, error, loading, reload };
}
