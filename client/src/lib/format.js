export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const SHORT_MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function monthLabel(month, year) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function dueText(item) {
  if (item.status === 'overdue') {
    const n = item.daysOverdue ?? 0;
    return `${n} day${n === 1 ? '' : 's'} overdue`;
  }
  if (item.daysUntilDue === 0) return 'due today';
  if (item.daysUntilDue === 1) return 'in 1 day';
  return `in ${item.daysUntilDue} days`;
}
