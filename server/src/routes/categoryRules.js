const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const rules = await prisma.categoryRule.findMany({
      orderBy: { description: 'asc' },
    });
    res.json(rules);
  } catch (err) {
    console.error('[categoryRules] list', err.message);
    res.status(500).json({ error: 'Failed to fetch category rules' });
  }
});

router.post('/', async (req, res) => {
  const { description, categoryOverride } = req.body || {};
  if (typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description is required' });
  }
  if (typeof categoryOverride !== 'string' || !categoryOverride.trim()) {
    return res.status(400).json({ error: 'categoryOverride is required' });
  }

  const key = description.trim();
  const value = categoryOverride.trim();

  try {
    const rule = await prisma.categoryRule.upsert({
      where: { description: key },
      update: { categoryOverride: value },
      create: { description: key, categoryOverride: value },
    });
    res.status(201).json(rule);
  } catch (err) {
    console.error('[categoryRules] upsert', err.message);
    res.status(500).json({ error: 'Failed to save category rule' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.categoryRule.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Category rule not found' });
    }
    console.error('[categoryRules] delete', err.message);
    res.status(500).json({ error: 'Failed to delete category rule' });
  }
});

module.exports = router;
