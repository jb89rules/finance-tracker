require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const bills = await prisma.bill.findMany({
    where: { matchKeyword: null },
    select: { id: true, name: true },
  });

  console.log(`Backfilling matchKeyword for ${bills.length} bill${bills.length === 1 ? '' : 's'}.`);

  for (const b of bills) {
    await prisma.bill.update({
      where: { id: b.id },
      data: { matchKeyword: b.name },
    });
    console.log(`  ${b.name} -> matchKeyword set`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
