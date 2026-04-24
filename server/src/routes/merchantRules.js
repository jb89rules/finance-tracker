const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const rules = await prisma.merchantRule.findMany({
      orderBy: { description: 'asc' },
    });
    res.json(rules);
  } catch (err) {
    console.error('[merchantRules] list', err.message);
    res.status(500).json({ error: 'Failed to fetch merchant rules' });
  }
});

router.post('/', async (req, res) => {
  const { description, merchantOverride } = req.body || {};
  if (typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description is required' });
  }
  if (typeof merchantOverride !== 'string' || !merchantOverride.trim()) {
    return res.status(400).json({ error: 'merchantOverride is required' });
  }

  const key = description.trim();
  const value = merchantOverride.trim();

  try {
    const rule = await prisma.merchantRule.upsert({
      where: { description: key },
      update: { merchantOverride: value },
      create: { description: key, merchantOverride: value },
    });
    res.status(201).json(rule);
  } catch (err) {
    console.error('[merchantRules] upsert', err.message);
    res.status(500).json({ error: 'Failed to save merchant rule' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.merchantRule.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Merchant rule not found' });
    }
    console.error('[merchantRules] delete', err.message);
    res.status(500).json({ error: 'Failed to delete merchant rule' });
  }
});

module.exports = router;
