import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { billableDuration, calcEarnings, getRate, getRounding, timerElapsed } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { formatClock, formatEUR, formatHM, UI_LOCALE } from '../../lib/format.js';
import { readUiPref, writeUiPref } from '../../lib/useMediaQuery.js';
import { useNow } from '../../lib/useNow.js';
import { Page } from '../../components/shell/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Calendar } from '../../components/ui/Calendar.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { TimeGrid } from './TimeGrid.jsx';
import { TimerBar } from './TimerBar.jsx';
import {
  MIN_MS, addDays, clearTextWidths, dayDiff, duplicateOf, entryEnd, fmtDayShort, isOnlyTimeChange, isoWeek, mondayOf, sameDay, sameTimes, spanText, startOfDay, timeFields, withTimeFields,
} from './calendarUtils.js';

const NO_TIMERS = [];
const VIEW_KEY = 'tracker:ui:calendarView';
const MODES = [
  { value: 'day', label: 'Day', title: 'Day (D)' },
  { value: 'work', label: '5 days', title: 'Work week (5)' },
  { value: 'week', label: 'Week', title: 'Week (W)' },
];
// Zoom: px per hour. 48 shows a full working day at 800px; bigger levels give short entries room for text.
const ZOOM_KEY = 'tracker:ui:calendarZoom';
const ZOOMS = [36, 48, 64, 84];
const DEFAULT_ZOOM = 48;
const LONG_MS = 12 * 3600000;

const undoBtn = 'ml-auto shrink-0 self-center rounded-md border border-line-strong/80 bg-surface px-2.5 py-1 text-xs font-medium text-fg outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/60';
// Where a day sits against the range on screen, for toasts about changes that land off screen.
function whereIs(day, { mode, days }) {
  const k = dayDiff(days[0], day);
  if (k >= 0 && k < days.length) return '';
  if (mode === 'day') return k === 1 ? ' (next day)' : ' (not in view)';
  if (mode === 'work' && (k === 5 || k === 6)) return ' (weekend, not shown)';
  return k >= 7 && k < 14 ? ' (next week)' : ' (not in view)';
}

function daysFor(mode, anchor) {
  if (mode === 'day') return [startOfDay(anchor)];
  const mon = mondayOf(anchor);
  return Array.from({ length: mode === 'work' ? 5 : 7 }, (_, i) => addDays(mon, i));
}

// The date label sits in a fixed-width pill, so Previous, Today and Next never move while you step.
// Its longest text ("W44 | 27 Oct – 2 Nov 2025", "Last week | 28 Sept – 4 Oct") is about 176px.
const LABEL_W = 222;

function spanLabel(days, today) {
  const from = days[0];
  const to = days[days.length - 1];
  if (days.length === 1) {
    const diff = dayDiff(today, from);
    const name = diff === 0 ? 'Today' : diff === -1 ? 'Yesterday' : diff === 1 ? 'Tomorrow' : null;
    const yearOpt = !name && from.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {};
    return { name, dates: from.toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short', ...yearOpt }) };
  }
  const weeks = Math.round(dayDiff(mondayOf(today), mondayOf(from)) / 7);
  const name = weeks === 0 ? 'This week' : weeks === -1 ? 'Last week' : weeks === 1 ? 'Next week' : `W${isoWeek(from)}`;
  // "Last week" and "Next week" already say which year; other weeks add it when it is not this one.
  const yearOpt = weeks !== 0 && Math.abs(weeks) !== 1 && to.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {};
  const sameMonth = from.getMonth() === to.getMonth();
  const f = sameMonth ? String(from.getDate()) : from.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short' });
  return { name, dates: `${f} – ${to.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', ...yearOpt })}` };
}

export function CalendarView({
  entries, clients, tasks, activeTimers = NO_TIMERS, rates, clientRates, rounding, clientRounding,
  onEdit, onDelete, onResume, onCreateEntry, onUpdateEntry, onAddManualEntry, onNavigate, pushToast,
  onPauseTimer, onResumeTimer, onStopTimer,
}) {
  const [mode, setModeState] = useState(() => {
    const v = readUiPref(VIEW_KEY, 'week');
    return MODES.some(m => m.value === v) ? v : 'week';
  });
  const setMode = (v) => { setModeState(v); writeUiPref(VIEW_KEY, v); };
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [hourH, setHourH] = useState(() => {
    const v = Number(readUiPref(ZOOM_KEY, DEFAULT_ZOOM));
    return ZOOMS.includes(v) ? v : DEFAULT_ZOOM;
  });
  const zoom = useCallback((dir) => setHourH(h => {
    const i = Math.max(0, ZOOMS.indexOf(h));
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))];
    if (next !== h) writeUiPref(ZOOM_KEY, next);
    return next;
  }), []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const now = useNow(true);
  const today = useMemo(() => startOfDay(new Date(now)), [Math.floor(now / 60000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => daysFor(mode, anchor), [mode, anchor]);
  const from = days[0].getTime();
  const to = addDays(days[days.length - 1], 1).getTime();

  // The latest drag change, for Ctrl+Z (see the undo section below).
  const lastChangeRef = useRef(null);
  // Latest callbacks for memoised blocks and toasts. A stale App callback would save an old entries list.
  const latest = useRef({});
  latest.current = {
    entries, onEdit, onDelete, onResume, onCreateEntry, onUpdateEntry, onNavigate, pushToast, onPauseTimer, onResumeTimer, onStopTimer,
    range: { mode, days }, dropUndo: () => { lastChangeRef.current = null; },
  };
  const stable = useMemo(() => ({
    onEdit: (e) => latest.current.onEdit(e),
    onDelete: (e) => latest.current.onDelete(e),
    onResume: (e) => latest.current.onResume(e),
    onOpenTimer: () => latest.current.onNavigate('track'),
    onDuplicate: (e) => {
      // The copy keeps the tracked time as stored: pauses in the original stay out of the bill.
      const copy = duplicateOf(e, 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
      const L = latest.current;
      L.dropUndo();
      L.onCreateEntry(copy);
      // The copy starts where the original ends, so it can land on the next day or week: name the day,
      // and say so when it is off screen.
      const day = startOfDay(copy.start);
      L.pushToast(`Copy added on ${fmtDayShort(day)}, ${spanText(copy.start, copy.end)}${whereIs(day, L.range)}. ${formatHM(copy.duration)} tracked.`, 'ok');
    },
  }), []);

  // Timer controls for the bar and the blocks. They go through App, like on the Timer page.
  // A double click must not reach a second timer: after one action the controls under the
  // pointer change (the next timer moves into place), so a second press within 400ms is dropped.
  const lastTimerAct = useRef(0);
  const timerActions = useMemo(() => {
    const once = (fn) => (t) => {
      const at = Date.now();
      if (at - lastTimerAct.current < 400) return;
      lastTimerAct.current = at;
      latest.current.dropUndo();
      fn(t);
    };
    return {
      pause: once((t) => latest.current.onPauseTimer?.(t.id)),
      resume: once((t) => latest.current.onResumeTimer?.(t.id)),
      stop: once((t) => {
        const L = latest.current;
        if (!L.onStopTimer) { L.onNavigate('track'); return; }
        const ms = timerElapsed(t);
        L.onStopTimer(t.id);
        if (ms < 1000) L.pushToast('Timer removed. It ran under a second.', 'info');
        else L.pushToast(`Saved ${formatClock(ms)} for ${t.client}.`, 'ok');
      }),
    };
  }, []);
  const hasTimerHook = !!(onPauseTimer && onResumeTimer && onStopTimer);

  const barRef = useRef(null);

  // Undo for a drag change (the toast's button, or Ctrl+Z for the latest one). Undo puts back only the
  // times the drag changed, and only while the entry still has them: edits made since are never lost.
  // Ctrl+Z only ever undoes the latest change. Any other change (a duplicate, an entry drawn on the grid,
  // an edit, a delete, a timer paused, resumed or stopped, a change made on another page) empties the
  // slot, and Ctrl+Z then does nothing. A toast's own Undo button still undoes the change it names.
  const lastChange = lastChangeRef;
  const seen = useRef({ entries, timers: activeTimers });
  useEffect(() => {
    const prev = seen.current;
    seen.current = { entries, timers: activeTimers };
    const rec = lastChange.current;
    if (!rec) return;
    if (prev.timers !== activeTimers) { lastChange.current = null; return; }
    if (prev.entries === entries) return;
    // The first change after a drag must be that drag and nothing else; every later change is another action.
    if (rec.pending && isOnlyTimeChange(prev.entries, entries, rec.id, rec.after)) { rec.pending = false; return; }
    lastChange.current = null;
  }, [entries, activeTimers]);
  const undoChange = useCallback((rec) => {
    if (!rec) return;
    if (lastChange.current === rec) lastChange.current = null;
    const L = latest.current;
    const cur = L.entries.find(e => e.id === rec.id);
    if (!cur) { L.pushToast('That entry is gone. Nothing to undo.', 'info'); return; }
    if (!sameTimes(cur, rec.after)) { L.pushToast('Its times changed since. Nothing to undo.', 'info'); return; }
    const back = withTimeFields(cur, rec.before);
    L.onUpdateEntry(back);
    L.pushToast(`Back to ${fmtDayShort(new Date(back.start))}, ${spanText(back.start, entryEnd(back))}.`, 'info');
  }, []);
  const undo = useCallback(() => undoChange(lastChange.current), [undoChange]);
  const onCommit = useCallback((prev, next, kind) => {
    const rec = { id: prev.id, before: timeFields(prev), after: timeFields(next), pending: true };
    lastChange.current = rec;
    latest.current.onUpdateEntry(next);
    const s = new Date(next.start);
    const span = spanText(next.start, next.end);
    // A resize sets tracked = end - start. When that drops earlier pauses, say so (Undo brings them back).
    const hadPauses = (entryEnd(prev) - prev.start) - (prev.duration || 0) >= MIN_MS;
    const long = next.duration >= LONG_MS ? ' That is a long entry. Undo it if it was a slip.' : '';
    const msg = kind === 'move'
      ? `Moved to ${fmtDayShort(s)}, ${span}.`
      : `Resized to ${span}, ${fmtDayShort(s)}. Tracked ${formatHM(next.duration)}${hadPauses ? `, was ${formatHM(prev.duration || 0)} with pauses` : ''}.${long}`;
    toast(msg, { action: { label: 'Undo', onClick: () => undoChange(rec) }, classNames: { actionButton: undoBtn } });
  }, [undoChange]);

  const onCreate = useCallback((entry) => {
    lastChange.current = null;
    latest.current.onCreateEntry(entry);
    latest.current.pushToast(`Added ${formatHM(entry.duration)} for ${entry.client}, ${fmtDayShort(new Date(entry.start))}.`, 'ok');
  }, []);

  // Toasts sit over the bottom-right of the grid. A right-click on a toast that covers the calendar
  // goes to what is under it (a block's menu opens there), and the toasts make way.
  const rootRef = useRef(null);
  useEffect(() => {
    const onMenu = (e) => {
      const root = rootRef.current;
      if (!root || !e.isTrusted || !(e.target instanceof Element)) return;
      if (!e.target.closest('[data-sonner-toast]') || e.target.closest('button')) return;
      const below = document.elementsFromPoint(e.clientX, e.clientY).find(el => !el.closest('[data-sonner-toaster]'));
      if (!below || !root.contains(below)) return;
      e.preventDefault();
      e.stopPropagation();
      toast.dismiss();
      below.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, view: window, button: 2, buttons: 0,
        clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
      }));
    };
    window.addEventListener('contextmenu', onMenu, true);
    return () => window.removeEventListener('contextmenu', onMenu, true);
  }, []);

  // Remeasure block text once the bundled font is in (first paint measures the fallback font).
  const [, setFontTick] = useState(0);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) { clearTextWidths(); setFontTick(t => t + 1); } });
    return () => { alive = false; };
  }, []);

  // Billing facts for a block's hover card: rate, billable time after AI and rounding, amount.
  const billing = useCallback((e) => {
    const roundMin = rounding != null ? getRounding(e.client, rounding, clientRounding || {}) : 0;
    return {
      rate: getRate(e.client, e.task, rates, clientRates),
      roundMin,
      billableMs: billableDuration(e, roundMin),
      amount: calcEarnings(e, rates, clientRates, rounding, clientRounding),
    };
  }, [rates, clientRates, rounding, clientRounding]);

  // Blocks: entries in view plus timers. Running timers grow with the clock; paused ones show the
  // time tracked so far from their start (the pause moment is not stored), styled as paused.
  const entryItems = useMemo(() => entries
    .filter(e => e && Number.isFinite(e.start) && e.start < to && entryEnd(e) > from - 1)
    .map((e, i) => {
      const rawEnd = entryEnd(e);
      return {
        key: e.id || `e-${e.start}-${i}`, kind: 'entry', entry: e,
        start: e.start, rawEnd, end: Math.max(rawEnd, e.start + MIN_MS),
        client: e.client, task: e.task, project: e.project, note: e.note,
        ai: !!e.ai, aiFactor: e.aiFactor, free: !!e.free, invoiced: !!e.invoiced, duration: e.duration || 0, // aiFactor: labels show the entry's own factor
        ...billing(e),
      };
    }), [entries, from, to, billing]);

  const timers = activeTimers.filter(t => t && Number.isFinite(t.startedAt));
  const running = timers.filter(t => t.runningSince);
  const pausedCount = timers.length - running.length;
  const items = useMemo(() => {
    const live = timers
      .filter(t => t.startedAt < to && now > from)
      .map(t => {
        const isRunning = !!t.runningSince;
        const rawEnd = isRunning ? now : t.startedAt + (t.accumulatedMs || 0);
        const at = (n) => ({ ...billing({ ...t, free: false, duration: timerElapsed(t, n) }), elapsedMs: timerElapsed(t, n) });
        return {
          key: 'timer-' + t.id, kind: isRunning ? 'running' : 'paused', timer: t,
          start: t.startedAt, rawEnd, end: Math.max(rawEnd, t.startedAt + MIN_MS),
          client: t.client, task: t.task, project: t.project, note: t.note, ai: !!t.ai, aiFactor: t.aiFactor,
          elapsed: (n) => timerElapsed(t, n), live: at,
        };
      });
    return live.length ? [...entryItems, ...live] : entryItems;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryItems, activeTimers, running.length ? now : 0, from, to, billing]);

  // Per-day totals: tracked time and money of entries that start that day (same rule as the Log).
  const dayStats = useMemo(() => days.map(d => {
    const d0 = d.getTime();
    const d1 = addDays(d, 1).getTime();
    let ms = 0; let eur = 0; let free = false;
    const split = {};
    for (const it of entryItems) {
      if (it.start < d0 || it.start >= d1) continue;
      ms += it.duration; eur += it.amount; if (it.free) free = true;
      split[it.client] = (split[it.client] || 0) + it.duration;
    }
    return { ms, eur, free, split: Object.entries(split).sort((a, b) => b[1] - a[1]) };
  }), [days, entryItems]);
  const total = dayStats.reduce((a, s) => ({ ms: a.ms + s.ms, eur: a.eur + s.eur }), { ms: 0, eur: 0 });

  const step = mode === 'day' ? 1 : 7;
  const go = useCallback((dir) => setAnchor(a => addDays(a, dir * step)), [step]);
  const goToday = useCallback(() => setAnchor(startOfDay(new Date())), []);

  // Keyboard: T today, arrows step, D / 5 / W switch the view, Ctrl+Z undoes the last drag.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && (t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]'))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        // A held key undoes once; the slot is empty after that.
        if (lastChange.current) { e.preventDefault(); if (!e.repeat) undo(); }
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 't') { e.preventDefault(); goToday(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (k === 'n') { e.preventDefault(); barRef.current?.focusNew(); }
      else if (k === 'd') { e.preventDefault(); setMode('day'); }
      else if (k === 'w') { e.preventDefault(); setMode('week'); }
      else if (k === '5') { e.preventDefault(); setMode('work'); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, goToday, undo, zoom]);

  const amountOf = useCallback((t, ms) => billing({ ...t, free: false, duration: ms }).amount, [billing]);
  const { name, dates } = spanLabel(days, today);
  const showsToday = days.some(d => sameDay(d, today));
  const scope = mode === 'day' ? 'this day' : 'this week';
  // Timers live in the bar above; without the App hook the header still says what runs.
  const timerNote = !hasTimerHook && showsToday && timers.length > 0 ? (
    <>
      {running.length > 0 && <> <span aria-hidden className="text-fg-faint">·</span> <span className="text-brand-text">{running.length} running</span></>}
      {pausedCount > 0 && <> <span aria-hidden className="text-fg-faint">·</span> <span className="text-warning-text">{pausedCount} paused</span></>}
    </>
  ) : null;
  const description = total.ms > 0
    ? <>{formatHM(total.ms)} tracked <span aria-hidden className="text-fg-faint">·</span> {formatEUR(total.eur)} billable{timerNote}</>
    : <>Nothing tracked {scope} yet{timerNote || '.'}</>;

  const arrow = 'grid w-8 shrink-0 place-items-center text-fg-subtle outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60';
  const unit = mode === 'day' ? 'day' : 'week';

  return (
    <div ref={rootRef} className="flex h-full min-h-[660px] flex-col">
    <TimerBar ref={barRef} entries={entries} clients={clients} tasks={tasks} activeTimers={activeTimers} now={now} amountOf={amountOf}
      onStart={onResume} onPause={hasTimerHook ? timerActions.pause : null} onResume={hasTimerHook ? timerActions.resume : null}
      onStop={timerActions.stop} onNavigate={onNavigate} />
    <Page className="flex min-h-0 flex-1 flex-col pb-5 pt-4">
      {/* Title and totals, then two control groups of fixed width. The title block has a fixed basis,
          so where the header wraps depends on the window width only, never on the label or the totals:
          stepping through weeks never moves a button. Wide: one row. Narrow: the view switch and
          Add entry drop to a second row on the right. */}
      <header className="mb-3.5 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-[1_1_200px]">
          <h1 className="text-2xl font-semibold leading-8 text-fg">Calendar</h1>
          <p className="truncate text-sm leading-5 text-fg-subtle tnum">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip content={mode === 'day' ? 'Go to today' : 'Go to this week'} shortcut="T">
            <Button variant="secondary" size="md" onClick={goToday} aria-label="Go to today">Today</Button>
          </Tooltip>
          <div className="inline-flex h-9 items-stretch overflow-hidden rounded-lg border border-line-strong/80 bg-surface shadow-xs">
              <Tooltip content={`Previous ${unit}`} shortcut="←">
                <button type="button" aria-label={`Previous ${unit}`} onClick={() => go(-1)} className={cn(arrow, 'border-r border-line')}>
                  <ChevronLeft className="size-4" />
                </button>
              </Tooltip>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button type="button" aria-label={`Showing ${name ? name + ', ' : ''}${dates}. Pick a date`} style={{ width: LABEL_W }}
                    className="group flex min-w-0 items-center justify-center gap-2 px-3 text-sm outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 data-[state=open]:bg-surface-2">
                    {name && <span className="shrink-0 whitespace-nowrap font-medium text-fg">{name}</span>}
                    {name && <span aria-hidden className="h-3.5 w-px shrink-0 bg-line-strong" />}
                    <span className={cn('min-w-0 truncate tnum', name ? 'text-fg-muted' : 'font-medium text-fg')}>{dates}</span>
                    <ChevronDown className="size-3.5 shrink-0 text-fg-subtle transition-transform duration-base group-data-[state=open]:rotate-180" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" className="p-3">
                  <Calendar mode="single" selected={anchor} defaultMonth={anchor}
                    onSelect={(d) => { if (d) { setAnchor(startOfDay(d)); setPickerOpen(false); } }}
                    modifiers={{ inView: days }} modifiersClassNames={{ inView: '[&>button]:bg-fg/[0.06]' }} />
                </PopoverContent>
              </Popover>
              <Tooltip content={`Next ${unit}`} shortcut="→">
                <button type="button" aria-label={`Next ${unit}`} onClick={() => go(1)} className={cn(arrow, 'border-l border-line')}>
                  <ChevronRight className="size-4" />
                </button>
              </Tooltip>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SegmentedControl label="Calendar range" value={mode} onChange={setMode} options={MODES} />
          <Button variant="primary" onClick={onAddManualEntry}><Plus />Add entry</Button>
        </div>
      </header>

      <TimeGrid days={days} hourH={hourH} onZoom={zoom} canZoomIn={hourH < ZOOMS[ZOOMS.length - 1]} canZoomOut={hourH > ZOOMS[0]} items={items} dayStats={dayStats} now={now} today={today}
        entries={entries} clients={clients} tasks={tasks} scrollKey={mode} priceOf={billing}
        onEdit={stable.onEdit} onDelete={stable.onDelete} onResume={stable.onResume} onDuplicate={stable.onDuplicate}
        onOpenTimer={stable.onOpenTimer} onCommit={onCommit} onCreate={onCreate} onNavigate={onNavigate}
        pushToast={pushToast} onAddManualEntry={onAddManualEntry} timerActions={hasTimerHook ? timerActions : null} />
    </Page>
    </div>
  );
}
