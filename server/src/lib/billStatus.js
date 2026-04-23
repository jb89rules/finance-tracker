const MS_PER_DAY = 86400000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveDueDate(year, month, dueDay) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dueDay, lastDay));
}

function computeBillStatus(dueDay) {
  const today = startOfToday();
  const y = today.getFullYear();
  const m = today.getMonth();

  const thisMonthDue = resolveDueDate(y, m, dueDay);
  const overdueThisMonth = thisMonthDue < today;

  let nextDue;
  if (overdueThisMonth) {
    const nm = m === 11 ? 0 : m + 1;
    const ny = m === 11 ? y + 1 : y;
    nextDue = resolveDueDate(ny, nm, dueDay);
  } else {
    nextDue = thisMonthDue;
  }

  const daysUntilDue = Math.round((nextDue - today) / MS_PER_DAY);
  const daysOverdue = overdueThisMonth
    ? Math.round((today - thisMonthDue) / MS_PER_DAY)
    : 0;

  let status;
  if (overdueThisMonth) status = 'overdue';
  else if (daysUntilDue <= 7) status = 'due-soon';
  else status = 'upcoming';

  return { daysUntilDue, daysOverdue, status };
}

module.exports = { computeBillStatus };
