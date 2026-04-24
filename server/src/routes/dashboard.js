const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { computeBillStatus, enrichBillsWithPayments } = require('../lib/billStatus');
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
