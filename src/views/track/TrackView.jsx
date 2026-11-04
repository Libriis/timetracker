import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, List, Table2 } from 'lucide-react';
import { ActiveTimersPanel } from './ActiveTimersPanel.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { EditTimerModal } from './EditTimerModal.jsx';
import { FocusMode } from './FocusMode.jsx';
import { RecentEntries } from './RecentEntries.jsx';
import { Timesheet } from './Timesheet.jsx';
import { TrackPanel } from './TrackPanel.jsx';
import { QuickStart, ShortcutHints, WeekSummary } from './WeekSummary.jsx';
import { buildFrequentWork, buildLastTask, buildProjectIndex, buildRecentWork, primaryTimer, recentPairs, timerForWork, workKey, workTitle } from './trackData.js';
import { Button } from '../../components/ui/Button.jsx';
import { SectionLabel } from '../../components/ui/Card.jsx';
import { DateRangePicker, rangeOf } from '../../components/ui/DateRangePicker.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { notify } from '../../components/ui/ToastStack.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { entryAiFactor, timerElapsed, validAiFactor } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { isoDay } from '../../lib/format.js';
import { readUiPref, writeUiPref } from '../../lib/useMediaQuery.js';

const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
// Open dialogs, menus, pickers and selects own the keyboard. Tooltips do not count.
const overlayOpen = () => !!document.querySelector('[role=dialog],[role=alertdialog],[role=menu],[role=listbox]');
// A start leaves no button focused: Space and Enter then act on the new timer, never press Start again.
const releaseFocus = () => { const a = document.activeElement; if (a && a !== document.body && !isTyping(a)) a.blur(); };
// Two starts this close together are one double-click, not two timers.
const START_GUARD_MS = 600;
// One stop per 600 ms, from any source (S, a button, focus mode, the palette): S, S or a double-click
// stops the timer you meant and never the next one.
const STOP_GUARD_MS = 600;
// After a stop the next card slides up under the pointer, and after focus mode closes the page appears
// under it. For this long (the Windows double-click time), clicks there do nothing, so a double-click's second click lands nowhere.
const SETTLE_MS = 500;
// Start pressed again this soon after a start, with an empty field and the same client and activity,
// is a repeat press: the new timer lights up instead of a second, empty one.
const REPEAT_START_MS = 5000;
const VIEW_KEY = 'tracker:ui:trackListView';
const last7 = () => { const d = new Date(); d.setDate(d.getDate() - 6); return { period: 'custom', from: isoDay(d), to: isoDay() }; };

// Home view (?view=track): timer composer on top, live timers, recent entries (list or timesheet), and a week summary rail.
// Wide (>=1120px): two columns, the rail spans both rows and sticks under the composer.
// Narrow: one column in the order running → summary → list.
// Keyboard: N new · K (or Ctrl+K) search recent work · M past entry · Space pause/resume · S stop · F focus mode.
// The shortcuts act on the timer you paused or resumed last, else the newest running one (see primaryTimer).
// One physical key press = one action: auto-repeat (a held key) is ignored.
export function TrackView(props) {
  const {
    activeTimers, onPause: pauseTimer, onResume: resumeTimer, onStop: stopTimer, onToggleAi, entries, rates, clientRates, rounding, clientRounding,
    onEdit, onDelete, onResumeWork, onNavigate, onAddManualEntry, onUpdateTimer, onStart, clients, tasks,
  } = props;
  const panelRef = useRef(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [range, setRange] = useState(last7);
  const [listView, setListViewState] = useState(() => (readUiPref(VIEW_KEY, 'list') === 'timesheet' ? 'timesheet' : 'list'));
  const setListView = (v) => { setListViewState(v); writeUiPref(VIEW_KEY, v); };
  // The timer you paused or resumed last keeps the keyboard (Space, S, F) until it stops or a new one starts.
  const [lastPausedId, setLastPausedId] = useState(null);
  const onPause = useCallback((id) => { setLastPausedId(id); pauseTimer(id); }, [pauseTimer]);
  const onResume = useCallback((id) => { setLastPausedId(id); resumeTimer(id); }, [resumeTimer]);
  const knownIds = useRef(null);
  useEffect(() => {
    const ids = activeTimers.map(t => t.id);
    if (knownIds.current && ids.some(id => !knownIds.current.has(id))) setLastPausedId(null);
    knownIds.current = new Set(ids);
  }, [activeTimers]);
  // Settle: the running cards ignore the pointer for a moment after a stop. Shield: the whole window
  // does, for a moment after focus mode closes (its buttons sit over other controls on the page).
  const [settling, setSettling] = useState(false);
  const [shield, setShield] = useState(false);
  const settleTimer = useRef(null);
  const shieldTimer = useRef(null);
  useEffect(() => () => { clearTimeout(settleTimer.current); clearTimeout(shieldTimer.current); }, []);
  const raiseSettle = useCallback(() => { setSettling(true); clearTimeout(settleTimer.current); settleTimer.current = setTimeout(() => setSettling(false), SETTLE_MS); }, []);
  const raiseShield = useCallback(() => { setShield(true); clearTimeout(shieldTimer.current); shieldTimer.current = setTimeout(() => setShield(false), SETTLE_MS); }, []);
  const focusIdRef = useRef(focusId);
  focusIdRef.current = focusId;
  // A timer stopped within its first second has nothing to save. Say so, instead of losing it silently.
  const lastStopAt = useRef(0);
  const onStop = useCallback((id) => {
    const t = activeTimers.find(x => x.id === id);
    if (!t) return;
    const now = Date.now();
    if (now - lastStopAt.current < STOP_GUARD_MS) return;
    lastStopAt.current = now;
    if (timerElapsed(t) < 1000) notify('Stopped within a second, so nothing was saved.', 'info');
    raiseSettle();
    if (focusIdRef.current != null) raiseShield();
    stopTimer(id);
  }, [activeTimers, stopTimer, raiseSettle, raiseShield]);

  // Every way to start (Start, Enter, Continue, Frequent work, the palette) goes through here:
  // one timer per action, and focus leaves the button that started it. The same start twice within
  // 600 ms is one double-click; starting two different pieces of work quickly is fine.
  const lastStart = useRef({ key: '', at: 0 });
  const guarded = useCallback((key, fn) => {
    const now = Date.now();
    releaseFocus();
    if (lastStart.current.key === key && now - lastStart.current.at < START_GUARD_MS) return false;
    lastStart.current = { key, at: now };
    fn();
    return true;
  }, []);
  // The live list, read at click time: a second click one second later must see the timer the first one started.
  const timersRef = useRef(activeTimers);
  timersRef.current = activeTimers;
  // A short ring around one timer card: "this one". Shown when a start finds its work already on a timer.
  const [flash, setFlash] = useState({ id: null, n: 0 });
  useEffect(() => {
    if (flash.id == null) return undefined;
    const h = setTimeout(() => setFlash(f => ({ ...f, id: null })), 1800);
    return () => clearTimeout(h);
  }, [flash]);
  // Identical work (same client, activity, project and note) never gets a second timer by accident.
  // Paused: it resumes. Running: its card lights up. The keys then act on that timer.
  // Only "Start another copy" in a row's ⋯ menu starts a second copy, on purpose.
  // `ai`: the composer asked for AI, so that timer gets it (in the same save as a resume).
  // `aiFactor`: the composer's own factor for it (null = Default). It also applies when AI is already on.
  // `hint`: one more short sentence for the toast.
  const takeOver = useCallback((t, { ai = false, aiFactor = null, hint = '' } = {}) => {
    const title = workTitle(t);
    const own = ai && onUpdateTimer ? validAiFactor(aiFactor) : null;
    const addAi = ai && !t.ai && (!!onUpdateTimer || !!t.runningSince);
    const setFactor = own != null && own !== validAiFactor(t.aiFactor);
    const patch = { ...(addAi ? { ai: true } : {}), ...(setFactor ? { aiFactor: own } : {}) };
    if ((addAi || setFactor) && onUpdateTimer) onUpdateTimer(t.id, t.runningSince ? patch : { ...patch, runningSince: Date.now() });
    else if (addAi) onToggleAi(t.id);
    else if (!t.runningSince) resumeTimer(t.id);
    setLastPausedId(t.id);
    const f = own ?? entryAiFactor(t);
    const extra = [addAi ? `AI ×${f} is on now.` : setFactor ? `AI ×${f} now.` : '', hint].filter(Boolean).join(' ');
    if (t.runningSince) notify(`Already running: ${title}${extra ? `. ${extra}` : ''}`, 'info');
    else notify(`Resumed: ${title}${extra ? `. ${extra}` : ''}`, 'ok');
    setFlash(f => ({ id: t.id, n: f.n + 1 }));
  }, [onUpdateTimer, onToggleAi, resumeTimer]);
  const { selectedClient, selectedTask, project, note, setNote, setProject, aiAssisted, setAiAssisted, aiAssistedFactor, setAiAssistedFactor } = props;
  const startNew = useCallback(() => guarded('new', () => {
    const live = timersRef.current;
    const t = timerForWork(live, { client: selectedClient, task: selectedTask, project, note });
    if (t) {
      // The composer is used up either way: its note, project and AI tag never carry over to the next timer.
      takeOver(t, { ai: !!aiAssisted, aiFactor: aiAssisted ? aiAssistedFactor : null });
      setNote(''); setProject(''); setAiAssisted?.(false); setAiAssistedFactor?.(null);
      return;
    }
    if (!note.trim()) {
      const now = Date.now();
      const just = [...live].reverse().find(x => x.runningSince && x.client === selectedClient && x.task === selectedTask
        && now - x.startedAt >= 0 && now - x.startedAt < REPEAT_START_MS);
      if (just) { takeOver(just, { hint: 'Type a description to start another.' }); return; }
    }
    onStart();
  }), [guarded, onStart, takeOver, selectedClient, selectedTask, project, note, aiAssisted, aiAssistedFactor, setNote, setProject, setAiAssisted, setAiAssistedFactor]);
  const startWork = useCallback((w, { copy = false } = {}) => guarded(`${copy ? 'copy' : 'work'}|${workKey(w)}`, () => {
    const t = copy ? null : timerForWork(timersRef.current, w);
    if (t) takeOver(t); else onResumeWork(w, copy ? { copy: true } : undefined);
  }), [guarded, onResumeWork, takeOver]);
  const startCopy = useCallback((w) => startWork(w, { copy: true }), [startWork]);

  const billing = useMemo(() => ({ rates, clientRates, rounding, clientRounding }), [rates, clientRates, rounding, clientRounding]);
  const projectIndex = useMemo(() => buildProjectIndex(entries), [entries]);
  const lastTask = useMemo(() => buildLastTask(entries), [entries]);
  const pairs = useMemo(() => recentPairs(projectIndex, 3), [projectIndex]);
  const paletteWork = useMemo(() => buildRecentWork(entries, Infinity), [entries]);
  const frequent = useMemo(() => buildFrequentWork(entries, activeTimers), [entries, activeTimers]);
  const primary = primaryTimer(activeTimers, lastPausedId);
  const focusOpen = focusId != null && activeTimers.some(t => t.id === focusId);
  const win = useMemo(() => rangeOf(range), [range]);

  const openFocus = useCallback((id) => { const t = id ? activeTimers.find(x => x.id === id) : primaryTimer(activeTimers, lastPausedId); if (t) setFocusId(t.id); }, [activeTimers, lastPausedId]);
  const closeFocus = useCallback(() => { setFocusId(null); raiseShield(); }, [raiseShield]);
  // A stopped timer leaves focus mode.
  useEffect(() => { if (focusId != null && !activeTimers.some(t => t.id === focusId)) setFocusId(null); }, [focusId, activeTimers]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || focusOpen) return;
      const k = e.key.toLowerCase();
      const typing = isTyping(e.target);
      const onControl = e.target?.closest?.('button, a, [role=button], [role=option], [role=tab], [role=switch], [role=checkbox], [role=radio]');
      // A held key repeats: act once, and keep a held Space from scrolling the page.
      if (e.repeat) { if (k === ' ' && !typing && !onControl && !overlayOpen()) e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); setPaletteOpen(o => !o); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || typing || overlayOpen()) return;
      const p = primaryTimer(activeTimers, lastPausedId);
      if (k === 'n') { e.preventDefault(); panelRef.current?.focus(); }
      else if (k === 'k') { e.preventDefault(); setPaletteOpen(true); }
      else if (k === 'm') { e.preventDefault(); onAddManualEntry(); }
      else if (k === 's' && p) { e.preventDefault(); onStop(p.id); }
      else if (k === 'f' && p) { e.preventDefault(); setFocusId(p.id); }
      else if (k === ' ' && p && !onControl) { e.preventDefault(); (p.runningSince ? onPause : onResume)(p.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTimers, lastPausedId, focusOpen, onAddManualEntry, onPause, onResume, onStop]);

  const editTimer = onUpdateTimer ? setEditing : undefined;
  // A running timer's own AI factor (null = Default: follow Settings). Goes through App like any timer edit.
  const setTimerAiFactor = useCallback((id, f) => onUpdateTimer?.(id, { aiFactor: validAiFactor(f) ?? undefined }), [onUpdateTimer]);

  return (
    <div className="min-h-full">
      <h1 className="sr-only">Timer</h1>
      <div className="sticky top-0 z-10">
        <TrackPanel ref={panelRef} {...props} onStart={startNew} projectIndex={projectIndex} lastTask={lastTask} pairs={pairs}
          onOpenPalette={() => setPaletteOpen(true)} onOpenFocus={() => openFocus()} canFocus={activeTimers.length > 0} />
      </div>
      <div className="mx-auto grid w-full max-w-[1240px] gap-x-6 px-5 pb-16 pt-6 sm:px-8 [grid-template-areas:'run'_'aside'_'list'] min-[1120px]:grid-cols-[minmax(0,1fr)_288px] min-[1120px]:[grid-template-areas:'run_aside'_'list_aside']">
        {activeTimers.length > 0 && (
          <section className={cn('mb-7 min-w-0 [grid-area:run]', settling && 'pointer-events-none')} aria-label="Running timers">
            <div className="mb-2.5 flex items-center gap-2">
              <SectionLabel>Running now</SectionLabel>
              <span className="text-2xs font-semibold text-fg-subtle tnum">{activeTimers.length}</span>
            </div>
            <ActiveTimersPanel timers={activeTimers} billing={billing} primaryId={primary?.id} flashId={flash.id} flashN={flash.n}
              onPause={onPause} onResume={onResume} onStop={onStop} onToggleAi={onToggleAi} onFocus={openFocus} onEdit={editTimer}
              onSetAiFactor={onUpdateTimer ? setTimerAiFactor : undefined} />
          </section>
        )}
        <aside className="mb-7 grid content-start gap-4 [grid-area:aside] sm:grid-cols-2 min-[1120px]:sticky min-[1120px]:top-[84px] min-[1120px]:mb-0 min-[1120px]:grid-cols-1 min-[1120px]:self-start min-[1120px]:pt-[26px]">
          <WeekSummary entries={entries} timers={activeTimers} rates={rates} clientRates={clientRates} rounding={rounding} clientRounding={clientRounding} />
          <QuickStart items={frequent} onResumeWork={startWork} onOpenPalette={() => setPaletteOpen(true)} />
          <div className="hidden min-[1120px]:block"><ShortcutHints /></div>
        </aside>
        <section className="min-w-0 [grid-area:list]" aria-label="Recent entries">
          {/* Which days, and how to see them: ‹ Last 7 days › and List · Timesheet · Calendar. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <DateRangePicker value={range} onChange={setRange} presets={['last7', 'week', 'lastWeek', 'last30', 'month']} />
            <div className="flex items-center gap-2">
              <SegmentedControl size="sm" label="Show entries as" value={listView} onChange={setListView}
                options={[
                  { value: 'list', label: 'List', icon: <List /> },
                  { value: 'timesheet', label: 'Timesheet', icon: <Table2 /> },
                ]} />
              {/* The calendar is its own page; this is a shortcut to it, not a third mode. */}
              <Tooltip content="Open the calendar page">
                <Button variant="ghost" size="sm" onClick={() => onNavigate('calendar')} className="text-fg-muted">
                  <CalendarDays /> Calendar
                </Button>
              </Tooltip>
            </div>
          </div>
          {listView === 'timesheet' ? (
            <Timesheet entries={entries} range={win} billing={billing} onPickRange={setRange} />
          ) : (
            <RecentEntries entries={entries} range={win} isDefaultRange={range.period === 'custom' && range.from === last7().from && range.to === last7().to}
              onResetRange={() => setRange(last7())} rates={rates} clientRates={clientRates} rounding={rounding} clientRounding={clientRounding}
              timers={activeTimers} onEdit={onEdit} onDelete={onDelete} onResume={startWork} onCopy={startCopy} onOpenLog={() => onNavigate('log')} onAddManualEntry={onAddManualEntry} />
          )}
        </section>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} recentWork={paletteWork} timers={activeTimers} primaryId={primary?.id}
        onStartWork={startWork} onNewTimer={() => panelRef.current?.focus()} onManual={onAddManualEntry}
        onFocus={openFocus} onPause={onPause} onResume={onResume} onStop={onStop} />

      {focusOpen && (
        <FocusMode timers={activeTimers} focusId={focusId} setFocusId={setFocusId} onClose={closeFocus}
          onPause={onPause} onResume={onResume} onStop={onStop} onToggleAi={onToggleAi} billing={billing} entries={entries} />
      )}

      {shield && createPortal(<div aria-hidden className="fixed inset-0 z-[60]" />, document.body)}

      {editing && (
        <EditTimerModal timer={activeTimers.find(t => t.id === editing.id) || editing} timers={activeTimers} clients={clients} tasks={tasks} projectIndex={projectIndex}
          onClose={() => setEditing(null)} onSave={(id, patch) => { onUpdateTimer(id, patch); setEditing(null); }} />
      )}
    </div>
  );
}
