const STATUS_STYLES = {
  upcoming: { dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'Upcoming' },
  'due-soon': { dot: 'bg-amber-500', text: 'text-amber-400', label: 'Due soon' },
  overdue: { dot: 'bg-red-500', text: 'text-red-400', label: 'Overdue' },
  paid: { dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'Paid' },
};

export function statusStyle(status) {
  return STATUS_STYLES[status] || null;
}

export default function StatusPill({ status }) {
  const style = STATUS_STYLES[status];
  if (!style) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${style.text}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
