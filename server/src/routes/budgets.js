const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  EXCLUDED_CATEGORIES,
  getNonTransferDescriptionFilter,
} = require('../lib/excludedCategories');

const prisma = new PrismaClient();
const router = express.Router();

function parseMonthYear(req) {
  const now = new Date();
  const month = Number.parseInt(req.query.month, 10) || now.getMonth() + 1;
  const year = Number.parseInt(req.query.year, 10) || now.getFullYear();
  return { month, year };
}

router.get('/', async (req, res) => {
  const { month, year } = parseMonthYear(req);

  try {
    const NON_TRANSFER_DESCRIPTION = await getNonTransferDescriptionFilter(prisma);
    const budgets = await prisma.budget.findMany({
      where: { month, year },
      orderBy: { category: 'asc' },
    });

    if (budgets.length === 0) {
      return res.json([]);
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

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

    const withSpent = await Promise.all(
      budgets.map(async (b) => {
        if (EXCLUDED_CATEGORIES.includes(b.category)) {
          return { ...b, spent: 0 };
        }

        const billNames = billNamesByBudgetCategory.get(b.category) || [];
        const orClauses = [{ category: b.category }];
        for (const name of billNames) {
          orClauses.push({
            description: { contains: name, mode: 'insensitive' },
          });
        }

        const unsplit = await prisma.transaction.aggregate({
          where: {
            date: { gte: startDate, lt: endDate },
            amount: { gt: 0 },
            splits: { none: {} },
            ...NON_TRANSFER_DESCRIPTION,
            AND: [
              { OR: orClauses },
              {
                OR: [
                  { category: null },
                  { category: { notIn: EXCLUDED_CATEGORIES } },
                ],
              },
            ],
          },
          _sum: { amount: true },
        });

        const fromSplits = await prisma.transactionSplit.aggregate({
          where: {
            category: b.category,
            transaction: {
              date: { gte: startDate, lt: endDate },
              amount: { gt: 0 },
              ...NON_TRANSFER_DESCRIPTION,
            },
          },
          _sum: { amount: true },
        });

        const spent =
          (unsplit._sum.amount || 0) + (fromSplits._sum.amount || 0);
        return { ...b, spent };
      })
    );

    res.json(withSpent);
  } catch (err) {
    console.error('[budgets] list', err.message);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

router.post('/', async (req, res) => {
  const { category, limit, month, year } = req.body || {};

  if (typeof category !== 'string' || !category.trim()) {
    return res.status(400).json({ error: 'category must be a non-empty string' });
  }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return res.status(400).json({ error: 'limit must be a positive number' });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'month must be an integer 1-12' });
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'year must be a valid integer' });
  }

  try {
    const created = await prisma.budget.create({
      data: { category: category.trim(), limit, month, year },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error('[budgets] create', err.message);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { limit } = req.body || {};

  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return res.status(400).json({ error: 'limit must be a positive number' });
  }

  try {
    const updated = await prisma.budget.update({
      where: { id },
      data: { limit },
    });
    res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Budget not found' });
    }
    console.error('[budgets] patch', err.message);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.budget.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Budget not found' });
    }
    console.error('[budgets] delete', err.message);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

module.exports = router;
