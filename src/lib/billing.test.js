import { describe, it, expect } from 'vitest';
import {
  round2, getRate, getVat, getRounding, roundedDuration,
  calcEarnings, calcStandardValue, timerElapsed, normalizeTimer, buildInvoiceLines,
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
