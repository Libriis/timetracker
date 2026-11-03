import { describe, expect, it } from 'vitest';
import { billingTotals } from '../../lib/billing.js';
import { clientMoney, filterEntries, periodWindow, previousWindow, slugPart, summarize, entryFigures } from './logModel.js';

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = new Date(2026, 10, 3, 14, 30); // Tue 3 Nov 2026, 14:30 local

describe('periodWindow', () => {
  it('ends "This week" on Sunday night, so later entries stay out', () => {
    const w = periodWindow('week', '', '', NOW);
    expect(w.from).toBe(at(2026, 11, 2));
    expect(w.to).toBe(at(2026, 11, 9) - 1);
  });
  it('ends "This month" on its last day', () => {
    const w = periodWindow('month', '', '', NOW);
    expect(w.from).toBe(at(2026, 11, 1));
    expect(w.to).toBe(at(2026, 12, 1) - 1);
  });
  it('ends "Today" at midnight and "This year" on 31 Dec', () => {
    expect(periodWindow('today', '', '', NOW)).toEqual({ from: at(2026, 11, 3), to: at(2026, 11, 4) - 1 });
    expect(periodWindow('year', '', '', NOW)).toEqual({ from: at(2026, 1, 1), to: at(2027, 1, 1) - 1 });
  });
  it('covers whole local days for a custom range', () => {
    expect(periodWindow('custom', '2026-10-01', '2026-10-31', NOW)).toEqual({ from: at(2026, 10, 1), to: at(2026, 11, 1) - 1 });
  });
  it('keeps "All time" open', () => {
    expect(periodWindow('all', '', '', NOW)).toEqual({ from: 0, to: Infinity });
  });
  it('reads a custom range like the date picker label: no end = today, end before start = start day', () => {
    expect(periodWindow('custom', '2026-10-20', '', NOW)).toEqual({ from: at(2026, 10, 20), to: at(2026, 11, 4) - 1 });
    expect(periodWindow('custom', '2026-10-20', '2026-10-10', NOW)).toEqual({ from: at(2026, 10, 20), to: at(2026, 10, 21) - 1 });
    expect(periodWindow('custom', '', '2026-10-10', NOW)).toEqual({ from: 0, to: Infinity });
    expect(periodWindow('custom', 'nonsense', '', NOW)).toEqual({ from: 0, to: Infinity });
  });
  it('keeps the 25-hour DST day whole (Sun 25 Oct 2026)', () => {
    const w = periodWindow('custom', '2026-10-25', '2026-10-25', NOW);
    expect(w).toEqual({ from: at(2026, 10, 25), to: at(2026, 10, 26) - 1 });
  });
  it('every DateRangePicker preset gets a real start and end in local days', () => {
    const presets = { lastWeek: ['2026-10-26', '2026-11-01'], lastMonth: ['2026-10-01', '2026-10-31'], last7: ['2026-10-28', '2026-11-03'], last30: ['2026-10-05', '2026-11-03'] };
    for (const [from, to] of Object.values(presets)) {
      const w = periodWindow('custom', from, to, NOW);
      const [fy, fm, fd] = from.split('-').map(Number);
      const [ty, tm, td] = to.split('-').map(Number);
      expect(w.from).toBe(at(fy, fm, fd));
      expect(w.to).toBe(new Date(ty, tm - 1, td + 1).getTime() - 1);
    }
  });
  it('leaves future-dated entries out of week and month', () => {
    const base = { client: 'A', task: 'T', duration: 3600000 };
    const list = [
      { ...base, id: 'in', start: at(2026, 11, 3, 9) },
      { ...base, id: 'next-week', start: at(2026, 11, 11, 9) },
      { ...base, id: 'next-month', start: at(2026, 12, 2, 9) },
    ];
    const f = { client: 'all', project: 'all', excluded: [], billed: 'all', q: '' };
    const ids = (p) => filterEntries(list, { ...f, ...periodWindow(p, '', '', NOW) }).map(e => e.id);
    expect(ids('week')).toEqual(['in']);
    expect(ids('month')).toEqual(['in', 'next-week']);
  });
});

describe('money', () => {
  const cfg = { rates: { T: 33.33 }, clientRates: {}, vat: 23, clientVat: { B: 20 }, rounding: 0, clientRounding: {} };
  const list = [
    { id: 1, client: 'A', task: 'T', start: at(2026, 11, 2, 9), end: at(2026, 11, 2, 9, 7), duration: 7 * 60000 },
    { id: 2, client: 'A', task: 'T', start: at(2026, 11, 2, 10), end: at(2026, 11, 2, 10, 13), duration: 13 * 60000 },
    { id: 3, client: 'B', task: 'T', start: at(2026, 11, 2, 11), end: at(2026, 11, 2, 11, 29), duration: 29 * 60000, invoiced: true },
  ];
  it('uses the shared billingTotals rule', () => {
    const t = billingTotals(list, cfg);
    expect(clientMoney(list, cfg)).toEqual({ net: t.net, vat: t.vat, gross: t.gross });
    const s = summarize(list, (e) => entryFigures(e, cfg), cfg);
    expect([s.net, s.vat, s.gross]).toEqual([t.net, t.vat, t.gross]);
    expect(s.unbilledGross + s.invoicedGross).toBeCloseTo(s.gross, 6);
  });
  it('gives a row the same gross as billingTotals of that entry alone (172.50 at 23% = 212.18)', () => {
    const c = { rates: { P: 30 }, clientRates: {}, vat: 23, clientVat: {}, rounding: 15, clientRounding: {} };
    const e = { id: 'x', client: 'V', task: 'P', start: at(2026, 9, 20, 9), end: at(2026, 9, 20, 14, 40), duration: 340 * 60000 };
    const f = entryFigures(e, c);
    expect(f.net).toBe(172.5);
    expect(f.gross).toBe(212.18);
    expect(f.gross).toBe(billingTotals([e], c).gross);
    // Every net in steps of 3.75 up to 1,500: row gross = one-entry billingTotals gross.
    for (let i = 1; i <= 400; i++) {
      const n = Math.round(i * 3.75 * 100) / 100;
      const ee = { ...e, duration: (n / 30) * 3600000 };
      expect(entryFigures(ee, c).gross).toBe(billingTotals([ee], c).gross);
    }
  });
  it('splits invoiced and unbilled with billingTotals of each set, and says when the parts miss the total', () => {
    const c = { rates: { T: 30 }, clientRates: {}, vat: 23, clientVat: {}, rounding: 0, clientRounding: {} };
    // Nets 0.50 + 0.50 in one client: VAT 0.115 -> 0.12 each, 0.23 together.
    const mk = (id, invoiced) => ({ id, client: 'A', task: 'T', start: at(2026, 11, 2, 9), end: at(2026, 11, 2, 9, 1), duration: 60000, invoiced });
    const list = [mk('a', true), mk('b', false)];
    const s = summarize(list, (e) => entryFigures(e, c), c);
    expect(s.invoicedGross).toBe(billingTotals([list[0]], c).gross);
    expect(s.unbilledGross).toBe(billingTotals([list[1]], c).gross);
    expect(s.gross).toBe(billingTotals(list, c).gross);
    expect(s.splitDiff).toBe(Math.round((s.invoicedGross + s.unbilledGross - s.gross) * 100) / 100);
    expect(s.splitDiff).toBe(0.01);
  });
  it('counts what AI ×1.5 and rounding add to the billable time', () => {
    const c = { rates: { T: 30 }, clientRates: {}, vat: 23, clientVat: {}, rounding: 15, clientRounding: {} };
    const list = [
      { id: 'a', client: 'A', task: 'T', start: 0, end: 0, duration: 50 * 60000, ai: true }, // 75 -> 75
      { id: 'b', client: 'A', task: 'T', start: 0, end: 0, duration: 10 * 60000 }, // 10 -> 15
      { id: 'c', client: 'A', task: 'T', start: 0, end: 0, duration: 20 * 60000, free: true },
    ];
    const s = summarize(list, (e) => entryFigures(e, c), c);
    expect(s.aiExtraMs).toBe(25 * 60000);
    expect(s.roundingMs).toBe(5 * 60000);
    expect(s.freeMs).toBe(20 * 60000);
    expect(s.billableMs - s.ms).toBe(s.aiExtraMs + s.roundingMs - s.freeMs);
  });
});

describe('previousWindow', () => {
  it('compares a running week with the same stretch of last week, by wall clock across DST', () => {
    // Sun 1 Nov 2026 14:00: this week started Mon 26 Oct (after the 25 Oct change).
    const now = new Date(2026, 10, 1, 14, 0);
    const w = periodWindow('week', '', '', now);
    const p = previousWindow('week', w, now.getTime());
    expect(p.from).toBe(at(2026, 10, 19));
    expect(p.to).toBe(at(2026, 10, 25, 14, 0));
  });
  it('compares a finished month with the whole month before it', () => {
    const w = periodWindow('custom', '2026-02-01', '2026-02-28', NOW);
    const p = previousWindow('custom', w, NOW.getTime());
    expect(p).toEqual({ from: at(2026, 1, 1), to: at(2026, 2, 1) - 1, label: 'vs January' });
  });
  it('clamps "this month so far" to the end of a shorter month', () => {
    const now = new Date(2026, 2, 31, 10, 0); // 31 Mar
    const p = previousWindow('month', periodWindow('month', '', '', now), now.getTime());
    expect(p.from).toBe(at(2026, 2, 1));
    expect(p.to).toBe(at(2026, 3, 1) - 1);
  });
  it('has nothing to compare for all time or a window that has not started', () => {
    expect(previousWindow('all', periodWindow('all', '', '', NOW), NOW.getTime())).toBeNull();
    expect(previousWindow('custom', periodWindow('custom', '2026-11-10', '2026-11-12', NOW), NOW.getTime())).toBeNull();
  });
});

describe('slugPart', () => {
  it('folds accents and never leaves double hyphens', () => {
    expect(slugPart('Blue Fern Café')).toBe('blue-fern-cafe');
    expect(slugPart('Úprava videa / FB')).toBe('uprava-videa-fb');
    expect(slugPart('  ---  ')).toBe('');
  });
});
