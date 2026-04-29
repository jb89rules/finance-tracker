const VALID_KINDS = ['recurring', 'one_time'];
const VALID_FREQUENCIES = ['monthly', 'annual', 'semi-annual', 'custom'];

function expandMonthly(amount) {
  return Array.from({ length: 12 }, () => amount);
}

function maxAmount(monthlyAmounts) {
  return monthlyAmounts.reduce((m, a) => (a > m ? a : m), 0);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function parseDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Validates a PlannedItem create or patch payload.
// Returns { errors: string[], data: Prisma-shaped object }.
function validatePlannedItemInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  // name
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('name must be a non-empty string');
    } else {
      data.name = body.name.trim();
    }
  } else if (!partial) {
    errors.push('name is required');
  }

  // category (nullable)
  if (body.category !== undefined) {
    if (body.category === null || body.category === '') {
      data.category = null;
    } else if (typeof body.category !== 'string') {
      errors.push('category must be a string or null');
    } else {
      data.category = body.category.trim() || null;
    }
  }

  // kind
  let kind = null;
  if (body.kind !== undefined) {
    if (!VALID_KINDS.includes(body.kind)) {
      errors.push(`kind must be one of ${VALID_KINDS.join(', ')}`);
    } else {
      kind = body.kind;
      data.kind = body.kind;
    }
  } else if (!partial) {
    errors.push('kind is required');
  }

  // frequency (recurring) — must be null for one_time
  if (body.frequency !== undefined) {
    if (body.frequency === null) {
      data.frequency = null;
    } else if (!VALID_FREQUENCIES.includes(body.frequency)) {
      errors.push(`frequency must be one of ${VALID_FREQUENCIES.join(', ')}`);
    } else {
      data.frequency = body.frequency;
    }
  }

  // dueDay (integer 1-31, or null for spread / one_time)
  if (body.dueDay !== undefined) {
    if (body.dueDay === null) {
      data.dueDay = null;
    } else if (!Number.isInteger(body.dueDay) || body.dueDay < 1 || body.dueDay > 31) {
      errors.push('dueDay must be an integer 1-31 or null');
    } else {
      data.dueDay = body.dueDay;
    }
  }

  // oneTimeDate
  if (body.oneTimeDate !== undefined) {
    if (body.oneTimeDate === null) {
      data.oneTimeDate = null;
    } else {
      const parsed = parseDate(body.oneTimeDate);
      if (!parsed) {
        errors.push('oneTimeDate must be a valid ISO date string or null');
      } else {
        data.oneTimeDate = parsed;
      }
    }
  }

  // amount + monthlyAmounts
  let monthlyAmounts = null;
  if (Array.isArray(body.monthlyAmounts)) {
    if (body.monthlyAmounts.length !== 12) {
      errors.push('monthlyAmounts must have exactly 12 entries');
    } else if (
      body.monthlyAmounts.some(
        (a) => typeof a !== 'number' || !Number.isFinite(a) || a < 0
      )
    ) {
      errors.push('monthlyAmounts entries must be non-negative numbers');
    } else {
      monthlyAmounts = body.monthlyAmounts.map(round2);
    }
  }

  let amount = null;
  if (body.amount !== undefined) {
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0) {
      errors.push('amount must be a non-negative number');
    } else {
      amount = round2(body.amount);
    }
  }

  // matchKeyword
  if (body.matchKeyword !== undefined) {
    if (body.matchKeyword === null || body.matchKeyword === '') {
      data.matchKeyword = null;
    } else if (typeof body.matchKeyword !== 'string') {
      errors.push('matchKeyword must be a string or null');
    } else {
      data.matchKeyword = body.matchKeyword.trim() || null;
    }
  }

  // linkedTransactionId
  if (body.linkedTransactionId !== undefined) {
    if (body.linkedTransactionId === null || body.linkedTransactionId === '') {
      data.linkedTransactionId = null;
    } else if (typeof body.linkedTransactionId !== 'string') {
      errors.push('linkedTransactionId must be a string or null');
    } else {
      data.linkedTransactionId = body.linkedTransactionId.trim() || null;
    }
  }

  // paymentWindowDays
  if (body.paymentWindowDays !== undefined) {
    if (
      !Number.isInteger(body.paymentWindowDays) ||
      body.paymentWindowDays < 1 ||
      body.paymentWindowDays > 14
    ) {
      errors.push('paymentWindowDays must be an integer 1-14');
    } else {
      data.paymentWindowDays = body.paymentWindowDays;
    }
  }

  // isActive
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      errors.push('isActive must be a boolean');
    } else {
      data.isActive = body.isActive;
    }
  }

  // Cross-field rules — only enforced when we know the (effective) kind.
  const effectiveKind = kind ?? body.kind;
  if (errors.length === 0 && effectiveKind) {
    if (effectiveKind === 'recurring') {
      // Need either monthlyAmounts or amount to derive monthlyAmounts.
      if (monthlyAmounts === null && amount === null && !partial) {
        errors.push('amount or monthlyAmounts is required for recurring items');
      }
      if (monthlyAmounts === null && amount !== null) {
        monthlyAmounts = expandMonthly(amount);
      }
      if (monthlyAmounts !== null) {
        data.monthlyAmounts = monthlyAmounts;
        data.amount = maxAmount(monthlyAmounts);
      } else if (amount !== null) {
        data.amount = amount;
      }
      if (!partial) {
        if (data.frequency === undefined) data.frequency = 'monthly';
      }
      // one-time-only fields: clear them on a recurring item
      if (data.oneTimeDate === undefined && !partial) data.oneTimeDate = null;
    } else if (effectiveKind === 'one_time') {
      if (amount === null && !partial) {
        errors.push('amount is required for one_time items');
      }
      if (amount !== null) data.amount = amount;
      if (!partial) {
        if (data.oneTimeDate === undefined) {
          errors.push('oneTimeDate is required for one_time items');
        }
        data.frequency = null;
        data.dueDay = null;
        data.monthlyAmounts = [];
      } else {
        // partial: clear monthlyAmounts to keep model invariant if caller switched kind
        if (body.kind === 'one_time') {
          data.frequency = null;
          data.dueDay = null;
          data.monthlyAmounts = [];
        }
      }
    }
  }

  return { errors, data };
}

module.exports = {
  validatePlannedItemInput,
  VALID_KINDS,
  VALID_FREQUENCIES,
};
