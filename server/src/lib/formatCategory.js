const FRIENDLY_NAMES = {
  FOOD_AND_DRINK: 'Food & Drink',
  GENERAL_MERCHANDISE: 'Shopping',
  TRANSPORTATION: 'Transportation',
  LOAN_PAYMENTS: 'Loan Payments',
  TRANSFER_OUT: 'Transfer Out',
  TRANSFER_IN: 'Transfer In',
  PERSONAL_CARE: 'Personal Care',
  TRAVEL: 'Travel',
  ENTERTAINMENT: 'Entertainment',
  UTILITIES: 'Utilities',
  RENT_AND_UTILITIES: 'Rent & Utilities',
  INCOME: 'Income',
  MEDICAL: 'Medical',
  GENERAL_SERVICES: 'Services',
  HOME_IMPROVEMENT: 'Home',
  GOVERNMENT_AND_NON_PROFIT: 'Government',
  FOOD_AND_DRINK_RESTAURANTS: 'Restaurants',
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
};

function formatCategory(raw) {
  if (!raw) return '';
  if (FRIENDLY_NAMES[raw]) return FRIENDLY_NAMES[raw];
  if (!/^[A-Z][A-Z0-9_]*$/.test(raw)) return raw;
  return raw
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
    .trim();
}

module.exports = { formatCategory };
module.exports.default = formatCategory;
