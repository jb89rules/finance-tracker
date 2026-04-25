const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getExcludedDescriptions } = require('../lib/excludedCategories');
const { loadCategoryRuleMap, effectiveCategoryOf } = require('../lib/effectiveCategory');
const { paychecksInMonth } = require('../lib/paycheck');
const {
  monthsAhead,
  billNamesNeedles,
  computeHistoricalAverages,
  indexBudgets,
  billsLinkedTotalsByCategory,
  projectMonth,
} = require('../lib/projection');

const prisma = new PrismaClient();
const router = express.Router();

const HISTORY_MONTHS = 3;
const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 24;

function startOfMonth(year, month0) {
  return new Date(year, month0, 1);
}

router.get('/', async (req, res) => {
  try {
    const requested = parseInt(req.query.months, 10);
    const monthsCount = Number.isFinite(requested)
      ? Math.max(1, Math.min(MAX_MONTHS, requested))
      : DEFAULT_MONTHS;

    const now = new Date();
    const currentY = now.getFullYear();
    const currentM = now.getMonth();
    const historyStart = startOfMonth(currentY, currentM - HISTORY_MONTHS);
    const historyEnd = startOfMonth(currentY, currentM);

    const [bills, settingsRows, ruleMap, historyTxns, allBudgets, excludedPatterns] =
      await Promise.all([
        prisma.bill.findMany({ where: { isActive: true }, orderBy: { dueDay: 'asc' } }),
        prisma.appSetting.findMany({
          where: { key: { in: ['paycheckAmount', 'payFrequency', 'lastPayDate'] } },
        }),
        loadCategoryRuleMap(prisma),
        prisma.transaction.findMany({
          where: { date: { gte: historyStart, lt: historyEnd } },
          include: { splits: { select: { id: true, amount: true, category: true } } },
        }),
        prisma.budget.findMany(),
        getExcludedDescriptions(prisma),
      ]);

    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const paycheckAmount = Number(settings.paycheckAmount || 0);
    const payFrequency = settings.payFrequency || 'bi-weekly';
    const lastPayDate = settings.lastPayDate || null;

    const enrichedHistory = historyTxns.map((t) => ({
      ...t,
      effectiveCategory: effectiveCategoryOf(t, ruleMap),
    }));

    const billNeedles = billNamesNeedles(bills);
    const historicalAverages = computeHistoricalAverages({
      txns: enrichedHistory,
      monthsCount: HISTORY_MONTHS,
      excludedPatterns,
      billNeedles,
    });

    const recentBudgetsCutoff = startOfMonth(currentY, currentM - HISTORY_MONTHS);
    const standingSourceBudgets = allBudgets.filter((b) => {
      const d = new Date(b.year, b.month - 1, 1);
      return d >= recentBudgetsCutoff && d < historyEnd;
    });
    const { standingByCategory } = indexBudgets(standingSourceBudgets);

    const futureMonths = monthsAhead(monthsCount, now);
    const futureKeys = new Set(futureMonths.map((m) => `${m.year}|${m.month}`));
    const futureBudgets = allBudgets.filter((b) => futureKeys.has(`${b.year}|${b.month}`));
    const { exact: exactBudgets } = indexBudgets(futureBudgets);

    const linkedBillsByCategory = billsLinkedTotalsByCategory(bills);

    const months = futureMonths.map(({ year, month }) =>
      projectMonth({
        year,
        month,
        bills,
        paycheckCount: paychecksInMonth(lastPayDate, payFrequency, year, month),
        paycheckAmount,
        exactBudgets,
        standingBudgets: standingByCategory,
        historicalAverages,
        linkedBillsByCategory,
      })
    );

    const summary = months.reduce(
      (acc, m) => ({
        totalIncome: acc.totalIncome + m.income,
        totalBills: acc.totalBills + m.billsTotal,
        totalSpending: acc.totalSpending + m.spending.total,
        totalNet: acc.totalNet + m.net,
      }),
      { totalIncome: 0, totalBills: 0, totalSpending: 0, totalNet: 0 }
    );

    res.json({
      months,
      summary,
      meta: {
        monthsCount,
        historyMonths: HISTORY_MONTHS,
        paycheckAmount,
        payFrequency,
        lastPayDate,
      },
    });
  } catch (err) {
    console.error('[projection]', err.message);
    res.status(500).json({ error: 'Failed to compute projection' });
  }
});

module.exports = router;
