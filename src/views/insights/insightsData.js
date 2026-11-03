// Insights math. Every money total comes from billing.js billingTotals (via netOf / netByClient),
// so the same entries show the same cents here, on the Dashboard, in the Log and in the PDF.
import { clientColor } from '../../lib/colors.js';
import { formatMonthShort, UI_LOCALE } from '../../lib/format.js';
import { addDays, DAY, entryMoney, freeValueOf, HOUR, netByClient, netOf, previousWindow, startOfDay, stretchLabel } from '../dashboard/reportData.js';

const PACE_DAYS = 84; // projection uses the average day of the last 12 weeks

// Rate health of a client against the studio average, judged on the rounded % the chip shows, so
// the color and the number never disagree (−15% is amber, −16% is red). The table chips and the
// "Needs attention" rate check both use this, over the same window (the last 12 months).
export const LOW_RATE_PCT = -15;
export const MIN_RATE_MS = 2 * HOUR; // less tracked time than this is too little to judge a rate
export function rateHealth(vs) {
  if (vs == null || !isFinite(vs)) return null;
  const pct = Math.round(vs * 100);
  if (pct >= 0) return 'good';
  if (pct >= LOW_RATE_PCT) return 'fair';
  return 'low';
}

export function buildInsights(allEntries, cfg, now = new Date()) {
  // Every time-based figure runs up to now. Work dated later (planned or typed ahead) waits for its
  // day, so 'so far', the forecast, the compared stretch, the 12-month figures and the client rates
  // are always cut at the same moment.
  const nowMs = now.getTime();
  const laterList = allEntries.filter(e => e.start > nowMs);
  const later = { count: laterList.length, ms: laterList.reduce((s, e) => s + e.duration, 0), net: netOf(laterList, cfg) };
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = startOfDay(now);

  // 12 calendar months ending with the current one.
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`, start: d.getTime(),
      label: formatMonthShort(d), year: d.getFullYear(),
      full: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      net: 0, ms: 0, count: 0, current: i === 0, list: [],
    });
  }
  const mIndex = new Map(months.map((m, i) => [m.key, i]));
  const yearAgo = months[0].start;

  // Like for like: the month so far against the same days (to the same time of day) of last month.
  // Built from calendar dates (shared with the Dashboard), so month lengths and DST cannot shift it.
  const cmp = previousWindow('month', { from: monthStart, to: new Date(now.getFullYear(), now.getMonth(), daysInMonth) }, now);
  const prevFrom = cmp ? cmp.from : new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const prevEnd = cmp ? cmp.end : prevFrom;
  const paceFrom = addDays(today, -PACE_DAYS).getTime();
  const oldCutoff = addDays(today, -30).getTime();
  const oldCutoff60 = addDays(today, -60).getTime();
  const q90 = addDays(today, -90).getTime();

  let firstStart = Infinity;
  let firstPast = Infinity;
  const prevList = [];
  const paceList = [];
  const list12 = [];
  // Unbilled work by age: up to 30 days, 31 to 60 days, older (oldNet = the last two).
  const unbilledList = [];
  const ageLists = [[], [], []];
  const unbilledByClient = {};
  const clients = {};
  const projects = {};

  for (const e of allEntries) {
    const m = entryMoney(e, cfg);
    const past = e.start <= nowMs;
    if (e.start < firstStart) firstStart = e.start;
    if (past && e.start < firstPast) firstPast = e.start;
    if (past) {
      const d = new Date(e.start);
      const mi = mIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (mi != null) { const mo = months[mi]; mo.list.push(e); mo.ms += e.duration; mo.count += 1; }
      if (e.start >= prevFrom && e.start < prevEnd) prevList.push(e);
      if (e.start >= paceFrom && e.start < today.getTime()) paceList.push(e);
      if (e.start >= yearAgo) list12.push(e);
    }

    // Unbilled counts every entry that is not invoiced, like the Log and the Dashboard.
    if (!e.invoiced && !e.free && m.net > 0) {
      unbilledList.push(e);
      ageLists[e.start >= oldCutoff ? 0 : e.start >= oldCutoff60 ? 1 : 2].push(e);
      const u = unbilledByClient[e.client] || (unbilledByClient[e.client] = { list: [], old: [], oldest: e.start });
      u.list.push(e);
      if (e.start < u.oldest) u.oldest = e.start;
      if (e.start < oldCutoff) u.old.push(e);
    }

    // Client rates: the last 12 months up to now, the same window as the 12-month tiles above them.
    if (past && e.start >= yearAgo) {
      const c = clients[e.client] || (clients[e.client] = { client: e.client, ms: 0, count: 0, list: [], ms90: 0, free90: [], projects: new Set() });
      c.ms += e.duration; c.count += 1; c.list.push(e);
      if (e.project) c.projects.add(e.project);
      if (e.start >= q90 && e.free) { c.free90.push(e); c.ms90 += e.duration; }
    }

    if (e.project) {
      const k = `${e.client}\u0000${e.project}`;
      const p = projects[k] || (projects[k] = { id: k, project: e.project, client: e.client, ms: 0, cents: 0, count: 0, last: 0 });
      // A project belongs to one client: its net is that client's rounded sum, in whole cents.
      p.ms += e.duration; p.cents += Math.round(m.net * 100); p.count += 1; if (e.start > p.last) p.last = e.start;
    }
  }

  months.forEach(mo => {
    mo.net = netOf(mo.list, cfg);
    mo.rate = mo.ms > 0 ? mo.net / (mo.ms / HOUR) : null;
    delete mo.list;
  });
  const cur = months[11];
  const last = months[10];
  const prevSameNet = netOf(prevList, cfg);
  const paceNet = netOf(paceList, cfg);
  const pace = paceNet / PACE_DAYS;
  const remaining = daysInMonth - now.getDate();
  // A forecast, not a total: it is an estimate and stays unrounded until it is shown.
  const projected = paceNet > 0 ? cur.net + pace * remaining : null;
  cur.projectedExtra = projected != null ? Math.max(0, projected - cur.net) : 0;

  // Show the months since tracking began (never an empty month before it), at most twelve.
  let firstIdx = months.findIndex(m => m.count > 0);
  if (firstIdx < 0) firstIdx = 11;
  const shownMonths = months.slice(firstIdx);

  const total12 = netOf(list12, cfg);
  const ms12 = months.reduce((s, m) => s + m.ms, 0);
  const rate12 = ms12 > 0 ? total12 / (ms12 / HOUR) : 0;
  const fullMonths = months.filter(m => m.count > 0 && !m.current);
  const activeMonths = fullMonths.length;
  const fullMonthsNet = netOf(fullMonths.length ? list12.filter(e => e.start < monthStart.getTime()) : [], cfg);

  const unbilled = {
    net: netOf(unbilledList, cfg), count: unbilledList.length,
    oldNet: netOf([...ageLists[1], ...ageLists[2]], cfg),
    ages: [
      { id: 'fresh', label: '0–30 days', net: netOf(ageLists[0], cfg), count: ageLists[0].length },
      { id: 'aging', label: '31–60 days', net: netOf(ageLists[1], cfg), count: ageLists[1].length },
      { id: 'old', label: '60+ days', net: netOf(ageLists[2], cfg), count: ageLists[2].length },
    ],
    byClient: Object.fromEntries(Object.entries(unbilledByClient).map(([c, u]) => [c, { net: netOf(u.list, cfg), oldNet: netOf(u.old, cfg), oldest: u.oldest, count: u.list.length }])),
  };

  // Effective rate by client over the last 12 months. The average is the 12-month rate itself.
  const clientNet = netByClient(list12, cfg);
  const clientRows = Object.values(clients).map(c => {
    const net = clientNet[c.client] || 0;
    const rate = c.ms > 0 ? net / (c.ms / HOUR) : 0;
    const vsAvg = rate12 > 0 && c.ms > 0 ? rate / rate12 - 1 : null;
    return {
      client: c.client, ms: c.ms, net, count: c.count, projects: c.projects.size, color: clientColor(c.client), rate, vsAvg,
      // Too little time to judge: no color, so a chip is red exactly when Needs attention lists the client.
      health: c.ms >= MIN_RATE_MS ? rateHealth(vsAvg) : null,
      free90: freeValueOf(c.free90, cfg), freeMs90: c.ms90,
    };
  }).sort((a, b) => b.rate - a.rate || b.ms - a.ms || a.client.localeCompare(b.client));
  const allMs = ms12;
  const allNet = total12;

  const projectRows = Object.values(projects).map(p => {
    const net = p.cents / 100;
    return { id: p.id, project: p.project, client: p.client, ms: p.ms, net, count: p.count, last: p.last, rate: p.ms > 0 ? net / (p.ms / HOUR) : 0, color: clientColor(p.client) };
  }).sort((a, b) => b.net - a.net || b.ms - a.ms);

  // Things worth a look: old unbilled work, clients paying well below average, a lot of free work.
  const oldUnbilled = Object.entries(unbilled.byClient).filter(([, u]) => u.oldNet > 0).sort((a, b) => b[1].oldNet - a[1].oldNet || a[0].localeCompare(b[0])).slice(0, 3)
    .map(([client, u]) => ({
      id: 'old-' + client, kind: 'unbilled', client, value: u.oldNet,
      days: Math.round((today.getTime() - startOfDay(u.oldest).getTime()) / DAY), // round: a DST day is 23 or 25 h
      text: 'unbilled for more than 30 days',
    }));
  // The same rows and the same red line as the chips in "Effective rate by client".
  const lowRate = clientRows.filter(c => c.health === 'low').sort((a, b) => a.vsAvg - b.vsAvg).slice(0, 2)
    .map(c => ({ id: 'rate-' + c.client, kind: 'rate', client: c.client, value: c.rate, gap: c.vsAvg, text: 'per hour over the last 12 months' }));
  const freeWork = clientRows.filter(c => c.free90 >= 100).sort((a, b) => b.free90 - a.free90).slice(0, 2)
    .map(c => ({ id: 'free-' + c.client, kind: 'free', client: c.client, value: c.free90, ms: c.freeMs90, text: 'of free work in the last 90 days' }));
  // Five rows at most, taken in turns from each kind so every kind with something to say shows;
  // a client with a red rate chip always gets its row (there are at most two).
  const picked = new Set();
  for (let i = 0; picked.size < 5 && i < 3; i++) {
    for (const list of [oldUnbilled, lowRate, freeWork]) if (list[i] && picked.size < 5) picked.add(list[i]);
  }
  const attention = [...oldUnbilled, ...lowRate, ...freeWork].filter(it => picked.has(it));

  const since = isFinite(firstPast) ? firstPast : firstStart;
  return {
    months: shownMonths, cur, last,
    sinceLabel: isFinite(since) ? new Date(since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '',
    mtd: cur.net, prevSameNet, prevSameLabel: stretchLabel(prevFrom, prevEnd), monthName: monthStart.toLocaleDateString('en-US', { month: 'long' }),
    // True when last month is shorter than today's date (31 Mar against all of February).
    prevWholeMonth: prevEnd === monthStart.getTime(), later,
    lastName: new Date(last.start).toLocaleDateString('en-US', { month: 'long' }),
    projected, pace,
    total12, ms12, rate12, avgMonth: activeMonths ? fullMonthsNet / activeMonths : 0, activeMonths,
    unbilled, clientRows, projectRows, avgRate: rate12, attention, allMs, allNet,
  };
}

export const monthLong = (ms) => new Date(ms).toLocaleDateString(UI_LOCALE, { month: 'long', year: 'numeric' });
