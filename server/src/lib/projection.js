const { EXCLUDED_CATEGORIES } = require('./excludedCategories');
const { descriptionMatchesPatterns } = require('./dashboardAggregates');
const { descriptionMatchesBillName, resolveDueDate } = require('./billStatus');

function monthsAhead(n, fromDate = new Date()) {
  const baseY = fromDate.getFullYear();
  const baseM = fromDate.getMonth();
  const out = [];
  for (let i = 1; i <= n; i++) {
    const m0 = baseM + i;
    const y = baseY + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12;
    out.push({ year: y, month: m + 1 });
  }
  return out;
}

function billNamesNeedles(bills) {
  return bills.map((b) => b.matchKeyword || b.name).filter(Boolean);
}

function isBillTransaction(txn, billNeedles) {
  return billNeedles.some((n) => descriptionMatchesBillName(txn.description, n));
}

function computeHistoricalAverages({
  txns,
  monthsCount,
  excludedPatterns,
  billNeedles,
}) {
  const totals = new Map();
  for (const t of txns) {
    if (descriptionMatchesPatterns(t.description, excludedPatterns)) continue;
    if (isBillTransaction(t, billNeedles)) continue;
    if (Array.isArray(t.splits) && t.splits.length > 0) {
      for (const s of t.splits) {
        if (EXCLUDED_CATEGORIES.includes(s.category)) continue;
        totals.set(s.category, (totals.get(s.category) || 0) + s.amount);
      }
      continue;
    }
    if (t.amount <= 0) continue;
    const cat = t.effectiveCategory;
    if (!cat) continue;
    if (EXCLUDED_CATEGORIES.includes(cat)) continue;
    totals.set(cat, (totals.get(cat) || 0) + t.amount);
  }
  const denom = Math.max(monthsCount, 1);
  const avg = new Map();
  for (const [cat, sum] of totals) {
    avg.set(cat, sum / denom);
  }
  return avg;
}

function indexBudgets(budgets) {
  const exact = new Map();
  const standingByCategory = new Map();
  for (const b of budgets) {
    exact.set(`${b.category}|${b.year}|${b.month}`, b);
  }
  const sorted = [...budgets].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
  for (const b of sorted) {
    if (!standingByCategory.has(b.category)) {
      standingByCategory.set(b.category, b);
    }
  }
  return { exact, standingByCategory };
}

function billsLinkedTotalsByCategory(bills) {
  const totals = new Map();
  for (const b of bills) {
    if (!b.budgetCategory) continue;
    totals.set(b.budgetCategory, (totals.get(b.budgetCategory) || 0) + b.amount);
  }
  return totals;
}

function computeCategoryProjection({
  category,
  year,
  month,
  exactBudgets,
  standingBudgets,
  historicalAverages,
  linkedBillsTotal,
}) {
  const exact = exactBudgets.get(`${category}|${year}|${month}`);
  if (exact) {
    return {
      amount: Math.max(0, exact.limit - linkedBillsTotal),
      source: 'budget',
    };
  }
  const standing = standingBudgets.get(category);
  if (standing) {
    return {
      amount: Math.max(0, standing.limit - linkedBillsTotal),
      source: 'standing-budget',
    };
  }
  const avg = historicalAverages.get(category) || 0;
  if (avg > 0) {
    return { amount: avg, source: 'avg' };
  }
  return { amount: 0, source: 'none' };
}

function projectMonth({
  year,
  month,
  bills,
  paycheckCount,
  paycheckAmount,
  exactBudgets,
  standingBudgets,
  historicalAverages,
  linkedBillsByCategory,
}) {
  const billsForMonth = bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: b.amount,
    dueDate: resolveDueDate(year, month - 1, b.dueDay),
    budgetCategory: b.budgetCategory || null,
  }));
  const billsTotal = billsForMonth.reduce((s, b) => s + b.amount, 0);

  const categories = new Set();
  for (const key of exactBudgets.keys()) {
    const [cat, y, m] = key.split('|');
    if (Number(y) === year && Number(m) === month) categories.add(cat);
  }
  for (const cat of standingBudgets.keys()) categories.add(cat);
  for (const cat of historicalAverages.keys()) categories.add(cat);

  const spendingByCategory = [];
  for (const cat of categories) {
    if (EXCLUDED_CATEGORIES.includes(cat)) continue;
    const linked = linkedBillsByCategory.get(cat) || 0;
    const proj = computeCategoryProjection({
      category: cat,
      year,
      month,
      exactBudgets,
      standingBudgets,
      historicalAverages,
      linkedBillsTotal: linked,
    });
    if (proj.amount > 0 || proj.source === 'budget' || proj.source === 'standing-budget') {
      spendingByCategory.push({ category: cat, ...proj });
    }
  }
  spendingByCategory.sort((a, b) => b.amount - a.amount);
  const spendingTotal = spendingByCategory.reduce((s, c) => s + c.amount, 0);

  const income = paycheckCount * paycheckAmount;
  const net = income - billsTotal - spendingTotal;

  return {
    year,
    month,
    income,
    paycheckCount,
    bills: billsForMonth,
    billsTotal,
    spending: { byCategory: spendingByCategory, total: spendingTotal },
    net,
  };
}

module.exports = {
  monthsAhead,
  billNamesNeedles,
  isBillTransaction,
  computeHistoricalAverages,
  indexBudgets,
  billsLinkedTotalsByCategory,
  computeCategoryProjection,
  projectMonth,
};
