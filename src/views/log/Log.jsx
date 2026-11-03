import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Download, ListChecks, Plus, Search, SearchX, X } from 'lucide-react';
import { timerElapsed } from '../../lib/billing.js';
import { formatClock, formatEUR, UI_LOCALE } from '../../lib/format.js';
import { DateRangePicker, formatRange, rangeOf } from '../../components/ui/DateRangePicker.jsx';
import { Page, PageHeader } from '../../components/shell/PageHeader.jsx';
import { ActivityFilter } from '../../components/ui/ActivityFilter.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { notify } from '../../components/ui/ToastStack.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { InvoiceLinesModal } from './InvoiceLinesModal.jsx';
import { BulkBar } from './parts/BulkBar.jsx';
import { DayGroup, EntryRow } from './parts/EntryList.jsx';
import { StartBar } from './parts/StartBar.jsx';
import { TotalsBar } from './parts/TotalsBar.jsx';
import { clientMoney, entryFigures, filterEntries, groupByDay, periodWindow, previousWindow, slugPart, summarize } from './logModel.js';

const PAGE = 150; // entries rendered per step; more load as you scroll (keeps thousands of entries fast)
const BILLED_OPTIONS = [{ value: 'all', label: 'All' }, { value: 'unbilled', label: 'Unbilled' }, { value: 'invoiced', label: 'Invoiced' }];
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'j', 'k']);
const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
// Sonner runs unstyled here (ToastStack), so the Undo button brings its own look.
const UNDO_TOAST = {
  duration: 9000,
  classNames: {
    actionButton: 'ml-auto -my-0.5 h-7 shrink-0 self-center rounded-md bg-fg/[0.07] px-2.5 text-xs font-semibold text-fg outline-none transition-colors hover:bg-fg/[0.12] focus-visible:ring-2 focus-visible:ring-ring/60',
  },
};

export function Log({
  entries, clients, activityOptions, rates, clientRates, vat, clientVat, rounding, clientRounding, csvFormat,
  onDelete, onEdit, onResume, onExport, onToggleInvoiced, onBulkInvoiced, onAddManualEntry,
  onUpdateEntry, onBulkUpdate, onBulkDelete, activeTimers, onStopTimer, onNavigate,
}) {
  const [fClient, setFClient] = useState('all');
  const [fProject, setFProject] = useState('all');
  const [fExcluded, setFExcluded] = useState([]); // hidden activities
  const [fPeriod, setFPeriod] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fBilled, setFBilled] = useState('all'); // all | unbilled | invoiced
  const [search, setSearch] = useState('');
  const [showLines, setShowLines] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [noteId, setNoteId] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmMark, setConfirmMark] = useState(null); // { value } from "Mark all invoiced / unbilled"
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const sentinelRef = useRef(null);
  const anchorRef = useRef(null);
  const noteIdRef = useRef(null);
  noteIdRef.current = noteId;
  // Undo runs after later renders: it must call the newest handler (it holds the newest entries).
  const latestRef = useRef({});
  latestRef.current = { onBulkUpdate, onBulkInvoiced };

  const cfg = useMemo(() => ({ rates, clientRates, vat, clientVat, rounding, clientRounding }),
    [rates, clientRates, vat, clientVat, rounding, clientRounding]);
  const win = periodWindow(fPeriod, fFrom, fTo);
  const baseFilter = useMemo(() => ({ client: fClient, project: fProject, excluded: fExcluded, billed: fBilled, q: search }),
    [fClient, fProject, fExcluded, fBilled, search]);
  const filtered = useMemo(() => filterEntries(entries, { ...baseFilter, from: win.from, to: win.to }),
    [entries, baseFilter, win.from, win.to]);
  const figs = useMemo(() => {
    const m = new WeakMap();
    for (const e of filtered) m.set(e, entryFigures(e, cfg));
    return m;
  }, [filtered, cfg]);
  const figsOf = useCallback((e) => figs.get(e) || entryFigures(e, cfg), [figs, cfg]);
  const totals = useMemo(() => summarize(filtered, figsOf, cfg), [filtered, figsOf, cfg]);
  // The same filters one period earlier, for the trend under each total.
  const prev = useMemo(() => {
    const w = previousWindow(fPeriod, win);
    if (!w) return null;
    const list = filterEntries(entries, { ...baseFilter, from: w.from, to: w.to });
    if (list.length === 0) return null;
    const s = summarize(list, (e) => entryFigures(e, cfg), cfg);
    return { ms: s.ms, billableMs: s.billableMs, net: s.net, gross: s.gross, label: w.label };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, baseFilter, cfg, fPeriod, win.from, win.to]);
  const days = useMemo(() => groupByDay(filtered), [filtered]);
  const dayTotals = useMemo(() => {
    const m = new Map();
    for (const d of days) {
      const money = clientMoney(d.items, cfg);
      m.set(d.key, {
        ms: d.items.reduce((a, e) => a + e.duration, 0),
        billableMs: d.items.reduce((a, e) => a + (e.free ? 0 : figsOf(e).billableMs), 0),
        net: money.net, gross: money.gross, allFree: d.items.every(e => e.free),
      });
    }
    return m;
  }, [days, cfg, figsOf]);
  // Render whole days until about `limit` entries; the rest load on scroll.
  const { shownDays, flat } = useMemo(() => {
    const shown = [];
    const list = [];
    for (const d of days) {
      if (list.length >= limit) break;
      shown.push(d);
      list.push(...d.items);
    }
    return { shownDays: shown, flat: list };
  }, [days, limit]);
  const hasMore = flat.length < filtered.length;
  const flatRef = useRef(flat);
  flatRef.current = flat;

  const selected = useMemo(() => filtered.filter(e => selectedIds.has(e.id)), [filtered, selectedIds]);
  const selecting = selected.length > 0;
  const activeKey = activeId && flat.some(e => e.id === activeId) ? activeId : flat[0]?.id;

  // Back to the first page whenever the filters change.
  useEffect(() => { setLimit(PAGE); }, [baseFilter, win.from, win.to]);

  // "/" jumps to search from anywhere on the page.
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (isTyping(document.activeElement) || document.querySelector('[role="dialog"], [role="menu"]')) return;
      ev.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Load the next page when the end of the list comes near.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!hasMore || !el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((list) => { if (list.some(x => x.isIntersecting)) setLimit(l => l + PAGE); }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, flat.length]);

  const focusRow = useCallback((id) => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-row-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  const toggleSelect = useCallback((e, shift) => {
    setSelectedIds(prevIds => {
      const next = new Set(prevIds);
      const list = flatRef.current;
      if (shift && anchorRef.current && anchorRef.current !== e.id) {
        const a = list.findIndex(x => x.id === anchorRef.current);
        const b = list.findIndex(x => x.id === e.id);
        if (a >= 0 && b >= 0) {
          const on = !prevIds.has(e.id);
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            if (on) next.add(list[i].id); else next.delete(list[i].id);
          }
          return next;
        }
      }
      if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
      return next;
    });
    anchorRef.current = e.id;
  }, []);
  const toggleDay = useCallback((day, on) => {
    setSelectedIds(prevIds => {
      const next = new Set(prevIds);
      day.items.forEach(e => { if (on) next.add(e.id); else next.delete(e.id); });
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => { setSelectedIds(new Set()); anchorRef.current = null; }, []);
  const startNote = useCallback((id) => { setActiveId(id); setNoteId(id); }, []);
  const cancelNote = useCallback(() => {
    const id = noteIdRef.current;
    setNoteId(null);
    if (id) focusRow(id);
  }, [focusRow]);
  const commitNote = useCallback((e, value) => {
    if (noteIdRef.current !== e.id) return; // Enter already saved; the blur that follows is a no-op
    noteIdRef.current = null;
    setNoteId(null);
    const note = value.trim();
    if (onUpdateEntry && note !== (e.note || '')) {
      onUpdateEntry({ ...e, note });
      notify(note ? 'Note saved.' : 'Note removed.', 'ok');
    }
    focusRow(e.id);
  }, [onUpdateEntry, focusRow]);

  const focusIndex = (n) => {
    const list = flatRef.current;
    if (list.length === 0) return;
    if (hasMore && n > list.length - 8) setLimit(l => l + PAGE);
    const i = Math.max(0, Math.min(list.length - 1, n));
    setActiveId(list[i].id);
    focusRow(list[i].id);
  };

  // Keyboard: ↑↓ (or J/K) move, Space selects, Enter edits, N edits the note, I toggles invoiced, Del deletes.
  const onListKeyDown = (ev) => {
    if (!listRef.current || !listRef.current.contains(ev.target) || isTyping(ev.target)) return;
    const k = ev.key;
    // A held key repeats only the moves. Held I, Space or N would flip a row back and forth.
    if (ev.repeat && !NAV_KEYS.has(k)) { if (k === ' ') ev.preventDefault(); return; }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'a' || k === 'A')) { ev.preventDefault(); setSelectedIds(new Set(filtered.map(x => x.id))); return; }
    if (k === 'Escape' && selectedIds.size > 0) { ev.preventDefault(); clearSelection(); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const rowEl = ev.target.closest('[data-row-id]');
    const i = rowEl ? flat.findIndex(x => x.id === rowEl.dataset.rowId) : -1;
    if (k === 'ArrowDown' || k === 'j') { ev.preventDefault(); focusIndex(i + 1); return; }
    if (k === 'ArrowUp' || k === 'k') { ev.preventDefault(); focusIndex(i - 1); return; }
    if (k === 'Home') { ev.preventDefault(); focusIndex(0); return; }
    if (k === 'End') { ev.preventDefault(); focusIndex(flat.length - 1); return; }
    if (!rowEl || ev.target !== rowEl || i < 0) return;
    const row = flat[i];
    if (k === ' ' || k === 'x') { ev.preventDefault(); toggleSelect(row, ev.shiftKey); }
    else if (k === 'Enter' || k === 'e') { ev.preventDefault(); onEdit(row); }
    else if ((k === 'n' || k === 'N') && onUpdateEntry) { ev.preventDefault(); startNote(row.id); }
    else if (k === 'i' || k === 'I') { ev.preventDefault(); onToggleInvoiced(row); }
    else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); onDelete(row); }
  };

  const onRange = ({ period: p, from: f, to: t }) => {
    if (p === 'custom') { setFFrom(f); setFTo(t); }
    setFPeriod(p);
  };
  const q = search.trim().toLowerCase();
  const clientOptions = useMemo(() => Array.from(new Set([...(clients || []), ...entries.map(e => e.client)])), [clients, entries]);
  const anyProjects = useMemo(() => entries.some(e => e.project), [entries]);
  // Only the chosen client's projects, so every pick can match something.
  const projectOptions = useMemo(() => Array.from(new Set(entries.filter(e => fClient === 'all' || e.client === fClient).map(e => e.project).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b)), [entries, fClient]);
  const pickClient = (c) => {
    setFClient(c);
    if (fProject !== 'all' && !entries.some(e => (c === 'all' || e.client === c) && e.project === fProject)) setFProject('all');
  };

  // Invoiced flags change only on entries that need it, and every bulk change can be undone from the toast.
  const applyInvoiced = (list, value) => {
    const changed = list.filter(e => !!e.invoiced !== value);
    if (changed.length === 0) { notify(`Already ${value ? 'invoiced' : 'unbilled'}.`, 'info'); return; }
    if (!onBulkUpdate) { onBulkInvoiced(changed, value); return; }
    onBulkUpdate(changed, { invoiced: value });
    const n = changed.length;
    toast.success(`Marked ${plural(n, 'entry', 'entries')} as ${value ? 'invoiced' : 'unbilled'}.`, {
      ...UNDO_TOAST,
      action: {
        label: 'Undo',
        onClick: () => {
          latestRef.current.onBulkUpdate?.(changed, { invoiced: !value });
          notify(`Undone. ${plural(n, 'entry is', 'entries are')} ${value ? 'unbilled' : 'invoiced'} again.`, 'ok');
        },
      },
    });
  };
  const stopTimer = (t) => {
    const ms = timerElapsed(t);
    onStopTimer(t.id);
    if (ms < 1000) notify('Timer removed. It ran under a second.', 'info');
    else notify(`Saved ${formatClock(ms)} for ${t.client}.`, 'ok');
  };
  const startBar = (
    <StartBar entries={entries} clients={clients || []} activities={activityOptions || []} activeTimers={activeTimers || []}
      onStart={onResume} onStop={onStopTimer ? stopTimer : null} onNavigate={onNavigate} />
  );
  const exportSuffix = () => {
    const parts = [];
    if (fClient !== 'all') parts.push(slugPart(fClient));
    if (fProject !== 'all') parts.push(slugPart(fProject));
    if (fPeriod === 'custom') parts.push(`${fFrom || 'start'}_${fTo || 'end'}`);
    else if (fPeriod !== 'all') parts.push(fPeriod);
    if (fBilled !== 'all') parts.push(fBilled);
    // Same as excludedSuffix, but accents fold too ("Úprava" -> "uprava", never a double hyphen).
    const excl = fExcluded.filter(t => activityOptions.includes(t)).map(slugPart).filter(Boolean);
    if (excl.length) parts.push('excl-' + excl.join('-'));
    if (q) parts.push('search');
    return parts.filter(Boolean).join('-');
  };
  const activeExcluded = fExcluded.filter(t => activityOptions.includes(t));
  const filtersOn = fClient !== 'all' || fProject !== 'all' || activeExcluded.length > 0 || fPeriod !== 'all' || fBilled !== 'all' || !!q;
  const clearFilters = () => { setFClient('all'); setFProject('all'); setFExcluded([]); setFPeriod('all'); setFBilled('all'); setSearch(''); };

  if (entries.length === 0) {
    return (
      <>
      {startBar}
      <Page>
        <PageHeader title="Log" description="Every entry, ready to review, correct and bill." />
        <Card>
          <EmptyState icon={<ListChecks />} title="No entries yet" description="Start a timer or add a past entry by hand. Every session lands here."
            action={onAddManualEntry && <Button variant="primary" size="sm" onClick={onAddManualEntry}><Plus /> Add entry</Button>} />
        </Card>
      </Page>
      </>
    );
  }

  const oldest = entries.reduce((m, e) => (e.start < m ? e.start : m), Infinity);
  // With filters on, the count and the way out sit together under the title (keeps the toolbar on one line).
  const description = filtersOn ? (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span>{`Showing ${filtered.length.toLocaleString('en-US')} of ${plural(entries.length, 'entry', 'entries')}`}</span>
      <span aria-hidden className="text-fg-faint">·</span>
      <button type="button" onClick={clearFilters}
        className="inline-flex items-center gap-1 rounded font-medium text-fg-muted underline decoration-fg/25 underline-offset-[3px] outline-none hover:text-fg hover:decoration-fg focus-visible:ring-2 focus-visible:ring-ring/60">
        Clear filters
      </button>
    </span>
  ) : `${plural(entries.length, 'entry', 'entries')} since ${new Date(oldest).toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  // Why the list is empty, in words, and the quickest way back.
  const outsidePeriod = filtered.length === 0 && fPeriod !== 'all'
    ? filterEntries(entries, { ...baseFilter, from: 0, to: Infinity }).length : 0;
  const filterWords = [
    fClient !== 'all' && fClient,
    fProject !== 'all' && fProject,
    fBilled !== 'all' && (fBilled === 'unbilled' ? 'unbilled' : 'invoiced'),
    activeExcluded.length > 0 && `${activeExcluded.length} ${activeExcluded.length === 1 ? 'activity' : 'activities'} hidden`,
    q && `“${search.trim()}”`,
  ].filter(Boolean);
  const range = rangeOf({ period: fPeriod, from: fFrom, to: fTo });

  const bulkMs = selected.reduce((s, e) => s + e.duration, 0);
  const bulkNet = clientMoney(selected, cfg).net;

  const markList = confirmMark ? filtered.filter(e => !!e.invoiced !== confirmMark.value) : [];

  return (
    <>
    {startBar}
    <Page className="pt-6">
      <PageHeader title="Log" description={description}
        actions={(
          <>
            <div className="relative w-full sm:w-60">
              <Input ref={searchRef} icon={<Search />} value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.preventDefault(); setSearch(''); } }}
                placeholder="Search entries" aria-label="Search notes, activity, client or project" className="pr-9" />
              {search ? (
                <button type="button" onClick={() => { setSearch(''); searchRef.current?.focus(); }} aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-fg-subtle outline-none hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60">
                  <X className="size-3.5" />
                </button>
              ) : (
                <Kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" aria-hidden>/</Kbd>
              )}
            </div>
            <Tooltip content={`Export the ${plural(filtered.length, 'entry', 'entries')} shown`}>
              <Button variant="secondary" onClick={(ev) => { if (ev.detail <= 1) onExport(filtered, exportSuffix()); }}><Download /> Export CSV</Button>
            </Tooltip>
            {onAddManualEntry && <Button variant="primary" onClick={onAddManualEntry}><Plus /> Add entry</Button>}
          </>
        )}>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={{ period: fPeriod, from: fFrom, to: fTo }} onChange={onRange}
            presets={['all', 'week', 'month', 'lastWeek', 'lastMonth', 'last7', 'last30', 'year']} />
          <Select value={fClient} onChange={pickClient} clientDots aria-label="Client" className="w-[152px]"
            options={[{ value: 'all', label: 'All clients' }, ...clientOptions.map(c => ({ value: c, label: c }))]} />
          {anyProjects && (
            <Select value={fProject} onChange={setFProject} aria-label="Project" className="w-[144px]"
              options={[{ value: 'all', label: projectOptions.length ? 'All projects' : 'No projects' }, ...projectOptions.map(p => ({ value: p, label: p }))]} />
          )}
          <ActivityFilter options={activityOptions} excluded={fExcluded} onChange={setFExcluded} />
          <SegmentedControl options={BILLED_OPTIONS} value={fBilled} onChange={setFBilled} label="Billing status" />
        </div>
      </PageHeader>

      {filtered.length > 0 && (
        <TotalsBar className="mb-6" totals={totals} prev={prev}
          onBulkInvoiced={(value) => setConfirmMark({ value })} onOpenLines={() => setShowLines(true)} />
      )}
      {showLines && (
        <InvoiceLinesModal entries={filtered} rates={rates} clientRates={clientRates}
          vat={vat} clientVat={clientVat} rounding={rounding} clientRounding={clientRounding}
          csvFormat={csvFormat} onClose={() => setShowLines(false)} />
      )}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<SearchX />} title="No entries match these filters"
            description={[
              range ? `Nothing in ${formatRange(range)}` : 'Nothing found',
              filterWords.length ? ` for ${filterWords.join(', ')}.` : '.',
              outsidePeriod > 0 ? ` ${plural(outsidePeriod, 'entry matches', 'entries match')} outside this period.` : '',
            ].join('')}
            action={(
              <>
                {outsidePeriod > 0 && <Button variant="secondary" size="sm" onClick={() => setFPeriod('all')}>Show all time</Button>}
                <Button variant={outsidePeriod > 0 ? 'ghost' : 'secondary'} size="sm" onClick={clearFilters}>Clear filters</Button>
              </>
            )} />
        </Card>
      ) : (
        <div ref={listRef} onKeyDown={onListKeyDown} className="space-y-4" aria-label="Entries by day" role="region">
          {shownDays.map(day => (
            <DayGroup key={day.key} day={day} totals={dayTotals.get(day.key)} onToggleDay={toggleDay}
              selectedCount={day.items.reduce((n, e) => n + (selectedIds.has(e.id) ? 1 : 0), 0)}>
              {day.items.map(e => (
                <EntryRow key={e.id} e={e} f={figsOf(e)} active={e.id === activeKey} selected={selectedIds.has(e.id)} selecting={selecting}
                  editingNote={noteId === e.id} canEditNote={!!onUpdateEntry}
                  onActivate={setActiveId} onToggleSelect={toggleSelect} onEdit={onEdit}
                  onStartNote={startNote} onCommitNote={commitNote} onCancelNote={cancelNote}
                  onToggleInvoiced={onToggleInvoiced} onResume={onResume} onDelete={onDelete} />
              ))}
            </DayGroup>
          ))}
          {hasMore ? (
            <div ref={sentinelRef} className="flex justify-center py-4">
              <Button variant="ghost" size="sm" onClick={() => setLimit(l => l + PAGE)}>
                Show more <span className="text-fg-subtle tnum">{(filtered.length - flat.length).toLocaleString('en-US')} left</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 pt-3 text-xs text-fg-subtle">
              <span className="tnum">That is all: {plural(filtered.length, 'entry', 'entries')}, {formatClock(totals.ms)} tracked.</span>
              <span className="hidden flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:flex">
                <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
                <span className="flex items-center gap-1"><Kbd>Space</Kbd> select</span>
                <span className="flex items-center gap-1"><Kbd>Enter</Kbd> edit</span>
                {onUpdateEntry && <span className="flex items-center gap-1"><Kbd>N</Kbd> note</span>}
                <span className="flex items-center gap-1"><Kbd>I</Kbd> invoiced</span>
                <span className="flex items-center gap-1"><Kbd>/</Kbd> search</span>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none sticky bottom-5 z-30 mt-4 flex justify-center">
        <AnimatePresence>
          {selecting && (
            <BulkBar key="bulk" count={selected.length} ms={bulkMs} net={bulkNet}
              anyInvoiced={selected.some(e => e.invoiced)} anyUnbilled={selected.some(e => !e.invoiced)}
              clients={clientOptions} activities={activityOptions}
              onInvoiced={(value) => applyInvoiced(selected, value)}
              onSetClient={onBulkUpdate ? (c) => { onBulkUpdate(selected, { client: c }); notify(`Moved ${plural(selected.length, 'entry', 'entries')} to ${c}.`, 'ok'); } : null}
              onSetActivity={onBulkUpdate ? (t) => { onBulkUpdate(selected, { task: t }); notify(`Changed ${plural(selected.length, 'entry', 'entries')} to ${t}.`, 'ok'); } : null}
              onDelete={onBulkDelete ? () => setConfirmDelete(selected) : null}
              onClear={clearSelection} />
          )}
        </AnimatePresence>
      </div>

      {confirmDelete && (
        <ConfirmDialog danger title={`Delete ${plural(confirmDelete.length, 'entry', 'entries')}?`}
          message={`${plural(confirmDelete.length, 'entry', 'entries')} (${formatClock(confirmDelete.reduce((s, e) => s + e.duration, 0))}, ${formatEUR(clientMoney(confirmDelete, cfg).net)} net) will be permanently removed.`}
          confirmLabel="Delete" onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const n = confirmDelete.length;
            onBulkDelete(confirmDelete);
            clearSelection();
            notify(`Deleted ${plural(n, 'entry', 'entries')}.`, 'ok');
          }} />
      )}
      {confirmMark && (
        <ConfirmDialog
          title={markList.length === 0 ? 'Nothing to change'
            : `Mark ${plural(markList.length, 'entry', 'entries')} as ${confirmMark.value ? 'invoiced' : 'unbilled'}?`}
          message={markList.length === 0
            ? `Every shown entry is already ${confirmMark.value ? 'invoiced' : 'unbilled'}.`
            : confirmMark.value
              ? `${plural(markList.length, 'unbilled entry', 'unbilled entries')} in this view (${formatClock(markList.reduce((s, e) => s + e.duration, 0))}, ${formatEUR(clientMoney(markList, cfg).gross)} incl. VAT) will be marked as invoiced. Entries already invoiced stay as they are. You can undo this from the message that follows.`
              : `${plural(markList.length, 'invoiced entry', 'invoiced entries')} in this view (${formatEUR(clientMoney(markList, cfg).gross)} incl. VAT) will be marked as unbilled. You can undo this from the message that follows.`}
          confirmLabel={markList.length === 0 ? 'OK' : confirmMark.value ? 'Mark invoiced' : 'Mark unbilled'}
          onClose={() => setConfirmMark(null)}
          onConfirm={() => { if (markList.length) applyInvoiced(markList, confirmMark.value); }} />
      )}
    </Page>
    </>
  );
}
