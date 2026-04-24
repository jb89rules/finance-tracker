export const EXCLUDED_CATEGORIES = ['Transfer In', 'Transfer Out'];

export const EXCLUDED_DESCRIPTIONS = [
  'To Round Ups Vault',
  'From Round Ups Vault',
  'To Checking -',
  'From checking balance',
  'From Savings -',
];

export function isTransferTransaction(t, patterns = EXCLUDED_DESCRIPTIONS) {
  if (!t) return false;
  if (EXCLUDED_CATEGORIES.includes(t.category)) return true;
  const list = Array.isArray(patterns) ? patterns : EXCLUDED_DESCRIPTIONS;
  if (list.length === 0) return false;
  const desc = (t.description || '').toLowerCase();
  return list.some((pat) => desc.includes(pat.toLowerCase()));
}

export default EXCLUDED_CATEGORIES;
