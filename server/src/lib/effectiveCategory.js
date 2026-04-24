async function loadCategoryRuleMap(prisma) {
  const rules = await prisma.categoryRule.findMany({
    select: { description: true, categoryOverride: true },
  });
  return new Map(rules.map((r) => [r.description, r.categoryOverride]));
}

function effectiveCategoryOf(txn, ruleMap) {
  if (Array.isArray(txn.splits) && txn.splits.length > 0) return null;
  return (
    txn.categoryOverride ||
    ruleMap.get(txn.description) ||
    txn.category ||
    null
  );
}

function hasSplits(txn) {
  return Array.isArray(txn.splits) && txn.splits.length > 0;
}

module.exports = {
  loadCategoryRuleMap,
  effectiveCategoryOf,
  hasSplits,
};
