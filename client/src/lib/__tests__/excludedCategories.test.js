import { describe, it, expect } from 'vitest';
import {
  EXCLUDED_CATEGORIES,
  isTransferTransaction,
} from '../excludedCategories.js';

describe('EXCLUDED_CATEGORIES', () => {
  it('contains the expected transfer labels', () => {
    expect(EXCLUDED_CATEGORIES).toEqual(['Transfer In', 'Transfer Out']);
  });
});

describe('isTransferTransaction', () => {
  it('returns false for null transaction', () => {
    expect(isTransferTransaction(null, [])).toBe(false);
  });

  it('returns true when category is excluded', () => {
    expect(isTransferTransaction({ category: 'Transfer In' }, [])).toBe(true);
    expect(isTransferTransaction({ category: 'Transfer Out' }, [])).toBe(true);
  });

  it('returns false for empty/missing patterns when category is allowed', () => {
    const t = { category: 'Restaurants', description: 'STARBUCKS' };
    expect(isTransferTransaction(t, [])).toBe(false);
    expect(isTransferTransaction(t, undefined)).toBe(false);
    expect(isTransferTransaction(t, null)).toBe(false);
  });

  it('matches description against provided patterns case-insensitively', () => {
    const t = { category: 'Other', description: 'To Round Ups Vault' };
    expect(isTransferTransaction(t, ['round ups'])).toBe(true);
    expect(isTransferTransaction(t, ['ROUND UPS'])).toBe(true);
  });

  it('returns false when no pattern matches', () => {
    expect(
      isTransferTransaction(
        { category: 'Other', description: 'STARBUCKS' },
        ['Round Ups']
      )
    ).toBe(false);
  });

  it('does not consult any default — caller must pass patterns', () => {
    // Even though "Round Ups Vault" was a hardcoded default historically,
    // it is no longer applied unless the caller passes it in.
    expect(
      isTransferTransaction(
        { category: 'Other', description: 'To Round Ups Vault' },
        []
      )
    ).toBe(false);
  });
});
