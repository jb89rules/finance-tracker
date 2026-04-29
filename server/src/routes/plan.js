const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  EXCLUDED_CATEGORIES,
  getExcludedDescriptions,
} = require('../lib/excludedCategories');
const { loadCategoryRuleMap, effectiveCategoryOf } = require('../lib/effectiveCategory');
const {
  computeItemStatus,
  enrichItemsWithPayments,
  amountForMonth,
  formatDueLabel,
  hasDate,
  categoryRollup,
} = require('../lib/itemStatus');
const { validatePlannedItemInput } = require('../lib/plannedItemValidation');

const prisma = new PrismaClient();
const router = express.Router();

function parseMonthYear(req) {
  const now = new Date();
  const month = Number.parseInt(req.query.month, 10) || now.getMonth() + 1;
  const year = Number.parseInt(req.query.year, 10) || now.getFullYear();
  return { month, year };
}

// Returns the item with status, due label, and the dollar amount that hits in (year, month0).
function decorateItem(item, month0, year) {
  const status = computeItemStatus(item);
  return {
    ...item,
    status: status.status,
    daysUntilDue: status.daysUntilDue,
    daysOverdue: status.daysOverdue,
    dueLabel: formatDueLabel(item),
    amountForMonth: amountForMonth(item, month0, year),
  };
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

// Mirrors the spent calculation from the old budgets route, but reads from PlannedItem.
function computeSpent(category, txns, itemNames, excludedPatterns) {
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
    const descMatches = itemNames.some((n) => descriptionContains(t.description, n));
    if (categoryMatches || descMatches) total += t.amount;
  }
  return total;
}

// GET /api/plan/detect — same logic as /api/bills/detect, now namespaced under /plan.
router.get('/detect', async (req, res) => {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  try {
    const txns = await prisma.transaction.findMany({
      where: {
        date: { gte: ninetyDaysAgo },
        amount: { gt: 0 },
      },
      orderBy: { date: 'asc' },
    });

    const groups = new Map();
    for (const t of txns) {
      const key = t.description.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }

    const suggestions = [];
    for (const list of groups.values()) {
      if (list.length < 2) continue;

      const sortedAmounts = list.map((t) => t.amount).sort((a, b) => a - b);
      const median = sortedAmounts[Math.floor(sortedAmounts.length / 2)];
      if (median <= 0) continue;

      const similar = list.filter(
        (t) => Math.abs(t.amount - median) / median <= 0.15
      );
      if (similar.length < 2) continue;

      const avg = similar.reduce((s, t) => s + t.amount, 0) / similar.length;

      const dayCounts = new Map();
      for (const t of similar) {
        const d = new Date(t.date).getDate();
        dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
      }
      const mostCommonDay = [...dayCounts.entries()].sort(
        (a, b) => b[1] - a[1]
      )[0][0];

      suggestions.push({
        name: similar[0].description,
        matchKeyword: similar[0].description,
        kind: 'recurring',
        amount: Math.round(avg * 100) / 100,
        dueDay: mostCommonDay,
        txnCategory: similar[0].category || null,
      });
    }

    suggestions.sort((a, b) => b.amount - a.amount);
    res.json(suggestions);
  } catch (err) {
    console.error('[plan] detect', err.message);
    res.status(500).json({ error: 'Failed to detect items' });
  }
});

// GET /api/plan/items — list with optional filters.
router.get('/items', async (req, res) => {
  const { month, year } = parseMonthYear(req);
  const month0 = month - 1;

  const where = {};
  if (req.query.category !== undefined) {
    where.category = req.query.category || null;
  }
  if (req.query.kind !== undefined) {
    where.kind = req.query.kind;
  }
  if (req.query.isActive !== undefined) {
    where.isActive = req.query.isActive === 'true';
  }

  try {
    const items = await prisma.plannedItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { dueDay: 'asc' }, { name: 'asc' }],
    });

    const decorated = items.map((i) => decorateItem(i, month0, year));
    const enriched = await enrichItemsWithPayments(prisma, decorated);

    let filtered = enriched;
    if (req.query.hasDate === 'true') filtered = enriched.filter(hasDate);
    if (req.query.hasDate === 'false') filtered = enriched.filter((i) => !hasDate(i));

    res.json(filtered);
  } catch (err) {
    console.error('[plan] items', err.message);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET /api/plan/rollup — monthly category rollup.
router.get('/rollup', async (req, res) => {
  const { month, year } = parseMonthYear(req);
  const month0 = month - 1;

  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const [items, txns, ruleMap, excludedPatterns] = await Promise.all([
      prisma.plannedItem.findMany({ where: { isActive: true } }),
      prisma.transaction.findMany({
        where: { date: { gte: startDate, lt: endDate } },
        include: {
          splits: { select: { id: true, amount: true, category: true } },
        },
      }),
      loadCategoryRuleMap(prisma),
      getExcludedDescriptions(prisma),
    ]);

    const enrichedTxns = txns.map((t) => ({
      ...t,
      effectiveCategory: effectiveCategoryOf(t, ruleMap),
    }));

    // Categories that have at least one item active this month.
    const itemsByCategory = new Map();
    for (const item of items) {
      const a = amountForMonth(item, month0, year) || 0;
      if (a <= 0) continue;
      const cat = item.category;
      if (!itemsByCategory.has(cat)) itemsByCategory.set(cat, []);
      itemsByCategory.get(cat).push(item);
    }

    const rows = [];
    for (const [category, catItems] of itemsByCategory.entries()) {
      const rollup = categoryRollup(items, category, month0, year);
      const itemNames = catItems.map((i) => i.name);
      const spent = computeSpent(category, enrichedTxns, itemNames, excludedPatterns);
      rows.push({
        category,
        planned: rollup.planned,
        billsTotal: rollup.billsTotal,
        discretionaryTotal: rollup.discretionaryTotal,
        oneTimeTotal: rollup.oneTimeTotal,
        spent: Math.round(spent * 100) / 100,
        remaining: Math.round((rollup.planned - spent) * 100) / 100,
        month,
        year,
      });
    }

    rows.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    res.json(rows);
  } catch (err) {
    console.error('[plan] rollup', err.message);
    res.status(500).json({ error: 'Failed to fetch rollup' });
  }
});

// POST /api/plan/items — create
router.post('/items', async (req, res) => {
  const { errors, data } = validatePlannedItemInput(req.body || {}, { partial: false });
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; ') });
  }

  try {
    const created = await prisma.plannedItem.create({
      data: {
        name: data.name,
        category: data.category ?? null,
        kind: data.kind,
        frequency: data.frequency ?? null,
        dueDay: data.dueDay ?? null,
        oneTimeDate: data.oneTimeDate ?? null,
        amount: data.amount,
        monthlyAmounts: data.monthlyAmounts ?? [],
        matchKeyword: data.matchKeyword ?? null,
        linkedTransactionId: data.linkedTransactionId ?? null,
        paymentWindowDays: data.paymentWindowDays ?? 3,
        isActive: data.isActive ?? true,
      },
    });
    const now = new Date();
    res.status(201).json(decorateItem(created, now.getMonth(), now.getFullYear()));
  } catch (err) {
    console.error('[plan] create', err.message);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PATCH /api/plan/items/:id — partial update
router.patch('/items/:id', async (req, res) => {
  const { id } = req.params;
  const { errors, data } = validatePlannedItemInput(req.body || {}, { partial: true });
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; ') });
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'no updatable fields provided' });
  }

  try {
    const updated = await prisma.plannedItem.update({ where: { id }, data });
    const now = new Date();
    res.json(decorateItem(updated, now.getMonth(), now.getFullYear()));
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found' });
    }
    console.error('[plan] patch', err.message);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// PATCH /api/plan/items/:id/monthly-amounts — dedicated 12-month editor.
router.patch('/items/:id/monthly-amounts', async (req, res) => {
  const { id } = req.params;
  const months = req.body?.monthlyAmounts;

  if (!Array.isArray(months) || months.length !== 12) {
    return res.status(400).json({ error: 'monthlyAmounts must be a 12-element array' });
  }
  if (months.some((a) => typeof a !== 'number' || !Number.isFinite(a) || a < 0)) {
    return res.status(400).json({ error: 'monthlyAmounts entries must be non-negative numbers' });
  }

  const rounded = months.map((a) => Math.round(a * 100) / 100);
  const amount = rounded.reduce((m, a) => (a > m ? a : m), 0);

  try {
    const updated = await prisma.plannedItem.update({
      where: { id },
      data: { monthlyAmounts: rounded, amount },
    });
    const now = new Date();
    res.json(decorateItem(updated, now.getMonth(), now.getFullYear()));
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found' });
    }
    console.error('[plan] monthly-amounts', err.message);
    res.status(500).json({ error: 'Failed to update monthly amounts' });
  }
});

// PATCH /api/plan/items/:id/active — toggle active
router.patch('/items/:id/active', async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be a boolean' });
  }
  try {
    const updated = await prisma.plannedItem.update({ where: { id }, data: { isActive } });
    const now = new Date();
    res.json(decorateItem(updated, now.getMonth(), now.getFullYear()));
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found' });
    }
    console.error('[plan] active', err.message);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/plan/items/:id
router.delete('/items/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.plannedItem.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found' });
    }
    console.error('[plan] delete', err.message);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// POST /api/plan/items/:id/link-transaction
router.post('/items/:id/link-transaction', async (req, res) => {
  const { id } = req.params;
  const { transactionId } = req.body || {};

  if (typeof transactionId !== 'string' || !transactionId.trim()) {
    return res.status(400).json({ error: 'transactionId is required' });
  }

  try {
    const txn = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { id: true },
    });
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const updated = await prisma.plannedItem.update({
      where: { id },
      data: { linkedTransactionId: transactionId },
    });
    const now = new Date();
    res.json(decorateItem(updated, now.getMonth(), now.getFullYear()));
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found' });
    }
    console.error('[plan] link-transaction', err.message);
    res.status(500).json({ error: 'Failed to link transaction' });
  }
});

// DELETE /api/plan/items/:id/link-transaction
router.delete('/items/:id/link-transaction', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await prisma.plannedItem.update({
      where: { id },
      data: { linkedTransactionId: null },
    });
    const now = new Date();
    res.json(decorateItem(updated, now.getMonth(), now.getFullYear()));
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found' });
    }
    console.error('[plan] unlink-transaction', err.message);
    res.status(500).json({ error: 'Failed to unlink transaction' });
  }
});

module.exports = router;
