import { useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronDown, ChevronLeft, Play, Plus, Search, Sparkles, Square, X } from 'lucide-react';
import { AI_FACTOR } from '../../../lib/billing.js';
import { cn } from '../../../lib/cn.js';
import { formatTime } from '../../../lib/format.js';
import { ClientDot } from '../../../components/ui/Badge.jsx';
import { Kbd } from '../../../components/ui/Kbd.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';

// Sticky height of this bar (py-3 + h-12 + 1px border). Day headers stick right below it.
export const START_BAR_H = 73;
const tipKbd = 'border-canvas/25 bg-transparent text-canvas/75';
const itemCls = 'flex h-9 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm text-fg outline-none data-[selected=true]:bg-fg/[0.06]';
const STEPS = { client: 'Client', task: 'Activity', project: 'Project' };

// One chip for client, activity and project: [● Client · Activity ▾]. Three short steps in one popover.
function ContextChip({ clients, activities, projectsOf, client, task, project, ai, onChange, onDone }) {
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
            'group inline-flex h-9 min-w-0 max-w-[48%] shrink items-center lg:max-w-[55%] gap-1.5 rounded-lg px-2.5 text-sm outline-none transition-colors duration-fast ease-out',
            'hover:bg-fg/[0.05] focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-fg/[0.06]',
          )}>
          <ClientDot client={client} />
          <span className="min-w-0 truncate font-medium text-fg">{client}</span>
          <span aria-hidden className="text-fg-faint">·</span>
          <span className="min-w-0 shrink-[2] truncate text-fg-muted">{task}</span>
          {project && <><span aria-hidden className="hidden text-fg-faint lg:inline">·</span><span className="hidden min-w-0 shrink-[3] truncate text-fg-subtle lg:inline">{project}</span></>}
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
            <span className="ml-auto flex items-center gap-1 pr-1 text-2xs text-fg-subtle tnum" aria-hidden>
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
        <label className="flex cursor-pointer items-center gap-2 border-t border-line px-3 py-2.5 text-sm text-fg">
          <Sparkles className={cn('size-3.5', ai ? 'text-ai-text' : 'text-fg-subtle')} aria-hidden />
          <span className="min-w-0 flex-1">AI-assisted, bill ×{AI_FACTOR}</span>
          <Switch size="sm" tone="ai" checked={!!ai} onCheckedChange={(v) => onChange({ ai: !!v })} aria-label={`AI-assisted, bill ×${AI_FACTOR}`} />
        </label>
      </PopoverContent>
    </Popover>
  );
}

// The timer that is on now: what it is, since when, and a stop button. The ticking clock stays in the
// sidebar (one clock per timer per screen), so this shows the start time instead.
function RunningNow({ timers, onStop, onNavigate }) {
  // The newest running timer (the one just started here), else the newest paused one.
  const newest = (list) => list.reduce((m, x) => (!m || (x.runningSince || x.startedAt) > (m.runningSince || m.startedAt) ? x : m), null);
  const t = newest(timers.filter(x => x.runningSince)) || newest(timers);
  const isRunning = !!t.runningSince;
  const more = timers.length - 1;
  const title = t.note || t.task;
  const where = `${t.client} · ${isRunning ? 'since' : 'paused, started'} ${formatTime(t.startedAt)}`;
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 rounded-xl bg-canvas pl-1 pr-1.5 ring-1 ring-inset ring-line-strong/70">
      <Tooltip content={more > 0 ? `${timers.length} timers. Open the Timer page.` : 'Open the Timer page'}>
        <button type="button" onClick={() => onNavigate?.('track')}
          aria-label={`${isRunning ? 'Running' : 'Paused'}: ${title}, ${where}.${more > 0 ? ` ${more} more.` : ''} Open the Timer page.`}
          className="flex h-10 min-w-0 items-center gap-2.5 rounded-lg px-2 text-left outline-none transition-colors duration-fast hover:bg-fg/[0.04] focus-visible:ring-2 focus-visible:ring-ring/60">
          <span className="relative grid size-2.5 shrink-0 place-items-center" aria-hidden>
            {isRunning && <span className="absolute inset-0 rounded-full bg-brand/40 animate-ping [animation-duration:1.8s]" />}
            <span className={cn('size-2.5 rounded-full', isRunning ? 'bg-brand' : 'bg-warning')} />
          </span>
          <span className="hidden min-w-0 max-w-[13rem] flex-col leading-tight min-[1180px]:flex">
            <span className="truncate text-sm font-medium text-fg">{title}</span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-fg-subtle">
              <span className="truncate">{where}</span>
              {more > 0 && <span className="shrink-0 rounded-full bg-fg/[0.07] px-1.5 text-2xs font-medium text-fg-muted tnum">+{more}</span>}
            </span>
          </span>
          <span className="text-xs font-medium text-fg-muted min-[1180px]:hidden">{isRunning ? 'Live' : 'Paused'}{more > 0 ? ` +${more}` : ''}</span>
        </button>
      </Tooltip>
      <Tooltip content="Stop and save">
        {/* A double click must not stop the next timer that slides into this spot. */}
        <button type="button" onClick={(ev) => { if (ev.detail <= 1) onStop(t); }} aria-label={`Stop and save ${title}`}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-fg outline-none transition-[transform,background-color] duration-fast ease-out hover:scale-[1.05] hover:bg-primary-hover active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
          <Square className="size-3.5" fill="currentColor" strokeWidth={0} />
        </button>
      </Tooltip>
    </div>
  );
}

// Top bar of the Log: start a timer without leaving the list, and stop the one that runs.
// [ What are you working on?   ● Client · Activity ▾ ] (▶)  [● Running … (■)]
export function StartBar({ entries, clients, activities, activeTimers = [], onStart, onStop, onNavigate }) {
  const inputRef = useRef(null);
  const latest = useMemo(() => entries.reduce((m, e) => (!m || e.start > m.start ? e : m), null), [entries]);
  const [note, setNote] = useState('');
  const [ctx, setCtx] = useState(() => ({
    client: latest?.client || clients[0] || '',
    task: latest?.task || activities[0] || '',
    project: '',
    ai: false,
  }));
  // Recent projects per client, newest first.
  const projectIndex = useMemo(() => {
    const m = new Map();
    const sorted = [...entries].sort((a, b) => b.start - a.start);
    for (const e of sorted) {
      if (!e.project) continue;
      if (!m.has(e.client)) m.set(e.client, []);
      const list = m.get(e.client);
      if (!list.includes(e.project) && list.length < 12) list.push(e.project);
    }
    return m;
  }, [entries]);
  const clientList = useMemo(() => Array.from(new Set([...(clients || []), ...(ctx.client ? [ctx.client] : [])])), [clients, ctx.client]);
  const activityList = useMemo(() => Array.from(new Set([...(activities || []), ...(ctx.task ? [ctx.task] : [])])), [activities, ctx.task]);
  const canStart = !!(ctx.client && ctx.task && onStart);
  const typed = note.trim().length > 0;

  const start = (viaKeyboard) => {
    if (!canStart) return;
    onStart({ client: ctx.client, task: ctx.task, project: ctx.project, note: note.trim(), ai: !!ctx.ai });
    setNote('');
    setCtx(c => ({ ...c, ai: false }));
    if (viaKeyboard) inputRef.current?.blur();
  };

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-2.5 px-5 py-3 sm:px-8">
        <div
          onMouseDown={(e) => {
            if (!e.currentTarget.contains(e.target)) return;
            if (e.target.closest('button, input, a, [role=option]')) return;
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            'flex h-12 min-w-0 flex-1 cursor-text items-center gap-1 rounded-xl bg-canvas pl-4 pr-1.5 ring-1 ring-inset ring-line-strong/70',
            'transition-[background-color,box-shadow] duration-fast ease-out hover:ring-line-strong',
            'focus-within:bg-surface focus-within:shadow-focus focus-within:ring-ring/60 hover:focus-within:ring-ring/60',
          )}>
          <input ref={inputRef} value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (!e.repeat) start(true); }
              else if (e.key === 'Escape') { e.preventDefault(); if (note) setNote(''); else e.currentTarget.blur(); }
            }}
            placeholder="What are you working on?" aria-label="What are you working on?"
            autoComplete="off" spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-md font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-muted" />
          {typed && (
            <span aria-hidden className="mr-1 hidden shrink-0 items-center gap-1.5 text-xs text-fg-subtle md:flex">
              <Kbd>Enter</Kbd> to start
            </span>
          )}
          {ctx.ai && (
            <Tooltip content={`AI-assisted: bills ×${AI_FACTOR} of the tracked time. Click to turn off.`}>
              <button type="button" onClick={() => setCtx(c => ({ ...c, ai: false }))} aria-label={`AI-assisted ×${AI_FACTOR} is on. Turn off`}
                className="group/ai inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-ai-soft pl-2 pr-1.5 text-xs font-medium text-ai-text outline-none transition-colors hover:bg-ai/15 focus-visible:ring-2 focus-visible:ring-ring/60">
                <Sparkles className="size-3.5" /> <span className="tnum">AI ×{AI_FACTOR}</span>
                <X className="size-3 opacity-60 group-hover/ai:opacity-100" />
              </button>
            </Tooltip>
          )}
          <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line-strong/80" />
          <ContextChip clients={clientList} activities={activityList} projectsOf={(c) => projectIndex.get(c) || []}
            client={ctx.client} task={ctx.task} project={ctx.project} ai={ctx.ai}
            onChange={(patch) => setCtx(c => ({ ...c, ...patch }))}
            onDone={() => inputRef.current?.focus()} />
        </div>
        <Tooltip content="Start timer" shortcut={<Kbd className={tipKbd}>Enter</Kbd>}>
          <button type="button" onClick={(ev) => { if (ev.detail <= 1) start(false); }} aria-label="Start timer" disabled={!canStart}
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-full bg-brand text-brand-fg shadow-brand outline-none transition-[background-color,transform,box-shadow] duration-fast ease-out',
              'hover:scale-[1.04] hover:bg-brand-hover active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              'disabled:pointer-events-none disabled:opacity-50',
            )}>
            <Play className="ml-0.5 size-5" fill="currentColor" strokeWidth={0} />
          </button>
        </Tooltip>
        {activeTimers.length > 0 && onStop && (
          <>
            <span aria-hidden className="mx-0.5 hidden h-8 w-px shrink-0 bg-line sm:block" />
            <RunningNow timers={activeTimers} onStop={onStop} onNavigate={onNavigate} />
          </>
        )}
      </div>
    </div>
  );
}
