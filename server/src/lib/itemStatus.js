const MS_PER_DAY = 86400000;

const SHORT_MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(d) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function resolveDueDate(year, month, dueDay) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dueDay, lastDay));
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// True iff this item has a discrete event date (recurring scheduled OR one-time with date).
function hasDate(item) {
  if (item.kind === 'one_time') return Boolean(item.oneTimeDate);
  return item.dueDay !== null && item.dueDay !== undefined;
}

function computeRecurringStatus(dueDay) {
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

function computeOneTimeStatus(oneTimeDate) {
  const today = startOfToday();
  const target = startOfDay(new Date(oneTimeDate));

  const diff = Math.round((target - today) / MS_PER_DAY);
  if (diff < 0) {
    return { daysUntilDue: 0, daysOverdue: -diff, status: 'overdue' };
  }
  if (diff <= 7) {
    return { daysUntilDue: diff, daysOverdue: 0, status: 'due-soon' };
  }
  return { daysUntilDue: diff, daysOverdue: 0, status: 'upcoming' };
}

// Unified entry point. Accepts a PlannedItem or — for back-compat — a bare dueDay number.
function computeItemStatus(itemOrDueDay) {
  if (typeof itemOrDueDay === 'number') {
    return computeRecurringStatus(itemOrDueDay);
  }
  const item = itemOrDueDay;
  if (item.kind === 'one_time') {
    if (!item.oneTimeDate) {
      return { status: null, daysUntilDue: null, daysOverdue: null };
    }
    return computeOneTimeStatus(item.oneTimeDate);
  }
  if (item.dueDay === null || item.dueDay === undefined) {
    return { status: null, daysUntilDue: null, daysOverdue: null };
  }
  return computeRecurringStatus(item.dueDay);
}

function computeMostRecentDueForDay(dueDay) {
  const today = startOfToday();
  const y = today.getFullYear();
  const m = today.getMonth();
  const thisMonthDue = resolveDueDate(y, m, dueDay);
  if (thisMonthDue <= today) return thisMonthDue;
  const lm = m === 0 ? 11 : m - 1;
  const ly = m === 0 ? y - 1 : y;
  return resolveDueDate(ly, lm, dueDay);
}

// Returns the most recent past-or-equal due Date for an item, or null if not date-bound.
function computeMostRecentDue(itemOrDueDay) {
  if (typeof itemOrDueDay === 'number') {
    return computeMostRecentDueForDay(itemOrDueDay);
  }
  const item = itemOrDueDay;
  if (item.kind === 'one_time') {
    return item.oneTimeDate ? new Date(item.oneTimeDate) : null;
  }
  if (item.dueDay === null || item.dueDay === undefined) return null;
  return computeMostRecentDueForDay(item.dueDay);
}

function descriptionMatchesItemName(description, itemName) {
  const desc = (description || '').toLowerCase();
  const name = (itemName || '').toLowerCase().trim();
  if (!desc || !name) return false;
  const tokenize = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);
  const descTokens = new Set(tokenize(desc));
  const nameTokens = tokenize(name);
  if (nameTokens.length === 0) return false;
  return nameTokens.every((t) => descTokens.has(t));
}

// Dollar amount that hits in the requested (year, month0).
// One-time: amount only if oneTimeDate falls in that (year, month0).
// Recurring: monthlyAmounts[month0] when populated; else flat amount.
function amountForMonth(item, month0, year) {
  if (item && item.kind === 'one_time') {
    if (!item.oneTimeDate) return 0;
    const d = new Date(item.oneTimeDate);
    if (d.getMonth() !== month0) return 0;
    if (year !== undefined && d.getFullYear() !== year) return 0;
    return item.amount;
  }
  if (item && Array.isArray(item.monthlyAmounts) && item.monthlyAmounts.length === 12) {
    return item.monthlyAmounts[month0];
  }
  return item ? item.amount : 0;
}

// Server-formatted "due" label so the frontend doesn't branch on dueDay vs oneTimeDate.
function formatDueLabel(item) {
  if (item.kind === 'one_time') {
    if (!item.oneTimeDate) return null;
    const d = new Date(item.oneTimeDate);
    return `${SHORT_MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
  }
  if (item.dueDay === null || item.dueDay === undefined) return null;
  return `the ${ordinal(item.dueDay)}`;
}

async function findItemPayment(prisma, item) {
  if (item.linkedTransactionId) {
    const linked = await prisma.transaction.findUnique({
      where: { id: item.linkedTransactionId },
    });
    return linked || null;
  }

  const targetDue = computeMostRecentDue(item);
  if (!targetDue) return null;

  const monthAmount = amountForMonth(item, targetDue.getMonth(), targetDue.getFullYear());
  if (!monthAmount || monthAmount <= 0) return null;

  const windowStart = new Date(targetDue);
  windowStart.setDate(windowStart.getDate() - item.paymentWindowDays);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(targetDue);
  windowEnd.setDate(windowEnd.getDate() + item.paymentWindowDays + 1);
  windowEnd.setHours(0, 0, 0, 0);

  const amountLow = monthAmount * 0.9;
  const amountHigh = monthAmount * 1.1;

  const candidates = await prisma.transaction.findMany({
    where: {
      date: { gte: windowStart, lt: windowEnd },
      amount: { gte: amountLow, lte: amountHigh },
    },
    orderBy: { date: 'desc' },
  });

  const needle = item.matchKeyword || item.name;
  return (
    candidates.find((t) => descriptionMatchesItemName(t.description, needle)) ||
    null
  );
}

async function enrichItemsWithPayments(prisma, items) {
  return Promise.all(
    items.map(async (item) => {
      if (!item.isActive) return item;
      if (!hasDate(item)) return item;
      const match = await findItemPayment(prisma, item);
      if (!match) return item;
      return {
        ...item,
        paidDate: match.date,
        paidAmount: match.amount,
        status: 'paid',
      };
    })
  );
}

// Sums planned amount for `category` in (year, month0).
// Returns { planned, billsTotal, discretionaryTotal, oneTimeTotal }.
function categoryRollup(items, category, month0, year) {
  let billsTotal = 0;
  let discretionaryTotal = 0;
  let oneTimeTotal = 0;
  for (const item of items) {
    if (!item.isActive) continue;
    if (item.category !== category) continue;
    const a = amountForMonth(item, month0, year) || 0;
    if (a <= 0) continue;
    if (item.kind === 'one_time') {
      oneTimeTotal += a;
    } else if (item.dueDay !== null && item.dueDay !== undefined) {
      billsTotal += a;
    } else {
      discretionaryTotal += a;
    }
  }
  const round = (n) => Math.round(n * 100) / 100;
  return {
    billsTotal: round(billsTotal),
    discretionaryTotal: round(discretionaryTotal),
    oneTimeTotal: round(oneTimeTotal),
    planned: round(billsTotal + discretionaryTotal + oneTimeTotal),
  };
}

// Back-compat aliases for the existing test file's "bill" terminology.
const computeBillStatus = computeItemStatus;
const descriptionMatchesBillName = descriptionMatchesItemName;
const findBillPayment = findItemPayment;
const enrichBillsWithPayments = enrichItemsWithPayments;

function billsTotalForCategoryMonth(bills, category, month) {
  if (!category) return 0;
  let total = 0;
  for (const b of bills) {
    if (!b.isActive) continue;
    if (b.budgetCategory !== category) continue;
    total += amountForMonth(b, month - 1) || 0;
  }
  return total;
}

module.exports = {
  computeItemStatus,
  computeMostRecentDue,
  descriptionMatchesItemName,
  amountForMonth,
  findItemPayment,
  enrichItemsWithPayments,
  categoryRollup,
  formatDueLabel,
  hasDate,
  resolveDueDate,
  // Legacy aliases retained while old call sites exist.
  computeBillStatus,
  descriptionMatchesBillName,
  findBillPayment,
  enrichBillsWithPayments,
  billsTotalForCategoryMonth,
};
