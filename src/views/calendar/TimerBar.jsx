import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronDown, ChevronLeft, Pause, Play, Plus, Search, Sparkles, Square, X } from 'lucide-react';
import { AI_FACTOR, entryAiFactor, timerElapsed, validAiFactor } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { formatClock, formatEUR } from '../../lib/format.js';
import { AiFactorPicker } from '../../components/ui/AiFactorPicker.jsx';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { clockHM } from './calendarUtils.js';

const tipKbd = 'border-canvas/25 bg-transparent text-canvas/75';
const itemCls = 'flex h-9 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm text-fg outline-none data-[selected=true]:bg-fg/[0.06]';
const STEPS = { client: 'Client', task: 'Activity', project: 'Project' };
const ring = 'focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
// Round icon buttons, same family as the Timer page: stop is the neutral filled circle, resume the orange one.
const roundBtn = cn('grid size-9 shrink-0 place-items-center rounded-full outline-none transition-[transform,background-color,box-shadow] duration-fast ease-out hover:scale-[1.05] active:scale-[0.96]', ring);
const btnPause = cn(roundBtn, 'bg-surface text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2');
const btnStop = cn(roundBtn, 'bg-primary text-primary-fg hover:bg-primary-hover');
const btnStopSoft = cn(roundBtn, 'bg-surface text-fg-muted ring-1 ring-inset ring-line-strong hover:bg-surface-2 hover:text-fg');
const btnResume = cn(roundBtn, 'bg-brand-soft text-brand-text hover:bg-brand/20');

const titleOf = (t) => t.note || t.task || 'Untitled';
const newest = (list, key) => list.reduce((m, x) => (!m || (x[key] || x.startedAt) > (m[key] || m.startedAt) ? x : m), null);

// Width budget for the bar row (px). The running card (or the field) keeps LEAD_MIN; other timers sit
// next to it only when they fit at their widest, else they get a row of their own. Measured at 1440 px:
// a full chip is at most ~350, a compact one ~295, "+N" ~40, the round button 48, gaps 10.
const GAP = 10;
const ROUND_BTN = 48;
const MORE_W = 44;
const LEAD_MIN = 390;
const CHIP_W = { full: 356, compact: 302 };
function fitBar(rowW, nOthers) {
  const base = LEAD_MIN + GAP + ROUND_BTN;
  for (let k = Math.min(2, nOthers); k >= 1; k--) {
    for (const size of ['full', 'compact']) {
      const more = nOthers > k ? GAP + MORE_W : 0;
      const used = base + k * (CHIP_W[size] + GAP) + more;
      if (used <= rowW) return { inline: k, size, leadW: rowW - used + LEAD_MIN };
    }
  }
  return { inline: 0, size: 'row', leadW: rowW - GAP - ROUND_BTN };
}

// One chip for client, activity and project: [● Client · Activity ▾]. Three short steps in one popover.
// The AI switch sits at the bottom; with AI on, the next timer's factor (aiFactor, null = Default) too.
function ContextChip({ clients, activities, projectsOf, client, task, project, ai, aiFactor, onChange, onDone, compact }) {
  const aiF = validAiFactor(aiFactor) ?? AI_FACTOR;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('client');
  const [query, setQuery] = useState('');
  const q = query.trim();
  const go = (s) => { setStep(s); setQuery(''); };
  const close = () => { setOpen(false); onDone?.(); };
  const projects = projectsOf(client);
  const exact = projects.some(p => p.toLowerCase() === q.toLowerCase());

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) go('client'); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Client, activity and project: ${client} · ${task}${project ? ' · ' + project : ''}`}
          className={cn(
            'group inline-flex h-9 min-w-0 shrink items-center gap-1.5 rounded-lg px-2.5 text-sm outline-none transition-colors duration-fast ease-out',
            'hover:bg-fg/[0.05] focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-fg/[0.06]',
            compact ? 'max-w-[60%]' : 'max-w-[55%]',
          )}>
          <ClientDot client={client} />
          <span className="min-w-0 truncate font-medium text-fg">{client || 'Pick a client'}</span>
          {!compact && task && <><span aria-hidden className="text-fg-faint">·</span><span className="min-w-0 shrink-[2] truncate text-fg-muted">{task}</span></>}
          <ChevronDown className="size-3.5 shrink-0 text-fg-subtle transition-transform duration-base ease-out group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(19rem,calc(100vw-24px))] p-0">
        <Command loop className="flex flex-col" filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
          <div className="flex h-9 items-center gap-1 border-b border-line px-1.5">
            {step !== 'client' && (
              <button type="button" onClick={() => go(step === 'project' ? 'task' : 'client')} aria-label="Back"
                className="grid size-6 place-items-center rounded-md text-fg-subtle outline-none hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60">
                <ChevronLeft className="size-4" />
              </button>
            )}
            <span className="px-1 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">{STEPS[step]}</span>
            <span className="ml-auto flex items-center gap-1 pr-1" aria-hidden>
              {Object.keys(STEPS).map(s => <span key={s} className={cn('size-1.5 rounded-full', s === step ? 'bg-fg-muted' : 'bg-fg/15')} />)}
            </span>
          </div>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 shrink-0 text-fg-subtle" />
            <Command.Input value={query} onValueChange={setQuery} autoFocus
              placeholder={step === 'client' ? 'Find a client…' : step === 'task' ? 'Find an activity…' : 'Find or type a project…'}
              className="h-10 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle" />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1">
            {!(step === 'project' && q) && <Command.Empty className="px-3 py-6 text-center text-sm text-fg-subtle">No matches.</Command.Empty>}
            {step === 'client' && clients.map(c => (
              <Command.Item key={c} value={c} onSelect={() => { onChange({ client: c, project: c === client ? project : '' }); go('task'); }} className={itemCls}>
                <ClientDot client={c} />
                <span className="min-w-0 flex-1 truncate">{c}</span>
                {c === client && <Check className="size-4 text-fg" />}
              </Command.Item>
            ))}
            {step === 'task' && activities.map(t => (
              <Command.Item key={t} value={t} onSelect={() => { onChange({ task: t }); if (projects.length) go('project'); else close(); }} className={itemCls}>
                <span className="min-w-0 flex-1 truncate">{t}</span>
                {t === task && <Check className="size-4 text-fg" />}
              </Command.Item>
            ))}
            {step === 'project' && (
              <>
                {q && !exact && (
                  <Command.Item value={`__custom__${q}`} forceMount onSelect={() => { onChange({ project: q }); close(); }} className={itemCls}>
                    <Plus className="size-4 text-fg-muted" />
                    <span className="truncate">Use “{q}”</span>
                  </Command.Item>
                )}
                <Command.Item value="__none__ No project" onSelect={() => { onChange({ project: '' }); close(); }} className={cn(itemCls, 'text-fg-muted')}>
                  <X className="size-4 text-fg-subtle" />
                  <span className="min-w-0 flex-1 truncate">No project</span>
                  {!project && <Check className="size-4 text-fg" />}
                </Command.Item>
                {projects.map(p => (
                  <Command.Item key={p} value={p} onSelect={() => { onChange({ project: p }); close(); }} className={itemCls}>
                    <span className="min-w-0 flex-1 truncate">{p}</span>
                    {p === project && <Check className="size-4 text-fg" />}
                  </Command.Item>
                ))}
              </>
            )}
          </Command.List>
        </Command>
        <div className="border-t border-line">
          <label className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm text-fg">
            <Sparkles className={cn('size-3.5', ai ? 'text-ai-text' : 'text-fg-subtle')} aria-hidden />
            <span className="min-w-0 flex-1">AI-assisted, bill ×{aiF}</span>
            {/* AI off also drops the picked factor. */}
            <Switch size="sm" tone="ai" checked={!!ai} onCheckedChange={(v) => onChange(v ? { ai: true } : { ai: false, aiFactor: null })} aria-label={`AI-assisted, bill ×${aiF}`} />
          </label>
          {ai && (
            <AiFactorPicker value={aiFactor} onChange={(f) => onChange({ aiFactor: f })} label="AI factor for the next timer" className="-mt-1 px-3 pb-3" />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// What to start next: a note plus the client/activity chip. Shared by the inline field and the "start another" popover.
function useComposer(entries, clients, tasks) {
  const latest = useMemo(() => entries.reduce((m, e) => (!m || e.start > m.start ? e : m), null), [entries]);
  const [note, setNote] = useState('');
  const [ctx, setCtx] = useState(() => ({
    client: latest && clients.includes(latest.client) ? latest.client : clients[0] || '',
    task: latest && tasks.includes(latest.task) ? latest.task : tasks[0] || '',
    project: '',
    ai: false,
    aiFactor: null, // the next timer's own AI factor, null = Default (follow Settings)
  }));
  const projectIndex = useMemo(() => {
    const m = new Map();
    for (const e of [...entries].sort((a, b) => b.start - a.start)) {
      if (!e.project) continue;
      if (!m.has(e.client)) m.set(e.client, []);
      const list = m.get(e.client);
      if (!list.includes(e.project) && list.length < 12) list.push(e.project);
    }
    return m;
  }, [entries]);
  const clientList = useMemo(() => Array.from(new Set([...(clients || []), ...(ctx.client ? [ctx.client] : [])])), [clients, ctx.client]);
  const activityList = useMemo(() => Array.from(new Set([...(tasks || []), ...(ctx.task ? [ctx.task] : [])])), [tasks, ctx.task]);
  return { note, setNote, ctx, setCtx, projectIndex, clientList, activityList, canStart: !!(ctx.client && ctx.task) };
}

function AiTag({ onOff, factor }) {
  const f = validAiFactor(factor) ?? AI_FACTOR;
  return (
    <Tooltip content={`AI-assisted: bills ×${f} of the tracked time. Click to turn off.`}>
      <button type="button" onClick={onOff} aria-label={`AI-assisted ×${f} is on. Turn off`}
        className="group/ai inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-ai-soft pl-2 pr-1.5 text-xs font-medium text-ai-text outline-none transition-colors hover:bg-ai/15 focus-visible:ring-2 focus-visible:ring-ring/60">
        <Sparkles className="size-3.5" /> <span className="tnum">AI ×{f}</span>
        <X className="size-3 opacity-60 group-hover/ai:opacity-100" />
      </button>
    </Tooltip>
  );
}

// The field: [ What are you working on?   ● Client · Activity ▾ ]
const ComposerField = forwardRef(function ComposerField({ c, onSubmit, compact, className }, ref) {
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => inputRef.current);
  const typed = c.note.trim().length > 0;
  return (
    <div
      onMouseDown={(e) => {
        if (e.target.closest('button, input, a, [role=option]')) return;
        e.preventDefault();
        inputRef.current?.focus();
      }}
      className={cn(
        'flex h-12 min-w-0 flex-1 cursor-text items-center gap-1 rounded-xl bg-canvas pl-4 pr-1.5 ring-1 ring-inset ring-line-strong/70',
        'transition-[background-color,box-shadow] duration-fast ease-out hover:ring-line-strong',
        'focus-within:bg-surface focus-within:shadow-focus focus-within:ring-ring/60 hover:focus-within:ring-ring/60',
        className,
      )}>
      <input ref={inputRef} value={c.note} onChange={(e) => c.setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(true); }
          else if (e.key === 'Escape' && c.note) { e.preventDefault(); e.stopPropagation(); c.setNote(''); }
        }}
        placeholder="What are you working on?" aria-label="What are you working on?"
        autoComplete="off" spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent text-md font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-muted" />
      {typed && !compact && (
        <span aria-hidden className="mr-1 hidden shrink-0 items-center gap-1.5 text-xs text-fg-subtle lg:flex"><Kbd>Enter</Kbd> to start</span>
      )}
      {c.ctx.ai && <AiTag factor={c.ctx.aiFactor} onOff={() => c.setCtx(x => ({ ...x, ai: false, aiFactor: null }))} />}
      <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line-strong/80" />
      <ContextChip clients={c.clientList} activities={c.activityList} projectsOf={(cl) => c.projectIndex.get(cl) || []}
        client={c.ctx.client} task={c.ctx.task} project={c.ctx.project} ai={c.ctx.ai} aiFactor={c.ctx.aiFactor} compact={compact}
        onChange={(patch) => c.setCtx(x => ({ ...x, ...patch }))}
        onDone={() => inputRef.current?.focus()} />
    </div>
  );
});

function StartButton({ onClick, disabled, label = 'Start timer' }) {
  return (
    <Tooltip content={label} shortcut={<Kbd className={tipKbd}>Enter</Kbd>}>
      <button type="button" onClick={onClick} aria-label={label} disabled={disabled}
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-full bg-brand text-brand-fg shadow-brand outline-none transition-[background-color,transform,box-shadow] duration-fast ease-out',
          'hover:scale-[1.04] hover:bg-brand-hover active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50', ring,
        )}>
        <Play className="ml-0.5 size-5" fill="currentColor" strokeWidth={0} />
      </button>
    </Tooltip>
  );
}

// The timer that runs now: what it is, the live clock, pause and stop.
// narrow: no project / activity line. tight: no amount next to the start time either.
function RunningCard({ t, now, amountOf, narrow, tight, onPause, onStop, onOpen }) {
  const elapsed = timerElapsed(t, now);
  const title = titleOf(t);
  const meta = [t.project, t.note ? t.task : null].filter(Boolean);
  const amount = amountOf ? amountOf(t, elapsed) : null;
  return (
    <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl bg-canvas pl-4 pr-1.5 ring-1 ring-inset ring-line-strong/70">
      <span className="relative grid size-2.5 shrink-0 place-items-center" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/40 [animation-duration:1.8s]" />
        <span className="size-2.5 rounded-full bg-brand" />
      </span>
      <button type="button" onClick={onOpen} aria-label={`Running: ${title}, ${t.client}. Open the Timer page`}
        className="-my-1 flex min-w-0 flex-1 flex-col rounded-md py-1 text-left leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{title}</span>
          {t.ai && <span className="inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded bg-ai-soft px-1 text-2xs font-semibold text-ai-text"><Sparkles className="size-3" />AI ×{entryAiFactor(t)}</span>}
        </span>
        {/* The client keeps its name (up to the full line); project and activity give way first. */}
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-fg-muted">
          <span className="flex min-w-0 max-w-full shrink-0 items-center gap-1.5">
            <ClientDot client={t.client} size={7} />
            <span className="min-w-0 truncate">{t.client}</span>
          </span>
          {!narrow && meta.map(m => <span key={m} className="flex min-w-0 items-center gap-1.5 overflow-hidden"><span aria-hidden className="text-fg-faint">·</span><span className="min-w-0 truncate">{m}</span></span>)}
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end leading-tight">
        <span className="text-[19px] font-semibold tracking-[-0.01em] text-fg tnum" aria-label={`Elapsed ${formatClock(elapsed)}`}>{formatClock(elapsed)}</span>
        <span className="mt-px whitespace-nowrap text-2xs text-fg-subtle tnum">since {clockHM(t.startedAt)}{amount != null && !tight && <> · {formatEUR(amount)}</>}</span>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 pl-1">
        {onPause && (
          <Tooltip content="Pause">
            <button type="button" onClick={() => onPause(t)} aria-label={`Pause ${title}`} className={btnPause}>
              <Pause className="size-3.5" fill="currentColor" strokeWidth={0} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Stop and save">
          <button type="button" onClick={() => onStop(t)} aria-label={`Stop and save ${title}`} className={btnStop}>
            <Square className="size-3.5" fill="currentColor" strokeWidth={0} />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}

// Any other timer: a smaller chip. Paused ones are dashed, with Resume (orange) and Stop.
// Every size names the timer and its client, so two paused timers never look the same.
// size: 'full' (wide bar), 'compact' (narrower title), 'row' (its own row under a narrow bar, fills it).
function TimerChip({ t, now, size = 'full', onPause, onResume, onStop }) {
  const isRunning = !!t.runningSince;
  const title = titleOf(t);
  const elapsed = timerElapsed(t, now);
  const row = size === 'row';
  return (
    <div className={cn('flex h-12 items-center rounded-xl pl-3 pr-1.5',
      row ? 'min-w-0 flex-1 gap-2.5' : size === 'compact' ? 'shrink-0 gap-2.5' : 'shrink-0 gap-3',
      isRunning ? 'bg-canvas ring-1 ring-inset ring-line-strong/70' : 'border border-dashed border-line-strong bg-canvas/60')}>
      {isRunning
        ? <span aria-hidden className="size-2 shrink-0 animate-pulse-dot rounded-full bg-brand" />
        : <Pause aria-hidden className="size-3.5 shrink-0 fill-current text-warning-text" strokeWidth={0} />}
      <span className={cn('flex min-w-0 flex-col leading-tight', row ? 'flex-1' : size === 'compact' ? 'max-w-[6.5rem]' : 'max-w-[9rem]')}>
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm font-medium text-fg">{title}</span>
          {t.ai && <Sparkles aria-label={`AI-assisted ×${entryAiFactor(t)}`} className="size-3 shrink-0 text-ai-text" />}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
          <ClientDot client={t.client} size={7} /><span className="truncate">{t.client}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end leading-tight">
        <span className={cn('text-md font-semibold tnum', isRunning ? 'text-fg' : 'text-fg-muted')}>{formatClock(elapsed)}</span>
        <span className={cn('mt-px text-2xs font-medium', isRunning ? 'text-fg-subtle' : 'text-warning-text')}>{isRunning ? 'Running' : 'Paused'}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {isRunning ? (
          onPause && (
            <Tooltip content={`Pause ${title}`}>
              <button type="button" onClick={() => onPause(t)} aria-label={`Pause ${title}`} className={btnPause}>
                <Pause className="size-3.5" fill="currentColor" strokeWidth={0} />
              </button>
            </Tooltip>
          )
        ) : (
          onResume && (
            <Tooltip content={`Resume ${title}`}>
              <button type="button" onClick={() => onResume(t)} aria-label={`Resume ${title}`} className={btnResume}>
                <Play className="ml-px size-3.5" fill="currentColor" strokeWidth={0} />
              </button>
            </Tooltip>
          )
        )}
        {onStop && (
          <Tooltip content={`Stop and save ${title}`}>
            <button type="button" onClick={() => onStop(t)} aria-label={`Stop and save ${title}`} className={isRunning ? btnStop : btnStopSoft}>
              <Square className="size-3.5" fill="currentColor" strokeWidth={0} />
            </button>
          </Tooltip>
        )}
      </span>
    </div>
  );
}

// Top bar of the Calendar. Nothing running: [ What are you working on? ● Client · Activity ▾ ] (▶).
// A timer running: [● Title  client · project   1:12:18  (❚❚) (■)] [❚❚ paused chip] (+ start another).
export const TimerBar = forwardRef(function TimerBar({
  entries, clients, tasks, activeTimers = [], now, amountOf, onStart, onPause, onResume, onStop, onNavigate,
}, ref) {
  const rowRef = useRef(null);
  const fieldRef = useRef(null);
  const [w, setW] = useState(1000);
  const [anotherOpen, setAnotherOpen] = useState(false);
  const c = useComposer(entries, clients || [], tasks || []);

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const measure = () => setW(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const timers = activeTimers.filter(t => t && Number.isFinite(t.startedAt));
  const primary = newest(timers.filter(t => t.runningSince), 'runningSince');
  const others = timers.filter(t => t !== primary)
    .sort((a, b) => (!!b.runningSince - !!a.runningSince) || (b.startedAt - a.startedAt));
  // The field (or the running card) first, then up to two chips and a "+N", as many as fit next to it
  // (see fitBar). When not even one fits, the other timers get a row of their own (two at most).
  const fit = fitBar(w, others.length);
  const ownRow = fit.size === 'row';
  const shown = others.slice(0, ownRow ? 2 : fit.inline);
  const hidden = others.length - shown.length;
  const chipSize = fit.size;
  const narrow = fit.leadW < 560; // card: drop the project / activity line; field: shorter chip
  const tight = fit.leadW < 430; // card: drop the amount as well

  const start = (viaKeyboard) => {
    if (!c.canStart || !onStart) return;
    onStart({ client: c.ctx.client, task: c.ctx.task, project: c.ctx.project, note: c.note.trim(), ai: !!c.ctx.ai, aiFactor: c.ctx.ai ? c.ctx.aiFactor : null }, { applyAi: true });
    c.setNote('');
    c.setCtx(x => ({ ...x, ai: false, aiFactor: null }));
    setAnotherOpen(false);
    if (viaKeyboard) fieldRef.current?.blur();
  };

  // N from the Calendar: focus the field, or open "start another" while a timer runs.
  useImperativeHandle(ref, () => ({
    focusNew: () => { if (primary) setAnotherOpen(true); else fieldRef.current?.focus(); },
  }), [primary]);

  const chips = shown.map(t => (
    <TimerChip key={t.id} t={t} now={now} size={chipSize} onPause={onPause} onResume={onResume} onStop={onStop} />
  ));
  const more = hidden > 0 && (
    <Tooltip content="See every timer on the Timer page">
      <button type="button" onClick={() => onNavigate?.('track')} aria-label={`${hidden} more timers. Open the Timer page`}
        className="grid h-12 shrink-0 place-items-center rounded-xl px-3 text-sm font-medium text-fg-muted outline-none ring-1 ring-inset ring-line-strong/70 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60">
        +{hidden}
      </button>
    </Tooltip>
  );

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-2 px-5 py-3 sm:px-8">
        <div ref={rowRef} className="flex min-w-0 items-center gap-2.5">
          {primary ? (
            <RunningCard t={primary} now={now} amountOf={amountOf} narrow={narrow} tight={tight} onPause={onPause} onStop={onStop} onOpen={() => onNavigate?.('track')} />
          ) : (
            <ComposerField ref={fieldRef} c={c} onSubmit={start} compact={narrow} />
          )}
          {!ownRow && chips}
          {!ownRow && more}
          {primary ? (
            <Popover open={anotherOpen} onOpenChange={setAnotherOpen}>
              <Tooltip content="Start another timer" shortcut={<Kbd className={tipKbd}>N</Kbd>}>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="Start another timer"
                    className={cn('grid size-12 shrink-0 place-items-center rounded-full bg-surface text-fg-muted shadow-xs outline-none ring-1 ring-inset ring-line-strong transition-[background-color,color,transform] duration-fast ease-out hover:bg-surface-2 hover:text-fg active:scale-[0.97] data-[state=open]:bg-surface-2 data-[state=open]:text-fg', ring)}>
                    <Plus className="size-5" />
                  </button>
                </PopoverTrigger>
              </Tooltip>
              <PopoverContent align="end" sideOffset={8} className="w-[min(30rem,calc(100vw-24px))] p-0"
                onOpenAutoFocus={(e) => { e.preventDefault(); fieldRef.current?.focus(); }}>
                <div className="px-4 pb-2 pt-3.5">
                  <div className="text-sm font-semibold text-fg">Start another timer</div>
                  <div className="mt-0.5 text-xs text-fg-subtle">It runs next to {titleOf(primary)}.</div>
                </div>
                <div className="flex items-center gap-2 px-4 pb-4 pt-1">
                  <ComposerField ref={fieldRef} c={c} onSubmit={start} compact />
                  <StartButton onClick={() => start(false)} disabled={!c.canStart || !onStart} />
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <StartButton onClick={() => start(false)} disabled={!c.canStart || !onStart} />
          )}
        </div>
        {ownRow && shown.length > 0 && (
          <div className="flex min-w-0 items-center gap-2.5">
            {chips}
            {more}
          </div>
        )}
      </div>
    </div>
  );
});
