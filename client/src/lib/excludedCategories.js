export const EXCLUDED_CATEGORIES = ['Transfer In', 'Transfer Out'];

export const EXCLUDED_DESCRIPTIONS = [
  'To Round Ups Vault',
  'From Round Ups Vault',
  'To Checking -',
  'From checking balance',
  'From Savings -',
];

export function isTransferTransaction(t) {
  if (!t) return false;
  if (EXCLUDED_CATEGORIES.includes(t.category)) return true;
  const desc = (t.description || '').toLowerCase();
  return EXCLUDED_DESCRIPTIONS.some((pat) => desc.includes(pat.toLowerCase()));
}

export default EXCLUDED_CATEGORIES;
