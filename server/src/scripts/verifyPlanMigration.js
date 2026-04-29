// Verifies that the data migration ported every Bill and discretionary Budget row
// into a corresponding PlannedItem. Run AFTER migratePlannedItems.js and BEFORE
// migration B (`drop_budget_and_bill`).
//
// Usage:
//   node src/scripts/verifyPlanMigration.js

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function approxEqual(a, b, epsilon = 0.01) {
  return Math.abs(a - b) <= epsilon;
}

async function main() {
  console.log('=== verifyPlanMigration ===\n');

  const failures = [];
  const log = (msg) => console.log(msg);
  const fail = (msg) => {
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  };
  const pass = (msg) => console.log(`  ✓ ${msg}`);

  const [oldBills, oldBudgets, plannedItems] = await Promise.all([
    prisma.bill.findMany(),
    prisma.budget.findMany(),
    prisma.plannedItem.findMany(),
  ]);

  const budgetsWithDisc = oldBudgets.filter((b) => b.discretionary > 0);
  const distinctDiscCategories = new Set(budgetsWithDisc.map((b) => b.category));

  log(`Old data: ${oldBills.length} Bills, ${budgetsWithDisc.length} Budgets w/ discretionary > 0 (${distinctDiscCategories.size} distinct categories)`);
  log(`New data: ${plannedItems.length} PlannedItems`);
  log('');

  const expectedCount = oldBills.length + distinctDiscCategories.size;
  log('Row count check:');
  if (plannedItems.length === expectedCount) {
    pass(`PlannedItem count matches expected (${expectedCount})`);
  } else {
    fail(`expected ${expectedCount} PlannedItems, got ${plannedItems.length}`);
  }
  log('');

  log('Per-bill mapping:');
  for (const bill of oldBills) {
    const match = plannedItems.find(
      (p) =>
        p.kind === 'recurring' &&
        p.name === bill.name &&
        p.dueDay === bill.dueDay &&
        approxEqual(p.amount, bill.amount)
    );
    if (!match) {
      fail(`no PlannedItem found for Bill "${bill.name}" (dueDay=${bill.dueDay}, amount=${bill.amount})`);
    }
  }
  if (failures.length === 0) pass(`every old Bill has a matching PlannedItem`);
  log('');

  log('Per-discretionary-category mapping:');
  let discFailures = 0;
  for (const category of distinctDiscCategories) {
    const expectedName = `Discretionary - ${category}`;
    const match = plannedItems.find(
      (p) =>
        p.kind === 'recurring' &&
        p.dueDay === null &&
        p.name === expectedName &&
        p.category === category
    );
    if (!match) {
      fail(`no Discretionary PlannedItem for category "${category}" (expected name: "${expectedName}")`);
      discFailures++;
    }
  }
  if (discFailures === 0) pass(`every distinct discretionary category has a matching PlannedItem`);
  log('');

  log('Active bill total parity:');
  const activeBillsSum = oldBills
    .filter((b) => b.isActive)
    .reduce((s, b) => s + b.amount, 0);
  const activeBillsItemsSum = plannedItems
    .filter(
      (p) => p.kind === 'recurring' && p.dueDay !== null && p.isActive
    )
    .reduce((s, p) => s + p.amount, 0);
  if (approxEqual(activeBillsSum, activeBillsItemsSum)) {
    pass(`sum(Bill.amount where active) === sum(recurring scheduled PlannedItem.amount where active) (${activeBillsSum.toFixed(2)})`);
  } else {
    fail(`active sum mismatch: bills=${activeBillsSum.toFixed(2)}, items=${activeBillsItemsSum.toFixed(2)}`);
  }
  log('');

  if (failures.length === 0) {
    log('All checks passed. Safe to apply migration B (drop_budget_and_bill).');
    process.exit(0);
  } else {
    log(`${failures.length} check(s) failed. Do NOT apply migration B until resolved.`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Verify failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
