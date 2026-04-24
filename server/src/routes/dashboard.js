const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { computeBillStatus, enrichBillsWithPayments } = require('../lib/billStatus');

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

      budgetsWithSpent = await Promise.all(
        budgets.map(async (b) => {
          const billNames = billNamesByBudgetCategory.get(b.category) || [];
          const orClauses = [{ category: b.category }];
          for (const name of billNames) {
            orClauses.push({
              description: { contains: name, mode: 'insensitive' },
            });
          }
          const unsplit = await prisma.transaction.aggregate({
            where: {
              date: { gte: thisMonthStart, lt: thisMonthEnd },
              amount: { gt: 0 },
              splits: { none: {} },
              OR: orClauses,
            },
            _sum: { amount: true },
          });
          const fromSplits = await prisma.transactionSplit.aggregate({
            where: {
              category: b.category,
              transaction: {
                date: { gte: thisMonthStart, lt: thisMonthEnd },
                amount: { gt: 0 },
              },
            },
            _sum: { amount: true },
          });
          const spent =
            (unsplit._sum.amount || 0) + (fromSplits._sum.amount || 0);
          return { ...b, spent };
        })
      );
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
