import { useMemo, useRef } from 'react';
import { ArrowRight, Clock3, CopyPlus, Maximize2, MoreHorizontal, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { billingTotals, calcEarnings, calcStandardValue, entryAiFactor, getRate } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { formatClock, formatEUR, formatTime, isoDay, UI_LOCALE } from '../../lib/format.js';
import { Badge, ClientDot } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { workKey } from './trackData.js';
import { WorkMeta } from './WorkMeta.jsx';

// One column grid for day headers and entry rows: [what | money | duration | actions].
// Money and duration are fixed-width, right-aligned, tabular, so every figure lines up down the page.
// Duration is the one bold figure; money sits beside it, muted. At rest a row shows only those two
// figures; the time range and rate, and the play button, come in on hover or keyboard focus.
export const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_84px_72px_68px] gap-x-3 sm:grid-cols-[minmax(0,1fr)_92px_80px_72px] sm:gap-x-4';

function dayLabel(key) {
  const d = new Date(key + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  const date = d.toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
  if (diff === 0) return { title: 'Today', sub: date };
  if (diff === 1) return { title: 'Yesterday', sub: date };
  if (diff === -1) return { title: 'Tomorrow', sub: date };
  const thisYear = d.getFullYear() === today.getFullYear();
  return { title: d.toLocaleDateString(UI_LOCALE, { weekday: 'long' }), sub: d.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) }) };
}

// Entries in the chosen range (default: the last seven days), grouped by day, newest first.
// range: { from: Date, to: Date } (whole days) or null for everything.
// timers: the live timers, so each row knows if its exact work is running or paused right now.
export function RecentEntries({ entries, range, isDefaultRange = true, onResetRange, rates, clientRates, rounding, clientRounding, timers = [], onEdit, onDelete, onResume, onCopy, onOpenLog, onAddManualEntry }) {
  // work key -> 'running' | 'paused' (running wins when the same work sits on two timers).
  const onClock = useMemo(() => {
    const m = new Map();
    for (const t of timers) { const k = workKey(t); if (t.runningSince) m.set(k, 'running'); else if (!m.has(k)) m.set(k, 'paused'); }
    return m;
  }, [timers]);
  const groups = useMemo(() => {
    const from = range ? new Date(range.from).setHours(0, 0, 0, 0) : -Infinity;
    const to = range ? new Date(range.to).setHours(24, 0, 0, 0) : Infinity;
    const map = new Map();
    entries.filter(e => e.start >= from && e.start < to).sort((a, b) => b.start - a.start).forEach(e => {
      const k = isoDay(new Date(e.start));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ e, eur: calcEarnings(e, rates, clientRates, rounding, clientRounding), std: e.free ? calcStandardValue(e, rates, clientRates, rounding, clientRounding) : 0, rate: getRate(e.client, e.task, rates, clientRates) });
    });
    // Day totals follow the money rule: billingTotals (net), the same cents as the Log and reports.
    return [...map.entries()].map(([key, list]) => ({
      key, list,
      ms: list.reduce((s, r) => s + r.e.duration, 0),
      net: billingTotals(list.map(r => r.e), { rates, clientRates, vat: 0, clientVat: {}, rounding, clientRounding }).net,
    }));
  }, [entries, range, rates, clientRates, rounding, clientRounding]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface/60">
        <EmptyState icon={<Clock3 />} title={isDefaultRange ? 'Nothing tracked this week' : 'Nothing tracked in these days'}
          description={isDefaultRange ? 'Start the timer above, or add a past entry by hand. Your last seven days show up here.' : 'Pick other days with the arrows, or go back to the last seven days.'}
          action={(
            <>
              {!isDefaultRange && onResetRange && <Button variant="secondary" size="sm" onClick={onResetRange}>Show the last 7 days</Button>}
              {isDefaultRange && onAddManualEntry && <Button variant="secondary" size="sm" onClick={onAddManualEntry}><Plus /> Add a past entry</Button>}
              {onOpenLog && <Button variant="ghost" size="sm" onClick={onOpenLog}>Open the full log <ArrowRight /></Button>}
            </>
          )} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(({ key, list, ms, net }) => {
        const { title, sub } = dayLabel(key);
        return (
          <section key={key} aria-label={`${title}, ${sub}`} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <header className={cn(ROW_GRID, 'items-baseline border-b border-line bg-surface-2/70 py-2.5 pl-4 pr-3')}>
              <div className="flex min-w-0 items-baseline gap-2">
                <h3 className="text-sm font-semibold text-fg">{title}</h3>
                <span className="truncate text-xs text-fg-subtle">{sub}</span>
                <span className="hidden text-xs text-fg-subtle sm:inline">· {list.length} {list.length === 1 ? 'entry' : 'entries'}</span>
              </div>
              <div className="text-right text-sm text-fg-subtle tnum" title="Billable amount this day (net)">{formatEUR(net)}</div>
              <div className="text-right text-sm font-semibold text-fg tnum" title="Time tracked this day">{formatClock(ms)}</div>
              <span aria-hidden />
            </header>
            <ul className="divide-y divide-line">
              {list.map(({ e, eur: amount, std, rate }) => (
                <EntryRow key={e.id} e={e} amount={amount} std={std} rate={rate} clock={onClock.get(workKey(e))}
                  onEdit={onEdit} onDelete={onDelete} onResume={onResume} onCopy={onCopy} />
              ))}
            </ul>
          </section>
        );
      })}
      {onOpenLog && (
        <div className="flex justify-center pt-1">
          <Button variant="ghost" size="sm" onClick={onOpenLog}>See all entries in the log <ArrowRight /></Button>
        </div>
      )}
    </div>
  );
}

// Continue: a real round button. Quiet outline at rest, orange (start) on hover.
// When this exact work is already on a timer, the button says so and never starts a copy:
// paused, it reads as Resume (soft orange, like the card's own resume); running, it shows a live dot
// and only points at the running card.
const continueBase = cn(
  'grid size-8 shrink-0 place-items-center rounded-full outline-none',
  'transition-[background-color,color,box-shadow,transform] duration-fast ease-out active:scale-[0.94]',
  'focus-visible:ring-2 focus-visible:ring-ring/70',
);
// Idle rows show the button on hover or focus only (one quiet column at rest). Paused and running keep it:
// there it is a status, not just an action.
const continueCls = {
  idle: cn(continueBase, 'bg-surface text-fg-muted opacity-0 ring-1 ring-inset ring-line-strong/70 transition-[background-color,color,box-shadow,transform,opacity] group-focus-within:opacity-100 group-hover:text-fg group-hover:opacity-100 group-hover:ring-line-strong focus-visible:opacity-100 hover:!bg-brand hover:!text-brand-fg hover:!ring-brand'),
  paused: cn(continueBase, 'bg-brand-soft text-brand-text hover:bg-brand/20'),
  running: cn(continueBase, 'bg-surface ring-1 ring-inset ring-brand/40 hover:bg-brand-soft'),
};
const CONTINUE = {
  idle: { tip: 'Continue this work', hint: '', item: 'Continue' },
  paused: { tip: 'Paused on a timer. Resume it', hint: '. Resumes the paused timer', item: 'Resume the paused timer' },
  running: { tip: 'Already running. Show it', hint: '. Already running, shows the timer', item: 'Show the running timer' },
};

function EntryRow({ e, amount, std, rate, clock, onEdit, onDelete, onResume, onCopy }) {
  const state = clock || 'idle';
  const c = CONTINUE[state];
  // A start from the ⋯ menu must not hand focus back to the ⋯ button: Space would open the menu again
  // instead of pausing the timer that just started.
  const started = useRef(false);
  const startFromMenu = (fn) => () => { started.current = true; fn(e); };
  return (
    <li className={cn(ROW_GRID, 'group relative grid-rows-[auto_auto] items-baseline gap-y-0.5 py-2.5 pl-4 pr-3 transition-colors hover:bg-surface-2/70')}>
      {/* Line 1: what · money · duration (the bold one). */}
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 self-center">
        <span className={cn('truncate text-base', e.note ? 'font-medium text-fg' : 'text-fg-subtle')}>{e.note || 'No description'}</span>
        {e.ai && <Badge variant="ai"><Sparkles />AI ×{entryAiFactor(e)}</Badge>}
        {e.free && <Badge variant="free">Free</Badge>}
        {e.invoiced && <Badge variant="invoiced">Invoiced</Badge>}
      </div>
      <div className={cn('col-start-2 row-start-1 text-right text-sm text-fg-subtle tnum', e.free && 'line-through decoration-fg-faint')}
        title={e.free ? `Free: would bill ${formatEUR(std)}` : 'Billable amount (net)'}>{formatEUR(e.free ? std : amount)}</div>
      <div className="col-start-3 row-start-1 text-right text-md font-semibold text-fg tnum">{formatClock(e.duration)}</div>
      {/* Line 2: who (the activity never truncates). Under the figures, on hover or focus only: time range and rate. */}
      <div className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 text-sm">
        <ClientDot client={e.client} size={7} />
        <WorkMeta client={e.client} project={e.project} task={e.task} />
      </div>
      <div className="col-span-2 col-start-2 row-start-2 truncate text-right text-xs text-fg-subtle opacity-0 transition-opacity duration-fast tnum group-focus-within:opacity-100 group-hover:opacity-100">
        {formatTime(e.start)}–{formatTime(e.end)}
        <span aria-hidden className="text-fg-faint"> · </span>
        {e.free ? 'free' : `€${rate}/h${e.ai ? ` ×${entryAiFactor(e)}` : ''}`}
      </div>
      <div className="col-start-4 row-span-2 row-start-1 flex items-center justify-end gap-1 self-center">
        {/* Continue is always there (one click to repeat work); the ⋯ menu shows on hover. */}
        <Tooltip content={c.tip}>
          <button type="button" aria-label={`Continue this work: ${e.note || e.task}, ${e.client}${c.hint}`} data-state={state}
            onClick={(ev) => { if (ev.detail > 1) { ev.currentTarget.blur(); return; } onResume(e); }} className={continueCls[state]}>
            {state === 'running'
              ? <span aria-hidden className="size-2 rounded-full bg-brand animate-pulse-dot" />
              : <Play className="ml-px size-3.5" fill="currentColor" strokeWidth={0} />}
          </button>
        </Tooltip>
        <span className="opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="More actions"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent onCloseAutoFocus={(ev) => { if (started.current) { started.current = false; ev.preventDefault(); } }}>
            <DropdownMenuItem onSelect={() => onEdit(e)}><Pencil />Edit entry</DropdownMenuItem>
            <DropdownMenuItem onSelect={startFromMenu(onResume)}>
              {state === 'running' ? <Maximize2 /> : <Play fill="currentColor" strokeWidth={0} />}{c.item}
            </DropdownMenuItem>
            {/* The one way to run identical work twice: said out loud, never by accident. */}
            {state !== 'idle' && onCopy && (
              <DropdownMenuItem onSelect={startFromMenu(onCopy)}><CopyPlus />Start another copy</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={() => onDelete(e)}><Trash2 />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </span>
      </div>
    </li>
  );
}
