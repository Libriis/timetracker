import { describe, it, expect } from 'vitest';
import { billingTotals, round2 } from '../../lib/billing.js';
import { buildTree, netByClient, netOf, periodWindow, previousWindow, stretchLabel, summarize } from './reportData.js';

const d = (y, m, day, h = 0, min = 0) => new Date(y, m, day, h, min);
const win = (from, to) => ({ from, to });

describe('previousWindow (calendar dates, not ms offsets)', () => {
  it('compares a whole month with the whole month before', () => {
    const p = previousWindow('custom', win(d(2026, 10, 1), d(2026, 10, 30)), d(2026, 11, 3, 10));
    expect(p.from).toBe(d(2026, 9, 1).getTime());
    expect(p.end).toBe(d(2026, 10, 1).getTime());
    expect(stretchLabel(p.from, p.end)).toBe('October 2026');
  });

  it('compares February with all of January', () => {
    const p = previousWindow('custom', win(d(2027, 1, 1), d(2027, 1, 28)), d(2027, 2, 2, 10));
    expect(p.from).toBe(d(2027, 0, 1).getTime());
    expect(p.end).toBe(d(2027, 1, 1).getTime());
  });

  it('compares the month so far with the same days and time of last month', () => {
    const p = previousWindow('month', win(d(2026, 11, 1), d(2026, 11, 31)), d(2026, 11, 3, 10));
    expect(p.from).toBe(d(2026, 10, 1).getTime());
    expect(p.end).toBe(d(2026, 10, 3, 10).getTime());
    expect(stretchLabel(p.from, p.end)).toBe('1 – 3 Nov');
  });

  it('uses the whole shorter month when the day does not exist in it', () => {
    const p = previousWindow('month', win(d(2027, 2, 1), d(2027, 2, 31)), d(2027, 2, 31, 9));
    expect(p.from).toBe(d(2027, 1, 1).getTime());
    expect(p.end).toBe(d(2027, 2, 1).getTime());
  });

  it('steps a week back by calendar days, also across a DST change', () => {
    const p = previousWindow('custom', win(d(2026, 9, 26), d(2026, 10, 1)), d(2026, 10, 3, 14));
    expect(p.from).toBe(d(2026, 9, 19).getTime());
    expect(p.end).toBe(d(2026, 9, 26).getTime());
    expect(new Date(p.end - 1).getHours()).toBe(23);
  });

  it('compares a whole year with the year before, to the same moment when it is running', () => {
    const p = previousWindow('year', win(d(2027, 0, 1), d(2027, 11, 31)), d(2027, 0, 2, 12));
    expect(p.from).toBe(d(2026, 0, 1).getTime());
    expect(p.end).toBe(d(2026, 0, 2, 12).getTime());
  });

  it('has nothing to compare for all time or a future window', () => {
    expect(previousWindow('all', win(d(2026, 0, 1), d(2026, 11, 31)), d(2026, 5, 1))).toBeNull();
    expect(previousWindow('custom', win(d(2027, 0, 1), d(2027, 0, 31)), d(2026, 5, 1))).toBeNull();
  });
});

describe('periodWindow', () => {
  it('runs all time to the last entry when one is dated after today', () => {
    const now = d(2026, 10, 3, 12);
    const w = periodWindow('all', '', '', [{ start: d(2026, 6, 1, 9).getTime() }, { start: d(2026, 11, 2, 9).getTime() }], now);
    expect(w.from.getTime()).toBe(d(2026, 6, 1).getTime());
    expect(w.to.getTime()).toBe(d(2026, 11, 2).getTime());
  });
});

describe('buildTree VAT', () => {
  const rates = { Edit: 37.33, Shoot: 41.17 };
  const cfg = { rates, clientRates: {}, rounding: 0, clientRounding: {} };
  const vat = { A: 23, B: 20 };
  const vatOf = (c) => vat[c];
  const entries = [];
  let t = d(2026, 9, 1, 9).getTime();
  const notes = ['Cut', 'Grade', 'Mix'];
  for (let i = 0; i < 40; i++) {
    const dur = (7 + ((i * 37) % 113)) * 60000 + (i % 7) * 1000;
    entries.push({ id: 'e' + i, client: i % 3 ? 'A' : 'B', task: i % 2 ? 'Edit' : 'Shoot', project: i % 4 ? 'P1' : '', note: notes[i % 3], start: t, end: t + dur, duration: dur, ai: i % 5 === 0 });
    t += 3 * 3600000;
  }
  const cents = (x) => Math.round(x * 100);
  const sumKids = (rows) => rows.reduce((s, r) => s + cents(r.gross), 0);
  const check = (rows) => rows.forEach(r => { if (r.subRows) { expect(sumKids(r.subRows)).toBe(cents(r.gross)); check(r.subRows); } });

  for (const groupBy of ['client', 'project', 'activity']) {
    it(`children add up to parents and rows to the per-client total (${groupBy})`, () => {
      const rows = buildTree(entries, groupBy, cfg, vatOf);
      check(rows);
      const byClient = {};
      buildTree(entries, 'client', cfg, vatOf).forEach(r => { byClient[r.client] = r; });
      const expected = Object.entries(byClient).reduce((s, [c, r]) => s + cents(r.net + round2((r.net * vat[c]) / 100)), 0);
      expect(sumKids(rows)).toBe(expected);
    });
  }

  it('client rows follow net + round2(net × VAT)', () => {
    buildTree(entries, 'client', cfg, vatOf).forEach(r => {
      expect(cents(r.gross)).toBe(cents(r.net) + cents(round2((r.net * vat[r.client]) / 100)));
      expect(r.vatPct).toBe(vat[r.client]);
    });
  });
});

describe('round 4: money totals follow billingTotals', () => {
  const cfg = { rates: { Edit: 33.33, Shoot: 47.5 }, clientRates: {}, rounding: 0, clientRounding: {} };
  const mk = (id, client, mins, extra = {}) => ({ id, client, task: 'Edit', start: d(2026, 9, 1, 9).getTime(), end: 0, duration: mins * 60000, ...extra });
  const list = [
    mk('a', 'A', 7), mk('b', 'A', 13, { task: 'Shoot' }), mk('c', 'B', 29, { ai: true }), mk('d', 'B', 11, { free: true }),
    mk('e', 'C', 41, { invoiced: true }), mk('f', 'C', 3),
  ];
  const cfgV = { ...cfg, vat: 0, clientVat: {} };
  it('netOf and netByClient are billingTotals', () => {
    expect(netOf(list, cfg)).toBe(billingTotals(list, cfgV).net);
    const by = netByClient(list, cfg);
    billingTotals(list, cfgV).clients.forEach(c => expect(by[c.client]).toBe(c.net));
    expect(netOf([], cfg)).toBe(0);
  });
  it('summarize uses the same rule for net, unbilled and complimentary value', () => {
    const s = summarize(list, cfg);
    expect(s.net).toBe(billingTotals(list, cfgV).net);
    expect(s.unbilledNet).toBe(billingTotals(list.filter(e => !e.invoiced && !e.free), cfgV).net);
    expect(s.freeValue).toBe(billingTotals([{ ...list[3], free: false }], cfgV).net);
  });
  it('tree rows are whole cents and add up to the total', () => {
    const rows = buildTree(list, 'client', cfg, () => 23);
    rows.forEach(r => expect(Math.round(r.net * 100) / 100).toBe(r.net));
    expect(round2(rows.reduce((s, r) => s + r.net, 0))).toBe(billingTotals(list, cfgV).net);
  });
});

describe('buildTree AI factor per row (for the badge tooltip)', () => {
  const cfg = { rates: { Edit: 30 }, clientRates: {}, rounding: 0, clientRounding: {} };
  const e = (id, client, extra) => ({ id, client, task: 'Edit', project: '', note: '', start: d(2026, 10, 2, 9).getTime(), end: d(2026, 10, 2, 10).getTime(), duration: 3600000, ...extra });
  it('shows the factor the AI entries of a row share, null when they differ', () => {
    const list = [
      e('1', 'Same', { ai: true, aiFactor: 2 }), e('2', 'Same', { ai: true, aiFactor: 2 }), e('3', 'Same'),
      e('4', 'Mixed', { ai: true, aiFactor: 2 }), e('5', 'Mixed', { ai: true }),
      e('6', 'Plain'),
    ];
    const rows = buildTree(list, 'client', cfg, () => 23);
    const by = Object.fromEntries(rows.map(r => [r.client, r]));
    expect(by.Same.aiCount).toBe(2);
    expect(by.Same.aiFactor).toBe(2);
    expect(by.Mixed.aiCount).toBe(2);
    expect(by.Mixed.aiFactor).toBe(null);
    expect(by.Plain.aiCount).toBe(0);
    // money follows each entry's own factor: 2 h x 2 + 1 h = 5 h at 30
    expect(by.Same.net).toBe(150);
  });
});
