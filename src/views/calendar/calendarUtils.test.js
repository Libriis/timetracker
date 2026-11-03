import { describe, expect, it } from 'vitest';
import {
  DAY_MIN, FUTURE_WEIGHT, LANE_WEIGHT, atMinutes, columnAt, dayDiff, dayWeights, duplicateOf, isOnlyTimeChange, layoutDay, minutesFrom, resizedDuration, sameTimes, spanText, splitByDay, startOfDay, timeFields, withTimeFields,
} from './calendarUtils.js';

const day = (y, m, d) => new Date(y, m, d);
const at = (y, m, d, h, mi = 0) => new Date(y, m, d, h, mi).getTime();
// The local zone has a DST change on this day when midnight and noon use different UTC offsets.
const hasDst = (d) => new Date(d).getTimezoneOffset() !== new Date(new Date(d).setHours(23)).getTimezoneOffset();

describe('calendar wall-clock math', () => {
  it('maps a time to its wall-clock minute on an ordinary day', () => {
    const d = day(2026, 10, 3);
    expect(minutesFrom(d, at(2026, 10, 3, 10, 30))).toBe(630);
    expect(minutesFrom(d, at(2026, 10, 4, 1, 0))).toBe(DAY_MIN + 60);
    expect(minutesFrom(d, at(2026, 10, 2, 23, 0))).toBe(-60);
  });

  it('keeps blocks on their wall-clock rows on DST change days', () => {
    for (const d of [day(2026, 9, 25), day(2026, 2, 29)]) {
      // Holds in every zone; the DST case only bites where the zone changes clocks that day.
      expect(minutesFrom(d, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0).getTime())).toBe(600);
      expect(minutesFrom(d, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0).getTime())).toBe(1200);
      expect(new Date(atMinutes(d, 720)).getHours()).toBe(12);
      if (hasDst(d)) expect(Math.abs(new Date(d).getTimezoneOffset() - new Date(atMinutes(d, 720)).getTimezoneOffset())).toBe(60);
    }
  });

  it('counts calendar days, not 24-hour blocks', () => {
    expect(dayDiff(day(2026, 9, 24), day(2026, 9, 26))).toBe(2);
    expect(dayDiff(day(2026, 2, 28), day(2026, 2, 30))).toBe(2);
  });

  it('splits an entry across midnight into per-day pieces', () => {
    const days = [startOfDay(day(2026, 10, 2)), startOfDay(day(2026, 10, 3))];
    const item = { key: 'a', start: at(2026, 10, 2, 22, 0), end: at(2026, 10, 3, 1, 30) };
    const [mon, tue] = splitByDay([item], days);
    expect(mon[0]).toMatchObject({ startMin: 1320, endMin: DAY_MIN, first: true, last: false });
    expect(tue[0]).toMatchObject({ startMin: 0, endMin: 90, first: false, last: true });
  });

  it('places overlapping pieces side by side and lifts short ones near midnight', () => {
    const out = layoutDay([
      { item: { key: 'a' }, startMin: 600, endMin: 660 },
      { item: { key: 'b' }, startMin: 630, endMin: 690 },
      { item: { key: 'c' }, startMin: 700, endMin: 720 },
    ]);
    const by = Object.fromEntries(out.map(p => [p.item.key, p]));
    expect(by.a.cols).toBe(2);
    expect(by.b.col).toBe(1);
    expect(by.c.cols).toBe(1);
    // A 5-minute piece at 23:55 with a 30-minute visual floor is laid out as 23:30 – 24:00.
    const late = layoutDay([
      { item: { key: 'x' }, startMin: 1400, endMin: 1430 },
      { item: { key: 'y' }, startMin: 1435, endMin: 1440 },
    ], 30);
    expect(late.find(p => p.item.key === 'y').cols).toBe(2);
  });
});

describe('resizing an entry', () => {
  const M = 60000;
  const s = at(2026, 10, 3, 14, 0);
  it('sets tracked = end - start, with or without earlier pauses', () => {
    expect(resizedDuration(s, s + 90 * M)).toBe(90 * M);
    expect(resizedDuration(s, s + 30 * M)).toBe(30 * M);
    // 14:00 – 16:26 with 1:40 tracked, dragged to 16:50: the explicit range wins.
    expect(resizedDuration(s, s + 170 * M)).toBe(170 * M);
    expect(resizedDuration(s, s - M)).toBe(0);
  });
});

describe('duplicating an entry', () => {
  const M = 60000;
  const s = at(2026, 10, 1, 13, 0);
  it('keeps the stored tracked time of an entry with pauses', () => {
    const e = { id: 'a', client: 'C', task: 'T', project: 'P', note: 'N', start: s, end: s + 120 * M, duration: 80 * M, ai: true, invoiced: true };
    const c = duplicateOf(e, 'b');
    expect(c).toEqual({ id: 'b', client: 'C', task: 'T', project: 'P', note: 'N', free: false, ai: true, start: s + 120 * M, end: s + 240 * M, duration: 80 * M });
  });
  it('copies an entry without pauses as it is', () => {
    const c = duplicateOf({ client: 'C', task: 'T', start: s, end: s + 45 * M, duration: 45 * M }, 'x');
    expect([c.start, c.end, c.duration, c.project, c.note]).toEqual([s + 45 * M, s + 90 * M, 45 * M, '', '']);
  });
});

describe('span text for toasts', () => {
  it('names the end day only when the span crosses midnight', () => {
    expect(spanText(at(2026, 10, 2, 9, 0), at(2026, 10, 2, 10, 30))).toBe('09:00 – 10:30');
    expect(spanText(at(2026, 10, 2, 22, 0), at(2026, 10, 3, 0, 0))).toBe('22:00 – 24:00');
    expect(spanText(at(2026, 10, 1, 23, 45), at(2026, 10, 2, 1, 0))).toBe('23:45 – Mon 2 Nov, 01:00');
  });
});

describe('column weights', () => {
  const today = day(2026, 10, 3);
  const week = Array.from({ length: 7 }, (_, i) => day(2026, 10, 2 + i));
  it('narrows only empty days after today', () => {
    const w = dayWeights(week, today, [true, true, false, true, false, false, false]);
    expect(w).toEqual([1, 1, FUTURE_WEIGHT, 1, FUTURE_WEIGHT, FUTURE_WEIGHT, FUTURE_WEIGHT]);
    expect(dayWeights(week, day(2026, 10, 9), week.map(() => false))).toEqual(week.map(() => 1));
  });
  it('widens a day from three overlapping lanes, up to four', () => {
    const w = dayWeights(week, day(2026, 10, 9), week.map(() => true), [1, 2, 3, 9, 0, undefined, 4]);
    expect(w).toEqual([1, 1, 1 + LANE_WEIGHT, 1 + 2 * LANE_WEIGHT, 1, 1, 1 + 2 * LANE_WEIGHT]);
    // An empty future day stays narrow whatever the lanes say.
    expect(dayWeights(week, today, week.map(() => false), [3, 3, 3, 3, 3, 3, 3])[4]).toBe(FUTURE_WEIGHT);
  });
  it('counts only full lanes in a cluster, not a slim paused lane', () => {
    const out = layoutDay([
      { item: { key: 'a' }, startMin: 600, endMin: 700 },
      { item: { key: 'p', paused: true }, startMin: 620, endMin: 680 },
    ], 0, { slim: (p) => !!p.item.paused });
    expect(out.every(p => p.lanes === 1)).toBe(true);
  });
  it('finds the column under the pointer', () => {
    const w = [1, 1, 0.5, 0.5];
    expect(columnAt(-5, 300, w)).toBe(0);
    expect(columnAt(99, 300, w)).toBe(0);
    expect(columnAt(101, 300, w)).toBe(1);
    expect(columnAt(201, 300, w)).toBe(2);
    expect(columnAt(299, 300, w)).toBe(3);
    expect(columnAt(400, 300, w)).toBe(3);
  });
});

describe('undo of a drag', () => {
  it('restores only the time fields and keeps later edits', () => {
    const before = { id: 'a', note: 'Revisions', start: 1, end: 5, duration: 4 };
    const now = { id: 'a', note: 'Typed later', start: 3, end: 7, duration: 4, ai: true };
    expect(withTimeFields(now, timeFields(before))).toEqual({ id: 'a', note: 'Typed later', ai: true, start: 1, end: 5, duration: 4 });
    // Same key order as before the drag, so the stored record is byte-identical when nothing else changed.
    const orig = { id: 'c', client: 'X', start: 1, end: 5, duration: 4, note: 'n' };
    expect(JSON.stringify(withTimeFields({ ...orig, start: 9, end: 13 }, timeFields(orig)))).toBe(JSON.stringify(orig));
  });
  it('leaves out an end the old record never had', () => {
    const old = { id: 'b', start: 1, duration: 4 };
    expect(withTimeFields({ id: 'b', start: 2, end: 6, duration: 4 }, timeFields(old))).toEqual({ id: 'b', start: 1, duration: 4 });
  });
  it('tells its own drag apart from any other change', () => {
    const a = { id: 'a', start: 1, end: 5, duration: 4 };
    const b = { id: 'b', start: 6, end: 9, duration: 3 };
    const moved = { ...a, start: 2, end: 6 };
    const after = timeFields(moved);
    expect(isOnlyTimeChange([a, b], [moved, b], 'a', after)).toBe(true);
    // Same values in a fresh copy (storage reload) still count as unchanged.
    expect(isOnlyTimeChange([a, b], [moved, { ...b }], 'a', after)).toBe(true);
    // A duplicate, a delete, an edit of another entry, or a different time on the dragged one: not ours.
    expect(isOnlyTimeChange([a, b], [moved, b, { ...b, id: 'c' }], 'a', after)).toBe(false);
    expect(isOnlyTimeChange([a, b], [moved], 'a', after)).toBe(false);
    expect(isOnlyTimeChange([a, b], [moved, { ...b, note: 'x' }], 'a', after)).toBe(false);
    expect(isOnlyTimeChange([a, b], [{ ...moved, end: 7 }, b], 'a', after)).toBe(false);
    expect(isOnlyTimeChange([a, b], [a, b], 'zz', after)).toBe(false);
  });
  it('sees when the times changed again since the drag', () => {
    expect(sameTimes({ start: 1, end: 5, duration: 4 }, { start: 1, end: 5, duration: 4 })).toBe(true);
    expect(sameTimes({ start: 1, end: 6, duration: 4 }, { start: 1, end: 5, duration: 4 })).toBe(false);
  });
});
