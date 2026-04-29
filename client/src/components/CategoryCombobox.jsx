import { useEffect, useRef, useState } from 'react';
import formatCategory from '../lib/formatCategory.js';

export default function CategoryCombobox({ value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allOptions =
    value && !options.includes(value) ? [value, ...options] : options;
  const filtered = query
    ? allOptions.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : allOptions;

  const select = (next) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-left text-sm outline-none focus:ring-2 focus:ring-accent-500"
      >
        <span className={value ? 'text-slate-100' : 'text-slate-500'}>
          {value ? formatCategory(value) : placeholder || 'Select'}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-slate-500"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-surface-600/60 bg-surface-700 shadow-lg">
          <div className="border-b border-surface-600/60 p-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full rounded bg-surface-800 px-2 py-1 text-xs text-slate-100 outline-none ring-1 ring-surface-600 focus:ring-accent-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {value && (
              <button
                type="button"
                onClick={() => select('')}
                className="block w-full border-b border-surface-600/60 px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-surface-600"
              >
                Clear selection
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">No matches</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => select(opt)}
                  className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-600 ${
                    opt === value ? 'text-accent-400' : 'text-slate-200'
                  }`}
                >
                  {formatCategory(opt)}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
