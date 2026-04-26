const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  EXCLUDED_CATEGORIES,
  getExcludedDescriptions,
} = require('../lib/excludedCategories');
const { loadCategoryRuleMap, effectiveCategoryOf } = require('../lib/effectiveCategory');
const { amountForMonth } = require('../lib/billStatus');

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

function computeSpent(category, txns, billNames, excludedPatterns) {
  if (EXCLUDED_CATEGORIES.includes(category)) return 0;
  let total = 0;
  for (const t of txns) {
    if (descriptionMatchesPatterns(t.description, excludedPatterns)) continue;
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        if (s.category === category) total += s.amount;
      }
      continue;
    }
    if (t.amount <= 0) continue;
    if (t.effectiveCategory && EXCLUDED_CATEGORIES.includes(t.effectiveCategory)) continue;
    const categoryMatches = t.effectiveCategory === category;
    const descMatches = billNames.some((n) => descriptionContains(t.description, n));
    if (categoryMatches || descMatches) total += t.amount;
  }
  return total;
}

router.get('/', async (req, res) => {
  const { month, year } = parseMonthYear(req);

  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const [budgets, allBills, txns, ruleMap, excludedPatterns] = await Promise.all([
      prisma.budget.findMany({
        where: { month, year },
        orderBy: { category: 'asc' },
      }),
      prisma.bill.findMany({
        where: { isActive: true, NOT: { budgetCategory: null } },
      }),
      prisma.transaction.findMany({
        where: { date: { gte: startDate, lt: endDate } },
        include: {
          splits: { select: { id: true, amount: true, category: true } },
        },
      }),
      loadCategoryRuleMap(prisma),
      getExcludedDescriptions(prisma),
    ]);

    const enriched = txns.map((t) => ({
      ...t,
      effectiveCategory: effectiveCategoryOf(t, ruleMap),
    }));

    const billsByCategory = new Map();
    for (const b of allBills) {
      const a = amountForMonth(b, month - 1);
      if (!a || a <= 0) continue;
      const cat = b.budgetCategory;
      if (!billsByCategory.has(cat)) billsByCategory.set(cat, []);
      billsByCategory.get(cat).push(b);
    }

    const categories = new Set([
      ...budgets.map((b) => b.category),
      ...billsByCategory.keys(),
    ]);

    const rows = [];
    for (const category of categories) {
      const bills = billsByCategory.get(category) || [];
      const billsTotal = bills.reduce(
        (s, b) => s + (amountForMonth(b, month - 1) || 0),
        0
      );
      const billNames = bills.map((b) => b.name);
      const budget = budgets.find((b) => b.category === category) || null;
      const discretionary = budget ? budget.discretionary : 0;
      const total = billsTotal + discretionary;
      const spent = computeSpent(category, enriched, billNames, excludedPatterns);
      rows.push({
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

    rows.sort((a, b) => a.category.localeCompare(b.category));
    res.json(rows);
  } catch (err) {
    console.error('[budgets] list', err.message);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

function pickDiscretionary(body) {
  if (typeof body.discretionary === 'number') return body.discretionary;
  if (typeof body.limit === 'number') return body.limit;
  return null;
}

router.post('/', async (req, res) => {
  const { category, month, year } = req.body || {};
  const discretionary = pickDiscretionary(req.body || {});

  if (typeof category !== 'string' || !category.trim()) {
    return res.status(400).json({ error: 'category must be a non-empty string' });
  }
  if (discretionary === null || !Number.isFinite(discretionary) || discretionary < 0) {
    return res.status(400).json({ error: 'discretionary (or limit) must be a non-negative number' });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'month must be an integer 1-12' });
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'year must be a valid integer' });
  }

  try {
    const created = await prisma.budget.create({
      data: {
        category: category.trim(),
        discretionary,
        limit: discretionary,
        month,
        year,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error('[budgets] create', err.message);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const discretionary = pickDiscretionary(req.body || {});

  if (discretionary === null || !Number.isFinite(discretionary) || discretionary < 0) {
    return res.status(400).json({ error: 'discretionary (or limit) must be a non-negative number' });
  }

  try {
    const updated = await prisma.budget.update({
      where: { id },
      data: { discretionary, limit: discretionary },
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
