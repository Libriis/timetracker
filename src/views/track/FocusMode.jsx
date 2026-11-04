import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Minimize2, Pause, Play, Sparkles, Square } from 'lucide-react';
import { aiAdjusted, entryAiFactor, getRounding, roundedDuration } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { clientColor } from '../../lib/colors.js';
import { formatClock, formatEUR, formatHM, formatTime, fromIsoDay, isoDay } from '../../lib/format.js';
import { useNow } from '../../lib/useNow.js';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { pointerFlipOk } from './clickGuard.js';
import { timerMoney, workTitle } from './trackData.js';

const TICKS = 60;
const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const tipKbd = 'border-canvas/25 bg-transparent text-canvas/75';
// The second click of a double-click does nothing: Pause turns into Resume under the pointer, a switch
// chip swaps places with the timer you left, and Stop closes focus mode over the page. Keys always count.
const once = (fn) => (ev) => { if (ev.detail > 1) return; fn(); };

// The dial: 60 ticks around the clock. They fill through the current billing block (the client's
// rounding, 15 min by default), so you can see when the next block starts. No rounding: one hour.
function Dial({ progress, running, size }) {
  const r = size / 2;
  const lit = Math.floor(progress * TICKS);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0">
      {Array.from({ length: TICKS }, (_, i) => {
        const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
        const major = i % 15 === 0;
        const outer = r - 4;
        const inner = outer - (major ? 18 : 10);
        const on = i < lit || (i === 0 && progress > 0);
        return (
          <line key={i} x1={r + Math.cos(a) * inner} y1={r + Math.sin(a) * inner} x2={r + Math.cos(a) * outer} y2={r + Math.sin(a) * outer}
            strokeWidth={major ? 3 : 2.25} strokeLinecap="round"
            className={cn('transition-[stroke] duration-slow', on ? (running ? 'stroke-brand' : 'stroke-fg-muted') : 'stroke-fg/[0.12]')} />
        );
      })}
      {/* The live tick: where the block is now. */}
      {running && lit < TICKS && (() => {
        const a = (lit / TICKS) * Math.PI * 2 - Math.PI / 2;
        return <circle cx={r + Math.cos(a) * (r - 4 - 5)} cy={r + Math.sin(a) * (r - 4 - 5)} r={4.5} className="fill-brand animate-pulse-dot" />;
      })()}
    </svg>
  );
}

// Full-screen running timer (Toggl calls it focus mode). One timer in the middle, nothing else to read.
// Space pauses or resumes, S stops and saves, Esc goes back. Other timers sit at the bottom to switch to.
export function FocusMode({ timers, focusId, setFocusId, onClose, onPause, onResume, onStop, onToggleAi, billing, entries = [] }) {
  const t = timers.find(x => x.id === focusId) || timers[timers.length - 1];
  const running = !!t?.runningSince;
  const now = useNow(timers.some(x => x.runningSince));
  // Saved time today: entries that start today (not later: a past entry can be dated in the future).
  // Keyed by the calendar day, so it starts over at midnight while focus mode stays open.
  const day = isoDay(new Date(now));
  const todayBaseMs = useMemo(() => {
    const t0 = fromIsoDay(day).getTime();
    const t1 = new Date(t0); t1.setDate(t1.getDate() + 1);
    return entries.reduce((s, e) => (e.start >= t0 && e.start < t1.getTime() ? s + e.duration : s), 0);
  }, [entries, day]);
  const reduce = useReducedMotion();
  const rootRef = useRef(null);

  // A modal: the page behind is inert (no focus, no clicks) while focus mode is open. On close focus goes
  // to the page itself, not back to a button, so Space then pauses instead of pressing that button.
  useEffect(() => {
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    rootRef.current?.focus({ preventScroll: true });
    return () => { app?.removeAttribute('inert'); };
  }, []);
  useEffect(() => { if (!t) onClose(); }, [t, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (!t || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role=menu],[role=listbox]')) return;
      const k = e.key.toLowerCase();
      const onButton = e.target?.closest?.('button');
      // Tab cycles inside focus mode.
      if (k === 'tab') {
        const root = rootRef.current;
        const list = root ? [...root.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')] : [];
        if (!list.length) { e.preventDefault(); return; }
        const i = list.indexOf(document.activeElement);
        const n = i < 0 ? (e.shiftKey ? list.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + list.length) % list.length;
        e.preventDefault();
        list[n].focus();
        return;
      }
      // One action per key press: a held key repeats, and a repeat must not flip pause/resume or stop the next timer.
      if (e.repeat) { if (k === ' ' && !onButton) e.preventDefault(); return; }
      if (k === 'escape') { e.preventDefault(); onClose(); }
      else if (k === ' ' && !onButton) { e.preventDefault(); (t.runningSince ? onPause : onResume)(t.id); }
      else if (k === 's') { e.preventDefault(); onStop(t.id); }
      else if (k === 'a') { e.preventDefault(); onToggleAi(t.id); }
      else if ((k === 'arrowright' || k === 'arrowleft') && timers.length > 1) {
        e.preventDefault();
        const i = timers.findIndex(x => x.id === t.id);
        const n = (i + (k === 'arrowright' ? 1 : -1) + timers.length) % timers.length;
        setFocusId(timers[n].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [t, timers, onClose, onPause, onResume, onStop, onToggleAi, setFocusId]);

  if (!t) return null;
  const { amount, rate, duration } = timerMoney(t, now, billing);
  const aiF = entryAiFactor(t); // this timer's own factor, else the setting
  const billable = aiAdjusted(duration, t.ai, aiF);
  const blockMin = getRounding(t.client, billing.rounding, billing.clientRounding) || 60;
  const blockMs = blockMin * 60000;
  const billed = roundedDuration(billable, blockMin);
  const progress = (billable % blockMs) / blockMs;
  const toNext = blockMs - (billable % blockMs);
  const color = clientColor(t.client);
  const clock = formatClock(duration);
  const cut = clock.lastIndexOf(':');
  const others = timers.filter(x => x.id !== t.id);
  const todayMs = todayBaseMs + timers.reduce((s, x) => s + timerMoney(x, now, billing).duration, 0);
  const title = workTitle(t);

  return createPortal(
    <motion.div ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Focus mode: ${title}`}
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-canvas text-fg outline-none">
      {/* Atmosphere: a soft wash of the client's color, very low contrast. */}
      <div aria-hidden className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(60% 55% at 50% 42%, color-mix(in srgb, ${color} 13%, transparent), transparent 70%), radial-gradient(40% 40% at 50% 46%, rgb(var(--brand) / ${running ? 0.06 : 0}), transparent 70%)` }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-line" />

      {/* Top bar */}
      <header className="relative flex h-16 shrink-0 items-center justify-between px-6 sm:px-10">
        <div className="flex items-center gap-2.5 text-sm">
          <span className={cn('inline-flex h-7 items-center gap-2 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.08em]',
            running ? 'bg-brand-soft text-brand-text' : 'bg-warning-soft text-warning-text')}>
            <span aria-hidden className={cn('size-1.5 rounded-full', running ? 'bg-brand animate-pulse-dot' : 'bg-warning')} />
            {running ? 'Recording' : 'Paused'}
          </span>
          <span className="hidden text-fg-subtle sm:inline">Focus mode</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden items-baseline gap-2 text-sm text-fg-subtle md:flex">
            Today <span className="font-semibold text-fg tnum">{formatHM(todayMs)}</span>
          </span>
          <Tooltip content="Back to the timer page" shortcut={<Kbd className={tipKbd}>Esc</Kbd>} side="bottom">
            <button type="button" onClick={onClose} aria-label="Exit focus mode"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong/80 bg-surface/70 pl-3 pr-3.5 text-sm font-medium text-fg-muted shadow-xs outline-none backdrop-blur transition-colors hover:border-line-strong hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60">
              <Minimize2 className="size-4" /> Exit
            </button>
          </Tooltip>
        </div>
      </header>

      {/* The timer */}
      <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-4">
        <div className="relative grid size-[min(440px,52vh)] shrink-0 place-items-center">
          <div aria-hidden className="absolute inset-[9%] rounded-full border border-line/80 bg-surface/55 shadow-[0_1px_0_rgb(255_255_255/0.5)_inset,0_24px_60px_-28px_rgb(20_20_25/0.25)] backdrop-blur-sm" />
          <DialSized progress={progress} running={running} />
          <div className="relative flex flex-col items-center text-center">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-fg-subtle">{running ? `since ${formatTime(t.startedAt)}` : 'on hold'}</div>
            <div role="timer" aria-label={`${running ? 'Running' : 'Paused'}: ${clock}`}
              className={cn('mt-2 font-semibold leading-none tracking-[-0.045em] tnum', running ? 'text-fg' : 'text-fg-muted')}
              style={{ fontSize: 'clamp(48px, min(7vw, 8.8vh), 76px)' }}>
              {clock.slice(0, cut)}<span className="text-fg-subtle">{clock.slice(cut)}</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2 text-sm text-fg-muted tnum">
              <span className="font-semibold text-fg">{formatEUR(amount)}</span>
              <span aria-hidden className="text-fg-faint">·</span>
              <span>billed as {formatHM(billed)}</span>
            </div>
            <div className="mt-1 text-xs text-fg-subtle tnum">next {blockMin}-min block in {mmss(toNext)}</div>
          </div>
        </div>

        <div className="mt-7 flex max-w-[40rem] flex-col items-center text-center">
          <h2 className="max-w-full truncate text-2xl font-semibold text-fg">{title}</h2>
          <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-md text-fg-muted">
            <span className="inline-flex min-w-0 items-center gap-2"><ClientDot client={t.client} size={9} /><span className="truncate font-medium text-fg">{t.client}</span></span>
            {t.project && <><span aria-hidden className="text-fg-faint">·</span><span className="truncate">{t.project}</span></>}
            {t.note && <><span aria-hidden className="text-fg-faint">·</span><span className="truncate">{t.task}</span></>}
            <span aria-hidden className="text-fg-faint">·</span>
            <span className="tnum text-fg-subtle">€{rate}/h</span>
          </div>
        </div>

        {/* Controls: pause / stop / AI */}
        <div className="mt-8 flex items-center gap-5">
          <FocusButton label={running ? 'Pause' : 'Resume'} k="Space" onClick={(ev) => { if (pointerFlipOk(t.id, ev)) (running ? onPause : onResume)(t.id); }}
            className={running ? 'border border-line-strong bg-surface text-fg-muted shadow-xs hover:border-fg/25 hover:text-fg' : 'bg-brand text-brand-fg shadow-brand hover:bg-brand-hover'}>
            {running ? <Pause className="size-5" fill="currentColor" strokeWidth={0} /> : <Play className="ml-0.5 size-5" fill="currentColor" strokeWidth={0} />}
          </FocusButton>
          <FocusButton label="Stop and save" k="S" big onClick={() => onStop(t.id)} className="bg-primary text-primary-fg shadow-md hover:bg-primary-hover">
            <Square className="size-5" fill="currentColor" strokeWidth={0} />
          </FocusButton>
          <FocusButton label={t.ai ? `AI ×${aiF} on` : `AI ×${aiF}`} k="A" onClick={() => onToggleAi(t.id)} pressed={!!t.ai}
            className={t.ai ? 'border border-ai/35 bg-ai-soft text-ai-text hover:border-ai/55' : 'border border-line-strong bg-surface text-fg-subtle shadow-xs hover:border-fg/25 hover:text-fg'}>
            <Sparkles className="size-5" />
          </FocusButton>
        </div>
      </main>

      {/* Other timers: one click to switch */}
      <footer className="relative flex min-h-16 shrink-0 flex-wrap items-center justify-center gap-2 px-6 pb-6">
        {others.length > 0 && <span className="mr-1 text-xs text-fg-subtle">Also tracking</span>}
        {others.map(o => {
          const r = !!o.runningSince;
          return (
            <button key={o.id} type="button" onClick={once(() => setFocusId(o.id))} aria-label={`Switch to ${workTitle(o)}, ${o.client}`}
              className="inline-flex h-9 max-w-[22rem] items-center gap-2 rounded-full border border-line bg-surface/80 pl-3 pr-3.5 text-sm shadow-xs outline-none backdrop-blur transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring/60">
              <ClientDot client={o.client} size={7} pulse={r} />
              <span className="min-w-0 truncate font-medium text-fg">{workTitle(o)}</span>
              <span className="min-w-0 truncate text-fg-subtle">{o.client}</span>
              <span className={cn('tnum', r ? 'font-semibold text-fg' : 'text-fg-subtle')}>{formatClock(timerMoney(o, now, billing).duration)}</span>
              {!r && <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-warning-text">Paused</span>}
            </button>
          );
        })}
      </footer>
    </motion.div>,
    document.body,
  );
}

// The dial sizes itself to its square parent.
function DialSized({ progress, running }) {
  const ref = useRef(null);
  const size = useParentSize(ref);
  return <div ref={ref} className="absolute inset-0">{size > 0 && <Dial progress={progress} running={running} size={size} />}</div>;
}

function useParentSize(ref) {
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    setSize(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [ref, setSize]);
  return size;
}


function FocusButton({ label, k, onClick, className, children, big = false, pressed }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid size-[72px] place-items-center">
      <button type="button" onClick={(ev) => { if (ev.detail > 1) return; onClick(ev); }} aria-label={label} aria-pressed={pressed} aria-keyshortcuts={k === 'Space' ? 'Space' : k}
        className={cn('grid place-items-center rounded-full outline-none transition-[background-color,border-color,color,transform] duration-fast ease-out active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          big ? 'size-[72px]' : 'size-14', className)}>
        {children}
      </button>
      </div>
      <span className="flex items-center gap-1.5 text-xs text-fg-subtle">{label}<Kbd>{k}</Kbd></span>
    </div>
  );
}
