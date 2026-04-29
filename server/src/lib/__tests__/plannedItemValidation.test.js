import { describe, it, expect } from 'vitest';
import { validatePlannedItemInput } from '../plannedItemValidation.js';

describe('validatePlannedItemInput - recurring', () => {
  it('expands a single amount into monthlyAmounts on create', () => {
    const { errors, data } = validatePlannedItemInput(
      { name: 'Netflix', kind: 'recurring', amount: 15.99, dueDay: 15 },
      { partial: false }
    );
    expect(errors).toEqual([]);
    expect(data.monthlyAmounts).toHaveLength(12);
    expect(data.monthlyAmounts.every((a) => a === 15.99)).toBe(true);
    expect(data.amount).toBe(15.99);
    expect(data.frequency).toBe('monthly');
    expect(data.dueDay).toBe(15);
  });

  it('accepts monthlyAmounts directly and computes amount = max', () => {
    const months = [0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 0, 0];
    const { errors, data } = validatePlannedItemInput(
      {
        name: 'Insurance',
        kind: 'recurring',
        monthlyAmounts: months,
        frequency: 'semi-annual',
        dueDay: 1,
      },
      { partial: false }
    );
    expect(errors).toEqual([]);
    expect(data.monthlyAmounts).toEqual(months);
    expect(data.amount).toBe(100);
  });

  it('allows null dueDay for spread items', () => {
    const { errors, data } = validatePlannedItemInput(
      {
        name: 'Discretionary - Food',
        kind: 'recurring',
        amount: 200,
        dueDay: null,
      },
      { partial: false }
    );
    expect(errors).toEqual([]);
    expect(data.dueDay).toBe(null);
  });

  it('rejects monthlyAmounts not of length 12', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'recurring', monthlyAmounts: [1, 2, 3], dueDay: 1 },
      { partial: false }
    );
    expect(errors[0]).toMatch(/12 entries/);
  });

  it('rejects negative monthlyAmounts entries', () => {
    const months = Array(12).fill(0);
    months[3] = -5;
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'recurring', monthlyAmounts: months, dueDay: 1 },
      { partial: false }
    );
    expect(errors[0]).toMatch(/non-negative/);
  });

  it('requires amount or monthlyAmounts on create', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'recurring', dueDay: 1 },
      { partial: false }
    );
    expect(errors[0]).toMatch(/amount or monthlyAmounts/);
  });

  it('rejects dueDay outside 1-31', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'recurring', amount: 1, dueDay: 32 },
      { partial: false }
    );
    expect(errors[0]).toMatch(/dueDay/);
  });
});

describe('validatePlannedItemInput - one_time', () => {
  it('accepts a one_time item with date and amount', () => {
    const { errors, data } = validatePlannedItemInput(
      {
        name: 'Christmas gifts',
        kind: 'one_time',
        amount: 800,
        oneTimeDate: '2026-12-20T00:00:00.000Z',
      },
      { partial: false }
    );
    expect(errors).toEqual([]);
    expect(data.amount).toBe(800);
    expect(data.oneTimeDate).toBeInstanceOf(Date);
    expect(data.frequency).toBe(null);
    expect(data.dueDay).toBe(null);
    expect(data.monthlyAmounts).toEqual([]);
  });

  it('requires oneTimeDate on one_time create', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'one_time', amount: 100 },
      { partial: false }
    );
    expect(errors.some((e) => e.match(/oneTimeDate/))).toBe(true);
  });

  it('requires amount on one_time create', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'one_time', oneTimeDate: '2026-12-20' },
      { partial: false }
    );
    expect(errors.some((e) => e.match(/amount/))).toBe(true);
  });

  it('rejects invalid oneTimeDate', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'one_time', amount: 100, oneTimeDate: 'not-a-date' },
      { partial: false }
    );
    expect(errors.some((e) => e.match(/oneTimeDate/))).toBe(true);
  });
});

describe('validatePlannedItemInput - common rules', () => {
  it('requires name on create', () => {
    const { errors } = validatePlannedItemInput(
      { kind: 'recurring', amount: 1, dueDay: 1 },
      { partial: false }
    );
    expect(errors.some((e) => e.match(/name is required/))).toBe(true);
  });

  it('requires kind on create', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', amount: 1, dueDay: 1 },
      { partial: false }
    );
    expect(errors.some((e) => e.match(/kind is required/))).toBe(true);
  });

  it('rejects invalid kind', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'lol', amount: 1, dueDay: 1 },
      { partial: false }
    );
    expect(errors[0]).toMatch(/kind must be/);
  });

  it('rejects paymentWindowDays out of 1-14', () => {
    const { errors } = validatePlannedItemInput(
      { name: 'X', kind: 'recurring', amount: 1, dueDay: 1, paymentWindowDays: 0 },
      { partial: false }
    );
    expect(errors[0]).toMatch(/paymentWindowDays/);
  });

  it('accepts a partial update of just isActive', () => {
    const { errors, data } = validatePlannedItemInput(
      { isActive: false },
      { partial: true }
    );
    expect(errors).toEqual([]);
    expect(data).toEqual({ isActive: false });
  });

  it('on partial update without kind, does not enforce one_time/recurring cross-field rules', () => {
    const { errors, data } = validatePlannedItemInput(
      { matchKeyword: 'NETFLIX.COM' },
      { partial: true }
    );
    expect(errors).toEqual([]);
    expect(data.matchKeyword).toBe('NETFLIX.COM');
  });
});
