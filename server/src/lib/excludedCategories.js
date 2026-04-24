const EXCLUDED_CATEGORIES = ['Transfer In', 'Transfer Out'];

const EXCLUDED_DESCRIPTIONS = [
  'To Round Ups Vault',
  'From Round Ups Vault',
  'To Checking -',
  'From checking balance',
  'From Savings -',
];

const NON_TRANSFER_CATEGORY = {
  OR: [
    { category: null },
    { category: { notIn: EXCLUDED_CATEGORIES } },
  ],
};

const NON_TRANSFER_DESCRIPTION =
  EXCLUDED_DESCRIPTIONS.length > 0
    ? {
        NOT: {
          OR: EXCLUDED_DESCRIPTIONS.map((d) => ({
            description: { contains: d, mode: 'insensitive' },
          })),
        },
      }
    : {};

module.exports = {
  EXCLUDED_CATEGORIES,
  EXCLUDED_DESCRIPTIONS,
  NON_TRANSFER_CATEGORY,
  NON_TRANSFER_DESCRIPTION,
};
