require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SEED_RULES = [
  { description: 'To Round Ups Vault', categoryOverride: 'Transfer Out' },
];

async function main() {
  let totalUpdated = 0;

  for (const { description, categoryOverride } of SEED_RULES) {
    const rule = await prisma.categoryRule.upsert({
      where: { description },
      update: { categoryOverride },
      create: { description, categoryOverride },
    });
    console.log(`rule: ${rule.description} -> ${rule.categoryOverride}`);

    const updated = await prisma.transaction.updateMany({
      where: {
        description,
        splits: { none: {} },
      },
      data: { categoryOverride },
    });
    console.log(
      `  applied to ${updated.count} non-split transaction${updated.count === 1 ? '' : 's'}`
    );
    totalUpdated += updated.count;
  }

  console.log(`\nTotal transactions updated: ${totalUpdated}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
