import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  monthsAhead,
  computeHistoricalAverages,
  indexBudgets,
  billsLinkedTotalsByCategory,
  computeCategoryProjection,
  projectMonth,
} from '../projection.js';

describe('monthsAhead', () => {
  it('returns the next n 1-indexed months from a given anchor', () => {
    const result = monthsAhead(3, new Date(2026, 3, 15));
    expect(result).toEqual([
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it('crosses year boundaries', () => {
    const result = monthsAhead(4, new Date(2026, 9, 15));
    expect(result).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
  });

  it('handles 12-month windows', () => {
    const result = monthsAhead(12, new Date(2026, 3, 1));
    expect(result.length).toBe(12);
    expect(result[0]).toEqual({ year: 2026, month: 5 });
    expect(result[11]).toEqual({ year: 2027, month: 4 });
  });
});

describe('computeHistoricalAverages', () => {
  it('averages outflow per category over the given month count, excluding transfers and bill-matching txns', () => {
    const txns = [
      { description: 'WHOLEFOODS', amount: 100, splits: [], effectiveCategory: 'Groceries' },
      { description: 'WHOLEFOODS 2', amount: 200, splits: [], effectiveCategory: 'Groceries' },
      { description: 'TARGET', amount: 50, splits: [], effectiveCategory: 'Shopping' },
      { description: 'INCOME PAYCHECK', amount: -1000, splits: [], effectiveCategory: 'Income' },
      { description: 'TRANSFER OUT BANK', amount: 500, splits: [], effectiveCategory: 'Transfer Out' },
      { description: 'NETFLIX MONTHLY', amount: 15, splits: [], effectiveCategory: 'Entertainment' },
    ];
    const avg = computeHistoricalAverages({
      txns,
      monthsCount: 3,
      excludedPatterns: [],
      billNeedles: ['Netflix'],
    });
    expect(avg.get('Groceries')).toBeCloseTo(100, 5);
    expect(avg.get('Shopping')).toBeCloseTo(50 / 3, 5);
    expect(avg.has('Income')).toBe(false);
    expect(avg.has('Transfer Out')).toBe(false);
    expect(avg.has('Entertainment')).toBe(false);
  });

  it('uses split categories instead of effectiveCategory when txn has splits', () => {
    const txns = [
      {
        description: 'COSTCO',
        amount: 300,
        splits: [
          { category: 'Groceries', amount: 200 },
          { category: 'Household', amount: 100 },
        ],
        effectiveCategory: null,
      },
    ];
    const avg = computeHistoricalAverages({
      txns,
      monthsCount: 1,
      excludedPatterns: [],
      billNeedles: [],
    });
    expect(avg.get('Groceries')).toBe(200);
    expect(avg.get('Household')).toBe(100);
  });
});

describe('indexBudgets', () => {
  it('builds exact (cat|year|month) lookup and most-recent-per-category lookup', () => {
    const budgets = [
      { category: 'Groceries', year: 2026, month: 2, limit: 400 },
      { category: 'Groceries', year: 2026, month: 4, limit: 600 },
      { category: 'Shopping', year: 2026, month: 3, limit: 200 },
    ];
    const { exact, standingByCategory } = indexBudgets(budgets);
    expect(exact.get('Groceries|2026|4').limit).toBe(600);
    expect(standingByCategory.get('Groceries').month).toBe(4);
    expect(standingByCategory.get('Shopping').limit).toBe(200);
  });
});

describe('billsLinkedTotalsByCategory', () => {
  it('sums bill amounts per linked budgetCategory', () => {
    const totals = billsLinkedTotalsByCategory([
      { name: 'Rent', amount: 1500, budgetCategory: 'Housing' },
      { name: 'HOA', amount: 200, budgetCategory: 'Housing' },
      { name: 'Internet', amount: 70, budgetCategory: 'Utilities' },
      { name: 'Spotify', amount: 12, budgetCategory: null },
    ]);
    expect(totals.get('Housing')).toBe(1700);
    expect(totals.get('Utilities')).toBe(70);
    expect(totals.has(null)).toBe(false);
  });
});

describe('computeCategoryProjection — source-of-truth hierarchy', () => {
  const standing = new Map([['Groceries', { limit: 500 }]]);
  const exactWith = new Map([['Groceries|2026|5', { limit: 400 }]]);
  const exactWithout = new Map();
  const avgs = new Map([['Groceries', 350]]);

  it('uses exact budget when present (source: budget) and subtracts linked bills', () => {
    const r = computeCategoryProjection({
      category: 'Groceries',
      year: 2026,
      month: 5,
      exactBudgets: exactWith,
      standingBudgets: standing,
      historicalAverages: avgs,
      linkedBillsTotal: 50,
    });
    expect(r).toEqual({ amount: 350, source: 'budget' });
  });

  it('falls back to standing budget when no exact match (source: standing-budget)', () => {
    const r = computeCategoryProjection({
      category: 'Groceries',
      year: 2026,
      month: 5,
      exactBudgets: exactWithout,
      standingBudgets: standing,
      historicalAverages: avgs,
      linkedBillsTotal: 0,
    });
    expect(r).toEqual({ amount: 500, source: 'standing-budget' });
  });

  it('falls back to historical average when no budget at all (source: avg)', () => {
    const r = computeCategoryProjection({
      category: 'Groceries',
      year: 2026,
      month: 5,
      exactBudgets: exactWithout,
      standingBudgets: new Map(),
      historicalAverages: avgs,
      linkedBillsTotal: 0,
    });
    expect(r).toEqual({ amount: 350, source: 'avg' });
  });

  it('clamps to 0 when linked bills exceed budget', () => {
    const r = computeCategoryProjection({
      category: 'Housing',
      year: 2026,
      month: 5,
      exactBudgets: new Map([['Housing|2026|5', { limit: 1500 }]]),
      standingBudgets: new Map(),
      historicalAverages: new Map(),
      linkedBillsTotal: 1700,
    });
    expect(r.amount).toBe(0);
    expect(r.source).toBe('budget');
  });

  it('returns source none when no data at all', () => {
    const r = computeCategoryProjection({
      category: 'Pets',
      year: 2026,
      month: 5,
      exactBudgets: new Map(),
      standingBudgets: new Map(),
      historicalAverages: new Map(),
      linkedBillsTotal: 0,
    });
    expect(r).toEqual({ amount: 0, source: 'none' });
  });
});

describe('projectMonth — end to end', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('produces income, bills, spending, and net for a month', () => {
    vi.setSystemTime(new Date(2026, 3, 15, 12, 0, 0));
    const result = projectMonth({
      year: 2026,
      month: 5,
      bills: [
        { id: 'b1', name: 'Rent', amount: 1500, dueDay: 1, budgetCategory: 'Housing' },
        { id: 'b2', name: 'Netflix', amount: 15, dueDay: 10, budgetCategory: null },
      ],
      paycheckCount: 2,
      paycheckAmount: 2000,
      exactBudgets: new Map([['Groceries|2026|5', { limit: 600 }]]),
      standingBudgets: new Map([['Groceries', { limit: 600 }]]),
      historicalAverages: new Map([
        ['Groceries', 550],
        ['Shopping', 200],
      ]),
      linkedBillsByCategory: new Map([['Housing', 1500]]),
    });

    expect(result.year).toBe(2026);
    expect(result.month).toBe(5);
    expect(result.income).toBe(4000);
    expect(result.paycheckCount).toBe(2);
    expect(result.bills.length).toBe(2);
    expect(result.billsTotal).toBe(1515);
    expect(result.spending.byCategory.find((c) => c.category === 'Groceries').amount).toBe(600);
    expect(result.spending.byCategory.find((c) => c.category === 'Groceries').source).toBe('budget');
    expect(result.spending.byCategory.find((c) => c.category === 'Shopping').amount).toBe(200);
    expect(result.spending.byCategory.find((c) => c.category === 'Shopping').source).toBe('avg');
    expect(result.spending.total).toBe(800);
    expect(result.net).toBe(4000 - 1515 - 800);
  });

  it('subtracts linked bills from a budget that covers a bill category', () => {
    const result = projectMonth({
      year: 2026,
      month: 5,
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 1, budgetCategory: 'Housing' }],
      paycheckCount: 0,
      paycheckAmount: 0,
      exactBudgets: new Map([['Housing|2026|5', { limit: 1800 }]]),
      standingBudgets: new Map(),
      historicalAverages: new Map(),
      linkedBillsByCategory: new Map([['Housing', 1500]]),
    });
    const housing = result.spending.byCategory.find((c) => c.category === 'Housing');
    expect(housing.amount).toBe(300);
    expect(housing.source).toBe('budget');
    expect(result.billsTotal + result.spending.total).toBe(1800);
  });

  it('excludes transfer categories from spending', () => {
    const result = projectMonth({
      year: 2026,
      month: 5,
      bills: [],
      paycheckCount: 0,
      paycheckAmount: 0,
      exactBudgets: new Map(),
      standingBudgets: new Map(),
      historicalAverages: new Map([
        ['Transfer Out', 1000],
        ['Groceries', 400],
      ]),
      linkedBillsByCategory: new Map(),
    });
    expect(result.spending.byCategory.map((c) => c.category)).toEqual(['Groceries']);
  });
});
