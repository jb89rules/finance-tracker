const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { computeBillStatus, enrichBillsWithPayments } = require('../lib/billStatus');

const prisma = new PrismaClient();
const router = express.Router();

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
        amount: Math.round(avg * 100) / 100,
        dueDay: mostCommonDay,
        txnCategory: similar[0].category || null,
      });
    }

    suggestions.sort((a, b) => b.amount - a.amount);
    res.json(suggestions);
  } catch (err) {
    console.error('[bills] detect', err.message);
    res.status(500).json({ error: 'Failed to detect bills' });
  }
});

router.get('/', async (req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      orderBy: { dueDay: 'asc' },
    });
    const withStatus = bills.map((b) => ({ ...b, ...computeBillStatus(b.dueDay) }));
    const enriched = await enrichBillsWithPayments(prisma, withStatus);
    res.json(enriched);
  } catch (err) {
    console.error('[bills] list', err.message);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

function validateBillInput(body, { partial }) {
  const errors = [];
  const data = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('name must be a non-empty string');
    } else {
      data.name = body.name.trim();
    }
  } else if (!partial) {
    errors.push('name is required');
  }

  if (body.amount !== undefined) {
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0) {
      errors.push('amount must be a non-negative number');
    } else {
      data.amount = body.amount;
    }
  } else if (!partial) {
    errors.push('amount is required');
  }

  if (body.dueDay !== undefined) {
    if (!Number.isInteger(body.dueDay) || body.dueDay < 1 || body.dueDay > 31) {
      errors.push('dueDay must be an integer 1-31');
    } else {
      data.dueDay = body.dueDay;
    }
  } else if (!partial) {
    errors.push('dueDay is required');
  }

  if (body.budgetCategory !== undefined) {
    if (body.budgetCategory === null || body.budgetCategory === '') {
      data.budgetCategory = null;
    } else if (typeof body.budgetCategory !== 'string') {
      errors.push('budgetCategory must be a string or null');
    } else {
      data.budgetCategory = body.budgetCategory.trim() || null;
    }
  }

  if (body.matchKeyword !== undefined) {
    if (body.matchKeyword === null || body.matchKeyword === '') {
      data.matchKeyword = null;
    } else if (typeof body.matchKeyword !== 'string') {
      errors.push('matchKeyword must be a string or null');
    } else {
      data.matchKeyword = body.matchKeyword.trim() || null;
    }
  }

  if (body.linkedTransactionId !== undefined) {
    if (body.linkedTransactionId === null || body.linkedTransactionId === '') {
      data.linkedTransactionId = null;
    } else if (typeof body.linkedTransactionId !== 'string') {
      errors.push('linkedTransactionId must be a string or null');
    } else {
      data.linkedTransactionId = body.linkedTransactionId.trim() || null;
    }
  }

  if (body.paymentWindowDays !== undefined) {
    if (
      !Number.isInteger(body.paymentWindowDays) ||
      body.paymentWindowDays < 1 ||
      body.paymentWindowDays > 14
    ) {
      errors.push('paymentWindowDays must be an integer 1-14');
    } else {
      data.paymentWindowDays = body.paymentWindowDays;
    }
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      errors.push('isActive must be a boolean');
    } else {
      data.isActive = body.isActive;
    }
  }

  return { errors, data };
}

router.post('/', async (req, res) => {
  const { errors, data } = validateBillInput(req.body || {}, { partial: false });
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; ') });
  }

  try {
    const created = await prisma.bill.create({
      data: {
        name: data.name,
        matchKeyword: data.matchKeyword ?? null,
        linkedTransactionId: data.linkedTransactionId ?? null,
        amount: data.amount,
        dueDay: data.dueDay,
        budgetCategory: data.budgetCategory ?? null,
        paymentWindowDays: data.paymentWindowDays ?? 3,
        isActive: data.isActive ?? true,
      },
    });
    res.status(201).json({ ...created, ...computeBillStatus(created.dueDay) });
  } catch (err) {
    console.error('[bills] create', err.message);
    res.status(500).json({ error: 'Failed to create bill' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { errors, data } = validateBillInput(req.body || {}, { partial: true });
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; ') });
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'no updatable fields provided' });
  }

  try {
    const updated = await prisma.bill.update({ where: { id }, data });
    res.json({ ...updated, ...computeBillStatus(updated.dueDay) });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Bill not found' });
    }
    console.error('[bills] patch', err.message);
    res.status(500).json({ error: 'Failed to update bill' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.bill.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Bill not found' });
    }
    console.error('[bills] delete', err.message);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
});

router.post('/:id/link-transaction', async (req, res) => {
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

    const updated = await prisma.bill.update({
      where: { id },
      data: { linkedTransactionId: transactionId },
    });
    res.json({ ...updated, ...computeBillStatus(updated.dueDay) });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Bill not found' });
    }
    console.error('[bills] link-transaction', err.message);
    res.status(500).json({ error: 'Failed to link transaction' });
  }
});

router.delete('/:id/link-transaction', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await prisma.bill.update({
      where: { id },
      data: { linkedTransactionId: null },
    });
    res.json({ ...updated, ...computeBillStatus(updated.dueDay) });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Bill not found' });
    }
    console.error('[bills] unlink-transaction', err.message);
    res.status(500).json({ error: 'Failed to unlink transaction' });
  }
});

module.exports = router;
