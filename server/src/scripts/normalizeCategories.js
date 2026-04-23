require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { formatCategory } = require('../lib/formatCategory');

const prisma = new PrismaClient();

async function main() {
  const distinct = await prisma.transaction.findMany({
    distinct: ['category'],
    select: { category: true },
  });

  const categories = distinct
    .map((d) => d.category)
    .filter((c) => c !== null);

  console.log(`Found ${categories.length} distinct non-null categor${categories.length === 1 ? 'y' : 'ies'}.`);
  if (categories.length === 0) {
    console.log('Nothing to migrate.');
    await prisma.$disconnect();
    return;
  }

  let totalUpdated = 0;
  for (const raw of categories) {
    const formatted = formatCategory(raw);
    if (formatted === raw) {
      const count = await prisma.transaction.count({ where: { category: raw } });
      console.log(`  ${raw} -> (unchanged, ${count} row${count === 1 ? '' : 's'})`);
      continue;
    }
    const res = await prisma.transaction.updateMany({
      where: { category: raw },
      data: { category: formatted },
    });
    console.log(`  ${raw} -> ${formatted} (${res.count} row${res.count === 1 ? '' : 's'})`);
    totalUpdated += res.count;
  }

  console.log(`\nTotal transactions updated: ${totalUpdated}`);

  const final = await prisma.transaction.findMany({
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  console.log('\nDistinct categories after migration:');
  for (const d of final) {
    console.log(`  - ${d.category ?? '(null)'}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
