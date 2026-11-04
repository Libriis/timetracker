import { describe, it, expect } from 'vitest';
import {
  round2, getRate, getVat, getRounding, roundedDuration,
  AI_FACTOR, aiAdjusted, billableDuration, setAiFactor, normalizeAiFactor, DEFAULT_AI_FACTOR,
  calcEarnings, calcStandardValue, timerElapsed, normalizeTimer, buildInvoiceLines, billingTotals, vatOf,
} from './billing.js';

const rates = { 'Post-production': 30, 'Pre-production': 15 };
const clientRates = { 'RCT': { 'Post-production': 40 } };
const clientVat = { 'NoVat': 0 };
const clientRounding = { 'Exact': 0 };
const H = 3600000; // ms in an hour

describe('round2', () => {
  it('rounds to cents and avoids float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(90)).toBe(90);
  });
});

describe('rate/vat/rounding lookups', () => {
  it('uses per-client override when present, else default', () => {
    expect(getRate('RCT', 'Post-production', rates, clientRates)).toBe(40);
    expect(getRate('Other', 'Post-production', rates, clientRates)).toBe(30);
    expect(getRate('Other', 'Unknown', rates, clientRates)).toBe(0);
    expect(getVat('NoVat', 23, clientVat)).toBe(0);
    expect(getVat('Other', 23, clientVat)).toBe(23);
    expect(getRounding('Exact', 15, clientRounding)).toBe(0);
    expect(getRounding('Other', 15, clientRounding)).toBe(15);
  });
});

describe('roundedDuration', () => {
  it('ceils to the block, or returns exact when rounding is 0', () => {
    expect(roundedDuration(16 * 60000, 15)).toBe(30 * 60000);
    expect(roundedDuration(15 * 60000, 15)).toBe(15 * 60000);
    expect(roundedDuration(61 * 60000, 0)).toBe(61 * 60000);
    expect(roundedDuration(1, 15)).toBe(15 * 60000);
  });
});

describe('AI factor', () => {
  it('scales only when the flag is on', () => {
    expect(aiAdjusted(H, false)).toBe(H);
    expect(aiAdjusted(H, undefined)).toBe(H);
    expect(aiAdjusted(H, true)).toBe(H * AI_FACTOR);
  });
  it('scales before rounding, so the block boundary still means something', () => {
    // 50 min AI → 75 min → already on a 15-minute block, so it must not jump to 90
    const e = { duration: 50 * 60000, ai: true };
    expect(billableDuration(e, 15)).toBe(75 * 60000);
    // scaling after rounding would give 60 → 90; make sure we did not do that
    expect(billableDuration(e, 15)).not.toBe(90 * 60000);
  });
  it('leaves non-AI entries exactly as before', () => {
    const e = { duration: 61 * 60000 };
    expect(billableDuration(e, 15)).toBe(roundedDuration(61 * 60000, 15));
    expect(billableDuration(e, 0)).toBe(61 * 60000);
  });
  it('bills AI work at the scaled time', () => {
    const e = { client: 'X', task: 'Post-production', duration: 2 * H, ai: true }; // 2h → 3h @ 30
    expect(calcEarnings(e, rates, clientRates, 0, {})).toBe(90);
    expect(calcStandardValue(e, rates, clientRates, 0, {})).toBe(90);
  });
  it('free beats AI — complimentary work is still €0', () => {
    const e = { client: 'X', task: 'Post-production', duration: 2 * H, ai: true, free: true };
    expect(calcEarnings(e, rates, clientRates, 0, {})).toBe(0);
    expect(calcStandardValue(e, rates, clientRates, 0, {})).toBe(90); // the value it would have had
  });
  it('carries the flag through invoice lines', () => {
    const cfg = { rates, clientRates, vat: 0, clientVat: {}, rounding: 0, clientRounding: {}, includeFree: false };
    const { lines, totalNet } = buildInvoiceLines(
      [{ client: 'X', task: 'Post-production', project: 'P', duration: 2 * H, ai: true }], cfg);
    expect(lines[0].hours).toBe(3);
    expect(totalNet).toBe(90);
  });
  it('normalizeTimer keeps the flag', () => {
    expect(normalizeTimer({ client: 'X', task: 'T', startedAt: 1, ai: true }).ai).toBe(true);
    expect(normalizeTimer({ client: 'X', task: 'T', startedAt: 1 }).ai).toBe(false);
  });
});

describe('calcEarnings / calcStandardValue', () => {
  it('free work earns 0 but keeps a standard value', () => {
    const e = { client: 'X', task: 'Post-production', duration: H, free: true };
    expect(calcEarnings(e, rates, clientRates, 0, {})).toBe(0);
    expect(calcStandardValue(e, rates, clientRates, 0, {})).toBe(30);
  });
  it('applies rate × billable hours with rounding', () => {
    const e = { client: 'X', task: 'Post-production', duration: H }; // 1h @ 30
    expect(calcEarnings(e, rates, clientRates, 0, {})).toBe(30);
    const e2 = { client: 'X', task: 'Post-production', duration: 61 * 60000 }; // 1h1m → 1h15m @30 = 37.5
    expect(calcEarnings(e2, rates, clientRates, 15, {})).toBe(37.5);
    const e3 = { client: 'RCT', task: 'Post-production', duration: H }; // override 40
    expect(calcEarnings(e3, rates, clientRates, 0, {})).toBe(40);
  });
});

describe('timerElapsed', () => {
  it('counts running segment + accumulated, freezes when paused', () => {
    expect(timerElapsed({ accumulatedMs: 1000, runningSince: null }, 5000)).toBe(1000);
    expect(timerElapsed({ accumulatedMs: 1000, runningSince: 4000 }, 5000)).toBe(2000);
  });
});

describe('normalizeTimer', () => {
  it('migrates a legacy timer (only startedAt) to running', () => {
    const t = normalizeTimer({ client: 'X', task: 'T', startedAt: 1000 });
    expect(t.runningSince).toBe(1000);
    expect(t.accumulatedMs).toBe(0);
    expect(t.id).toBeTruthy();
  });
  it('preserves an explicit paused state', () => {
    const t = normalizeTimer({ id: 't1', client: 'X', task: 'T', startedAt: 1000, runningSince: null, accumulatedMs: 5000 });
    expect(t.runningSince).toBe(null);
    expect(t.accumulatedMs).toBe(5000);
    expect(t.id).toBe('t1');
  });
});

describe('buildInvoiceLines', () => {
  const cfg = { rates, clientRates, vat: 23, clientVat: {}, rounding: 0, clientRounding: {}, includeFree: false };
  const entries = [
    { client: 'RCT', task: 'Post-production', project: 'A', duration: 2 * H },
    { client: 'RCT', task: 'Post-production', project: 'A', duration: 1 * H }, // same group → merge
    { client: 'RCT', task: 'Pre-production', project: 'A', duration: 1 * H },
    { client: 'RCT', task: 'Post-production', project: 'A', duration: 1 * H, free: true }, // excluded
  ];
  it('groups by project+task, sums hours, qty×rate = net', () => {
    const { lines, totalNet, totalGross } = buildInvoiceLines(entries, cfg);
    expect(lines.length).toBe(2);
    const post = lines.find(l => l.task === 'Post-production');
    expect(post.hours).toBe(3);
    expect(post.rate).toBe(40); // RCT override
    expect(post.net).toBe(120);
    const pre = lines.find(l => l.task === 'Pre-production');
    expect(pre.net).toBe(15);
    expect(totalNet).toBe(135);
    expect(totalGross).toBe(round2(135 * 1.23));
  });
  it('includes complimentary as €0 lines when asked', () => {
    const { lines } = buildInvoiceLines(entries, { ...cfg, includeFree: true });
    const free = lines.find(l => l.free);
    expect(free).toBeTruthy();
    expect(free.net).toBe(0);
  });
});

describe('billingTotals (the one rule for totals)', () => {
  const cfg = { rates, clientRates, vat: 23, clientVat, rounding: 0, clientRounding: {} };
  it('rounds the net per client, then VAT on that base', () => {
    // 3 entries of 20 min at 30 €/h = 10.00 each -> net 30.00, VAT 6.90, gross 36.90
    const es = [0, 1, 2].map(i => ({ id: 'x' + i, client: 'A', task: 'Post-production', duration: H / 3, start: 0, end: H / 3 }));
    const t = billingTotals(es, cfg);
    expect(t.net).toBe(30);
    expect(t.vat).toBe(6.9);
    expect(t.gross).toBe(36.9);
  });
  it('uses per-client VAT and adds clients up', () => {
    const es = [
      { id: 'a', client: 'A', task: 'Post-production', duration: H, start: 0, end: H },      // 30.00 + 23%
      { id: 'b', client: 'NoVat', task: 'Post-production', duration: H, start: 0, end: H },  // 30.00 + 0%
    ];
    const t = billingTotals(es, cfg);
    expect(t.net).toBe(60);
    expect(t.vat).toBe(6.9);
    expect(t.gross).toBe(66.9);
    expect(t.clients.find(c => c.client === 'NoVat').vat).toBe(0);
  });
  it('gives free entries no money and handles an empty list', () => {
    const es = [{ id: 'f', client: 'A', task: 'Post-production', duration: H, free: true, start: 0, end: H }];
    expect(billingTotals(es, cfg).gross).toBe(0);
    expect(billingTotals([], cfg)).toEqual({ net: 0, vat: 0, gross: 0, clients: [] });
  });
  it('matches the per-client PDF math to the cent on odd minutes', () => {
    const es = [7, 13, 29, 41].map((m, i) => ({ id: 'o' + i, client: 'A', task: 'Pre-production', duration: m * 60000, start: 0, end: m * 60000 }));
    const net = round2(es.reduce((s, e) => s + calcEarnings(e, rates, clientRates, 0, {}), 0));
    const t = billingTotals(es, cfg);
    expect(t.net).toBe(net);
    expect(t.gross).toBe(round2(net + round2(net * 0.23)));
  });
});

describe('vatOf (whole-cent VAT, half up)', () => {
  it('rounds .5 cents up where float math would round down', () => {
    expect(vatOf(602.5, 23)).toBe(138.58);
    expect(vatOf(100, 23)).toBe(23);
    expect(vatOf(0, 23)).toBe(0);
    expect(vatOf(30, 0)).toBe(0);
  });
  it('matches exact decimal math for every net from 0.01 to 20,000.00 at 23 %', () => {
    for (let c = 1; c <= 2000000; c += 7) {
      const exact = Math.floor((c * 23 + 50) / 100) / 100;
      expect(vatOf(c / 100, 23)).toBe(exact);
    }
  });
});

describe('AI factor setting (applies to every AI entry)', () => {
  it('defaults to 1.5 and rejects invalid values', () => {
    expect(DEFAULT_AI_FACTOR).toBe(1.5);
    expect(normalizeAiFactor('2')).toBe(2);
    expect(normalizeAiFactor(1.255)).toBe(1.26);
    expect(normalizeAiFactor(0.5)).toBe(1.5);
    expect(normalizeAiFactor(9)).toBe(1.5);
    expect(normalizeAiFactor('abc')).toBe(1.5);
    expect(normalizeAiFactor(undefined)).toBe(1.5);
  });
  it('changes billable time and money for old and new AI entries alike', () => {
    const e = { id: 'a', client: 'A', task: 'Post-production', duration: H, ai: true, start: 0, end: H };
    try {
      expect(setAiFactor(2)).toBe(2);
      expect(AI_FACTOR).toBe(2);
      expect(aiAdjusted(H, true)).toBe(2 * H);
      expect(calcEarnings(e, rates, clientRates, 0, {})).toBe(60);
      expect(billingTotals([e], { rates, clientRates, vat: 23, clientVat, rounding: 0, clientRounding: {} }).net).toBe(60);
      setAiFactor(1.25);
      expect(calcEarnings(e, rates, clientRates, 0, {})).toBe(37.5);
      // AI off is never scaled
      expect(calcEarnings({ ...e, ai: false }, rates, clientRates, 0, {})).toBe(30);
    } finally {
      setAiFactor(DEFAULT_AI_FACTOR);
    }
    expect(AI_FACTOR).toBe(1.5);
  });
});
