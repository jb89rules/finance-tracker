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

function buildNonTransferDescriptionFilter(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return {};
  return {
    NOT: {
      OR: patterns.map((d) => ({
        description: { contains: d, mode: 'insensitive' },
      })),
    },
  };
}

async function getExcludedDescriptions(prisma) {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: 'excludedDescriptions' },
    });
    if (!setting) return EXCLUDED_DESCRIPTIONS;
    const parsed = JSON.parse(setting.value);
    return Array.isArray(parsed) ? parsed : EXCLUDED_DESCRIPTIONS;
  } catch {
    return EXCLUDED_DESCRIPTIONS;
  }
}

async function getNonTransferDescriptionFilter(prisma) {
  const patterns = await getExcludedDescriptions(prisma);
  return buildNonTransferDescriptionFilter(patterns);
}

const NON_TRANSFER_DESCRIPTION = buildNonTransferDescriptionFilter(EXCLUDED_DESCRIPTIONS);

module.exports = {
  EXCLUDED_CATEGORIES,
  EXCLUDED_DESCRIPTIONS,
  NON_TRANSFER_CATEGORY,
  NON_TRANSFER_DESCRIPTION,
  buildNonTransferDescriptionFilter,
  getExcludedDescriptions,
  getNonTransferDescriptionFilter,
};
