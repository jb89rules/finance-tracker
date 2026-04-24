import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeBillStatus,
  computeMostRecentDue,
  descriptionMatchesBillName,
} from '../billStatus.js';

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
