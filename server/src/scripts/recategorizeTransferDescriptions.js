require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MAPPINGS = [
  { pattern: 'To Round Ups Vault', category: 'Transfer Out' },
  { pattern: 'From Round Ups Vault', category: 'Transfer In' },
  { pattern: 'To Checking -', category: 'Transfer Out' },
  { pattern: 'From checking balance', category: 'Transfer In' },
  { pattern: 'From Savings -', category: 'Transfer In' },
];

async function main() {
  let totalUpdated = 0;
  for (const { pattern, category } of MAPPINGS) {
    const res = await prisma.transaction.updateMany({
      where: {
        description: { contains: pattern, mode: 'insensitive' },
        NOT: { category },
      },
      data: { category },
    });
    console.log(
      `  "${pattern}" -> ${category}: ${res.count} row${res.count === 1 ? '' : 's'}`
    );
    totalUpdated += res.count;
  }

  console.log(`\nTotal transactions recategorized: ${totalUpdated}`);

  const verify = await Promise.all(
    MAPPINGS.map(async ({ pattern }) => {
      const count = await prisma.transaction.count({
        where: { description: { contains: pattern, mode: 'insensitive' } },
      });
      return { pattern, count };
    })
  );
  console.log('\nFinal counts per pattern (all should now have transfer category):');
  for (const row of verify) {
    console.log(`  "${row.pattern}": ${row.count}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
