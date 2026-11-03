// Derived lists for the Timer page. Pure functions over entries and timers: nothing here is stored.
import { calcEarnings, getRate, timerElapsed } from '../../lib/billing.js';

// client -> [{ client, project, task, last }] newest first. `task` is the activity last used with that project.
export function buildProjectIndex(entries) {
  const byClient = new Map();
  for (const e of entries) {
    if (!e.project) continue;
    let m = byClient.get(e.client);
    if (!m) { m = new Map(); byClient.set(e.client, m); }
    const cur = m.get(e.project);
    if (!cur || e.start > cur.last) m.set(e.project, { client: e.client, project: e.project, task: e.task, last: e.start });
  }
  const out = {};
  for (const [c, m] of byClient) out[c] = [...m.values()].sort((a, b) => b.last - a.last);
  return out;
}

// client -> the activity used last for that client.
export function buildLastTask(entries) {
  const out = {};
  const seen = {};
  for (const e of entries) {
    if (seen[e.client] == null || e.start > seen[e.client]) { seen[e.client] = e.start; out[e.client] = e.task; }
  }
  return out;
}

// Newest client+project pairs across all clients (for the picker's "Recent" group).
export function recentPairs(projectIndex, n = 3) {
  return Object.values(projectIndex).flat().sort((a, b) => b.last - a.last).slice(0, n);
}

// One piece of work = client + activity + project + note (spaces around the note do not count).
// Two timers with the same key bill the same work twice, so every start path checks it (see TrackView).
export const workKey = (w) => [w.client, w.task, w.project || '', (w.note || '').trim()].join('|');

// The timer that holds exactly this work, if any: a running copy first, else the newest paused one.
export function timerForWork(timers, w) {
  const k = workKey(w);
  let paused = null;
  for (const t of timers) {
    if (workKey(t) !== k) continue;
    if (t.runningSince) return t;
    paused = t;
  }
  return paused;
}

// Distinct pieces of work (client + activity + project + note), newest first. Used by the command palette.
export function buildRecentWork(entries, n = 40) {
  const seen = new Set();
  const out = [];
  const sorted = [...entries].sort((a, b) => b.start - a.start);
  for (const e of sorted) {
    const key = workKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= n) break;
  }
  return out;
}

// The work you repeat most: distinct pieces of work ranked by how often they were logged in the last
// `days` days (ties: the newest first). Work that is on a timer right now is left out.
export function buildFrequentWork(entries, timers = [], days = 30, n = 5) {
  const from = Date.now() - days * 86400000;
  const busy = new Set(timers.map(workKey));
  const map = new Map();
  for (const e of entries) {
    if (e.start < from) continue;
    const k = workKey(e);
    if (busy.has(k)) continue;
    const cur = map.get(k);
    if (!cur) map.set(k, { work: e, count: 1, last: e.start });
    else { cur.count += 1; if (e.start > cur.last) { cur.last = e.start; cur.work = e; } }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, n);
}

// The timer that keyboard shortcuts act on. `pinnedId` is the timer you paused or resumed last; it keeps
// the keys until you stop it or start another timer, so Space, Space resumes exactly what it paused.
// Without a pin: the newest running timer, else the newest paused one.
export function primaryTimer(timers, pinnedId) {
  const pinned = pinnedId != null && timers.find(t => t.id === pinnedId);
  if (pinned) return pinned;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].runningSince) return timers[i];
  return timers[timers.length - 1] || null;
}

// Money a timer has earned so far, with the same rules as a saved entry (AI factor, then rounding).
export function timerMoney(t, now, billing) {
  const { rates, clientRates, rounding, clientRounding } = billing;
  // The shared clock ticks once a second, so right after a resume `now` can be a little older than
  // runningSince. Never count that as negative time (the clock would step back a second).
  const duration = timerElapsed(t, t.runningSince ? Math.max(now, t.runningSince) : now);
  const amount = calcEarnings({ client: t.client, task: t.task, duration, ai: !!t.ai }, rates, clientRates, rounding, clientRounding);
  return { amount, rate: getRate(t.client, t.task, rates, clientRates), duration };
}

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const startOfWeek = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

// Short label for a piece of work: the note when there is one, else the activity.
export const workTitle = (w) => (w.note && w.note.trim()) || w.task;
