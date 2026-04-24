const { EXCLUDED_CATEGORIES } = require('./excludedCategories');

function pctChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function descriptionMatchesPatterns(description, patterns) {
  if (!patterns || patterns.length === 0) return false;
  const lower = (description || '').toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function descriptionContains(description, needle) {
  if (!description || !needle) return false;
  return description.toLowerCase().includes(needle.toLowerCase());
}

function computeMonthTotals(txns, excludedPatterns) {
  let spending = 0;
  let income = 0;
  for (const t of txns) {
    if (descriptionMatchesPatterns(t.description, excludedPatterns)) continue;
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        if (EXCLUDED_CATEGORIES.includes(s.category)) continue;
        spending += s.amount;
      }
      continue;
    }
    if (t.effectiveCategory && EXCLUDED_CATEGORIES.includes(t.effectiveCategory)) {
      continue;
    }
    if (t.amount > 0) spending += t.amount;
    else if (t.amount < 0) income += Math.abs(t.amount);
  }
  return { spending, income };
}

function computeTopCategories(txns, excludedPatterns, total) {
  const byCategory = new Map();
  for (const t of txns) {
    if (descriptionMatchesPatterns(t.description, excludedPatterns)) continue;
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        if (EXCLUDED_CATEGORIES.includes(s.category)) continue;
        byCategory.set(s.category, (byCategory.get(s.category) || 0) + s.amount);
      }
      continue;
    }
    if (t.amount <= 0) continue;
    const cat = t.effectiveCategory;
    if (!cat) continue;
    if (EXCLUDED_CATEGORIES.includes(cat)) continue;
    byCategory.set(cat, (byCategory.get(cat) || 0) + t.amount);
  }
  return [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }));
}

function computeBudgetSpent(budget, txns, billNames, excludedPatterns) {
  if (EXCLUDED_CATEGORIES.includes(budget.category)) return 0;
  let total = 0;
  for (const t of txns) {
    if (descriptionMatchesPatterns(t.description, excludedPatterns)) continue;
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        if (s.category === budget.category) total += s.amount;
      }
      continue;
    }
    if (t.amount <= 0) continue;
    if (t.effectiveCategory && EXCLUDED_CATEGORIES.includes(t.effectiveCategory)) continue;
    const categoryMatches = t.effectiveCategory === budget.category;
    const descMatches = billNames.some((n) => descriptionContains(t.description, n));
    if (categoryMatches || descMatches) total += t.amount;
  }
  return total;
}

module.exports = {
  pctChange,
  descriptionMatchesPatterns,
  descriptionContains,
  computeMonthTotals,
  computeTopCategories,
  computeBudgetSpent,
};
