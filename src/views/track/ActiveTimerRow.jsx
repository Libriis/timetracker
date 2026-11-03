import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { Maximize2, MoreHorizontal, Pause, Pencil, Play, Sparkles, Square } from 'lucide-react';
import { AI_FACTOR, aiAdjusted } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { clientColor } from '../../lib/colors.js';
import { LONG_TIMER_WARN_MS } from '../../lib/constants.js';
import { formatClock, formatEUR, formatHours, formatTime } from '../../lib/format.js';
import { Badge, ClientDot } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { pointerFlipOk } from './clickGuard.js';
import { naturalWidth } from './measure.js';
import { timerMoney, workTitle } from './trackData.js';
import { WorkMeta } from './WorkMeta.jsx';

const circle = 'grid size-10 shrink-0 place-items-center rounded-full outline-none transition-[background-color,border-color,color,transform] duration-fast ease-out active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
const tipKbd = 'border-canvas/25 bg-transparent text-canvas/75';
const key = (k, on) => (on ? <Kbd className={tipKbd}>{k}</Kbd> : undefined);
// The second click of a double-click does nothing. Pause turns into Resume under the pointer, and after a
// stop the next card slides up under it, so a second click would undo the first or hit another timer.
// Keyboard presses (detail 0) always count.
const once = (fn) => (ev) => { if (ev.detail > 1) return; fn(); };

// One running or paused timer. Reads like a log row: what (note) first, then client · project · activity.
// Color roles: orange = recording (pulse dot, resume), neutral = stop (it saves, it does not delete),
// violet = AI ×1.5 (a badge; the switch is in ⋯). `primary` marks the timer the keyboard acts on.
// `flash` (a counter, 0 = off): ring this card for a moment and scroll it into view. TrackView sets it when
// Continue, Start or the palette finds this exact work already on a timer, instead of starting a copy.
// `narrow`: the clock and buttons sit on a second line. Each card reports through onFit whether its work
// line (client · project · activity) and its clock fit on one line; the panel stacks every card when one
// does not, so client and project stay whole and the clocks stay in one column.
export function ActiveTimerRow({ timer, now, billing, primary, narrow = false, onFit, flash = 0, onPause, onResume, onStop, onToggleAi, onFocus, onEdit }) {
  const running = !!timer.runningSince;
  const { amount, rate, duration: elapsed } = timerMoney(timer, now, billing);
  const longWarn = running && elapsed >= LONG_TIMER_WARN_MS;
  const billable = aiAdjusted(elapsed, timer.ai);
  const color = clientColor(timer.client);
  const title = workTitle(timer);
  const cardRef = useRef(null);
  const released = useRef(false);
  const release = (fn) => () => { released.current = true; fn(); };
  const reduce = useReducedMotion();
  useEffect(() => {
    if (flash) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [flash, reduce]);

  // One line or two. The natural widths do not depend on the current layout, and a small margin keeps a
  // card that sits right at the edge from flipping back and forth.
  const narrowRef = useRef(narrow);
  narrowRef.current = narrow;
  const titleRef = useRef(null);
  const metaRef = useRef(null);
  const clusterRef = useRef(null);
  const clockRef = useRef(null);
  const fit = useRef(() => {});
  fit.current = () => {
    const card = cardRef.current;
    const cluster = clusterRef.current;
    if (!card || !cluster || !card.clientWidth) return;
    const kids = [...cluster.children];
    // Clock + buttons, their 8 px gaps, and the clock's right margin and the ⋯ wrapper's left margin.
    const side = kids.reduce((s, k) => s + k.getBoundingClientRect().width, 0) + 8 * Math.max(0, kids.length - 1) + 6;
    const need = Math.max(naturalWidth(titleRef.current), naturalWidth(metaRef.current));
    // Card padding (20 + 12), the 20 px gap, and the edit button's own padding (16, 8 of it outside).
    const room = card.clientWidth - 32 - 20 - 8 - side;
    onFit?.(timer.id, narrowRef.current ? need > room - 12 : need > room);
  };
  useLayoutEffect(() => { fit.current(); }, [title, timer.client, timer.project, timer.task, timer.ai, running, longWarn]);
  useLayoutEffect(() => {
    const card = cardRef.current;
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) fit.current(); });
    if (!card || typeof ResizeObserver === 'undefined') return () => { alive = false; };
    // Re-fit when the card gets wider or narrower, or the clock grows a digit; not on height changes.
    let w = card.clientWidth;
    const ro = new ResizeObserver(() => { if (card.clientWidth !== w) { w = card.clientWidth; fit.current(); } });
    ro.observe(card);
    let cw = clockRef.current?.offsetWidth;
    const ro2 = new ResizeObserver(() => { const n = clockRef.current?.offsetWidth; if (n !== cw) { cw = n; fit.current(); } });
    if (clockRef.current) ro2.observe(clockRef.current);
    return () => { alive = false; ro.disconnect(); ro2.disconnect(); };
  }, []);
  return (
    <div ref={cardRef} data-flash={flash ? '' : undefined} className={cn(
      'group relative flex scroll-mt-32 overflow-hidden rounded-xl border pl-5 pr-3 transition-[background-color,border-color,box-shadow] duration-slow',
      narrow ? 'flex-col gap-2.5' : 'flex-row items-center gap-5',
      // Running: a raised card. Paused: flat, hollow and quiet, so the live timer is the one that reads first.
      running ? 'border-line bg-surface py-3 shadow-card' : 'border-dashed border-line-strong/80 bg-transparent py-2.5 hover:bg-surface/50',
      flash ? 'ring-2 ring-brand/60 ring-offset-2 ring-offset-canvas' : '',
    )}>
      {running && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />}

      {/* What: click to edit the details or the start time. */}
      <button type="button" onClick={once(() => onEdit?.(timer))} aria-label={`Edit timer: ${title}, ${timer.client}`}
        className="group/edit -my-1 -ml-2 min-w-0 flex-1 rounded-lg px-2 py-1 text-left outline-none transition-colors hover:bg-fg/[0.035] focus-visible:ring-2 focus-visible:ring-ring/60">
        <div ref={titleRef} className="flex min-w-0 items-center gap-2">
          <span className={cn('truncate', running ? 'text-md font-semibold text-fg' : 'text-base font-medium text-fg-muted')}>{title}</span>
          {!running && <Badge variant="paused"><Pause fill="currentColor" strokeWidth={0} />Paused</Badge>}
          {timer.ai && <Badge variant="ai" title={`AI-assisted, bills ×${AI_FACTOR}`}><Sparkles />AI ×{AI_FACTOR}</Badge>}
          <Pencil aria-hidden className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover/edit:opacity-100" />
        </div>
        <div ref={metaRef} className={cn('mt-1 flex min-w-0 items-center gap-2', running ? 'text-sm' : 'text-xs')}>
          <ClientDot client={timer.client} pulse={running} size={7} />
          {/* Client · project · activity: the activity (it sets the rate) never truncates; the project gives way first.
              Without a note the activity is already the title. */}
          <WorkMeta client={timer.client} project={timer.project} task={timer.task} showTask={!!timer.note} strong={running} quiet={!running} />
        </div>
        {longWarn && <div className="mt-1 text-xs font-medium text-warning-text">Running for {formatHours(elapsed)}. Forgot to stop?</div>}
      </button>

      <div ref={clusterRef} className={cn('flex items-center gap-2', narrow && '-mt-0.5')}>
        {/* The clock opens focus mode. Money so far follows the same AI and rounding rules as a saved entry. */}
        <Tooltip content="Open focus mode" shortcut={key('F', primary)}>
          <button ref={clockRef} type="button" onClick={once(() => onFocus?.(timer.id))} aria-label={`${running ? 'Running' : 'Paused'} ${formatClock(elapsed)}. Open focus mode`}
            className={cn('rounded-lg px-1.5 py-0.5 outline-none transition-colors hover:bg-fg/[0.035] focus-visible:ring-2 focus-visible:ring-ring/60',
              narrow ? '-ml-1.5 mr-auto min-w-[120px] text-left' : 'mr-1 min-w-[120px] text-right')}>
            <div role="timer" className={cn('tracking-[-0.02em] tnum', running
              ? cn('text-[28px] font-semibold leading-8', longWarn ? 'text-danger-text' : 'text-fg')
              : 'text-[22px] font-medium leading-7 text-fg-subtle')}>{formatClock(elapsed)}</div>
            <div className="whitespace-nowrap text-xs tnum">
              {timer.ai
                ? <span className={cn('font-medium', running ? 'text-ai-text' : 'text-fg-subtle')}>{formatClock(billable)} billable</span>
                : <span className="text-fg-subtle">{running ? `since ${formatTime(timer.startedAt)}` : `started ${formatTime(timer.startedAt)}`}</span>}
              <span aria-hidden className="text-fg-faint"> · </span>
              <span className={cn(running ? 'font-medium text-fg-muted' : 'text-fg-subtle')} title={`€${rate}/h`}>{formatEUR(amount)}</span>
            </div>
          </button>
        </Tooltip>
        {running ? (
          <Tooltip content="Pause (breaks are not counted)" shortcut={key('Space', primary)}>
            <button type="button" onClick={(ev) => { if (pointerFlipOk(timer.id, ev)) onPause(timer.id); }} aria-label="Pause"
              className={cn(circle, 'border border-line-strong bg-surface text-fg-muted shadow-xs hover:border-fg/25 hover:text-fg')}>
              <Pause className="size-4" fill="currentColor" strokeWidth={0} />
            </button>
          </Tooltip>
        ) : (
          <Tooltip content="Resume tracking" shortcut={key('Space', primary)}>
            <button type="button" onClick={(ev) => { if (pointerFlipOk(timer.id, ev)) onResume(timer.id); }} aria-label="Resume"
              className={cn(circle, 'bg-brand-soft text-brand-text hover:bg-brand/20')}>
              <Play className="ml-0.5 size-4" fill="currentColor" strokeWidth={0} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Stop and save" shortcut={key('S', primary)}>
          <button type="button" onClick={once(() => onStop(timer.id))} aria-label="Stop and save"
            className={cn(circle, running
              ? 'bg-primary text-primary-fg shadow-sm hover:bg-primary-hover'
              : 'border border-line-strong bg-surface text-fg-muted shadow-xs hover:border-fg/25 hover:text-fg')}>
            <Square className="size-3.5" fill="currentColor" strokeWidth={0} />
          </button>
        </Tooltip>
        <div className="ml-0.5 flex items-center">
          <DropdownMenu>
            <Tooltip content="More">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${timer.client}`} className="text-fg-subtle"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
            </Tooltip>
            {/* After pause, resume or the AI switch, focus does not go back to ⋯: Space then pauses or
                resumes this timer (as the menu says) instead of opening the menu again. */}
            <DropdownMenuContent align="end" className="w-64"
              onCloseAutoFocus={(ev) => { if (released.current) { released.current = false; ev.preventDefault(); } }}>
              <DropdownMenuItem onSelect={() => onEdit?.(timer)}><Pencil /> Edit details and start time</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={!!timer.ai} onCheckedChange={release(() => onToggleAi(timer.id))}>
                AI-assisted, bill ×{AI_FACTOR}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {running
                ? <DropdownMenuItem onSelect={release(() => onPause(timer.id))} shortcut={primary ? 'Space' : undefined}><Pause fill="currentColor" strokeWidth={0} /> Pause</DropdownMenuItem>
                : <DropdownMenuItem onSelect={release(() => onResume(timer.id))} shortcut={primary ? 'Space' : undefined}><Play fill="currentColor" strokeWidth={0} /> Resume</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => onFocus?.(timer.id)} shortcut={primary ? 'F' : undefined}><Maximize2 /> Focus mode</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onStop(timer.id)} shortcut={primary ? 'S' : undefined}><Square className="mx-px !size-3.5" fill="currentColor" strokeWidth={0} /> Stop and save</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
