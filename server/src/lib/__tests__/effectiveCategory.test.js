import { describe, it, expect } from 'vitest';
import { effectiveCategoryOf, hasSplits } from '../effectiveCategory.js';

describe('effectiveCategoryOf', () => {
  const ruleMap = new Map([['STARBUCKS COFFEE', 'Restaurants']]);

  it('returns null when transaction has splits', () => {
    const t = {
      categoryOverride: 'X',
      category: 'Y',
      description: 'STARBUCKS COFFEE',
      splits: [{ amount: 5, category: 'Restaurants' }],
    };
    expect(effectiveCategoryOf(t, ruleMap)).toBe(null);
  });

  it('prefers categoryOverride over rule and category', () => {
    const t = {
      categoryOverride: 'Override Pick',
      category: 'Plaid Pick',
      description: 'STARBUCKS COFFEE',
      splits: [],
    };
    expect(effectiveCategoryOf(t, ruleMap)).toBe('Override Pick');
  });

  it('falls back to rule when no override', () => {
    const t = {
      categoryOverride: null,
      category: 'Plaid Pick',
      description: 'STARBUCKS COFFEE',
      splits: [],
    };
    expect(effectiveCategoryOf(t, ruleMap)).toBe('Restaurants');
  });

  it('falls back to raw category when no override and no rule', () => {
    const t = {
      categoryOverride: null,
      category: 'Plaid Pick',
      description: 'UNKNOWN',
      splits: [],
    };
    expect(effectiveCategoryOf(t, ruleMap)).toBe('Plaid Pick');
  });

  it('returns null when nothing resolves', () => {
    const t = {
      categoryOverride: null,
      category: null,
      description: 'UNKNOWN',
      splits: [],
    };
    expect(effectiveCategoryOf(t, ruleMap)).toBe(null);
  });
});

describe('hasSplits', () => {
  it('detects split transactions', () => {
    expect(hasSplits({ splits: [{ amount: 1, category: 'X' }] })).toBe(true);
  });
  it('returns false for empty splits array', () => {
    expect(hasSplits({ splits: [] })).toBe(false);
  });
  it('returns false when splits is missing', () => {
    expect(hasSplits({})).toBe(false);
  });
});
