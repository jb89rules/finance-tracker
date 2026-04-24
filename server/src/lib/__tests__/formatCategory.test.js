import { describe, it, expect } from 'vitest';
import { formatCategory } from '../formatCategory.js';

describe('formatCategory', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(formatCategory(null)).toBe('');
    expect(formatCategory(undefined)).toBe('');
    expect(formatCategory('')).toBe('');
  });

  it('maps known Plaid categories to friendly names', () => {
    expect(formatCategory('FOOD_AND_DRINK')).toBe('Food & Drink');
    expect(formatCategory('TRANSFER_IN')).toBe('Transfer In');
    expect(formatCategory('TRANSFER_OUT')).toBe('Transfer Out');
    expect(formatCategory('GENERAL_MERCHANDISE')).toBe('Shopping');
    expect(formatCategory('RENT_AND_UTILITIES')).toBe('Rent & Utilities');
  });

  it('title-cases unknown ALL_CAPS strings', () => {
    expect(formatCategory('SOMETHING_NEW')).toBe('Something New');
    expect(formatCategory('A_B_C')).toBe('A B C');
  });

  it('passes through already-formatted strings unchanged', () => {
    expect(formatCategory('Food & Drink')).toBe('Food & Drink');
    expect(formatCategory('Custom Category')).toBe('Custom Category');
  });
});
