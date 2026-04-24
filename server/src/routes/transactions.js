const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.get('/categories', async (req, res) => {
  try {
    const rows = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    res.json(rows.map((r) => r.name));
  } catch (err) {
    console.error('[transactions] categories', err.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.get('/', async (req, res) => {
  const { category, account, search } = req.query;

  const where = {};
  if (category) where.category = category;
  if (account) where.accountId = account;
  if (search) where.description = { contains: String(search), mode: 'insensitive' };

  try {
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        account: {
          select: { id: true, institution: true, name: true },
        },
        splits: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    res.json(transactions);
  } catch (err) {
    console.error('[transactions] list', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

router.post('/:id/splits', async (req, res) => {
  const { id } = req.params;
  const { splits } = req.body || {};

  if (!Array.isArray(splits) || splits.length < 2) {
    return res.status(400).json({ error: 'splits must be an array of at least 2 items' });
  }

  const cleaned = [];
  for (const s of splits) {
    if (!s || typeof s !== 'object') {
      return res.status(400).json({ error: 'invalid split entry' });
    }
    const amount = Number(s.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'each split amount must be > 0' });
    }
    if (typeof s.category !== 'string' || !s.category.trim()) {
      return res.status(400).json({ error: 'each split needs a non-empty category' });
    }
    const note =
      s.note === undefined || s.note === null || s.note === ''
        ? null
        : typeof s.note === 'string'
        ? s.note.trim() || null
        : null;
    cleaned.push({ amount, category: s.category.trim(), note });
  }

  try {
    const txn = await prisma.transaction.findUnique({ where: { id } });
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const total = Math.abs(txn.amount);
    const sum = cleaned.reduce((acc, s) => acc + s.amount, 0);
    if (Math.abs(sum - total) > 0.01) {
      return res.status(400).json({
        error: `splits must sum to transaction total ${total.toFixed(2)} (got ${sum.toFixed(2)})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
      await tx.transactionSplit.createMany({
        data: cleaned.map((s) => ({ ...s, transactionId: id })),
      });
      return tx.transaction.findUnique({
        where: { id },
        include: {
          account: { select: { id: true, institution: true, name: true } },
          splits: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    res.json(updated);
  } catch (err) {
    console.error('[transactions] splits create', err.message);
    res.status(500).json({ error: 'Failed to save splits' });
  }
});

router.delete('/:id/splits', async (req, res) => {
  const { id } = req.params;

  try {
    const txn = await prisma.transaction.findUnique({ where: { id }, select: { id: true } });
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    await prisma.transactionSplit.deleteMany({ where: { transactionId: id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[transactions] splits delete', err.message);
    res.status(500).json({ error: 'Failed to delete splits' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { category } = req.body || {};

  if (typeof category !== 'string' || !category.trim()) {
    return res.status(400).json({ error: 'category must be a non-empty string' });
  }

  try {
    const updated = await prisma.transaction.update({
      where: { id },
      data: { category: category.trim() },
    });
    res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    console.error('[transactions] patch', err.message);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

module.exports = router;
