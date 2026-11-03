import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Minus, Play, Plus } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { clientColor } from '../../lib/colors.js';
import { formatEUR, formatHM } from '../../lib/format.js';
import { Button } from '../../components/ui/Button.jsx';
import { Popover, PopoverAnchor, PopoverContent } from '../../components/ui/Popover.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { CreateEntryForm } from './CreateEntryForm.jsx';
import { EventBlock, GhostBlock } from './EventBlock.jsx';
import {
  DAY_MIN, MIN_MS, addDays, atMinutes, clockHM, columnAt, dayWeights, floorMin, fmtWeekday, isoWeek, layoutDay, minutesFrom, resizedDuration, snapMin, splitByDay, startOfDay,
} from './calendarUtils.js';

const GUTTER = 56;
const WORK_START = 8;
const WORK_END = 18;
const DAY_MS_TARGET = 8 * 3600000;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isPaused = (p) => p.item.kind === 'paused';
// A paused timer is a small card (pause mark, time, Resume), so it needs two rows of room.
const PAUSED_MIN_H = 46;
// Width of a paused timer's lane next to entries (px, before the 15–40% clamp).
const PAUSED_LANE = 60;
const zoomBtn = 'grid size-[18px] place-items-center rounded-[5px] text-fg-subtle outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40';

function DayHeader({ day, isToday, isPast, stats, wide, money = wide, single }) {
  const weekday = single ? day.toLocaleDateString('en-GB', { weekday: 'long' }) : fmtWeekday(day);
  const has = stats.ms > 0;
  return (
    <div className={cn('relative flex min-w-0 items-end justify-between gap-1.5 border-l border-line pb-3 pt-2.5', single ? 'px-4' : wide ? 'px-2.5' : 'px-2')}
      aria-label={`${day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${has ? `, ${formatHM(stats.ms)} tracked` : ''}`}>
      <div className="flex min-w-0 flex-col">
        <span className={cn('text-2xs font-semibold uppercase tracking-[0.08em]', isToday ? 'text-brand-text' : 'text-fg-subtle')}>{weekday}</span>
        <span className={cn('mt-0.5 flex h-[30px] items-center tnum font-semibold leading-none',
          wide ? 'text-[22px] tracking-[-0.02em]' : 'text-lg',
          isToday ? 'text-brand-text' : isPast ? 'text-fg' : 'text-fg-muted')}>
          {isToday
            ? <span className={cn('inline-grid place-items-center rounded-full bg-brand-soft', wide ? '-ml-[7px] h-[30px] min-w-[30px] px-[7px]' : '-ml-[5px] h-[26px] min-w-[26px] px-[5px]')}>{day.getDate()}</span>
            : day.getDate()}
          {single && <span className="ml-2 text-base font-medium text-fg-muted">{day.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>}
        </span>
      </div>
      <div className="min-w-0 text-right">
        {has ? (
          <>
            <div className={cn('font-semibold text-fg tnum', wide ? 'text-sm leading-[18px]' : 'text-xs')}>{formatHM(stats.ms)}</div>
            {wide && money && <div className="truncate text-2xs text-fg-subtle tnum">{stats.free && !stats.eur ? 'Free' : formatEUR(stats.eur)}</div>}
          </>
        ) : (
          isPast && <div className={cn('text-fg-faint tnum', wide ? 'text-sm leading-[18px]' : 'text-xs')}>0:00</div>
        )}
      </div>
      {/* The day against an 8-hour day, split by client color */}
      {has && (
        <div aria-hidden title={`${formatHM(stats.ms)} of an 8-hour day`}
          className={cn('absolute bottom-[5px] flex h-[3px] gap-px overflow-hidden rounded-full bg-fg/[0.07]', single ? 'inset-x-4' : wide ? 'inset-x-2.5' : 'inset-x-2')}>
          {stats.split.map(([client, ms]) => (
            <span key={client} className="h-full shrink-0 first:rounded-l-full" style={{ width: `${(ms / Math.max(stats.ms, DAY_MS_TARGET)) * 100}%`, background: clientColor(client) }} />
          ))}
        </div>
      )}
    </div>
  );
}

// A click opens something (the editor, a new-entry draft, the Timer page). The second press of a
// double click then lands on what just opened, and a dialog closes on a press outside it. So the
// next press near the same spot within 500ms is swallowed, with the rest of its click sequence.
const SECOND_CLICK = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick'];
function swallowSecondClick(x, y) {
  if (typeof window === 'undefined') return;
  const until = performance.now() + 500;
  let active = false;
  let timer = 0;
  const handler = (e) => {
    if (!active) {
      if (e.type !== 'pointerdown') return;
      if (performance.now() > until || Math.hypot(e.clientX - x, e.clientY - y) > 8) { done(); return; }
      active = true;
    }
    e.stopPropagation();
    e.preventDefault();
    if (e.type === 'dblclick') done();
  };
  function done() {
    clearTimeout(timer);
    for (const t of SECOND_CLICK) window.removeEventListener(t, handler, true);
  }
  for (const t of SECOND_CLICK) window.addEventListener(t, handler, true);
  timer = setTimeout(done, 900);
}

// The scrolling time grid: sticky day headers, hour gutter, blocks, now line, and all pointer work
// (click to edit, drag to move, drag the bottom edge to resize, drag on empty space to create).
export function TimeGrid({
  days, hourH, onZoom, canZoomIn, canZoomOut, items, dayStats, now, today, entries, clients, tasks, scrollKey, priceOf,
  onEdit, onDelete, onResume, onDuplicate, onOpenTimer, onCommit, onCreate, onNavigate, pushToast, onAddManualEntry, timerActions,
}) {
  const n = days.length;
  const single = n === 1;
  const scrollRef = useRef(null);
  const headerRef = useRef(null);
  const colsRef = useRef(null);
  const [gridW, setGridW] = useState(140 * n);
  const [headH, setHeadH] = useState(68);
  const [drag, setDrag] = useState(null); // { mode, item, preview: {start,end} }
  const [hover, setHover] = useState(null); // { day, min }
  const [draft, setDraft] = useState(null); // { start, end }
  const [scrolled, setScrolled] = useState(false); // grid scrolled below 00:00: the headers cast a shadow
  const dragRef = useRef(null);
  const ptr = useRef({ x: 0, y: 0 });

  const todayIdx = days.findIndex(d => d.getTime() === today.getTime());
  const nowMin = minutesFrom(today, now);

  // Grid width drives each column's width, and that drives how much text each block shows.
  useLayoutEffect(() => {
    const el = colsRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setGridW(el.getBoundingClientRect().width));
    ro.observe(el);
    setGridW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Pieces per day, and column weights: empty days after today are narrower, so days with work get room,
  // and a day with overlapping entries is wider, so the titles side by side stay readable.
  const split = useMemo(() => splitByDay(items, days), [items, days]);
  // Shortest drawn block (22px) in minutes. A paused timer is a small card (pause mark, time, Resume):
  // it needs two rows of room. A few minutes of overlap (sloppy manual times) stack instead of halving both blocks.
  const minSpan = (22 / hourH) * 60;
  const pausedSpan = ((PAUSED_MIN_H + 2) / hourH) * 60;
  const layoutOpts = useMemo(() => ({ tol: 5, slim: isPaused, minSpanOf: (p) => (isPaused(p) ? pausedSpan : 0) }), [pausedSpan]);
  const lanes = useMemo(() => split.map(pieces => layoutDay(pieces, minSpan, layoutOpts)
    .reduce((m, p) => Math.max(m, p.lanes || 1), 1)), [split, minSpan, layoutOpts]);
  const weightKey = dayWeights(days, today, split.map(p => p.length > 0), lanes).join(',');
  const weights = useMemo(() => weightKey.split(',').map(Number), [weightKey]);
  const colWs = useMemo(() => {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    return weights.map(w => (gridW * w) / sum);
  }, [weights, gridW]);
  // Headers share one type size; only columns at full width carry totals.
  const wideHeads = Math.max(...colWs) >= 118;
  const track = weights.map(w => `minmax(0, ${w}fr)`).join(' ');

  // Block text sticks below the day headers when a block is cut by the top edge, so it needs their height.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    setHeadH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Open on working hours: just above the earliest block (08:00 when the range is empty), and when
  // today is in view keep "now" visible with room below it. A block cut by the top edge looks clipped,
  // so when the first choice cuts one, take the nearest top (15-minute steps) that cuts none and still
  // shows "now". Long blocks may leave no such top: then their text sticks under the headers.
  const openInputs = useRef(null);
  openInputs.current = { split, hourH, todayIdx, nowMin, minSpan };
  const lastSet = useRef(-1); // the scrollTop we set ourselves; any other value means the user scrolled
  const autoOpen = useRef(0); // until this time, layout changes (timer bar rows, header wrap) re-run the opening scroll
  const openScroll = useCallback(() => {
    const sc = scrollRef.current;
    const I = openInputs.current;
    if (!sc || !I) return;
    const pieces = I.split.flat();
    let firstMin = Infinity;
    for (const p of pieces) if (p.first) firstMin = Math.min(firstMin, Math.max(0, p.startMin - 15));
    if (!Number.isFinite(firstMin)) firstMin = WORK_START * 60 - 15;
    const viewMin = ((sc.clientHeight - (headerRef.current?.offsetHeight || 0)) / I.hourH) * 60;
    const maxTop = Math.max(0, DAY_MIN - viewMin);
    // An hour label right at the edge would hide under the sticky header, so then show 12px more.
    const pxFor = (m) => {
      const t = (clamp(m, 0, maxTop) / 60) * I.hourH;
      return Math.max(0, t % I.hourH < 8 ? t - 12 : t);
    };
    let topMin = floorMin(firstMin, 15);
    let lo = 0;
    let hi = maxTop;
    if (I.todayIdx >= 0) {
      const need = Math.ceil((I.nowMin + 75 - viewMin) / 15) * 15;
      if (need > topMin) topMin = need;
      if (I.nowMin - 60 < topMin) topMin = Math.max(0, floorMin(I.nowMin - 60, 15));
      lo = Math.max(0, I.nowMin + 20 - viewMin);
      hi = Math.max(lo, I.nowMin - 30);
    }
    const visEnd = (p) => Math.max(p.endMin, p.startMin + I.minSpan);
    const cuts = (px) => {
      const m = (px / I.hourH) * 60;
      return pieces.some(p => p.startMin < m - 0.5 && visEnd(p) > m + 0.5);
    };
    let best = pxFor(topMin);
    if (cuts(best)) {
      // Candidates: 15-minute steps and the edges of blocks (just above a start, right at an end),
      // within two and a half hours of the first choice; the nearest clean one wins, earlier on a tie.
      const marks = [];
      for (let k = -10; k <= 10; k++) marks.push(topMin + 15 * k);
      for (const p of pieces) marks.push(p.startMin - 4, visEnd(p));
      const found = marks
        .filter(m => m >= lo && m <= hi && Math.abs(m - topMin) <= 150)
        .sort((a, b) => Math.abs(a - topMin) - Math.abs(b - topMin) || a - b)
        .map(pxFor).find(px => !cuts(px));
      if (found != null) best = found;
    }
    sc.scrollTop = best;
    lastSet.current = sc.scrollTop;
    setScrolled(sc.scrollTop > 2);
  }, []);
  useLayoutEffect(() => {
    autoOpen.current = performance.now() + 1500;
    openScroll();
  }, [scrollKey, openScroll]);
  // The first frames still move things (the timer bar takes a second row on narrow windows, the header
  // wraps): until the user scrolls, open again on each size change of the grid in that first moment.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return undefined;
    const ro = new ResizeObserver(() => {
      if (performance.now() > autoOpen.current || dragRef.current) return;
      if (lastSet.current >= 0 && Math.abs(sc.scrollTop - lastSet.current) > 1) { autoOpen.current = 0; return; }
      openScroll();
    });
    ro.observe(sc);
    if (headerRef.current) ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, [openScroll]);

  // Zoom keeps the time under the pointer (or the middle of the view) in place.
  const zoomAnchor = useRef(null);
  const prevHourH = useRef(hourH);
  const zoomAt = useCallback((dir, clientY) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const head = headerRef.current?.offsetHeight || 0;
    const offset = clientY == null ? (sc.clientHeight + head) / 2 : clientY - r.top;
    zoomAnchor.current = { min: ((sc.scrollTop + offset - head) / prevHourH.current) * 60, offset };
    onZoom(dir);
  }, [onZoom]);
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const a = zoomAnchor.current;
    if (sc && prevHourH.current !== hourH) {
      const head = headerRef.current?.offsetHeight || 0;
      const min = a ? a.min : ((sc.scrollTop) / prevHourH.current) * 60;
      const offset = a ? a.offset : head;
      sc.scrollTop = Math.max(0, (min / 60) * hourH + head - offset);
    }
    zoomAnchor.current = null;
    if (prevHourH.current !== hourH) autoOpen.current = 0;
    prevHourH.current = hourH;
  }, [hourH]);
  // Ctrl + wheel (or a pinch on a trackpad) zooms the grid.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return undefined;
    let acc = 0;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 40) return;
      const dir = acc < 0 ? 1 : -1;
      acc = 0;
      zoomAt(dir, e.clientY);
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Pointer position -> { day index, minutes from that day's midnight }.
  const posAt = useCallback((x, y) => {
    const r = colsRef.current.getBoundingClientRect();
    return { day: columnAt(x - r.left, r.width, weights), min: clamp(((y - r.top) / hourH) * 60, 0, 1440) };
  }, [weights, hourH]);

  // Live copies for the window listeners (they are created once and read fresh values from here).
  const live = useRef({});
  live.current = { days, posAt, onEdit, onOpenTimer, onCommit, pushToast, draft };

  const H = useMemo(() => {
    const compute = (d, x, y) => {
      const { days: ds, posAt: pa } = live.current;
      const p = pa(x, y);
      if (d.mode === 'create') {
        const a = floorMin(d.min0);
        let s; let e;
        if (p.min >= a) { s = a; e = Math.max(a + 15, snapMin(p.min)); } else { s = floorMin(p.min); e = a + 15; }
        e = Math.min(e, 1440);
        return { start: atMinutes(ds[d.day0], s), end: atMinutes(ds[d.day0], e) };
      }
      const it = d.item;
      if (d.mode === 'move') {
        // Wall-clock math (rows), so moves on DST change days land where the pointer is.
        // A purely sideways move keeps the exact time; any vertical move snaps the start to 15 minutes.
        const shift = p.day - d.day0;
        let start;
        if (Math.abs(y - d.y0) > 3) {
          const home = startOfDay(it.start);
          const m = clamp(snapMin(minutesFrom(home, it.start) + (p.min - d.min0)), 0, DAY_MIN - 15);
          start = atMinutes(addDays(home, shift), m);
        } else {
          const base = new Date(it.start);
          base.setDate(base.getDate() + shift);
          start = base.getTime();
        }
        // Moving keeps the stored tracked time and the span (pauses included).
        return { start, end: start + (it.rawEnd - it.start), duration: it.duration };
      }
      // The bottom edge stays on the day it was grabbed on, whatever column the pointer drifts into,
      // and stops at 24:00. Crossing midnight is a job for the Edit dialog.
      let end = atMinutes(ds[d.day0], Math.min(DAY_MIN, snapMin(p.min)));
      if (end < it.start + 15 * MIN_MS) end = it.start + 15 * MIN_MS;
      // A resize is an explicit new range: tracked = end - start (earlier pauses go; Undo brings them back).
      return { start: it.start, end, duration: resizedDuration(it.start, end) };
    };
    const publish = (d) => setDrag({ mode: d.mode, item: d.item, preview: d.preview });

    const stop = () => {
      const d = dragRef.current;
      if (d?.raf) cancelAnimationFrame(d.raf);
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', stop);
      document.body.style.removeProperty('cursor');
      setDrag(null);
    };

    const autoScroll = () => {
      const d = dragRef.current;
      if (!d) return;
      const sc = scrollRef.current;
      if (d.moved && sc) {
        const r = sc.getBoundingClientRect();
        const topEdge = r.top + (headerRef.current?.offsetHeight || 0) + 28;
        const y = ptr.current.y;
        let dy = 0;
        if (y < topEdge) dy = -Math.min(22, Math.ceil((topEdge - y) / 3));
        else if (y > r.bottom - 24) dy = Math.min(22, Math.ceil((y - (r.bottom - 24)) / 3));
        if (dy) {
          const before = sc.scrollTop;
          sc.scrollTop += dy;
          if (sc.scrollTop !== before) { d.preview = compute(d, ptr.current.x, ptr.current.y); publish(d); }
        }
      }
      d.raf = requestAnimationFrame(autoScroll);
    };

    function onMove(ev) {
      const d = dragRef.current;
      if (!d) return;
      ptr.current = { x: ev.clientX, y: ev.clientY };
      if (!d.moved) {
        if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 4) return;
        if (d.mode !== 'create' && (d.item.kind !== 'entry' || d.item.invoiced || !d.item.entry?.id)) {
          const { invoiced, kind } = d.item;
          stop();
          if (invoiced) live.current.pushToast('Invoiced entries stay put. Open the entry to change its time.', 'info');
          else if (kind !== 'entry') live.current.pushToast('Timers move once you stop them. Then drag the entry.', 'info');
          return;
        }
        d.moved = true;
        document.body.style.cursor = d.mode === 'resize' ? 'ns-resize' : d.mode === 'move' ? 'grabbing' : 'cell';
      }
      d.preview = compute(d, ev.clientX, ev.clientY);
      publish(d);
    }

    function onUp(ev) {
      const d = dragRef.current;
      if (!d) return;
      const { days: ds } = live.current;
      stop();
      if (!d.moved) {
        // A press that never moved is a click, also on a block's bottom (resize) strip: on short blocks
        // that strip is a third of the block.
        if (d.mode === 'move' || d.mode === 'resize') {
          swallowSecondClick(ev.clientX, ev.clientY);
          if (d.item.kind !== 'entry') live.current.onOpenTimer();
          else live.current.onEdit(d.item.entry);
        } else if (d.mode === 'create' && !d.hadDraft) {
          swallowSecondClick(ev.clientX, ev.clientY);
          const s = floorMin(d.min0);
          setDraft({ key: Date.now(), start: atMinutes(ds[d.day0], s), end: atMinutes(ds[d.day0], Math.min(1440, s + 60)) });
        }
        return;
      }
      const pv = d.preview;
      if (!pv) return;
      if (d.mode === 'create') { setDraft({ key: Date.now(), ...pv }); return; }
      const e = d.item.entry;
      if (d.mode === 'move') {
        if (pv.start !== e.start) live.current.onCommit(e, { ...e, start: pv.start, end: pv.end }, 'move');
      } else if (pv.end !== d.item.rawEnd) {
        live.current.onCommit(e, { ...e, end: pv.end, duration: pv.duration }, 'resize');
      }
    }

    function onKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stop(); }
      // No undo while a block is held: the drag would then commit over the undone times.
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.stopPropagation(); }
    }

    const begin = (e, mode, piece) => {
      if (e.button !== 0 || dragRef.current) return;
      // React bubbles events through portals: a press on a block's right-click menu (rendered in
      // document.body) still reaches the column's handler. Only presses inside the element itself count.
      if (!(e.target instanceof Node) || !(e.currentTarget instanceof Node) || !e.currentTarget.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const hadDraft = !!live.current.draft;
      if (hadDraft) setDraft(null);
      const p = live.current.posAt(e.clientX, e.clientY);
      dragRef.current = { mode, item: piece?.item, x0: e.clientX, y0: e.clientY, day0: p.day, min0: p.min, moved: false, preview: null, hadDraft };
      ptr.current = { x: e.clientX, y: e.clientY };
      setHover(null);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', stop);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('blur', stop);
      dragRef.current.raf = requestAnimationFrame(autoScroll);
    };
    return {
      begin, stop,
      onBlockDown: (e, piece) => begin(e, 'move', piece),
      onResizeDown: (e, piece) => begin(e, 'resize', piece),
      onColDown: (e) => begin(e, 'create', null),
    };
  }, []);
  // Remove listeners if the view unmounts mid-drag.
  useEffect(() => () => { if (dragRef.current) H.stop(); }, [H]);

  const onColsMove = (e) => {
    if (dragRef.current || draft) return;
    if (!(e.target instanceof Element) || !e.target.closest('[data-slot="col"]') || e.target.closest('[data-slot="block"]')) {
      if (hover) setHover(null);
      return;
    }
    const p = posAt(e.clientX, e.clientY);
    const min = floorMin(p.min);
    if (!hover || hover.day !== p.day || hover.min !== min) setHover({ day: p.day, min });
  };

  // Blocks per day with side-by-side layout. A paused timer is a reminder, not tracked work: next to
  // entries it takes a narrower lane, just wide enough for its pause mark, time and Resume button.
  const perDay = useMemo(() => split.map((pieces, i) => layoutDay(pieces, minSpan, {
    ...layoutOpts, slimFrac: clamp(PAUSED_LANE / Math.max(1, colWs[i]), 0.15, 0.4),
  })), [split, colWs, minSpan, layoutOpts]);
  const dragKey = drag && drag.mode !== 'create' ? drag.item.key : null;

  // Preview pieces of the block being moved or resized.
  const ghostPerDay = useMemo(() => {
    if (!drag || drag.mode === 'create' || !drag.preview) return null;
    const pv = drag.preview;
    const it = { ...drag.item, start: pv.start, rawEnd: pv.end, end: Math.max(pv.end, pv.start + MIN_MS), duration: pv.duration };
    // The ghost shows what the change would bill, not the old amount.
    if (drag.mode === 'resize' && drag.item.entry) Object.assign(it, priceOf({ ...drag.item.entry, duration: pv.duration }));
    return splitByDay([it], days);
  }, [drag, days, priceOf]);

  const createRange = drag?.mode === 'create' && drag.preview ? drag.preview : draft;

  // Block box in px. Short pieces get a 20px floor and are lifted to stay inside the 24-hour grid.
  const gridH = 24 * hourH;
  const geom = (startMin, endMin, minH = 20) => {
    const height = Math.max(minH, ((endMin - startMin) / 60) * hourH - 2);
    const top = Math.max(0, Math.min((startMin / 60) * hourH + 1, gridH - height - 1));
    return { top, height };
  };

  const empty = items.length === 0;
  const cols = `${GUTTER}px ${track}`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]" style={{ '--cal-head': `${headH}px` }}
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          if (Math.abs(top - lastSet.current) > 1) autoOpen.current = 0;
          setScrolled(top > 2);
        }}>
        {/* Day headers */}
        <div ref={headerRef} className="sticky top-0 z-[46] grid border-b border-line bg-surface" style={{ gridTemplateColumns: cols }}>
          {/* Scrolled: a soft shadow under the headers says the day goes on above */}
          <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-full h-3 bg-gradient-to-b from-fg/[0.07] to-transparent transition-opacity duration-base dark:from-canvas',
            scrolled ? 'opacity-100' : 'opacity-0')} />
          <div className="flex flex-col items-end justify-between pb-2 pr-2 pt-2.5">
            <span className="pr-0.5 text-2xs font-medium text-fg-subtle tnum" title={`Week ${isoWeek(days[0])}`}>W{isoWeek(days[0])}</span>
            <div className="flex items-center rounded-md border border-line bg-surface">
              <Tooltip content="Zoom out" shortcut="−">
                <button type="button" aria-label="Zoom out" disabled={!canZoomOut} onClick={() => zoomAt(-1)} className={zoomBtn}>
                  <Minus className="size-3" />
                </button>
              </Tooltip>
              <span aria-hidden className="h-3 w-px bg-line" />
              <Tooltip content="Zoom in" shortcut="+">
                <button type="button" aria-label="Zoom in" disabled={!canZoomIn} onClick={() => zoomAt(1)} className={zoomBtn}>
                  <Plus className="size-3" />
                </button>
              </Tooltip>
            </div>
          </div>
          {days.map((d, i) => (
            // One type size for all headers; the amount shows only where its own column has room for it.
            <DayHeader key={d.getTime()} day={d} isToday={i === todayIdx} isPast={d.getTime() <= today.getTime()} stats={dayStats[i]}
              wide={single || wideHeads} money={single || colWs[i] >= 104} single={single} />
          ))}
        </div>

        <Popover open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
          <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * hourH }}>
            {/* Hour gutter */}
            <div className="relative select-none" aria-hidden>
              {Array.from({ length: 23 }, (_, k) => k + 1).map(h => {
                const nearNow = todayIdx >= 0 && Math.abs(nowMin - h * 60) < 14;
                return (
                  <span key={h} className={cn('absolute right-2.5 -translate-y-1/2 text-2xs text-fg-subtle tnum', nearNow && 'opacity-0')} style={{ top: h * hourH }}>
                    {String(h).padStart(2, '0')}:00
                  </span>
                );
              })}
              {todayIdx >= 0 && (
                <span className="absolute right-1.5 z-10 -translate-y-1/2 rounded-[5px] bg-brand-soft px-1 py-px text-2xs font-semibold text-brand-text tnum" style={{ top: (nowMin / 60) * hourH }}>
                  {clockHM(now)}
                </span>
              )}
            </div>

            <div ref={colsRef} className="relative" style={{ gridColumn: `2 / span ${n}` }}
              onPointerMove={onColsMove} onPointerLeave={() => hover && setHover(null)}>
              {/* Hour lines */}
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {Array.from({ length: 23 }, (_, k) => k + 1).map(h => (
                  <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: h * hourH }} />
                ))}
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={'h' + h} className="absolute inset-x-0 border-t border-dashed border-line/45" style={{ top: h * hourH + hourH / 2 }} />
                ))}
              </div>

              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: track }}>
                {days.map((d, i) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  const pieces = perDay[i];
                  const isToday = i === todayIdx;
                  return (
                    <div key={d.getTime()} data-slot="col" data-day={i}
                      onPointerDown={H.onColDown}
                      className={cn('relative min-w-0 border-l border-line', weekend && 'bg-fg/[0.018]', isToday && 'bg-brand/[0.035]')}>
                      {/* Outside working hours */}
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bg-fg/[0.022]" style={{ height: WORK_START * hourH }} />
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 bg-fg/[0.022]" style={{ height: (24 - WORK_END) * hourH }} />

                      {/* Hover hint: where a click would start a new entry */}
                      {hover && hover.day === i && !drag && (
                        <div aria-hidden className="pointer-events-none absolute inset-x-1 flex items-start rounded-md border border-dashed border-fg/20 bg-fg/[0.03] px-2 py-1 text-2xs font-medium text-fg-subtle tnum"
                          style={{ top: (hover.min / 60) * hourH + 1, height: Math.min(60, 1440 - hover.min) / 60 * hourH - 2 }}>
                          <Plus className="mr-1 mt-px size-3" />{clockHM(atMinutes(d, hover.min))}
                        </div>
                      )}

                      {pieces.map(p => {
                        const g = geom(p.startMin, p.endMin, isPaused(p) ? PAUSED_MIN_H : 20);
                        const { widthPct } = p;
                        return (
                          <EventBlock key={p.item.key} piece={p} top={g.top} height={g.height}
                            leftPct={p.leftPct} widthPct={widthPct} widthPx={(colWs[i] * widthPct) / 100 - 6}
                            now={p.item.kind === 'running' ? now : 0}
                            dimmed={dragKey === p.item.key} dragging={!!drag}
                            onBlockDown={H.onBlockDown} onResizeDown={H.onResizeDown}
                            onEdit={onEdit} onDelete={onDelete} onResume={onResume} onDuplicate={onDuplicate} onOpenTimer={onOpenTimer}
                            timerActions={timerActions} />
                        );
                      })}

                      {ghostPerDay && ghostPerDay[i].map(p => {
                        const g = geom(p.startMin, p.endMin);
                        return <GhostBlock key="ghost" piece={p} top={g.top} height={g.height} leftPct={0} widthPct={100} widthPx={colWs[i] - 6} now={now} />;
                      })}

                      {/* New entry being drawn, or waiting in the popover */}
                      {createRange && minutesFrom(d, createRange.start) >= 0 && minutesFrom(d, createRange.start) < 1440 && (() => {
                        const sMin = minutesFrom(d, createRange.start);
                        const eMin = Math.min(1440, minutesFrom(d, createRange.end));
                        const g = geom(sMin, eMin);
                        const el = (
                          <div className="pointer-events-none absolute inset-x-1 z-40 overflow-hidden rounded-[7px] border-2 border-fg/50 bg-surface-raised/90 px-2 py-1 shadow-lg backdrop-blur-[1px]"
                            style={{ top: g.top, height: g.height }}>
                            <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold leading-4 text-fg tnum">
                              <span className="truncate">{clockHM(createRange.start)} – {eMin >= 1440 ? '24:00' : clockHM(createRange.end)}</span>
                            </div>
                            {g.height > 34 && <div className="text-[11px] leading-[14px] text-fg-muted tnum">{formatHM(createRange.end - createRange.start)}</div>}
                          </div>
                        );
                        return draft ? <PopoverAnchor key="anchor" asChild>{el}</PopoverAnchor> : <div key="sel">{el}</div>;
                      })()}

                      {/* Now line */}
                      {todayIdx >= 0 && (
                        // Today's line sits on top; on other days it passes behind the blocks.
                        <div aria-hidden className={cn('pointer-events-none absolute inset-x-0', isToday ? 'z-30 h-[2px] bg-brand' : 'z-[1] h-px bg-brand/25')}
                          style={{ top: (nowMin / 60) * hourH - (isToday ? 1 : 0) }}>
                          {isToday && <span className="absolute -left-[5px] -top-[4px] size-2.5 rounded-full bg-brand ring-2 ring-surface" />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <PopoverContent side={single ? 'bottom' : 'right'} align="start" sideOffset={8} className="p-0"
            onOpenAutoFocus={(e) => { e.preventDefault(); const el = e.currentTarget?.querySelector?.('[data-autofocus]'); el?.focus(); }}>
            {draft && (
              <CreateEntryForm key={draft.key || 'draft'} draft={draft} clients={clients} tasks={tasks} entries={entries}
                onChangeRange={(start, end) => setDraft(d => ({ ...d, start, end }))}
                onCancel={() => setDraft(null)} onNavigate={onNavigate}
                onCreate={(entry) => { setDraft(null); onCreate(entry); }} />
            )}
          </PopoverContent>
        </Popover>

      </div>
        {empty && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-sm flex-col items-center rounded-xl border border-line bg-surface-raised/95 px-6 py-5 text-center shadow-lg backdrop-blur">
            <div className="mb-3 grid size-10 place-items-center rounded-xl border border-line bg-surface-2 text-fg-subtle"><CalendarPlus className="size-5" /></div>
            <div className="text-base font-semibold text-fg">Nothing tracked here yet</div>
            <p className="mt-1 text-sm text-fg-subtle">Drag across the grid to log time, or start a timer.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => onNavigate('track')}><Play />Start a timer</Button>
              <Button variant="ghost" size="sm" onClick={onAddManualEntry}><Plus />Add entry</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
