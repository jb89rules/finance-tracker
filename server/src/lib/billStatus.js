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

function computeMostRecentDue(dueDay) {
  const today = startOfToday();
  const y = today.getFullYear();
  const m = today.getMonth();
  const thisMonthDue = resolveDueDate(y, m, dueDay);
  if (thisMonthDue <= today) return thisMonthDue;
  const lm = m === 0 ? 11 : m - 1;
  const ly = m === 0 ? y - 1 : y;
  return resolveDueDate(ly, lm, dueDay);
}

function descriptionMatchesBillName(description, billName) {
  const desc = (description || '').toLowerCase();
  const name = (billName || '').toLowerCase().trim();
  if (!desc || !name) return false;
  const tokenize = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);
  const descTokens = new Set(tokenize(desc));
  const nameTokens = tokenize(name);
  if (nameTokens.length === 0) return false;
  return nameTokens.every((t) => descTokens.has(t));
}

async function findBillPayment(prisma, bill) {
  if (bill.linkedTransactionId) {
    const linked = await prisma.transaction.findUnique({
      where: { id: bill.linkedTransactionId },
    });
    return linked || null;
  }

  const mostRecentDue = computeMostRecentDue(bill.dueDay);
  const windowStart = new Date(mostRecentDue);
  windowStart.setDate(windowStart.getDate() - bill.paymentWindowDays);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(mostRecentDue);
  windowEnd.setDate(windowEnd.getDate() + bill.paymentWindowDays + 1);
  windowEnd.setHours(0, 0, 0, 0);

  const amountLow = bill.amount * 0.9;
  const amountHigh = bill.amount * 1.1;

  const candidates = await prisma.transaction.findMany({
    where: {
      date: { gte: windowStart, lt: windowEnd },
      amount: { gte: amountLow, lte: amountHigh },
    },
    orderBy: { date: 'desc' },
  });

  const needle = bill.matchKeyword || bill.name;
  return (
    candidates.find((t) => descriptionMatchesBillName(t.description, needle)) ||
    null
  );
}

async function enrichBillsWithPayments(prisma, bills) {
  return Promise.all(
    bills.map(async (bill) => {
      if (!bill.isActive) return bill;
      const match = await findBillPayment(prisma, bill);
      if (!match) return bill;
      return {
        ...bill,
        paidDate: match.date,
        paidAmount: match.amount,
        status: 'paid',
      };
    })
  );
}

module.exports = {
  computeBillStatus,
  computeMostRecentDue,
  descriptionMatchesBillName,
  findBillPayment,
  enrichBillsWithPayments,
};
