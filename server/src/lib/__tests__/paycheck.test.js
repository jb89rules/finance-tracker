import { describe, it, expect } from 'vitest';
import { nextPaycheckDates, paychecksInMonth } from '../paycheck.js';

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('nextPaycheckDates — weekly', () => {
  it('walks forward in 7-day steps from lastPayDate', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 3, 3),
      'weekly',
      new Date(2026, 3, 1),
      new Date(2026, 4, 1)
    );
    expect(dates.map(ymd)).toEqual(['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24']);
  });

  it('handles last pay way in the past', () => {
    const dates = nextPaycheckDates(
      new Date(2024, 0, 5),
      'weekly',
      new Date(2026, 3, 1),
      new Date(2026, 3, 22)
    );
    expect(dates.length).toBe(3);
  });

  it('handles last pay in the future (walks back)', () => {
    const dates = nextPaycheckDates(
      new Date(2027, 0, 1),
      'weekly',
      new Date(2026, 3, 1),
      new Date(2026, 3, 22)
    );
    expect(dates.length).toBe(3);
  });
});

describe('nextPaycheckDates — bi-weekly', () => {
  it('returns 2 paychecks in a typical month', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 3, 3),
      'bi-weekly',
      new Date(2026, 3, 1),
      new Date(2026, 4, 1)
    );
    expect(dates.map(ymd)).toEqual(['2026-04-03', '2026-04-17']);
  });

  it('returns 3 paychecks when the cadence aligns with a 5-week month', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 0, 2),
      'bi-weekly',
      new Date(2026, 0, 1),
      new Date(2026, 1, 1)
    );
    expect(dates.length).toBe(3);
  });
});

describe('nextPaycheckDates — semi-monthly', () => {
  it('returns 1st and 15th when anchored to the 1st', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 3, 1),
      'semi-monthly',
      new Date(2026, 3, 1),
      new Date(2026, 4, 1)
    );
    expect(dates.map(ymd)).toEqual(['2026-04-01', '2026-04-16']);
  });

  it('returns 5th and 20th when anchored to the 5th', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 3, 5),
      'semi-monthly',
      new Date(2026, 3, 1),
      new Date(2026, 4, 1)
    );
    expect(dates.map(ymd)).toEqual(['2026-04-05', '2026-04-20']);
  });

  it('clamps the second anchor to last day of short months (Feb)', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 1, 15),
      'semi-monthly',
      new Date(2026, 1, 1),
      new Date(2026, 2, 1)
    );
    expect(dates.map(ymd)).toEqual(['2026-02-15', '2026-02-28']);
  });

  it('does not duplicate when both anchors clamp to the same day', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 1, 28),
      'semi-monthly',
      new Date(2026, 1, 1),
      new Date(2026, 2, 1)
    );
    expect(dates.map(ymd)).toEqual(['2026-02-28']);
  });
});

describe('nextPaycheckDates — monthly', () => {
  it('uses the same day-of-month each month', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 0, 15),
      'monthly',
      new Date(2026, 3, 1),
      new Date(2026, 6, 1)
    );
    expect(dates.map(ymd)).toEqual(['2026-04-15', '2026-05-15', '2026-06-15']);
  });

  it('clamps day-31 anchor to short months', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 0, 31),
      'monthly',
      new Date(2026, 1, 1),
      new Date(2026, 3, 1)
    );
    expect(dates.map(ymd)).toEqual(['2026-02-28', '2026-03-31']);
  });

  it('handles leap-day anchor in non-leap year', () => {
    const dates = nextPaycheckDates(
      new Date(2024, 1, 29),
      'monthly',
      new Date(2025, 1, 1),
      new Date(2025, 2, 1)
    );
    expect(dates.map(ymd)).toEqual(['2025-02-28']);
  });
});

describe('nextPaycheckDates — invalid inputs', () => {
  it('returns [] when lastPayDate is null', () => {
    const dates = nextPaycheckDates(null, 'weekly', new Date(2026, 3, 1), new Date(2026, 4, 1));
    expect(dates).toEqual([]);
  });

  it('returns [] when frequency is unknown', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 3, 1),
      'fortnightly',
      new Date(2026, 3, 1),
      new Date(2026, 4, 1)
    );
    expect(dates).toEqual([]);
  });

  it('returns [] when from >= to', () => {
    const dates = nextPaycheckDates(
      new Date(2026, 3, 1),
      'weekly',
      new Date(2026, 3, 1),
      new Date(2026, 3, 1)
    );
    expect(dates).toEqual([]);
  });
});

describe('paychecksInMonth', () => {
  it('uses 1-indexed month at the API boundary', () => {
    expect(paychecksInMonth(new Date(2026, 3, 3), 'bi-weekly', 2026, 4)).toBe(2);
  });

  it('returns 0 when no lastPayDate', () => {
    expect(paychecksInMonth(null, 'bi-weekly', 2026, 4)).toBe(0);
  });
});
