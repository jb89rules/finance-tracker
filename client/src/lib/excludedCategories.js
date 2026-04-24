export const EXCLUDED_CATEGORIES = ['Transfer In', 'Transfer Out'];

export function isTransferTransaction(t, patterns) {
  if (!t) return false;
  if (EXCLUDED_CATEGORIES.includes(t.category)) return true;
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  const desc = (t.description || '').toLowerCase();
  return patterns.some((pat) => desc.includes(pat.toLowerCase()));
}

export default EXCLUDED_CATEGORIES;
