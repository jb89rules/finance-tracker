const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  computeItemStatus,
  enrichItemsWithPayments,
  amountForMonth,
  formatDueLabel,
  hasDate,
  categoryRollup,
} = require('../lib/itemStatus');
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
    const month0 = month - 1;
    const year = now.getFullYear();
    const { start: thisMonthStart, end: thisMonthEnd } = monthRange(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthRange(-1);

    const [thisMonthTxns, lastMonthTxns, items] = await Promise.all([
      loadEnrichedRange(prisma, thisMonthStart, thisMonthEnd),
      loadEnrichedRange(prisma, lastMonthStart, lastMonthEnd),
      prisma.plannedItem.findMany({ where: { isActive: true } }),
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

    // Group items by category, only counting those with a positive amount this month.
    const itemsByCategory = new Map();
    for (const item of items) {
      const a = amountForMonth(item, month0, year);
      if (!a || a <= 0) continue;
      const cat = item.category;
      if (!itemsByCategory.has(cat)) itemsByCategory.set(cat, []);
      itemsByCategory.get(cat).push(item);
    }

    const budgetsWithSpent = [];
    for (const [category, catItems] of itemsByCategory.entries()) {
      const rollup = categoryRollup(items, category, month0, year);
      const itemNames = catItems.map((i) => i.name);
      const spent = computeBudgetSpent(
        { category },
        thisMonthTxns,
        itemNames,
        excludedPatterns
      );
      budgetsWithSpent.push({
        id: null, // PlannedItem has no per-month budget row; the rollup is computed
        category,
        billsTotal: rollup.billsTotal,
        discretionary: rollup.discretionaryTotal,
        total: rollup.planned,
        limit: rollup.planned,
        spent,
        month,
        year,
      });
    }
    budgetsWithSpent.sort((a, b) => (a.category || '').localeCompare(b.category || ''));

    // "Bills" widget — items with a date (recurring scheduled OR one_time).
    const datedItems = items.filter(hasDate);
    const decoratedItems = datedItems.map((item) => {
      const status = computeItemStatus(item);
      return {
        ...item,
        status: status.status,
        daysUntilDue: status.daysUntilDue,
        daysOverdue: status.daysOverdue,
        dueLabel: formatDueLabel(item),
      };
    });
    const itemsWithStatus = await enrichItemsWithPayments(prisma, decoratedItems);

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
      bills: itemsWithStatus,
      topCategories,
    });
  } catch (err) {
    console.error('[dashboard]', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
