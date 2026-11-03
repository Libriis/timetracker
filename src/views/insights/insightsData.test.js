import { describe, it, expect } from 'vitest';
import { billingTotals } from '../../lib/billing.js';
import { buildTree } from '../dashboard/reportData.js';
import { buildInsights, rateHealth } from './insightsData.js';
import { rateLabelBox, rateRowBaseline } from './parts/TrendChart.jsx';

const d = (y, m, day, h = 0, min = 0) => new Date(y, m, day, h, min);
const cfg = { rates: { Edit: 30, Shoot: 40 }, clientRates: {}, rounding: 0, clientRounding: {} };
const entry = (id, start, mins, extra = {}) => ({ id, client: 'A', task: 'Edit', project: 'P', note: '', start: start.getTime(), end: start.getTime() + mins * 60000, duration: mins * 60000, ...extra });

describe('buildInsights like for like', () => {
  const base = [
    entry('oct1', d(2026, 9, 1, 10), 60), // €30, inside 1 – 3 Oct 15:35
    entry('oct3late', d(2026, 9, 3, 16), 60), // €30, after 15:35 on 3 Oct: not compared
    entry('nov2', d(2026, 10, 2, 10), 120), // €60
  ];
  const future = entry('nov4', d(2026, 10, 4, 10), 60); // €30, dated tomorrow

  it('counts the month so far up to now, the same cut as last month', () => {
    const r = buildInsights([...base, future], cfg, d(2026, 10, 3, 15, 35));
    expect(r.mtd).toBe(60);
    expect(r.prevSameNet).toBe(30);
    expect(r.later).toEqual({ count: 1, net: 30, ms: 3600000 });
    expect(r.cur.net).toBe(60);
  });

  it('shows nothing so far just after midnight on the 1st, even with work dated later', () => {
    const r = buildInsights([...base, future], cfg, d(2026, 10, 1, 0, 30));
    expect(r.mtd).toBe(0);
    expect(r.later.count).toBe(2);
  });

  it('adds the forecast on top of work done so far only', () => {
    const r = buildInsights([...base, future], cfg, d(2026, 10, 3, 15, 35));
    const withoutFuture = buildInsights(base, cfg, d(2026, 10, 3, 15, 35));
    expect(r.projected).toBeCloseTo(withoutFuture.projected, 9);
  });

  it('says when last month is shorter than today', () => {
    expect(buildInsights(base, cfg, d(2027, 2, 31, 9)).prevWholeMonth).toBe(true);
    expect(buildInsights(base, cfg, d(2026, 10, 3, 9)).prevWholeMonth).toBe(false);
  });

  it('starts the month list at the first month with work', () => {
    const r = buildInsights(base, cfg, d(2026, 10, 3, 15, 35));
    expect(r.months.map(m => m.label)).toEqual(['Oct', 'Nov']);
  });
});

describe('buildTree VAT follows billingTotals', () => {
  it('matches billingTotals to the cent for awkward half-cent amounts', () => {
    // 602.50 at 23 % = 138.575 -> 138.58 (half up in whole cents)
    const e = [entry('a', d(2026, 9, 1, 9), 1205, { task: 'Edit' })];
    const vat = 23;
    const rows = buildTree(e, 'client', cfg, () => vat);
    const t = billingTotals(e, { ...cfg, vat, clientVat: {} });
    expect(t.net).toBe(602.5);
    expect(rows[0].gross).toBe(t.gross);
  });
});

describe('round 4: rate windows, chips and attention agree', () => {
  const rates = { Edit: 30, Shoot: 40 };
  const c2 = { rates, clientRates: { Low: { Edit: 20 } }, rounding: 0, clientRounding: {} };
  const now = d(2026, 10, 3, 15, 35);
  const mk = (id, client, start, mins, extra = {}) => ({ id, client, task: 'Edit', project: '', note: '', start: start.getTime(), end: start.getTime() + mins * 60000, duration: mins * 60000, ...extra });
  const list = [
    mk('a1', 'High', d(2026, 9, 5, 9), 600, { task: 'Shoot' }), // €400, 10 h
    mk('l1', 'Low', d(2026, 9, 6, 9), 300), // €100, 5 h: €20/h
    mk('t1', 'Tiny', d(2026, 9, 7, 9), 30, { free: true }), // 0.5 h, €0/h: too little to judge
    mk('old', 'Low', d(2025, 0, 6, 9), 6000, { task: 'Shoot' }), // older than 12 months: not in the rates
    mk('fut', 'Low', d(2026, 10, 20, 9), 6000, { task: 'Shoot' }), // dated later: not in the rates
  ];
  const r = buildInsights(list, c2, now);

  it('rates use the last 12 months up to now, and the average is the 12-month rate', () => {
    const low = r.clientRows.find(x => x.client === 'Low');
    expect(low.ms).toBe(5 * 3600000);
    expect(low.net).toBe(100);
    expect(r.avgRate).toBeCloseTo(r.rate12, 9);
    expect(r.allNet).toBe(r.total12);
  });

  it('a red chip always has a Needs attention row, and only then', () => {
    const red = r.clientRows.filter(x => x.health === 'low').map(x => x.client).sort();
    const listed = r.attention.filter(a => a.kind === 'rate').map(a => a.client).sort();
    expect(red).toEqual(['Low']);
    expect(listed).toEqual(red);
    expect(r.clientRows.find(x => x.client === 'Tiny').health).toBe(null);
  });

  it('judges health on the rounded % the chip shows', () => {
    expect(rateHealth(-0.004)).toBe('good');
    expect(rateHealth(-0.152)).toBe('fair');
    expect(rateHealth(-0.156)).toBe('low');
    expect(rateHealth(null)).toBe(null);
  });

  it('months without tracked time have no rate (the line breaks there)', () => {
    const r2 = buildInsights([mk('j', 'High', d(2026, 0, 2, 9), 60), mk('n', 'High', d(2026, 10, 2, 9), 60)], c2, now);
    const feb = r2.months.find(m => m.label === 'Feb');
    expect(feb.rate).toBe(null);
    expect(r2.months.find(m => m.label === 'Jan').rate).toBe(30);
  });

  it('every money total equals billingTotals to the cent', () => {
    const cfgV = { ...c2, vat: 0, clientVat: {} };
    const past = list.filter(e => e.start <= now.getTime() && e.start >= new Date(2025, 11, 1).getTime());
    expect(r.total12).toBe(billingTotals(past, cfgV).net);
    const unb = list.filter(e => !e.invoiced && !e.free);
    expect(r.unbilled.net).toBe(billingTotals(unb, cfgV).net);
    expect(r.later.net).toBe(billingTotals([list[4]], cfgV).net);
  });
});

describe('€/h value row keeps labels off the dashed lines', () => {
  it('sits fully above the top dashed line, so neither line can cross a label', () => {
    for (const top of [22, 28, 40]) {
      const base = rateRowBaseline(top);
      const [up, down] = rateLabelBox(base);
      expect(down).toBeLessThan(top - 2);
      expect(up).toBeGreaterThan(0);
    }
  });
});
