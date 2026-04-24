const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { computeBillStatus, enrichBillsWithPayments } = require('../lib/billStatus');
const {
  EXCLUDED_CATEGORIES,
  getExcludedDescriptions,
} = require('../lib/excludedCategories');
const { loadCategoryRuleMap, effectiveCategoryOf } = require('../lib/effectiveCategory');

const prisma = new PrismaClient();
const router = express.Router();

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

function pctChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function descriptionMatchesPatterns(description, patterns) {
  if (!patterns || patterns.length === 0) return false;
  const lower = (description || '').toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function descriptionContains(description, needle) {
  if (!description || !needle) return false;
  return description.toLowerCase().includes(needle.toLowerCase());
}

function enrichTxn(t, ruleMap) {
  return { ...t, effectiveCategory: effectiveCategoryOf(t, ruleMap) };
}

async function loadEnrichedRange(prisma, start, end) {
  const [txns, ruleMap] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: start, lt: end } },
      include: {
        splits: { select: { id: true, amount: true, category: true } },
      },
    }),
    loadCategoryRuleMap(prisma),
  ]);
  return txns.map((t) => enrichTxn(t, ruleMap));
}

function computeMonthTotals(txns, excludedPatterns) {
  let spending = 0;
  let income = 0;
  for (const t of txns) {
    if (descriptionMatchesPatterns(t.description, excludedPatterns)) continue;
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        if (EXCLUDED_CATEGORIES.includes(s.category)) continue;
        spending += s.amount;
      }
      continue;
    }
    if (t.effectiveCategory && EXCLUDED_CATEGORIES.includes(t.effectiveCategory)) {
      continue;
    }
    if (t.amount > 0) spending += t.amount;
    else if (t.amount < 0) income += Math.abs(t.amount);
  }
  return { spending, income };
}

function computeTopCategories(txns, excludedPatterns, total) {
  const byCategory = new Map();
  for (const t of txns) {
    if (descriptionMatchesPatterns(t.description, excludedPatterns)) continue;
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        if (EXCLUDED_CATEGORIES.includes(s.category)) continue;
        byCategory.set(s.category, (byCategory.get(s.category) || 0) + s.amount);
      }
      continue;
    }
    if (t.amount <= 0) continue;
    const cat = t.effectiveCategory;
    if (!cat) continue;
    if (EXCLUDED_CATEGORIES.includes(cat)) continue;
    byCategory.set(cat, (byCategory.get(cat) || 0) + t.amount);
  }
  return [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }));
}

function computeBudgetSpent(budget, txns, billNames, excludedPatterns) {
  if (EXCLUDED_CATEGORIES.includes(budget.category)) return 0;
  let total = 0;
  for (const t of txns) {
    if (descriptionMatchesPatterns(t.description, excludedPatterns)) continue;
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        if (s.category === budget.category) total += s.amount;
      }
      continue;
    }
    if (t.amount <= 0) continue;
    if (t.effectiveCategory && EXCLUDED_CATEGORIES.includes(t.effectiveCategory)) continue;
    const categoryMatches = t.effectiveCategory === budget.category;
    const descMatches = billNames.some((n) => descriptionContains(t.description, n));
    if (categoryMatches || descMatches) total += t.amount;
  }
  return total;
}

router.get('/', async (req, res) => {
  try {
    const excludedPatterns = await getExcludedDescriptions(prisma);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const { start: thisMonthStart, end: thisMonthEnd } = monthRange(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthRange(-1);

    const [thisMonthTxns, lastMonthTxns] = await Promise.all([
      loadEnrichedRange(prisma, thisMonthStart, thisMonthEnd),
      loadEnrichedRange(prisma, lastMonthStart, lastMonthEnd),
    ]);

    const thisTotals = computeMonthTotals(thisMonthTxns, excludedPatterns);
    const lastTotals = computeMonthTotals(lastMonthTxns, excludedPatterns);

    const recentTransactions = await prisma.transaction.findMany({
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        account: { select: { id: true, institution: true, name: true } },
      },
    });

    const budgets = await prisma.budget.findMany({
      where: { month, year },
      orderBy: { category: 'asc' },
    });

    let budgetsWithSpent = [];
    if (budgets.length > 0) {
      const budgetCategories = budgets.map((b) => b.category);
      const linkedBills = await prisma.bill.findMany({
        where: {
          isActive: true,
          budgetCategory: { in: budgetCategories },
        },
        select: { name: true, budgetCategory: true },
      });
      const billNamesByBudgetCategory = new Map();
      for (const bill of linkedBills) {
        if (!billNamesByBudgetCategory.has(bill.budgetCategory)) {
          billNamesByBudgetCategory.set(bill.budgetCategory, []);
        }
        billNamesByBudgetCategory.get(bill.budgetCategory).push(bill.name);
      }

      budgetsWithSpent = budgets.map((b) => ({
        ...b,
        spent: computeBudgetSpent(
          b,
          thisMonthTxns,
          billNamesByBudgetCategory.get(b.category) || [],
          excludedPatterns
        ),
      }));
    }

    const bills = await prisma.bill.findMany({
      where: { isActive: true },
      orderBy: { dueDay: 'asc' },
    });
    const withStatus = bills.map((b) => ({
      ...b,
      ...computeBillStatus(b.dueDay),
    }));
    const billsWithStatus = await enrichBillsWithPayments(prisma, withStatus);

    const topCategories = computeTopCategories(
      thisMonthTxns,
      excludedPatterns,
      thisTotals.spending
    );

    res.json({
      netWorth: { totalBalance: 0 },
      spending: {
        thisMonth: thisTotals.spending,
        lastMonth: lastTotals.spending,
        percentChange: pctChange(thisTotals.spending, lastTotals.spending),
      },
      income: {
        thisMonth: thisTotals.income,
        lastMonth: lastTotals.income,
        percentChange: pctChange(thisTotals.income, lastTotals.income),
      },
      recentTransactions,
      budgets: budgetsWithSpent,
      bills: billsWithStatus,
      topCategories,
    });
  } catch (err) {
    console.error('[dashboard]', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
