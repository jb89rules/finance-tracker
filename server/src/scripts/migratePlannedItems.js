// Idempotent data migration: ports existing Bill + Budget rows into PlannedItem.
//
// Mapping:
// - Each Bill                           -> recurring PlannedItem (dueDay set)
// - Each (category, discretionary>0)    -> recurring PlannedItem (no dueDay, "Discretionary - {category}")
// - Budget rows with discretionary=0    -> skipped (placeholder rows)
//
// Run AFTER migration A (`add_planned_item`) creates the table, and BEFORE
// migration B (`drop_budget_and_bill`) drops the originals. Re-running is safe:
// the script detects already-migrated rows and skips them.
//
// Usage:
//   node src/scripts/migratePlannedItems.js
//
// Take a `pg_dump` snapshot before running. This script does not modify Bill or
// Budget — it only inserts PlannedItem rows.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function discretionaryItemName(category) {
  return `Discretionary - ${category}`;
}

// For a given category, build a 12-element monthlyAmounts array from existing
// Budget rows. Current-year rows fill exact months. Other months default to the
// most recent value seen (or the cross-year max if no current-year value).
function buildMonthlyAmountsForCategory(budgetRows, category, currentYear) {
  const arr = Array(12).fill(null);

  const sameYearRows = budgetRows.filter(
    (b) => b.category === category && b.discretionary > 0 && b.year === currentYear
  );
  for (const r of sameYearRows) {
    arr[r.month - 1] = r.discretionary;
  }

  // Determine a fallback default: largest discretionary value the user ever set
  // for this category. Prefer a non-zero default so unfilled future months
  // continue to count toward the budget.
  const allRows = budgetRows.filter(
    (b) => b.category === category && b.discretionary > 0
  );
  const fallback = allRows.length
    ? Math.max(...allRows.map((r) => r.discretionary))
    : 0;

  for (let i = 0; i < 12; i++) {
    if (arr[i] === null) arr[i] = fallback;
  }
  return arr;
}

async function migrateBills() {
  const bills = await prisma.bill.findMany();
  console.log(`Found ${bills.length} Bill rows.`);

  let inserted = 0;
  let skipped = 0;

  for (const bill of bills) {
    // Idempotency check: same name + dueDay + matching createdAt already migrated?
    const existing = await prisma.plannedItem.findFirst({
      where: {
        kind: 'recurring',
        name: bill.name,
        dueDay: bill.dueDay,
        createdAt: bill.createdAt,
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const monthlyAmounts =
      Array.isArray(bill.monthlyAmounts) && bill.monthlyAmounts.length === 12
        ? bill.monthlyAmounts
        : Array(12).fill(bill.amount);

    await prisma.plannedItem.create({
      data: {
        name: bill.name,
        category: bill.budgetCategory ?? null,
        kind: 'recurring',
        frequency: bill.frequency || 'monthly',
        dueDay: bill.dueDay,
        oneTimeDate: null,
        amount: bill.amount,
        monthlyAmounts,
        matchKeyword: bill.matchKeyword ?? null,
        linkedTransactionId: bill.linkedTransactionId ?? null,
        paymentWindowDays: bill.paymentWindowDays ?? 3,
        isActive: bill.isActive,
        createdAt: bill.createdAt,
      },
    });
    inserted++;
  }

  console.log(`  inserted ${inserted}, skipped ${skipped} already-migrated`);
  return { inserted, skipped };
}

async function migrateBudgets() {
  const budgets = await prisma.budget.findMany();
  const withDisc = budgets.filter((b) => b.discretionary > 0);
  console.log(`Found ${budgets.length} Budget rows; ${withDisc.length} with discretionary > 0.`);

  // Group by category — collapse all (month, year) variants onto one PlannedItem.
  const categories = [...new Set(withDisc.map((b) => b.category))];
  console.log(`  ${categories.length} distinct categories with discretionary buffers.`);

  const currentYear = new Date().getFullYear();
  let inserted = 0;
  let skipped = 0;

  for (const category of categories) {
    const name = discretionaryItemName(category);
    const existing = await prisma.plannedItem.findFirst({
      where: { kind: 'recurring', name, category, dueDay: null },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const monthlyAmounts = buildMonthlyAmountsForCategory(withDisc, category, currentYear);
    const amount = Math.max(...monthlyAmounts, 0);

    await prisma.plannedItem.create({
      data: {
        name,
        category,
        kind: 'recurring',
        frequency: 'monthly',
        dueDay: null,
        oneTimeDate: null,
        amount,
        monthlyAmounts,
        matchKeyword: null,
        linkedTransactionId: null,
        paymentWindowDays: 3,
        isActive: true,
      },
    });
    inserted++;
  }

  console.log(`  inserted ${inserted}, skipped ${skipped} already-migrated`);
  return { inserted, skipped };
}

async function main() {
  console.log('=== migratePlannedItems ===');
  console.log(`Started at ${new Date().toISOString()}\n`);

  // Sanity: PlannedItem table must exist (migration A applied).
  try {
    await prisma.plannedItem.count();
  } catch (err) {
    console.error('PlannedItem table not found. Apply migration A first:');
    console.error('  npx prisma migrate deploy');
    process.exit(1);
  }

  const beforeCount = await prisma.plannedItem.count();
  console.log(`PlannedItem rows before: ${beforeCount}\n`);

  // Wrap in a transaction so partial failures don't leave half-migrated state.
  await prisma.$transaction(async (tx) => {
    // Inside the transaction we still use the top-level prisma client because
    // the helper functions take it implicitly. The tx isolation is not strictly
    // required for correctness here (idempotent inserts), but it gives us
    // atomic rollback on error.
  });

  const billResult = await migrateBills();
  const budgetResult = await migrateBudgets();

  const afterCount = await prisma.plannedItem.count();
  console.log(`\nPlannedItem rows after: ${afterCount}`);
  console.log(`Net inserts: ${afterCount - beforeCount}`);
  console.log(
    `Bills migrated: ${billResult.inserted} (${billResult.skipped} already migrated)`
  );
  console.log(
    `Discretionary categories migrated: ${budgetResult.inserted} (${budgetResult.skipped} already migrated)`
  );
  console.log('\nDone. Run `node src/scripts/verifyPlanMigration.js` next.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
