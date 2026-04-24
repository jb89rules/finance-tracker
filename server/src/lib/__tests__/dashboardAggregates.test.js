import { describe, it, expect } from 'vitest';
import {
  pctChange,
  descriptionMatchesPatterns,
  descriptionContains,
  computeMonthTotals,
  computeTopCategories,
  computeBudgetSpent,
} from '../dashboardAggregates.js';

describe('pctChange', () => {
  it('returns 0 when both are zero', () => {
    expect(pctChange(0, 0)).toBe(0);
  });
  it('returns null when previous is zero and current is not', () => {
    expect(pctChange(50, 0)).toBe(null);
  });
  it('computes positive change', () => {
    expect(pctChange(150, 100)).toBe(50);
  });
  it('computes negative change', () => {
    expect(pctChange(50, 100)).toBe(-50);
  });
});

describe('descriptionMatchesPatterns', () => {
  it('returns false for empty patterns', () => {
    expect(descriptionMatchesPatterns('anything', [])).toBe(false);
    expect(descriptionMatchesPatterns('anything', null)).toBe(false);
  });
  it('matches case-insensitive substring', () => {
    expect(descriptionMatchesPatterns('To Round Ups Vault', ['round ups'])).toBe(true);
  });
  it('returns false when no pattern matches', () => {
    expect(descriptionMatchesPatterns('STARBUCKS', ['round ups'])).toBe(false);
  });
});

describe('descriptionContains', () => {
  it('case-insensitive substring match', () => {
    expect(descriptionContains('NETFLIX BILL', 'netflix')).toBe(true);
  });
  it('returns false on null inputs', () => {
    expect(descriptionContains(null, 'x')).toBe(false);
    expect(descriptionContains('x', null)).toBe(false);
  });
});

const tx = (overrides = {}) => ({
  description: 'STARBUCKS',
  amount: 5,
  effectiveCategory: 'Restaurants',
  splits: [],
  ...overrides,
});

describe('computeMonthTotals', () => {
  it('sums positive amounts as spending and absolute negatives as income', () => {
    const r = computeMonthTotals(
      [
        tx({ amount: 10 }),
        tx({ amount: 25 }),
        tx({ amount: -3000, effectiveCategory: 'Income' }),
      ],
      []
    );
    expect(r.spending).toBe(35);
    expect(r.income).toBe(3000);
  });

  it('excludes Transfer In / Transfer Out by category', () => {
    const r = computeMonthTotals(
      [
        tx({ amount: 100, effectiveCategory: 'Transfer Out' }),
        tx({ amount: -100, effectiveCategory: 'Transfer In' }),
        tx({ amount: 7 }),
      ],
      []
    );
    expect(r).toEqual({ spending: 7, income: 0 });
  });

  it('excludes by description pattern', () => {
    const r = computeMonthTotals(
      [
        tx({ amount: 50, description: 'To Round Ups Vault' }),
        tx({ amount: 8 }),
      ],
      ['Round Ups']
    );
    expect(r.spending).toBe(8);
  });

  it('uses split amounts when transaction has splits, ignoring excluded categories', () => {
    const r = computeMonthTotals(
      [
        tx({
          amount: 100,
          splits: [
            { amount: 60, category: 'Restaurants' },
            { amount: 40, category: 'Transfer Out' }, // excluded
          ],
        }),
      ],
      []
    );
    expect(r.spending).toBe(60);
  });
});

describe('computeTopCategories', () => {
  it('aggregates by effectiveCategory, sorts desc, returns top 5 with percent', () => {
    const txns = [
      tx({ amount: 30, effectiveCategory: 'Restaurants' }),
      tx({ amount: 20, effectiveCategory: 'Restaurants' }),
      tx({ amount: 100, effectiveCategory: 'Shopping' }),
      tx({ amount: 5, effectiveCategory: 'Travel' }),
    ];
    const r = computeTopCategories(txns, [], 155);
    expect(r[0]).toEqual({ category: 'Shopping', amount: 100, percent: (100 / 155) * 100 });
    expect(r[1]).toEqual({ category: 'Restaurants', amount: 50, percent: (50 / 155) * 100 });
    expect(r[2]).toEqual({ category: 'Travel', amount: 5, percent: (5 / 155) * 100 });
  });

  it('uses split categories when transaction has splits', () => {
    const r = computeTopCategories(
      [
        tx({
          amount: 100,
          splits: [
            { amount: 60, category: 'Groceries' },
            { amount: 40, category: 'Household' },
          ],
        }),
      ],
      [],
      100
    );
    expect(r.find((x) => x.category === 'Groceries').amount).toBe(60);
    expect(r.find((x) => x.category === 'Household').amount).toBe(40);
  });

  it('skips negative amounts (income) in non-split path', () => {
    const r = computeTopCategories(
      [tx({ amount: -2000, effectiveCategory: 'Income' })],
      [],
      0
    );
    expect(r).toEqual([]);
  });

  it('excludes transfer categories', () => {
    const r = computeTopCategories(
      [
        tx({ amount: 50, effectiveCategory: 'Transfer Out' }),
        tx({ amount: 10, effectiveCategory: 'Restaurants' }),
      ],
      [],
      10
    );
    expect(r).toHaveLength(1);
    expect(r[0].category).toBe('Restaurants');
  });

  it('caps at top 5', () => {
    const txns = Array.from({ length: 10 }, (_, i) =>
      tx({ amount: i + 1, effectiveCategory: `Cat${i}` })
    );
    const r = computeTopCategories(txns, [], 55);
    expect(r).toHaveLength(5);
    expect(r[0].category).toBe('Cat9');
  });
});

describe('computeBudgetSpent', () => {
  const budget = { category: 'Restaurants' };

  it('returns 0 when budget category is excluded', () => {
    expect(
      computeBudgetSpent(
        { category: 'Transfer Out' },
        [tx({ amount: 50, effectiveCategory: 'Transfer Out' })],
        [],
        []
      )
    ).toBe(0);
  });

  it('sums non-split transactions matching budget category', () => {
    const txns = [
      tx({ amount: 12, effectiveCategory: 'Restaurants' }),
      tx({ amount: 8, effectiveCategory: 'Restaurants' }),
      tx({ amount: 100, effectiveCategory: 'Shopping' }),
    ];
    expect(computeBudgetSpent(budget, txns, [], [])).toBe(20);
  });

  it('matches by bill name (description contains)', () => {
    const txns = [tx({ amount: 100, description: 'NETFLIX 1234', effectiveCategory: 'Other' })];
    expect(computeBudgetSpent(budget, txns, ['Netflix'], [])).toBe(100);
  });

  it('aggregates split amounts only when split.category matches', () => {
    const txns = [
      tx({
        amount: 100,
        splits: [
          { amount: 30, category: 'Restaurants' },
          { amount: 70, category: 'Shopping' },
        ],
      }),
    ];
    expect(computeBudgetSpent(budget, txns, [], [])).toBe(30);
  });

  it('respects excluded description patterns', () => {
    const txns = [
      tx({ amount: 50, description: 'To Round Ups Vault', effectiveCategory: 'Restaurants' }),
      tx({ amount: 5, effectiveCategory: 'Restaurants' }),
    ];
    expect(computeBudgetSpent(budget, txns, [], ['Round Ups'])).toBe(5);
  });
});
