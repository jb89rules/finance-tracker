import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeBillStatus,
  computeItemStatus,
  computeMostRecentDue,
  descriptionMatchesBillName,
  amountForMonth,
  billsTotalForCategoryMonth,
  categoryRollup,
  formatDueLabel,
  hasDate,
} from '../itemStatus.js';

describe('computeBillStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "upcoming" when due day is far away in the same month', () => {
    vi.setSystemTime(new Date(2026, 4, 1, 12, 0, 0)); // May 1, 2026
    const r = computeBillStatus(20);
    expect(r.status).toBe('upcoming');
    expect(r.daysUntilDue).toBe(19);
    expect(r.daysOverdue).toBe(0);
  });

  it('returns "due-soon" when due within 7 days', () => {
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0)); // May 15
    const r = computeBillStatus(20);
    expect(r.status).toBe('due-soon');
    expect(r.daysUntilDue).toBe(5);
  });

  it('returns "overdue" past the due date and rolls daysUntilDue to next month', () => {
    vi.setSystemTime(new Date(2026, 4, 25, 12, 0, 0)); // May 25
    const r = computeBillStatus(20);
    expect(r.status).toBe('overdue');
    expect(r.daysOverdue).toBe(5);
    expect(r.daysUntilDue).toBe(26); // June 20 from May 25
  });

  it('clamps due day to last day of short months', () => {
    vi.setSystemTime(new Date(2026, 1, 1, 12, 0, 0)); // Feb 1, 2026 (28 days)
    const r = computeBillStatus(31);
    expect(r.daysUntilDue).toBe(27); // Feb 28
  });
});

describe('computeMostRecentDue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns this month when today is at-or-past due day', () => {
    vi.setSystemTime(new Date(2026, 4, 25, 12, 0, 0));
    const d = computeMostRecentDue(20);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May
    expect(d.getDate()).toBe(20);
  });

  it('returns previous month when due day is later this month', () => {
    vi.setSystemTime(new Date(2026, 4, 5, 12, 0, 0));
    const d = computeMostRecentDue(20);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(20);
  });

  it('handles January edge case (rolls to previous December)', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0));
    const d = computeMostRecentDue(20);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(11); // December
  });
});

describe('descriptionMatchesBillName', () => {
  it('matches exact word in description', () => {
    expect(descriptionMatchesBillName('NETFLIX MONTHLY', 'Netflix')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(descriptionMatchesBillName('netflix monthly', 'NETFLIX')).toBe(true);
  });

  it('requires every bill-name token to appear as a whole word', () => {
    expect(
      descriptionMatchesBillName('INTERNET ARCHIVE DONATION', 'Internet Archive')
    ).toBe(true);
    expect(
      descriptionMatchesBillName('BANK OF AMERICA CREDIT INQUIRY', 'Credit Card')
    ).toBe(false);
  });

  it('does not match partial-word substrings (regression: SoFi vs SOFICITY)', () => {
    expect(descriptionMatchesBillName('SOFICITY GROCERY', 'SoFi')).toBe(false);
  });

  it('does not match shared common words (regression: Spotify Premium vs PREMIUM PARKING)', () => {
    expect(
      descriptionMatchesBillName('PREMIUM PARKING DOWNTOWN', 'Spotify Premium')
    ).toBe(false);
  });

  it('handles non-alphanumeric separators in descriptions', () => {
    expect(descriptionMatchesBillName('SPOTIFY*MEMBERSHIP', 'Spotify')).toBe(true);
    expect(descriptionMatchesBillName('AT&T WIRELESS', 'AT&T')).toBe(true);
  });

  it('returns false for empty inputs', () => {
    expect(descriptionMatchesBillName('', 'Netflix')).toBe(false);
    expect(descriptionMatchesBillName('NETFLIX', '')).toBe(false);
    expect(descriptionMatchesBillName(null, null)).toBe(false);
  });
});

describe('amountForMonth', () => {
  it('returns the per-month entry when monthlyAmounts is populated', () => {
    const bill = { monthlyAmounts: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120], amount: 0 };
    expect(amountForMonth(bill, 0)).toBe(10);
    expect(amountForMonth(bill, 5)).toBe(60);
    expect(amountForMonth(bill, 11)).toBe(120);
  });

  it('falls back to legacy flat amount when monthlyAmounts is missing or wrong length', () => {
    expect(amountForMonth({ monthlyAmounts: [], amount: 50 }, 3)).toBe(50);
    expect(amountForMonth({ monthlyAmounts: null, amount: 75 }, 0)).toBe(75);
    expect(amountForMonth({ amount: 99 }, 8)).toBe(99);
  });

  it('returns 0 for annual-bill non-due months', () => {
    const months = [0, 0, 99, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const bill = { monthlyAmounts: months, amount: 99 };
    expect(amountForMonth(bill, 2)).toBe(99);
    expect(amountForMonth(bill, 0)).toBe(0);
    expect(amountForMonth(bill, 11)).toBe(0);
  });
});

describe('billsTotalForCategoryMonth', () => {
  const bills = [
    {
      isActive: true,
      budgetCategory: 'Housing',
      monthlyAmounts: Array(12).fill(1500),
      amount: 1500,
    },
    {
      isActive: true,
      budgetCategory: 'Housing',
      monthlyAmounts: Array(12).fill(200),
      amount: 200,
    },
    {
      isActive: true,
      budgetCategory: 'Entertainment',
      monthlyAmounts: [0, 0, 99, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      amount: 99,
    },
    {
      isActive: false,
      budgetCategory: 'Housing',
      monthlyAmounts: Array(12).fill(99999),
      amount: 99999,
    },
    {
      isActive: true,
      budgetCategory: null,
      monthlyAmounts: Array(12).fill(50),
      amount: 50,
    },
  ];

  it('sums per-month amounts for matching active bills', () => {
    expect(billsTotalForCategoryMonth(bills, 'Housing', 5)).toBe(1700);
  });

  it('honors per-month variability (annual bill in due month vs other months)', () => {
    expect(billsTotalForCategoryMonth(bills, 'Entertainment', 3)).toBe(99);
    expect(billsTotalForCategoryMonth(bills, 'Entertainment', 5)).toBe(0);
  });

  it('skips inactive bills and bills with no budgetCategory', () => {
    expect(billsTotalForCategoryMonth(bills, 'Housing', 1)).toBe(1700);
  });

  it('returns 0 for unknown category or missing category', () => {
    expect(billsTotalForCategoryMonth(bills, 'Pets', 5)).toBe(0);
    expect(billsTotalForCategoryMonth(bills, null, 5)).toBe(0);
  });
});

describe('computeItemStatus (PlannedItem)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns null status for recurring items with no dueDay (spread)', () => {
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0));
    const item = { kind: 'recurring', dueDay: null };
    const r = computeItemStatus(item);
    expect(r.status).toBe(null);
    expect(r.daysUntilDue).toBe(null);
  });

  it('returns null status for one_time without oneTimeDate', () => {
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0));
    const item = { kind: 'one_time', oneTimeDate: null };
    const r = computeItemStatus(item);
    expect(r.status).toBe(null);
  });

  it('returns "upcoming" for one_time with future oneTimeDate beyond a week', () => {
    vi.setSystemTime(new Date(2026, 4, 1, 12, 0, 0));
    const item = { kind: 'one_time', oneTimeDate: new Date(2026, 4, 20) };
    const r = computeItemStatus(item);
    expect(r.status).toBe('upcoming');
    expect(r.daysUntilDue).toBe(19);
  });

  it('returns "due-soon" for one_time within 7 days', () => {
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0));
    const item = { kind: 'one_time', oneTimeDate: new Date(2026, 4, 20) };
    const r = computeItemStatus(item);
    expect(r.status).toBe('due-soon');
    expect(r.daysUntilDue).toBe(5);
  });

  it('returns "overdue" for one_time in the past', () => {
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0));
    const item = { kind: 'one_time', oneTimeDate: new Date(2026, 4, 10) };
    const r = computeItemStatus(item);
    expect(r.status).toBe('overdue');
    expect(r.daysOverdue).toBe(5);
  });

  it('routes recurring items with dueDay through the same logic as bare-day callers', () => {
    vi.setSystemTime(new Date(2026, 4, 1, 12, 0, 0));
    const item = { kind: 'recurring', dueDay: 20 };
    const r = computeItemStatus(item);
    expect(r.status).toBe('upcoming');
    expect(r.daysUntilDue).toBe(19);
  });
});

describe('amountForMonth (one_time)', () => {
  it('returns the amount when oneTimeDate falls in the requested month/year', () => {
    const item = {
      kind: 'one_time',
      oneTimeDate: new Date(2026, 11, 20), // Dec 20, 2026
      amount: 800,
    };
    expect(amountForMonth(item, 11, 2026)).toBe(800);
  });

  it('returns 0 for one_time when month does not match', () => {
    const item = {
      kind: 'one_time',
      oneTimeDate: new Date(2026, 11, 20),
      amount: 800,
    };
    expect(amountForMonth(item, 5, 2026)).toBe(0);
  });

  it('returns 0 for one_time when year does not match', () => {
    const item = {
      kind: 'one_time',
      oneTimeDate: new Date(2026, 11, 20),
      amount: 800,
    };
    expect(amountForMonth(item, 11, 2027)).toBe(0);
  });

  it('returns 0 for one_time without oneTimeDate', () => {
    const item = { kind: 'one_time', oneTimeDate: null, amount: 800 };
    expect(amountForMonth(item, 5, 2026)).toBe(0);
  });
});

describe('formatDueLabel', () => {
  it('formats recurring with dueDay as "the Nth"', () => {
    expect(formatDueLabel({ kind: 'recurring', dueDay: 1 })).toBe('the 1st');
    expect(formatDueLabel({ kind: 'recurring', dueDay: 22 })).toBe('the 22nd');
    expect(formatDueLabel({ kind: 'recurring', dueDay: 15 })).toBe('the 15th');
  });

  it('returns null for recurring without dueDay (spread)', () => {
    expect(formatDueLabel({ kind: 'recurring', dueDay: null })).toBe(null);
  });

  it('formats one_time as "Mmm D"', () => {
    expect(
      formatDueLabel({ kind: 'one_time', oneTimeDate: new Date(2026, 11, 20) })
    ).toBe('Dec 20');
  });

  it('returns null for one_time without oneTimeDate', () => {
    expect(formatDueLabel({ kind: 'one_time', oneTimeDate: null })).toBe(null);
  });
});

describe('hasDate', () => {
  it('true for recurring with dueDay', () => {
    expect(hasDate({ kind: 'recurring', dueDay: 15 })).toBe(true);
  });
  it('false for recurring without dueDay', () => {
    expect(hasDate({ kind: 'recurring', dueDay: null })).toBe(false);
  });
  it('true for one_time with oneTimeDate', () => {
    expect(hasDate({ kind: 'one_time', oneTimeDate: new Date() })).toBe(true);
  });
  it('false for one_time without oneTimeDate', () => {
    expect(hasDate({ kind: 'one_time', oneTimeDate: null })).toBe(false);
  });
});

describe('categoryRollup', () => {
  const items = [
    {
      isActive: true,
      category: 'Utilities',
      kind: 'recurring',
      dueDay: 15,
      monthlyAmounts: Array(12).fill(120),
      amount: 120,
    },
    {
      isActive: true,
      category: 'Utilities',
      kind: 'recurring',
      dueDay: null, // spread / discretionary
      monthlyAmounts: Array(12).fill(50),
      amount: 50,
    },
    {
      isActive: true,
      category: 'Utilities',
      kind: 'one_time',
      oneTimeDate: new Date(2026, 4, 20), // May 20, 2026
      amount: 200,
    },
    {
      isActive: false,
      category: 'Utilities',
      kind: 'recurring',
      dueDay: 1,
      monthlyAmounts: Array(12).fill(9999),
      amount: 9999,
    },
    {
      isActive: true,
      category: 'Other',
      kind: 'recurring',
      dueDay: 1,
      monthlyAmounts: Array(12).fill(77),
      amount: 77,
    },
  ];

  it('breaks down planned amount by bucket for the active month', () => {
    const r = categoryRollup(items, 'Utilities', 4, 2026); // May 2026
    expect(r.billsTotal).toBe(120);
    expect(r.discretionaryTotal).toBe(50);
    expect(r.oneTimeTotal).toBe(200);
    expect(r.planned).toBe(370);
  });

  it('excludes one-time items not in the target month', () => {
    const r = categoryRollup(items, 'Utilities', 5, 2026); // June 2026
    expect(r.oneTimeTotal).toBe(0);
    expect(r.planned).toBe(170);
  });

  it('skips inactive items and items in other categories', () => {
    const r = categoryRollup(items, 'Utilities', 4, 2026);
    expect(r.billsTotal).toBe(120); // not 9999 + 120
  });
});
