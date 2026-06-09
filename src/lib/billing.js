// Pure billing / time math — no React, no Tauri, no DOM. Safe to unit-test in isolation.

/**
 * @typedef {Object} Entry
 * @property {string} id
 * @property {string} client
 * @property {string} task
 * @property {string} [project]
 * @property {string} [note]
 * @property {boolean} [free]      - complimentary work, billed at €0
 * @property {boolean} [invoiced]  - already put on an invoice
 * @property {number} start        - epoch ms
 * @property {number} end          - epoch ms
 * @property {number} duration     - worked ms (may be < end-start when paused)
 */

/**
 * @typedef {Object} Timer
 * @property {string} id
 * @property {string} client
 * @property {string} task
 * @property {string} [project]
 * @property {string} [note]
 * @property {number} startedAt        - epoch ms when the session began
 * @property {number|null} runningSince - epoch ms of the current running segment, or null when paused
 * @property {number} accumulatedMs    - worked ms from completed (un-paused) segments
 */

/** Effective hourly rate for a client+task, honouring per-client overrides. */
export function getRate(client, task, rates, clientRates) {
  const o = clientRates?.[client]?.[task];
  if (o != null && !isNaN(o)) return o;
  return rates[task] || 0;
}

/** Effective VAT % for a client, honouring per-client overrides. */
export function getVat(client, defaultVat, clientVat) {
  const o = clientVat?.[client];
  if (o != null && !isNaN(o)) return o;
  return defaultVat;
}

/** Effective rounding (minutes) for a client, honouring per-client overrides. */
export function getRounding(client, defaultRounding, clientRounding) {
  const o = clientRounding?.[client];
  if (o != null && !isNaN(o)) return o;
  return defaultRounding;
}

/** Round a duration up to the nearest billable block (minutes). 0/falsy = no rounding. */
export function roundedDuration(durationMs, roundingMinutes) {
  if (!roundingMinutes || roundingMinutes <= 0) return durationMs;
  const blockMs = roundingMinutes * 60000;
  return Math.ceil(durationMs / blockMs) * blockMs;
}

/** Round a monetary amount to whole cents so line items always add up to the total. */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Net earnings for an entry (€0 when free). */
export function calcEarnings(entry, rates, clientRates, defaultRounding, clientRounding) {
  if (entry.free) return 0;
  const rate = getRate(entry.client, entry.task, rates, clientRates);
  const r = defaultRounding != null ? getRounding(entry.client, defaultRounding, clientRounding || {}) : 0;
  const billableMs = roundedDuration(entry.duration, r);
  return round2((billableMs / 3600000) * rate);
}

/** What an entry would have cost if it were not free. */
export function calcStandardValue(entry, rates, clientRates, defaultRounding, clientRounding) {
  const rate = getRate(entry.client, entry.task, rates, clientRates);
  const r = defaultRounding != null ? getRounding(entry.client, defaultRounding, clientRounding || {}) : 0;
  const billableMs = roundedDuration(entry.duration, r);
  return round2((billableMs / 3600000) * rate);
}

/** Worked time of a timer so far: completed segments + the segment running right now. */
export function timerElapsed(t, nowMs = Date.now()) {
  return (t.accumulatedMs || 0) + (t.runningSince ? nowMs - t.runningSince : 0);
}

/** Normalise a stored timer to the current shape (id + pause tracking). Migrates legacy records. */
export function normalizeTimer(tt) {
  const legacy = tt.runningSince === undefined && tt.accumulatedMs === undefined;
  return {
    id: tt.id || ('t_' + (tt.startedAt || Date.now()) + '_' + Math.random().toString(36).slice(2, 6)),
    client: tt.client,
    task: tt.task,
    project: tt.project || '',
    note: tt.note || '',
    startedAt: tt.startedAt,
    runningSince: legacy ? tt.startedAt : (tt.runningSince ?? null),
    accumulatedMs: tt.accumulatedMs || 0,
  };
}

/**
 * Aggregate entries into invoice line items grouped by client + project + task.
 * @returns {{ lines: Array, totalNet: number, totalVat: number, totalGross: number, totalHours: number }}
 */
export function buildInvoiceLines(entries, cfg) {
  const { rates, clientRates, vat, clientVat, rounding, clientRounding, includeFree } = cfg;
  const multiClient = new Set(entries.map(e => e.client)).size > 1;
  const map = new Map();
  for (const e of entries) {
    if (e.free && !includeFree) continue;
    const key = `${e.client}|||${e.project || ''}|||${e.task}|||${e.free ? 'F' : 'B'}`;
    let g = map.get(key);
    if (!g) {
      g = { client: e.client, project: e.project || '', task: e.task, free: !!e.free, billableMs: 0,
        rate: getRate(e.client, e.task, rates, clientRates), vatPct: getVat(e.client, vat, clientVat) };
      map.set(key, g);
    }
    g.billableMs += roundedDuration(e.duration, getRounding(e.client, rounding, clientRounding));
  }
  const lines = [...map.values()].map(g => {
    const hours = g.billableMs / 3600000;
    const net = g.free ? 0 : round2(hours * g.rate);
    const vatAmt = round2(net * g.vatPct / 100);
    return {
      desc: `${multiClient ? g.client + ' — ' : ''}${g.project ? g.project + ' — ' : ''}${g.task}${g.free ? ' (complimentary)' : ''}`,
      client: g.client, project: g.project, task: g.task, free: g.free,
      hours, rate: g.free ? 0 : g.rate, vatPct: g.vatPct, net, vatAmt, gross: round2(net + vatAmt),
    };
  }).sort((a, b) => a.client.localeCompare(b.client) || a.project.localeCompare(b.project) || a.task.localeCompare(b.task));
  const totalNet = round2(lines.reduce((s, l) => s + l.net, 0));
  const totalVat = round2(lines.reduce((s, l) => s + l.vatAmt, 0));
  return { lines, totalNet, totalVat, totalGross: round2(totalNet + totalVat), totalHours: lines.reduce((s, l) => s + l.hours, 0) };
}
