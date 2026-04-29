const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

const ALLOWED_TYPES = ['expense', 'income', 'transfer'];

function validateCategoryInput(body, { partial }) {
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
  if (body.color !== undefined) {
    if (typeof body.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(body.color)) {
      errors.push('color must be a hex color like #6366f1');
    } else {
      data.color = body.color.toLowerCase();
    }
  }
  if (body.type !== undefined) {
    if (!ALLOWED_TYPES.includes(body.type)) {
      errors.push(`type must be one of ${ALLOWED_TYPES.join(', ')}`);
    } else {
      data.type = body.type;
    }
  }
  return { errors, data };
}

router.get('/', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (err) {
    console.error('[categories] list', err.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/', async (req, res) => {
  const { errors, data } = validateCategoryInput(req.body || {}, { partial: false });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  try {
    const created = await prisma.category.create({
      data: {
        name: data.name,
        color: data.color || '#6366f1',
        type: data.type || 'expense',
      },
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    console.error('[categories] create', err.message);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.post('/merge', async (req, res) => {
  const { sourceId, targetId } = req.body || {};
  if (typeof sourceId !== 'string' || !sourceId || typeof targetId !== 'string' || !targetId) {
    return res.status(400).json({ error: 'sourceId and targetId are required' });
  }
  if (sourceId === targetId) {
    return res.status(400).json({ error: 'source and target must differ' });
  }

  try {
    const [source, target] = await Promise.all([
      prisma.category.findUnique({ where: { id: sourceId } }),
      prisma.category.findUnique({ where: { id: targetId } }),
    ]);
    if (!source || !target) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedTxns = await tx.transaction.updateMany({
        where: { category: source.name },
        data: { category: target.name },
      });
      await tx.transactionSplit.updateMany({
        where: { category: source.name },
        data: { category: target.name },
      });
      await tx.plannedItem.updateMany({
        where: { category: source.name },
        data: { category: target.name },
      });
      await tx.category.delete({ where: { id: sourceId } });
      return updatedTxns.count;
    });

    res.json({ success: true, transactionsUpdated: result });
  } catch (err) {
    console.error('[categories] merge', err.message);
    res.status(500).json({ error: 'Failed to merge categories' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { errors, data } = validateCategoryInput(req.body || {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'no fields to update' });
  }

  try {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const updated = await prisma.$transaction(async (tx) => {
      const renaming = data.name && data.name !== existing.name;
      const patched = await tx.category.update({ where: { id }, data });

      if (renaming) {
        const oldName = existing.name;
        const newName = data.name;
        await tx.transaction.updateMany({
          where: { category: oldName },
          data: { category: newName },
        });
        await tx.transactionSplit.updateMany({
          where: { category: oldName },
          data: { category: newName },
        });
        await tx.plannedItem.updateMany({
          where: { category: oldName },
          data: { category: newName },
        });
      }

      return patched;
    });

    res.json(updated);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    console.error('[categories] patch', err.message);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { reassignTo } = req.body || {};

  if (typeof reassignTo !== 'string' || !reassignTo.trim()) {
    return res.status(400).json({ error: 'reassignTo is required' });
  }

  try {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const target = reassignTo.trim();
    if (target === existing.name) {
      return res.status(400).json({ error: 'reassignTo must be a different category' });
    }

    const targetExists = await prisma.category.findUnique({ where: { name: target } });
    if (!targetExists) {
      return res.status(400).json({ error: 'reassignTo category does not exist' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedTxns = await tx.transaction.updateMany({
        where: { category: existing.name },
        data: { category: target },
      });
      await tx.transactionSplit.updateMany({
        where: { category: existing.name },
        data: { category: target },
      });
      await tx.plannedItem.updateMany({
        where: { category: existing.name },
        data: { category: target },
      });
      await tx.category.delete({ where: { id } });
      return updatedTxns.count;
    });

    res.json({ success: true, transactionsUpdated: result });
  } catch (err) {
    console.error('[categories] delete', err.message);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
