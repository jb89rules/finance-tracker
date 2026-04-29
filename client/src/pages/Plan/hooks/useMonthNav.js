import { useCallback, useState } from 'react';

export default function useMonthNav() {
  const now = new Date();
  const [date, setDate] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  const prev = useCallback(() => {
    setDate((d) =>
      d.month === 1 ? { month: 12, year: d.year - 1 } : { month: d.month - 1, year: d.year }
    );
  }, []);

  const next = useCallback(() => {
    setDate((d) =>
      d.month === 12 ? { month: 1, year: d.year + 1 } : { month: d.month + 1, year: d.year }
    );
  }, []);

  return { date, prev, next, setDate };
}
