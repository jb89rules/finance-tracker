import { describe, it, expect } from 'vitest';
import {
  EXCLUDED_CATEGORIES,
  buildNonTransferDescriptionFilter,
} from '../excludedCategories.js';

describe('EXCLUDED_CATEGORIES', () => {
  it('contains the expected transfer labels', () => {
    expect(EXCLUDED_CATEGORIES).toEqual(['Transfer In', 'Transfer Out']);
  });
});

describe('buildNonTransferDescriptionFilter', () => {
  it('returns empty filter when patterns is null', () => {
    expect(buildNonTransferDescriptionFilter(null)).toEqual({});
  });

  it('returns empty filter when patterns is empty', () => {
    expect(buildNonTransferDescriptionFilter([])).toEqual({});
  });

  it('returns empty filter when patterns is not an array', () => {
    expect(buildNonTransferDescriptionFilter('not-array')).toEqual({});
  });

  it('builds a NOT/OR Prisma filter from patterns', () => {
    const filter = buildNonTransferDescriptionFilter(['Round Ups', 'Savings']);
    expect(filter).toEqual({
      NOT: {
        OR: [
          { description: { contains: 'Round Ups', mode: 'insensitive' } },
          { description: { contains: 'Savings', mode: 'insensitive' } },
        ],
      },
    });
  });
});
