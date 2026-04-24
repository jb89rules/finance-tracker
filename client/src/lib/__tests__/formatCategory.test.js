import { describe, it, expect } from 'vitest';
import formatCategory from '../formatCategory.js';

describe('formatCategory (client)', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(formatCategory(null)).toBe('');
    expect(formatCategory(undefined)).toBe('');
    expect(formatCategory('')).toBe('');
  });

  it('maps known Plaid categories to friendly names', () => {
    expect(formatCategory('FOOD_AND_DRINK')).toBe('Food & Drink');
    expect(formatCategory('TRANSFER_IN')).toBe('Transfer In');
    expect(formatCategory('GENERAL_MERCHANDISE')).toBe('Shopping');
  });

  it('title-cases unknown ALL_CAPS strings', () => {
    expect(formatCategory('SOMETHING_NEW')).toBe('Something New');
  });

  it('passes through already-formatted strings', () => {
    expect(formatCategory('Food & Drink')).toBe('Food & Drink');
  });
});
