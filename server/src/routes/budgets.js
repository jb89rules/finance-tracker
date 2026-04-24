const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  EXCLUDED_CATEGORIES,
  getExcludedDescriptions,
} = require('../lib/excludedCategories');
const { loadCategoryRuleMap, effectiveCategoryOf } = require('../lib/effectiveCategory');

const prisma = new PrismaClient();
const router = express.Router();

function parseMonthYear(req) {
  const now = new Date();
  const month = Number.parseInt(req.query.month, 10) || now.getMonth() + 1;
  const year = Number.parseInt(req.query.year, 10) || now.getFullYear();
  return { month, year };
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

function computeSpent(budget, txns, billNames, excludedPatterns) {
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
  const { month, year } = parseMonthYear(req);

  try {
    const budgets = await prisma.budget.findMany({
      where: { month, year },
      orderBy: { category: 'asc' },
    });

    if (budgets.length === 0) {
      return res.json([]);
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const [txns, ruleMap, excludedPatterns, linkedBills] = await Promise.all([
      prisma.transaction.findMany({
        where: { date: { gte: startDate, lt: endDate } },
        include: {
          splits: { select: { id: true, amount: true, category: true } },
        },
      }),
      loadCategoryRuleMap(prisma),
      getExcludedDescriptions(prisma),
      prisma.bill.findMany({
        where: {
          isActive: true,
          budgetCategory: { in: budgets.map((b) => b.category) },
        },
        select: { name: true, budgetCategory: true },
      }),
    ]);

    const enriched = txns.map((t) => ({
      ...t,
      effectiveCategory: effectiveCategoryOf(t, ruleMap),
    }));

    const billNamesByBudgetCategory = new Map();
    for (const bill of linkedBills) {
      if (!billNamesByBudgetCategory.has(bill.budgetCategory)) {
        billNamesByBudgetCategory.set(bill.budgetCategory, []);
      }
      billNamesByBudgetCategory.get(bill.budgetCategory).push(bill.name);
    }

    const withSpent = budgets.map((b) => ({
      ...b,
      spent: computeSpent(
        b,
        enriched,
        billNamesByBudgetCategory.get(b.category) || [],
        excludedPatterns
      ),
    }));

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
