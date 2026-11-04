// Pure aggregation for the Dashboard and Insights. Every money and time figure comes from
// src/lib/billing.js, summed per entry exactly like App.jsx does, so the numbers always match.
import { billableDuration, billingTotals, calcEarnings, calcStandardValue, entryAiFactor, getRounding, round2, vatOf as vatAmount } from '../../lib/billing.js';
import { CLIENT_PALETTE, clientColor } from '../../lib/colors.js';
import { formatMonthShort, isoDay, UI_LOCALE } from '../../lib/format.js';

export const DAY = 86400000;
export const HOUR = 3600000;
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const monthEnd = (y, m) => new Date(y, m + 1, 0);
const sameDay = (a, b) => isoDay(a) === isoDay(b);

// The date window a period covers (inclusive days). Same meaning as App periodStart/periodEnd.
// "All time" runs from the first entry to today, or to the last entry when one is dated later.
export function periodWindow(period, customStart, customEnd, entries, now = new Date()) {
  if (period === 'today') { const s = startOfDay(now); return { from: s, to: s }; }
  if (period === 'week') { const s = monday(now); return { from: s, to: addDays(s, 6) }; }
  if (period === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: monthEnd(now.getFullYear(), now.getMonth()) };
  if (period === 'year') return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) };
  let first = now.getTime();
  let last = now.getTime();
  for (const e of entries) { if (e.start < first) first = e.start; if (e.start > last) last = e.start; }
  if (period === 'custom' && customStart) {
    const s = new Date(customStart + 'T00:00:00');
    const e = customEnd ? new Date(customEnd + 'T00:00:00') : startOfDay(last);
    return { from: s, to: e < s ? s : e };
  }
  return { from: startOfDay(first), to: startOfDay(last) };
}

// Calendar helpers. Windows are built from dates, never from ms offsets, so month lengths and
// daylight-saving changes cannot shift them.
const daySpan = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY) + 1;
const withTimeOf = (d, t) => { const x = new Date(d); x.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds()); return x; };
// The same moment n months earlier. When that day does not exist (31 Mar -> 31 Feb), the whole
// shorter month counts: the result is the start of the month after it.
const monthsBack = (t, n) => {
  const x = new Date(t.getFullYear(), t.getMonth() - n, 1);
  if (t.getDate() > monthEnd(x.getFullYear(), x.getMonth()).getDate()) return new Date(x.getFullYear(), x.getMonth() + 1, 1);
  x.setDate(t.getDate());
  return withTimeOf(x, t);
};
// Whole calendar months: starts on the 1st, ends on a month's last day. Returns the month count.
const wholeMonths = (w) => {
  if (w.from.getDate() !== 1 || !sameDay(w.to, monthEnd(w.to.getFullYear(), w.to.getMonth()))) return 0;
  return (w.to.getFullYear() - w.from.getFullYear()) * 12 + w.to.getMonth() - w.from.getMonth() + 1;
};

// The stretch to compare with: the same window one step earlier. Whole months compare with the
// whole months before (November with all of October), whole years with the year before, any other
// window with the same number of days just before it. When the window runs into the future, only
// the part that has happened is compared: 3 Nov 14:00 of this month against 3 Oct 14:00.
// Returns { from, end } in ms (end exclusive) or null.
export function previousWindow(period, win, now = new Date()) {
  if (period === 'all' || !win) return null;
  const from = startOfDay(win.from);
  const endEx = addDays(startOfDay(win.to), 1);
  if (now <= from) return null;
  const partial = now < endEx;
  const months = wholeMonths(win);
  let pFrom;
  let pCut = null;
  if (months) {
    pFrom = new Date(from.getFullYear(), from.getMonth() - months, 1);
    if (partial) pCut = monthsBack(now, months);
  } else {
    const n = daySpan(from, win.to);
    pFrom = addDays(from, -n);
    if (partial) pCut = withTimeOf(addDays(startOfDay(now), -n), now);
  }
  const pEnd = pCut && pCut < from ? pCut : from;
  return { from: pFrom.getTime(), end: pEnd.getTime(), partial };
}

// Short label for a compared stretch: "26 – 27 Oct", "October 2026", "Aug – Sep 2026", "2025",
// "Mon 26 Oct", "28 Sep – 4 Oct". Months are spelled en-US short (Sep, not en-GB "Sept"), like the
// axes and Insights; the Dashboard's date control is brought in line by useSepSpelling.
export function stretchLabel(fromMs, endMs) {
  const f = new Date(fromMs);
  const t = new Date(endMs - 1);
  const y = new Date().getFullYear();
  const dm = (d, withYear) => `${d.getDate()} ${formatMonthShort(d)}${withYear ? ' ' + d.getFullYear() : ''}`;
  if (sameDay(f, t)) return `${f.toLocaleDateString('en-GB', { weekday: 'short' })} ${dm(f, f.getFullYear() !== y)}`;
  // Month and year names only for stretches that end at midnight (a partial day is not a whole month).
  const midnight = new Date(endMs).getTime() === startOfDay(endMs).getTime();
  const months = midnight ? wholeMonths({ from: f, to: startOfDay(t) }) : 0;
  if (months === 1) return f.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (months === 12 && f.getMonth() === 0) return String(f.getFullYear());
  if (months > 1) return `${formatMonthShort(f)}${f.getFullYear() !== t.getFullYear() ? ' ' + f.getFullYear() : ''} – ${formatMonthShort(t)} ${t.getFullYear()}`;
  const sameMonth = f.getMonth() === t.getMonth() && f.getFullYear() === t.getFullYear();
  const left = sameMonth ? String(f.getDate()) : dm(f, f.getFullYear() !== t.getFullYear());
  return `${left} – ${dm(t, t.getFullYear() !== y)}`;
}

// The App's Dashboard filters, applied to any list of entries.
export function matchesFilters(e, { filterClient, filterBilled, excludedTasks }) {
  return (filterClient === 'all' || e.client === filterClient)
    && (filterBilled === 'all' || (filterBilled === 'invoiced' ? e.invoiced : !e.invoiced))
    && !excludedTasks.includes(e.task);
}

// One pass of billing math per entry. cfg = { rates, clientRates, rounding, clientRounding }
export function entryMoney(e, cfg) {
  const r = getRounding(e.client, cfg.rounding, cfg.clientRounding);
  return {
    net: calcEarnings(e, cfg.rates, cfg.clientRates, cfg.rounding, cfg.clientRounding),
    billableMs: e.free ? 0 : billableDuration(e, r),
    freeValue: e.free ? calcStandardValue(e, cfg.rates, cfg.clientRates, cfg.rounding, cfg.clientRounding) : 0,
  };
}

// The Money rule (DESIGN.md): every money total comes from billing.js billingTotals, so the same
// entries show the same cents on every screen (per client round2, then added up). Net needs no VAT.
const netCfg = (cfg) => ({ rates: cfg.rates, clientRates: cfg.clientRates, rounding: cfg.rounding, clientRounding: cfg.clientRounding, vat: 0, clientVat: {} });
export function netOf(entries, cfg) {
  return entries.length ? billingTotals(entries, netCfg(cfg)).net : 0;
}
// Net per client, { [client]: net }, from the same billingTotals call.
export function netByClient(entries, cfg) {
  const out = {};
  if (entries.length) billingTotals(entries, netCfg(cfg)).clients.forEach(c => { out[c.client] = c.net; });
  return out;
}
// What complimentary work would have billed: the same rule on the entries as if they were paid.
export function freeValueOf(entries, cfg) {
  const free = entries.filter(e => e.free);
  return free.length ? netOf(free.map(e => ({ ...e, free: false })), cfg) : 0;
}
// Unbilled work: not invoiced, not complimentary, worth something.
export const isUnbilled = (e, cfg) => !e.invoiced && !e.free && entryMoney(e, cfg).net > 0;

// Headline totals for a list of entries. Money comes from billingTotals (netOf).
export function summarize(entries, cfg) {
  const t = { ms: 0, billableMs: 0, net: 0, count: entries.length, clients: new Set(), freeCount: 0, freeValue: 0, unbilledNet: 0, unbilledCount: 0 };
  const unbilled = [];
  for (const e of entries) {
    const m = entryMoney(e, cfg);
    t.ms += e.duration; t.billableMs += m.billableMs;
    t.clients.add(e.client);
    if (e.free) t.freeCount += 1;
    if (!e.invoiced && !e.free && m.net > 0) { unbilled.push(e); t.unbilledCount += 1; }
  }
  t.net = netOf(entries, cfg);
  t.unbilledNet = netOf(unbilled, cfg);
  t.freeValue = freeValueOf(entries, cfg);
  t.rate = t.ms > 0 ? t.net / (t.ms / HOUR) : 0;
  return t;
}

// Fractional change, or null when there is nothing to compare with.
export function change(cur, prev) {
  if (!prev || !isFinite(prev)) return null;
  return (cur - prev) / Math.abs(prev);
}

// ---------- grouping tree (client / project / activity) ----------

const noteOf = (e) => [e.project, e.note].filter(Boolean).join(' — ') || '(no note)';
const LEVELS = {
  client: [
    { kind: 'client', key: (e) => e.client, label: (e) => e.client },
    { kind: 'task', key: (e) => e.task, label: (e) => e.task },
    { kind: 'note', key: noteOf, label: noteOf },
  ],
  project: [
    { kind: 'project', key: (e) => `${e.client}\u0000${e.project || ''}`, label: (e) => e.project || 'No project' },
    { kind: 'task', key: (e) => e.task, label: (e) => e.task },
    { kind: 'note', key: (e) => e.note || '(no note)', label: (e) => e.note || '(no note)' },
  ],
  activity: [
    { kind: 'task', key: (e) => e.task, label: (e) => e.task },
    { kind: 'client', key: (e) => e.client, label: (e) => e.client },
    { kind: 'note', key: noteOf, label: noteOf },
  ],
};

// Activities have no stored color: give them palette slots by rank, spaced apart so neighbours differ.
const ACTIVITY_ORDER = [0, 3, 6, 8, 1, 5, 7, 2, 10, 4, 11, 9];
export function activityColors(names) {
  const out = {};
  names.forEach((n, i) => { out[n] = CLIENT_PALETTE[ACTIVITY_ORDER[i % ACTIVITY_ORDER.length]]; });
  return out;
}

// Split totalCents over nodes in proportion to their net (largest remainder), so the parts
// always add up to the total to the cent and each part is within a cent of its exact share.
function allocate(totalCents, nodes) {
  const weight = nodes.reduce((s, n) => s + n.netC, 0);
  if (!(weight > 0) || !totalCents) { nodes.forEach(n => { n.vatC = 0; }); return; }
  let used = 0;
  const parts = nodes.map(n => { const exact = (totalCents * n.netC) / weight; const f = Math.floor(exact); used += f; return { n, f, r: exact - f }; });
  let left = totalCents - used;
  parts.sort((x, y) => y.r - x.r || y.n.netC - x.n.netC);
  parts.forEach(p => { p.n.vatC = p.f + (left > 0 ? 1 : 0); left -= 1; });
}
const allocateDown = (n) => {
  if (!n.children.size) return;
  const kids = [...n.children.values()];
  allocate(n.vatC, kids);
  kids.forEach(allocateDown);
};

// Build the breakdown tree. vatOf(client) -> VAT %. Nodes carry time, money and a color.
// VAT follows the app's one rule: per client, net + round2(net × VAT %), exactly like the KPI, the
// table total and the invoice. Each client's VAT cents are then split down the tree, so children
// add up to their parent and rows add up to the total to the cent.
export function buildTree(entries, groupBy, cfg, vatOf) {
  const levels = LEVELS[groupBy] || LEVELS.client;
  const root = { children: new Map() };
  const clientNet = new Map();
  const blank = (id, lvl, e, depth) => ({
    id, depth, kind: lvl.kind, label: lvl.label(e), client: e.client, project: e.project || '',
    ms: 0, billableMs: 0, net: 0, freeCount: 0, freeValue: 0, aiCount: 0, aiFactor: null, count: 0, // aiFactor: shared by its AI entries, null when they differ
    clients: new Set(), children: new Map(),
  });
  for (const e of entries) {
    const m = entryMoney(e, cfg);
    clientNet.set(e.client, (clientNet.get(e.client) || 0) + m.net);
    let parent = root;
    let path = '';
    levels.forEach((lvl, depth) => {
      const k = lvl.key(e);
      path += (depth ? '/' : '') + k;
      let n = parent.children.get(k);
      if (!n) { n = blank(path, lvl, e, depth); parent.children.set(k, n); }
      n.ms += e.duration; n.billableMs += m.billableMs; n.net += m.net; n.count += 1;
      if (e.free) { n.freeCount += 1; n.freeValue += m.freeValue; }
      if (e.ai) {
        const f = entryAiFactor(e);
        n.aiFactor = n.aiCount === 0 || n.aiFactor === f ? f : null;
        n.aiCount += 1;
      }
      n.clients.add(e.client);
      parent = n;
    });
  }
  // VAT per client in cents (same rounding as App totalGross), then split over the client's nodes.
  // vatAmount = billing.js vatOf: whole cents, half up, on the client's rounded net (as billingTotals).
  const vatCents = new Map([...clientNet].map(([c, net]) => [c, Math.round(vatAmount(round2(net), vatOf(c) || 0) * 100)]));
  const walk = (map, fn) => map.forEach(n => { fn(n); walk(n.children, fn); });
  walk(root.children, n => { n.netC = Math.round(n.net * 100); });
  // The first level that sits inside one client: clients themselves, projects, or clients under an activity.
  const anchors = groupBy === 'activity' ? [...root.children.values()].flatMap(a => [...a.children.values()]) : [...root.children.values()];
  const byClient = new Map();
  anchors.forEach(n => { if (!byClient.has(n.client)) byClient.set(n.client, []); byClient.get(n.client).push(n); });
  byClient.forEach((nodes, c) => { allocate(vatCents.get(c) || 0, nodes); nodes.forEach(allocateDown); });
  if (groupBy === 'activity') root.children.forEach(a => { a.vatC = [...a.children.values()].reduce((s, k) => s + k.vatC, 0); });
  walk(root.children, n => {
    // Whole cents: a client row is round2(sum of calcEarnings), exactly its billingTotals net.
    n.net = n.netC / 100;
    n.freeValue = round2(n.freeValue);
    n.gross = (n.netC + n.vatC) / 100;
    n.vat = n.vatC / 100;
    n.vatPct = n.clients.size === 1 ? (vatOf(n.client) || 0) : null;
  });
  const finish = (map) => [...map.values()].map(n => {
    const subRows = n.children.size ? finish(n.children) : undefined;
    const { children, netC, vatC, ...rest } = n;
    return { ...rest, rate: n.ms > 0 ? n.net / (n.ms / HOUR) : 0, subRows };
  });
  const rows = finish(root.children);
  // Colors: clients by name; projects by their client; activities by rank.
  if (groupBy === 'activity') {
    const colors = activityColors([...rows].sort((a, b) => b.net - a.net || b.ms - a.ms).map(r => r.label));
    rows.forEach(r => { r.color = colors[r.label]; });
  } else if (groupBy === 'project') {
    // Projects wear their client's color; a client's second and third project get lighter tints.
    const rank = {};
    [...rows].sort((a, b) => b.net - a.net || b.ms - a.ms).forEach(r => {
      const i = rank[r.client] = (rank[r.client] ?? -1) + 1;
      const c = clientColor(r.client);
      r.color = i === 0 ? c : `color-mix(in srgb, ${c} ${[100, 62, 38, 24][Math.min(i, 3)]}%, rgb(var(--surface)))`;
    });
  } else {
    rows.forEach(r => { r.color = clientColor(r.client); });
  }
  return rows;
}

// ---------- time buckets for the chart ----------

// Day bars up to 5 weeks, week bars up to ~5 months, month bars beyond.
export function buildBuckets(win, now = new Date()) {
  const spanDays = Math.round((startOfDay(win.to) - startOfDay(win.from)) / DAY) + 1;
  const unit = spanDays <= 35 ? 'day' : spanDays <= 150 ? 'week' : 'month';
  const today = startOfDay(now).getTime();
  const buckets = [];
  if (unit === 'day') {
    // Long day ranges label Mondays (and today) only, so the axis stays readable.
    const sparse = spanDays > 14;
    let lastMonth = -1;
    for (let i = 0; i < spanDays; i++) {
      const d = addDays(win.from, i);
      const isToday = d.getTime() === today;
      const show = !sparse || d.getDay() === 1 || isToday || i === 0;
      const monthChanged = show && d.getMonth() !== lastMonth;
      if (show) lastMonth = d.getMonth();
      buckets.push({
        key: isoDay(d), start: d.getTime(),
        label: !show ? '' : spanDays <= 7 ? d.toLocaleDateString(UI_LOCALE, { weekday: 'short' }) : String(d.getDate()),
        sub: !show ? '' : spanDays <= 7 ? String(d.getDate()) : (monthChanged ? formatMonthShort(d) : ''),
        full: d.toLocaleDateString(UI_LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }),
        weekend: d.getDay() === 0 || d.getDay() === 6,
        today: isToday,
        future: d.getTime() > today,
      });
    }
    // Today's label wins over a label one or two days before it (they would collide).
    const t = buckets.findIndex(b => b.today);
    if (sparse && t > 0) {
      for (let j = Math.max(1, t - 2); j < t; j++) {
        if (!buckets[j].label) continue;
        if (buckets[j].sub && !buckets[t].sub) buckets[t].sub = buckets[j].sub;
        buckets[j].label = ''; buckets[j].sub = '';
      }
    }
  } else if (unit === 'week') {
    let d = monday(win.from);
    while (d <= win.to) {
      const end = addDays(d, 6);
      buckets.push({
        key: isoDay(d), start: d.getTime(),
        label: String(d.getDate()), sub: formatMonthShort(d),
        full: `Week of ${d.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'long' })}`,
        today: today >= d.getTime() && today <= end.getTime(),
        future: d.getTime() > today,
      });
      d = addDays(d, 7);
    }
  } else {
    const c = new Date(win.from.getFullYear(), win.from.getMonth(), 1);
    while (c <= win.to) {
      buckets.push({
        key: `${c.getFullYear()}-${c.getMonth()}`, start: c.getTime(),
        label: formatMonthShort(c), sub: c.getMonth() === 0 || !buckets.length ? String(c.getFullYear()) : '',
        full: c.toLocaleDateString(UI_LOCALE, { month: 'long', year: 'numeric' }),
        today: c.getFullYear() === now.getFullYear() && c.getMonth() === now.getMonth(),
        future: c.getTime() > today,
      });
      c.setMonth(c.getMonth() + 1);
    }
  }
  const keyOf = (ts) => {
    const d = new Date(ts);
    if (unit === 'day') return isoDay(d);
    if (unit === 'week') return isoDay(monday(d));
    return `${d.getFullYear()}-${d.getMonth()}`;
  };
  return { unit, buckets, keyOf };
}

// Round axis ticks: 0, step, 2·step … covering max with 4–5 lines.
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1, 2, 3, 4];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || 10 * mag;
  const top = Math.ceil(max / step) * step;
  const out = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

// Compact money for axes: €850, €1.2k, €12k.
export function eurAxis(v) {
  if (v >= 10000) return `€${Math.round(v / 1000)}k`;
  if (v >= 1000) return `€${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `€${Math.round(v)}`;
}
