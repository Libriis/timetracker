// Date math and layout for the Calendar view. Pure functions, local time everywhere.
import { validAiFactor } from '../../lib/billing.js';
import { UI_LOCALE } from '../../lib/format.js';

export const MIN_MS = 60000;
export const SNAP_MIN = 15;
export const DAY_MIN = 1440;

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// ISO 8601 week number (weeks start on Monday, week 1 holds the first Thursday).
export function isoWeek(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));
  const jan4 = new Date(x.getFullYear(), 0, 4);
  return 1 + Math.round(((x - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

// 14:05 (24h, the app's en-GB convention).
export function clockHM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// Whole calendar days from a to b (local dates), immune to 23h and 25h DST days.
export const dayDiff = (a, b) => Math.round(
  (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
// Wall-clock minutes since local midnight of `day` (can exceed 1440 or go negative for other days).
// Reads the local clock, not elapsed ms, so on DST change days 10:00 still sits on the 10:00 row.
export function minutesFrom(day, ts) {
  const d = new Date(ts);
  return dayDiff(day, d) * DAY_MIN + d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / MIN_MS;
}
// Local timestamp for `minutes` after midnight of `day`. Uses setMinutes so DST days stay correct.
export function atMinutes(day, minutes) {
  const x = new Date(day);
  x.setHours(0, 0, 0, 0);
  x.setMinutes(Math.round(minutes));
  return x.getTime();
}
export const snapMin = (m, step = SNAP_MIN) => Math.round(m / step) * step;
export const floorMin = (m, step = SNAP_MIN) => Math.floor(m / step) * step;

// Compact duration for blocks and headers: 45m, 1h 30m, 2h.
export function shortDuration(ms) {
  const m = Math.round(Math.max(0, ms) / MIN_MS);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export const fmtDayLong = (d) => d.toLocaleDateString(UI_LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtDayShort = (d) => d.toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtWeekday = (d) => d.toLocaleDateString('en-US', { weekday: 'short' });

// "2 – 8 Nov 2026", "28 Oct – 3 Nov 2026", "Tue 3 Nov 2026".
export function fmtSpan(from, to) {
  if (sameDay(from, to)) return from.toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const sameYear = from.getFullYear() === to.getFullYear();
  const f = sameMonth ? String(from.getDate())
    : from.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${f} – ${to.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// Entry end, tolerating records that only carry a duration.
export const entryEnd = (e) => (Number.isFinite(e.end) ? e.end : e.start + (e.duration || 0));

// Rule for entries with pauses (stored duration smaller than end - start), same as the Log's Edit dialog:
// anything that keeps the work (move, duplicate) keeps the stored duration; only an explicit change of
// the range (a resize) sets tracked = end - start.
export function resizedDuration(start, end) {
  return Math.max(0, end - start);
}

// A copy placed right after the original: same span, same stored tracked time, never invoiced.
// An AI entry's own factor comes along (it is part of how that work bills).
export function duplicateOf(e, id) {
  const start = entryEnd(e);
  const span = Math.max(MIN_MS, start - e.start);
  const duration = Number.isFinite(e.duration) ? Math.max(0, e.duration) : span;
  return {
    id, client: e.client, task: e.task, project: e.project || '', note: e.note || '', free: !!e.free, ai: !!e.ai,
    ...(e.ai && validAiFactor(e.aiFactor) != null ? { aiFactor: validAiFactor(e.aiFactor) } : {}),
    start, end: start + span, duration,
  };
}

// Column weights for the visible days: empty days after today get a narrower column, so days with
// work get the room. Two entries side by side still have room for their titles; from three lanes on a
// day gets wider, three quarters of a column per lane past two (up to four lanes), so the titles stay
// readable. A range of only empty future days stays even.
export const FUTURE_WEIGHT = 0.55;
export const LANE_WEIGHT = 0.75;
export function dayWeights(days, today, hasItems, lanes = []) {
  const t = startOfDay(today).getTime();
  return days.map((d, i) => {
    if (startOfDay(d).getTime() > t && !hasItems[i]) return FUTURE_WEIGHT;
    const extra = Math.min(4, Math.max(2, lanes[i] || 1)) - 2;
    return 1 + extra * LANE_WEIGHT;
  });
}
// Index of the column under `x` (px from the grid's left edge) for columns sized by `weights`.
export function columnAt(x, width, weights) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += (weights[i] / sum) * width;
    if (x < acc) return i;
  }
  return weights.length - 1;
}

// The time fields a drag changes, as stored (keys the entry did not have stay absent).
const TIME_KEYS = ['start', 'end', 'duration'];
export function timeFields(e) {
  const out = {};
  for (const k of TIME_KEYS) if (Object.prototype.hasOwnProperty.call(e, k)) out[k] = e[k];
  return out;
}
// Put stored time fields back on the current version of an entry; every other field stays as it is now.
// Keeps the key order, so an undone entry is stored exactly as it was.
export function withTimeFields(current, fields) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const out = {};
  for (const k of Object.keys(current)) {
    if (!TIME_KEYS.includes(k)) out[k] = current[k];
    else if (has(fields, k)) out[k] = fields[k];
  }
  for (const k of TIME_KEYS) if (has(fields, k) && !has(out, k)) out[k] = fields[k];
  return out;
}
// True while the entry still has exactly the times a drag gave it.
export const sameTimes = (e, t) => !!e && e.start === t.start && entryEnd(e) === entryEnd(t) && (e.duration || 0) === (t.duration || 0);

// True when `next` is `prev` with one change only: entry `id` now carries the times `after`.
// Every other entry must be the same record (same object, or the same stored value), in the same order.
// The Calendar uses it to tell its own drag from any other change (an edit, a delete, a stop).
export function isOnlyTimeChange(prev, next, id, after) {
  if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length) return false;
  let hit = false;
  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (b && a && b.id === id && a.id === id) {
      if (!sameTimes(b, after)) return false;
      hit = true;
    } else if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) return false;
  }
  return hit;
}

// "09:00 – 10:30", "22:00 – 24:00", or "23:45 – Tue 3 Nov, 01:00" when the end falls on a later day.
export function spanText(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const midnight = end > start && clockHM(end) === '00:00' && end - start <= 86400000 + 3600000 && dayDiff(s, e) === 1;
  if (sameDay(s, e)) return `${clockHM(start)} – ${clockHM(end)}`;
  if (midnight) return `${clockHM(start)} – 24:00`;
  return `${clockHM(start)} – ${fmtDayShort(e)}, ${clockHM(end)}`;
}

// Cut items into per-day pieces for the visible days. Each item: { key, start, end, ... }.
// Returns one array per day of { item, startMin, endMin, first, last }.
export function splitByDay(items, days) {
  const out = days.map(() => []);
  days.forEach((day, i) => {
    const d0 = startOfDay(day).getTime();
    const d1 = addDays(startOfDay(day), 1).getTime();
    for (const it of items) {
      if (it.end <= d0 || it.start >= d1) continue;
      const s = Math.max(it.start, d0);
      const e = Math.min(it.end, d1);
      out[i].push({ item: it, startMin: minutesFrom(day, s), endMin: e >= d1 ? DAY_MIN : minutesFrom(day, e), first: it.start >= d0, last: it.end <= d1 });
    }
  });
  return out;
}

// Side-by-side layout for overlapping pieces (Google Calendar style).
// `minSpan` is the shortest visual length in minutes, so tiny entries still get room for a label.
// Options:
//   tol      minutes of overlap to ignore (a manual entry that starts 3 minutes before the previous
//            one ends is drawn on top of its last pixels instead of halving both blocks).
//   slim     piece => true for pieces that only need a slim lane (a paused timer next to entries).
//   slimFrac share of the day width one slim lane gets.
//   minSpanOf piece => shortest visual length in minutes for that piece (defaults to minSpan).
// Adds { col, cols, lanes, span, leftPct, widthPct } to each piece (lanes: full-width columns in its cluster).
export function layoutDay(pieces, minSpan = 0, { tol = 0, slim = () => false, slimFrac = 0.25, minSpanOf = null } = {}) {
  const ms = (p) => (minSpanOf ? Math.max(minSpan, minSpanOf(p) || 0) : minSpan);
  // Short pieces near midnight are drawn shifted up so they stay inside the grid; lay them out that way too.
  const vStart = (p) => Math.min(p.startMin, DAY_MIN - ms(p));
  const sorted = [...pieces].sort((a, b) => vStart(a) - vStart(b) || (b.endMin - b.startMin) - (a.endMin - a.startMin));
  const vEnd = (p) => Math.max(p.endMin, vStart(p) + ms(p));
  const overlaps = (a, b) => Math.min(vEnd(a), vEnd(b)) - Math.max(vStart(a), vStart(b)) > tol;
  const result = [];
  let cluster = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    const colsEnd = [];
    const placed = cluster.map(p => {
      let c = colsEnd.findIndex(end => end - tol <= vStart(p));
      if (c < 0) { c = colsEnd.length; colsEnd.push(vEnd(p)); } else colsEnd[c] = Math.max(colsEnd[c], vEnd(p));
      return { ...p, col: c };
    });
    const cols = colsEnd.length;
    // Column widths: slim lanes get a fixed share, the rest split evenly.
    const isSlim = new Array(cols).fill(true);
    for (const p of placed) if (!slim(p)) isSlim[p.col] = false;
    const k = isSlim.filter(Boolean).length;
    const normal = cols - k;
    const f = normal === 0 ? 1 / cols : Math.min(slimFrac, 0.5 / k);
    const colW = isSlim.map(sl => (sl ? f : (1 - k * f) / normal));
    const sum = (a, b) => colW.slice(a, b).reduce((x, y) => x + y, 0);
    // Let a block grow into free columns on its right.
    for (const p of placed) {
      let span = 1;
      for (let c = p.col + 1; c < cols; c++) {
        if (placed.some(q => q.col === c && overlaps(p, q))) break;
        span += 1;
      }
      result.push({ ...p, cols, lanes: normal, span, leftPct: sum(0, p.col) * 100, widthPct: sum(p.col, p.col + span) * 100 });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const p of sorted) {
    if (vStart(p) >= clusterEnd - tol) flush();
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, vEnd(p));
  }
  flush();
  return result;
}

// Rendered text width in px (canvas measure, cached). Lets blocks decide what fits instead of cutting titles.
const measureCache = new Map();
let measureCtx = null;
export const FONT_STACK = '"Geist Variable", ui-sans-serif, system-ui, "Segoe UI", sans-serif';
export function textWidth(text, size = 12, weight = 400) {
  const key = `${weight}|${size}|${text}`;
  let w = measureCache.get(key);
  if (w === undefined) {
    if (!measureCtx) {
      if (typeof document === 'undefined') return text.length * size * 0.56;
      measureCtx = document.createElement('canvas').getContext('2d');
    }
    measureCtx.font = `${weight} ${size}px ${FONT_STACK}`;
    w = measureCtx.measureText(text).width;
    if (measureCache.size > 4000) measureCache.clear();
    measureCache.set(key, w);
  }
  return w;
}
// Fonts load after first paint: drop measurements taken with the fallback font.
export const clearTextWidths = () => measureCache.clear();
