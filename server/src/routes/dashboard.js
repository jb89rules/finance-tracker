const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { computeBillStatus } = require('../lib/billStatus');

const prisma = new PrismaClient();
const router = express.Router();

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

async function sumAmounts(where) {
  const res = await prisma.transaction.aggregate({ where, _sum: { amount: true } });
  return res._sum.amount || 0;
}

function pctChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const { start: thisMonthStart, end: thisMonthEnd } = monthRange(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthRange(-1);

    const [spendingThis, spendingLast, incomeThisRaw, incomeLastRaw] =
      await Promise.all([
        sumAmounts({
          date: { gte: thisMonthStart, lt: thisMonthEnd },
          amount: { gt: 0 },
        }),
        sumAmounts({
          date: { gte: lastMonthStart, lt: lastMonthEnd },
          amount: { gt: 0 },
        }),
        sumAmounts({
          date: { gte: thisMonthStart, lt: thisMonthEnd },
          amount: { lt: 0 },
        }),
        sumAmounts({
          date: { gte: lastMonthStart, lt: lastMonthEnd },
          amount: { lt: 0 },
        }),
      ]);

    const incomeThis = Math.abs(incomeThisRaw);
    const incomeLast = Math.abs(incomeLastRaw);

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
      const spendingByCategory = await prisma.transaction.groupBy({
        by: ['category'],
        where: {
          date: { gte: thisMonthStart, lt: thisMonthEnd },
          amount: { gt: 0 },
          category: { in: budgets.map((b) => b.category) },
        },
        _sum: { amount: true },
      });
      const spentMap = new Map(
        spendingByCategory.map((row) => [row.category, row._sum.amount || 0])
      );
      budgetsWithSpent = budgets.map((b) => ({
        ...b,
        spent: spentMap.get(b.category) || 0,
      }));
    }

    const bills = await prisma.bill.findMany({
      where: { isActive: true },
      orderBy: { dueDay: 'asc' },
    });
    const billsWithStatus = bills.map((b) => ({
      ...b,
      ...computeBillStatus(b.dueDay),
    }));

    const groupedCategories = await prisma.transaction.groupBy({
      by: ['category'],
      where: {
        date: { gte: thisMonthStart, lt: thisMonthEnd },
        amount: { gt: 0 },
        category: { not: null },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });
    const topCategories = groupedCategories.map((g) => {
      const amount = g._sum.amount || 0;
      return {
        category: g.category,
        amount,
        percent: spendingThis > 0 ? (amount / spendingThis) * 100 : 0,
      };
    });

    res.json({
      netWorth: { totalBalance: 0 },
      spending: {
        thisMonth: spendingThis,
        lastMonth: spendingLast,
        percentChange: pctChange(spendingThis, spendingLast),
      },
      income: {
        thisMonth: incomeThis,
        lastMonth: incomeLast,
        percentChange: pctChange(incomeThis, incomeLast),
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
