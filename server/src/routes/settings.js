const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { EXCLUDED_DESCRIPTIONS } = require('../lib/excludedCategories');

const prisma = new PrismaClient();
const router = express.Router();

const DEFAULTS = {
  paycheckAmount: '0',
  payFrequency: 'bi-weekly',
  defaultPaymentWindow: '3',
  excludedDescriptions: JSON.stringify(EXCLUDED_DESCRIPTIONS),
};

router.get('/', async (req, res) => {
  try {
    const rows = await prisma.appSetting.findMany();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const merged = { ...DEFAULTS, ...stored };
    res.json(merged);
  } catch (err) {
    console.error('[settings] list', err.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.post('/', async (req, res) => {
  const { key, value } = req.body || {};
  if (typeof key !== 'string' || !key.trim()) {
    return res.status(400).json({ error: 'key is required' });
  }
  const v = value === null || value === undefined ? '' : String(value);

  try {
    const row = await prisma.appSetting.upsert({
      where: { key },
      update: { value: v },
      create: { key, value: v },
    });
    res.json(row);
  } catch (err) {
    console.error('[settings] upsert', err.message);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

module.exports = router;
