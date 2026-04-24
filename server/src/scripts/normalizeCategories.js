require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { formatCategory } = require('../lib/formatCategory');

const prisma = new PrismaClient();

async function normalizeModelField({ label, list, countFor, updateFor }) {
  const distinctValues = [...new Set(list.filter((c) => c !== null))];
  console.log(
    `\n[${label}] ${distinctValues.length} distinct non-null value${distinctValues.length === 1 ? '' : 's'}`
  );
  if (distinctValues.length === 0) return 0;

  let updated = 0;
  for (const raw of distinctValues) {
    const formatted = formatCategory(raw);
    if (formatted === raw) {
      const count = await countFor(raw);
      console.log(`  ${raw} -> (unchanged, ${count} row${count === 1 ? '' : 's'})`);
      continue;
    }
    const res = await updateFor(raw, formatted);
    console.log(`  ${raw} -> ${formatted} (${res.count} row${res.count === 1 ? '' : 's'})`);
    updated += res.count;
  }
  console.log(`[${label}] total updated: ${updated}`);
  return updated;
}

async function main() {
  const txnDistinct = await prisma.transaction.findMany({
    distinct: ['category'],
    select: { category: true },
  });
  await normalizeModelField({
    label: 'transaction.category',
    list: txnDistinct.map((d) => d.category),
    countFor: (raw) => prisma.transaction.count({ where: { category: raw } }),
    updateFor: (raw, formatted) =>
      prisma.transaction.updateMany({ where: { category: raw }, data: { category: formatted } }),
  });

  const billCatDistinct = await prisma.bill.findMany({
    distinct: ['category'],
    select: { category: true },
  });
  await normalizeModelField({
    label: 'bill.category',
    list: billCatDistinct.map((d) => d.category),
    countFor: (raw) => prisma.bill.count({ where: { category: raw } }),
    updateFor: (raw, formatted) =>
      prisma.bill.updateMany({ where: { category: raw }, data: { category: formatted } }),
  });

  const billBudgetDistinct = await prisma.bill.findMany({
    distinct: ['budgetCategory'],
    select: { budgetCategory: true },
  });
  await normalizeModelField({
    label: 'bill.budgetCategory',
    list: billBudgetDistinct.map((d) => d.budgetCategory),
    countFor: (raw) => prisma.bill.count({ where: { budgetCategory: raw } }),
    updateFor: (raw, formatted) =>
      prisma.bill.updateMany({
        where: { budgetCategory: raw },
        data: { budgetCategory: formatted },
      }),
  });

  const budgetDistinct = await prisma.budget.findMany({
    distinct: ['category'],
    select: { category: true },
  });
  await normalizeModelField({
    label: 'budget.category',
    list: budgetDistinct.map((d) => d.category),
    countFor: (raw) => prisma.budget.count({ where: { category: raw } }),
    updateFor: (raw, formatted) =>
      prisma.budget.updateMany({ where: { category: raw }, data: { category: formatted } }),
  });

  const finalTxn = await prisma.transaction.findMany({
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  console.log('\nDistinct transaction categories after migration:');
  for (const d of finalTxn) {
    console.log(`  - ${d.category ?? '(null)'}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
