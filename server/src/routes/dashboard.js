const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  computeBillStatus,
  enrichBillsWithPayments,
  amountForMonth,
} = require('../lib/billStatus');
const { getExcludedDescriptions } = require('../lib/excludedCategories');
const { loadCategoryRuleMap, effectiveCategoryOf } = require('../lib/effectiveCategory');
const {
  pctChange,
  computeMonthTotals,
  computeTopCategories,
  computeBudgetSpent,
} = require('../lib/dashboardAggregates');

const prisma = new PrismaClient();
const router = express.Router();

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
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

    const [budgets, bills] = await Promise.all([
      prisma.budget.findMany({
        where: { month, year },
        orderBy: { category: 'asc' },
      }),
      prisma.bill.findMany({
        where: { isActive: true },
        orderBy: { dueDay: 'asc' },
      }),
    ]);

    const billsByCategory = new Map();
    for (const b of bills) {
      if (!b.budgetCategory) continue;
      const a = amountForMonth(b, month - 1);
      if (!a || a <= 0) continue;
      if (!billsByCategory.has(b.budgetCategory)) {
        billsByCategory.set(b.budgetCategory, []);
      }
      billsByCategory.get(b.budgetCategory).push(b);
    }

    const budgetCategories = new Set([
      ...budgets.map((b) => b.category),
      ...billsByCategory.keys(),
    ]);

    const budgetsWithSpent = [];
    for (const category of budgetCategories) {
      const linkedBills = billsByCategory.get(category) || [];
      const billsTotal = linkedBills.reduce(
        (s, b) => s + (amountForMonth(b, month - 1) || 0),
        0
      );
      const budget = budgets.find((b) => b.category === category) || null;
      const discretionary = budget ? budget.discretionary : 0;
      const total = billsTotal + discretionary;
      const spent = computeBudgetSpent(
        { category },
        thisMonthTxns,
        linkedBills.map((b) => b.name),
        excludedPatterns
      );
      budgetsWithSpent.push({
        id: budget ? budget.id : null,
        category,
        billsTotal: Math.round(billsTotal * 100) / 100,
        discretionary,
        total,
        limit: total,
        spent,
        month,
        year,
      });
    }
    budgetsWithSpent.sort((a, b) => a.category.localeCompare(b.category));
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
