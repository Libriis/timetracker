// Pure helpers for the Log: period windows, filtering, per-entry money and totals.
// Nothing here writes data. Billing math comes from src/lib/billing.js unchanged.
import { aiAdjusted, billableDuration, billingTotals, calcEarnings, calcStandardValue, entryAiFactor, getRounding, getVat, round2, sharedAiFactor, vatOf } from '../../lib/billing.js';
import { isoDay, UI_LOCALE } from '../../lib/format.js';

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// 'YYYY-MM-DD' -> local midnight, or null when the text is not a real day.
const dayStart = (s) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? x : null;
};

// The window of a period id, in local time, both ends inclusive. Same window as App
// periodStart/periodEnd, the Dashboard periodWindow and the DateRangePicker label (rangeOf):
// every period runs from local midnight of its first day to the last millisecond of its last day,
// so future-dated entries stay out. Built from calendar dates (never ms offsets), so a
// daylight-saving day keeps its 23 or 25 hours.
// Custom ranges cover whole local days ('YYYY-MM-DD'), exactly like rangeOf: no start = all time,
// no end = today, an end before the start = the start day alone.
export function periodWindow(period, from, to, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const span = (a, b) => ({ from: a.getTime(), to: b.getTime() - 1 });
  if (period === 'today') return span(new Date(y, m, d), new Date(y, m, d + 1));
  if (period === 'week') { const mon = d - ((now.getDay() + 6) % 7); return span(new Date(y, m, mon), new Date(y, m, mon + 7)); }
  if (period === 'month') return span(new Date(y, m, 1), new Date(y, m + 1, 1));
  if (period === 'year') return span(new Date(y, 0, 1), new Date(y + 1, 0, 1));
  if (period === 'custom') {
    const a = dayStart(from);
    if (!a) return { from: 0, to: Infinity };
    let b = dayStart(to) || new Date(y, m, d);
    if (b < a) b = a;
    return span(a, new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1));
  }
  return { from: 0, to: Infinity };
}

const isMonthStart = (ms) => { const d = new Date(ms); return d.getDate() === 1 && d.getHours() === 0 && d.getMinutes() === 0; };
const isWholeMonth = (a, b) => {
  if (!isMonthStart(a) || !isFinite(b)) return false;
  const d = new Date(a);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1 === b;
};

// The same wall-clock moment `months` months earlier, clamped to the end of a shorter month
// (31 Mar 14:00 -> 28 Feb 23:59:59.999), so a "so far" window never spills into the next month.
function monthsBack(ms, months) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = d.getMonth() - months;
  const last = new Date(y, m + 1, 0).getDate();
  if (d.getDate() > last) return new Date(y, m + 1, 1).getTime() - 1;
  return new Date(y, m, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).getTime();
}

// The window just before the current one. A window that is over compares with the whole window
// before it; one still running ("this month so far") compares with the same stretch of the one
// before, moved back by calendar days or months (never by ms), so DST changes don't shift it.
// Returns null for open windows (all time) and for windows that have not started yet.
export function previousWindow(period, win, nowMs = Date.now()) {
  if (!win || win.from <= 0) return null;
  const end = Math.min(win.to, nowMs);
  if (end <= win.from) return null;
  const over = nowMs >= win.to;
  const f = new Date(win.from);
  let pf;
  let pt;
  let label;
  if (period === 'month' || isWholeMonth(win.from, win.to)) {
    pf = new Date(f.getFullYear(), f.getMonth() - 1, 1);
    pt = monthsBack(end, 1);
    label = 'vs ' + pf.toLocaleDateString(UI_LOCALE, { month: 'long' });
  } else if (period === 'year') {
    pf = new Date(f.getFullYear() - 1, 0, 1);
    pt = monthsBack(end, 12);
    label = 'vs ' + pf.getFullYear();
  } else if (period === 'week') {
    pf = addDays(win.from, -7);
    pt = addDays(end, -7).getTime();
    label = 'vs last week';
  } else if (period === 'today') {
    pf = addDays(win.from, -1);
    pt = addDays(end, -1).getTime();
    label = 'vs yesterday';
  } else {
    if (!isFinite(win.to)) return null;
    const days = Math.round((startOfDay(win.to) - startOfDay(win.from)) / 86400000) + 1;
    pf = addDays(win.from, -days);
    pt = addDays(end, -days).getTime();
    label = days === 1 ? 'vs day before' : days === 7 ? 'vs week before' : `vs previous ${days} days`;
  }
  const from = pf.getTime();
  const to = over ? win.from - 1 : Math.min(pt, win.from - 1);
  return { from, to, label };
}

export function filterEntries(entries, f) {
  const q = (f.q || '').trim().toLowerCase();
  return entries.filter(e => {
    if (f.client !== 'all' && e.client !== f.client) return false;
    if (f.project !== 'all' && (e.project || '') !== f.project) return false;
    if (f.excluded.includes(e.task)) return false;
    if (f.billed === 'unbilled' && e.invoiced) return false;
    if (f.billed === 'invoiced' && !e.invoiced) return false;
    if (e.start < f.from || e.start > f.to) return false;
    if (q && !`${e.client} ${e.task} ${e.project || ''} ${e.note || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// Money and time for one entry, with the client's rate, VAT and rounding. The gross is what
// billingTotals gives for this entry alone (VAT via vatOf, whole cents, half up), so a one-entry
// day shows the same cents in its row and its header. Display only: never add these up.
export function entryFigures(e, cfg) {
  const r = getRounding(e.client, cfg.rounding, cfg.clientRounding);
  const net = calcEarnings(e, cfg.rates, cfg.clientRates, cfg.rounding, cfg.clientRounding);
  const vatPct = getVat(e.client, cfg.vat, cfg.clientVat);
  const vat = vatOf(net, vatPct);
  return {
    net,
    vatPct,
    vat,
    gross: round2(net + vat),
    billableMs: billableDuration(e, r),
    // Tracked time after the AI factor (the entry's own, else the setting), before rounding
    // (shows what AI and rounding each add).
    aiMs: e.free ? 0 : aiAdjusted(e.duration, e.ai, entryAiFactor(e)),
    standard: e.free ? calcStandardValue(e, cfg.rates, cfg.clientRates, cfg.rounding, cfg.clientRounding) : 0,
  };
}

// Money for a list: THE shared rule from billing.js (per client net = round(sum of nets),
// VAT = vatOf(net, VAT %), gross = net + VAT, then added over clients). The Log, the Dashboard
// and the PDF invoice show the same cents for the same entries.
export function clientMoney(list, cfg) {
  const t = billingTotals(list, cfg);
  return { net: t.net, vat: t.vat, gross: t.gross };
}

// Totals for a list. Every amount is billingTotals of its own set of entries: the total of all of
// them, the invoiced ones and the unbilled ones. So "Invoiced" here shows the same cents as the
// total after filtering to Invoiced. VAT rounds once per client in each set, so the two parts can
// add up to a cent or two more or less than the total: splitDiff says by how much.
export function summarize(list, figsOf, cfg) {
  const s = { count: list.length, ms: 0, billableMs: 0, aiExtraMs: 0, roundingMs: 0, freeMs: 0, freeCount: 0, freeValue: 0, invoicedCount: 0 };
  const days = new Set();
  const invoiced = [];
  const unbilled = [];
  for (const e of list) {
    const f = figsOf(e);
    s.ms += e.duration;
    if (e.free) {
      s.freeCount += 1; s.freeValue += f.standard; s.freeMs += e.duration;
    } else {
      s.billableMs += f.billableMs;
      s.aiExtraMs += f.aiMs - e.duration;
      s.roundingMs += f.billableMs - f.aiMs;
    }
    if (e.invoiced) { s.invoicedCount += 1; invoiced.push(e); } else unbilled.push(e);
    days.add(isoDay(new Date(e.start)));
  }
  // The AI factor of the billed AI work, for "incl. AI ×1.5"; null when those entries differ.
  const aiFactor = sharedAiFactor(list.filter(e => !e.free));
  const all = clientMoney(list, cfg);
  const inv = invoiced.length === list.length ? all : invoiced.length ? clientMoney(invoiced, cfg) : { net: 0, vat: 0, gross: 0 };
  const unb = unbilled.length === list.length ? all : unbilled.length ? clientMoney(unbilled, cfg) : { net: 0, vat: 0, gross: 0 };
  return {
    count: s.count, ms: s.ms, billableMs: s.billableMs, dayCount: days.size,
    aiExtraMs: s.aiExtraMs, aiFactor, roundingMs: s.roundingMs, freeMs: s.freeMs,
    net: all.net, vat: all.vat, gross: all.gross,
    invoicedGross: inv.gross, unbilledGross: unb.gross, invoicedCount: s.invoicedCount,
    splitDiff: round2(inv.gross + unb.gross - all.gross),
    freeCount: s.freeCount, freeValue: round2(s.freeValue),
  };
}

// Newest first, grouped by local day. Display order only; stored order is never touched.
export function groupByDay(list) {
  const sorted = [...list].sort((a, b) => b.start - a.start);
  const map = new Map();
  for (const e of sorted) {
    const k = isoDay(new Date(e.start));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

export function dayLabel(key, now = new Date()) {
  const d = new Date(key + 'T00:00:00');
  const diff = Math.round((startOfDay(now) - d) / 86400000);
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  if (diff === 0) return { title: 'Today', sub: date };
  if (diff === 1) return { title: 'Yesterday', sub: date };
  if (diff === -1) return { title: 'Tomorrow', sub: date };
  return {
    title: d.toLocaleDateString(UI_LOCALE, { weekday: 'long' }),
    sub: d.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }),
  };
}

// h:mm for totals (598:12).
export function hoursMinutes(ms) {
  const m = Math.round(Math.max(0, ms) / 60000);
  return `${Math.floor(m / 60).toLocaleString('en-US')}:${String(m % 60).padStart(2, '0')}`;
}

// A file-name part: "Blue Fern Café" -> "blue-fern-cafe". Accents fold to plain letters, any other
// run of symbols becomes one hyphen, and no hyphen leads or trails.
export function slugPart(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}
