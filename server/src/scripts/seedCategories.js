require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PRESET_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6b7280',
];

function typeFor(name) {
  if (name === 'Income') return 'income';
  if (name === 'Transfer In' || name === 'Transfer Out') return 'transfer';
  return 'expense';
}

function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PRESET_COLORS[h % PRESET_COLORS.length];
}

async function main() {
  const distinct = await prisma.transaction.findMany({
    distinct: ['category'],
    where: { category: { not: null } },
    select: { category: true },
  });
  const names = distinct.map((d) => d.category).filter(Boolean);
  console.log(`Found ${names.length} distinct transaction categories.`);

  let created = 0;
  let existed = 0;
  for (const name of names) {
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
      existed++;
      console.log(`  - ${name} (already exists as ${existing.type})`);
      continue;
    }
    const row = await prisma.category.create({
      data: {
        name,
        type: typeFor(name),
        color: colorFor(name),
      },
    });
    created++;
    console.log(`  + ${row.name} (${row.type}) ${row.color}`);
  }

  console.log(`\nCreated: ${created}   Already present: ${existed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
