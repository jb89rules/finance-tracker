const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.get('/categories', async (req, res) => {
  try {
    const rows = await prisma.transaction.findMany({
      where: { category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    res.json(rows.map((r) => r.category));
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
      },
    });
    res.json(transactions);
  } catch (err) {
    console.error('[transactions] list', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
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
