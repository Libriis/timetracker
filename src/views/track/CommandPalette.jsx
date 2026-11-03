import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { CornerDownLeft, Maximize2, Pause, Play, Plus, Search, Square, Timer } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { timerForWork, workKey, workTitle } from './trackData.js';

// ⌘K / Ctrl+K / K palette: type a few letters of any recent work and press Enter to start it.
// Ported from the 21st.dev "Command Menu" (uvain, Layro System): cmdk inside a Radix dialog.
//
// Enter never stops anything by surprise. The order on screen is the order of the groups below
// (cmdk 1.1 sorts rows inside a group, not the groups themselves):
//   1. Work: start it, or resume it if it sits paused on a timer, or open it if it is already running.
//   2. Running timers (pause, stop and save, focus mode): below the work, unless you type a verb
//      such as "stop", "pause", "resume" or "focus", which moves them to the top.
//   3. Actions: new timer, past entry.
const groupCls = 'py-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-fg-subtle';
const itemCls = 'group flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg outline-none data-[selected=true]:bg-fg/[0.06] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle';
const match = (value, search, keywords) => {
  const hay = (keywords || []).join(' ').toLowerCase();
  // Every word must appear somewhere: "tatra grade" finds "Color grade · Tatra Outdoor".
  return search.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w)) ? 1 : 0;
};
const VERBS = ['stop', 'save', 'pause', 'resume', 'focus'];
const wantsControl = (s) => s.toLowerCase().split(/\s+/).some(w => w.length >= 3 && VERBS.some(v => v.startsWith(w)));

// What Enter does on the highlighted row, said in the footer.
const ACTION_TEXT = {
  start: ['start', 'Starts a new timer. Running timers keep going.'],
  resume: ['resume', 'Resumes the paused timer for this work.'],
  open: ['open', 'Already running. Opens it in focus mode.'],
  pause: ['pause', 'Pauses the timer. The break is not billed.'],
  stop: ['stop', 'Stops the timer and saves the entry.'],
  focus: ['open', 'Opens the timer full screen.'],
  new: ['go', 'Moves to the timer field.'],
  manual: ['open', 'Adds a past entry by hand.'],
};

function Item({ icon, children, hint, shortcut, className, ...props }) {
  return (
    <Command.Item className={cn(itemCls, className)} {...props}>
      {icon}
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{children}</span>
        {hint && <span className="truncate text-xs text-fg-subtle">{hint}</span>}
      </span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange, recentWork, timers, primaryId, onStartWork, onNewTimer, onManual, onFocus, onPause, onResume, onStop }) {
  // Idle: the 40 newest pieces of work. Typing searches every piece of work ever logged.
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  // One Enter (or click) = one action. The first one locks the palette until it opens again: while it
  // fades out the list resets to recent work, so a second Enter (a fast double press or a held key)
  // would otherwise run the first row of that list.
  const done = useRef(false);
  useEffect(() => { if (open) done.current = false; else { setSearch(''); setSelected(''); } }, [open]);
  // Work that is on a timer right now: resume it (paused) or open it (running), never a second copy.
  // Same rule as the rows and Start (timerForWork): a running copy wins over a paused one.
  const onTimer = useMemo(() => new Map(timers.map(t => [workKey(t), timerForWork(timers, t)])), [timers]);
  // While searching, paused timers come first as Resume rows: typing a paused timer's name and pressing
  // Enter picks it up again. Running ones stay in history order (Enter on them only opens them).
  const work = useMemo(() => {
    if (!search.trim()) return recentWork.slice(0, 40);
    const paused = timers.filter(t => !t.runningSince).map(t => ({ id: `timer-${t.id}`, client: t.client, task: t.task, project: t.project || '', note: t.note || '', ai: !!t.ai }));
    const keys = new Set(paused.map(workKey));
    return [...paused, ...recentWork.filter(w => !keys.has(workKey(w)))];
  }, [search, recentWork, timers]);
  // Every action closes the palette first. Focus then stays on the page (not on the button that opened
  // the palette), so Space pauses the timer instead of pressing that button again.
  const afterClose = useRef(null);
  const run = (fn) => () => { if (done.current) return; done.current = true; afterClose.current = () => {}; onOpenChange(false); fn(); };
  // "New timer" moves focus to the composer, so it has to wait until the dialog hands focus back.
  const later = (fn) => () => { if (done.current) return; done.current = true; afterClose.current = fn; onOpenChange(false); };
  // A held Enter repeats, and Enter after the first action is swallowed: cmdk skips a prevented key.
  const onKeyDown = (e) => { if (e.key === 'Enter' && (e.repeat || done.current)) { e.preventDefault(); e.stopPropagation(); } };
  const primary = timers.find(t => t.id === primaryId);
  const controlsFirst = wantsControl(search);

  const actionOf = (value) => {
    if (!value) return 'start';
    if (value.startsWith('work:')) return value.split(':')[1];
    if (value.startsWith('stop:')) return 'stop';
    if (value.startsWith('pause:')) return value.split(':')[1];
    return value.replace('act:', '');
  };
  const [enterVerb, enterHint] = ACTION_TEXT[actionOf(selected)] || ACTION_TEXT.start;

  // No work yet (a fresh install): no group, so no empty heading above the actions.
  const workGroup = work.length > 0 && (
    <Command.Group key="work" heading={search.trim() ? 'Work' : 'Recent work'} className={groupCls}>
      {work.map(w => {
        const t = onTimer.get(workKey(w));
        const kind = !t ? 'start' : t.runningSince ? 'open' : 'resume';
        const select = kind === 'start' ? () => onStartWork(w) : kind === 'resume' ? () => onResume(t.id) : () => onFocus(t.id);
        return (
          <Command.Item key={w.id} value={`work:${kind}:${w.id}`} keywords={[w.note || '', w.task, w.client, w.project || '']} onSelect={run(select)} className={itemCls}>
            <ClientDot client={w.client} />
            <span className="grid min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{workTitle(w)}</span>
                {kind === 'open' && <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-px text-2xs font-semibold text-brand-text">Running</span>}
                {kind === 'resume' && <span className="shrink-0 rounded-full bg-warning-soft px-1.5 py-px text-2xs font-semibold text-warning-text">Paused</span>}
              </span>
              <span className="truncate text-xs text-fg-subtle">{w.client}{w.project ? ` · ${w.project}` : ''}{w.note ? ` · ${w.task}` : ''}</span>
            </span>
            <span aria-hidden className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle opacity-0 group-data-[selected=true]:opacity-100">
              {kind === 'open'
                ? <><Maximize2 className="!size-3" /> Open</>
                : <><Play className="!size-3 !text-brand-text" fill="currentColor" strokeWidth={0} /> {kind === 'resume' ? 'Resume' : 'Start'}</>}
            </span>
          </Command.Item>
        );
      })}
    </Command.Group>
  );

  const controlsGroup = timers.length > 0 && (
    <Command.Group key="controls" heading="Running timers" className={groupCls}>
      {timers.map(t => (
        <Item key={'p' + t.id} value={`pause:${t.runningSince ? 'pause' : 'resume'}:${t.id}`} keywords={[t.runningSince ? 'pause' : 'resume', workTitle(t), t.client]}
          icon={t.runningSince ? <Pause fill="currentColor" strokeWidth={0} /> : <Play fill="currentColor" strokeWidth={0} />}
          shortcut={t.id === primaryId ? 'Space' : undefined} hint={`${t.client}${t.project ? ' · ' + t.project : ''}`}
          onSelect={run(() => (t.runningSince ? onPause : onResume)(t.id))}>
          {t.runningSince ? 'Pause' : 'Resume'}: {workTitle(t)}
        </Item>
      ))}
      {timers.map(t => (
        <Item key={t.id} value={`stop:${t.id}`} keywords={['stop', 'save', workTitle(t), t.client, t.task, t.project || '']} icon={<Square fill="currentColor" strokeWidth={0} className="!size-3.5" />}
          shortcut={t.id === primaryId ? 'S' : undefined} hint={`${t.client}${t.project ? ' · ' + t.project : ''}`} onSelect={run(() => onStop(t.id))}>
          Stop and save: {workTitle(t)}
        </Item>
      ))}
      {primary && (
        <Item value="act:focus" keywords={['focus mode', 'full screen', workTitle(primary), primary.client]} icon={<Maximize2 />} shortcut="F"
          hint={`${workTitle(primary)} · ${primary.client}`} onSelect={run(() => onFocus(primary.id))}>Focus mode</Item>
      )}
    </Command.Group>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(10_10_14/0.38)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content aria-describedby={undefined}
          onCloseAutoFocus={(e) => { if (afterClose.current) { e.preventDefault(); const fn = afterClose.current; afterClose.current = null; fn(); } }}
          className={cn(
            'fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface-raised text-fg shadow-xl outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]',
          )}>
          <DialogPrimitive.Title className="sr-only">Start recent work</DialogPrimitive.Title>
          <Command loop filter={match} label="Start recent work" value={selected} onValueChange={setSelected} onKeyDown={onKeyDown}>
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
              <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder="Start recent work, or type stop, pause, focus…"
                className="h-12 w-full bg-transparent text-md text-fg outline-none placeholder:text-fg-subtle" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">No matching work. Press Esc and type it in the timer.</Command.Empty>
              {controlsFirst ? [controlsGroup, workGroup] : [workGroup, controlsGroup]}
              <Command.Group heading="Actions" className={groupCls}>
                <Item value="act:new" keywords={['new timer', 'start', 'type']} icon={<Timer />} shortcut="N" onSelect={later(onNewTimer)}>New timer</Item>
                <Item value="act:manual" keywords={['add past entry', 'manual', 'by hand']} icon={<Plus />} shortcut="M" onSelect={run(onManual)}>Add a past entry by hand</Item>
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-2xs text-fg-subtle">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
              <span className="flex items-center gap-1.5"><Kbd><CornerDownLeft className="size-3" /></Kbd> {enterVerb}</span>
              <span className="ml-auto truncate">{enterHint}</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
