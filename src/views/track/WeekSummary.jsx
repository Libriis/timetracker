import { useMemo } from 'react';
import { Play } from 'lucide-react';
import { billableDuration, billingTotals, getRounding, sharedAiFactor } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { formatClock, formatEUR, formatHM, isoDay, UI_LOCALE } from '../../lib/format.js';
import { useNow } from '../../lib/useNow.js';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { aiLabel } from '../../components/ui/AiFactorPicker.jsx';
import { Card, SectionLabel } from '../../components/ui/Card.jsx';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { Amount } from '../../components/ui/Stat.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { startOfWeek, timerMoney, workTitle } from './trackData.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ISO week number, for the small "W45" tag.
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

// "2–8 Nov", or "27 Oct – 2 Nov" across two months.
function weekRange(startMs) {
  const a = new Date(startMs);
  const b = new Date(startMs); b.setDate(b.getDate() + 6);
  const dm = { day: 'numeric', month: 'short' };
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.toLocaleDateString(UI_LOCALE, dm)}`
    : `${a.toLocaleDateString(UI_LOCALE, dm)} – ${b.toLocaleDateString(UI_LOCALE, dm)}`;
}

// Right rail on the Timer page. Three labelled figures lead: time tracked this week, money earned this
// week (net), unbilled money across all weeks. Under them, a small day strip with the hours on each day.
// Saved entries are summed once; running and paused timers are added live, so the week and today tick.
// Money follows the money rule: saved entries through billingTotals, plus each timer's own amount so far.
export function WeekSummary({ entries, timers = [], rates, clientRates, rounding, clientRounding }) {
  const anyRunning = timers.some(t => t.runningSince);
  const now = useNow(anyRunning);
  // The week and today are worked out again when the calendar day changes (the app stays open over midnight).
  const day = isoDay(new Date(now));
  const s = useMemo(() => {
    const start = startOfWeek();
    const todayIdx = (new Date().getDay() + 6) % 7;
    const days = DOW.map(() => 0);
    const wk = [], unbilled = [];
    let week = 0, weekBillable = 0;
    for (const e of entries) {
      if (!e.invoiced && !e.free) unbilled.push(e);
      if (e.start < start) continue;
      // Calendar day, not 24-hour blocks: a week with a clock change has a 23- or 25-hour day.
      const d = new Date(e.start); d.setHours(0, 0, 0, 0);
      const i = Math.round((d.getTime() - start) / 86400000);
      if (i < 0 || i > 6) continue;
      days[i] += e.duration;
      week += e.duration;
      wk.push(e);
      if (!e.free) weekBillable += billableDuration(e, getRounding(e.client, rounding, clientRounding));
    }
    const cfg = { rates, clientRates, vat: 0, clientVat: {}, rounding, clientRounding };
    return { start, days, todayIdx, week, weekBillable, wk, weekEur: billingTotals(wk, cfg).net, unbilledEur: billingTotals(unbilled, cfg).net };
  }, [entries, rates, clientRates, rounding, clientRounding, day]);

  const billing = { rates, clientRates, rounding, clientRounding };
  let liveMs = 0, liveEur = 0, liveBillable = 0;
  for (const t of timers) {
    const m = timerMoney(t, now, billing);
    liveMs += m.duration;
    liveEur += m.amount;
    liveBillable += billableDuration({ duration: m.duration, ai: t.ai, aiFactor: t.aiFactor }, getRounding(t.client, rounding, clientRounding));
  }
  // "after AI ×1.5": the factor this week's AI work shares, or just "AI" when entries differ.
  const weekAi = aiLabel(sharedAiFactor([...s.wk, ...timers]));
  const days = s.days.map((ms, i) => (i === s.todayIdx ? ms + liveMs : ms));
  const max = Math.max(...days, 1);
  const today = days[s.todayIdx];
  const anyDay = days.some(Boolean);
  const earned = s.weekEur + liveEur;
  const BAR_MAX = 44;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>This week</SectionLabel>
        <span className="text-2xs font-medium text-fg-subtle tnum">W{isoWeek()} · {weekRange(s.start)}</span>
      </div>

      {/* The two figures that answer "how is the week going": time and money. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4">
        <div className="min-w-0">
          <dt className="text-xs text-fg-subtle">Tracked</dt>
          <dd className="mt-0.5 text-2xl font-semibold leading-8 tracking-[-0.01em] text-fg tnum">{formatHM(s.week + liveMs)}</dd>
          <dd className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle tnum">
            {anyRunning && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand animate-pulse-dot" />}
            <span>Today <span className="font-medium text-fg-muted">{formatClock(today)}</span></span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-fg-subtle">Earned, net</dt>
          {/* Five-figure weeks step down a size so the amount never runs into the next column. */}
          <dd className={cn('mt-0.5 font-semibold leading-8 tracking-[-0.01em] text-fg', earned >= 10000 ? 'text-xl' : 'text-2xl')}><Amount value={earned} /></dd>
          <dd className="mt-0.5 text-xs text-fg-subtle tnum" title={`Hours that bill this week, after ${weekAi} and rounding`}>{formatHM(s.weekBillable + liveBillable)} billable</dd>
        </div>
      </dl>

      {/* Day strip: hours on top of each bar; today is the dark bar and the filled day letter. */}
      <div className="mt-5 grid grid-cols-7 gap-1.5" role="img" aria-label={`Hours per day this week: ${days.map((ms, i) => `${DOW[i]} ${formatHM(ms)}`).join(', ')}`}>
        {days.map((ms, i) => {
          const isToday = i === s.todayIdx;
          const future = i > s.todayIdx;
          return (
            <div key={i} className="flex min-w-0 flex-col items-center" title={`${DOW[i]}: ${formatClock(ms)}`}>
              {/* An empty week collapses to a flat strip: no blank chart, no row of dashes. */}
              {anyDay && (
                <span className={cn('mb-1 h-4 whitespace-nowrap text-2xs leading-4 tnum', isToday ? 'font-semibold text-fg' : ms ? 'font-medium text-fg-muted' : 'text-fg-faint')}>
                  {future && !ms ? '' : ms ? formatHM(ms) : '–'}
                </span>
              )}
              <div className="flex w-full items-end" style={{ height: anyDay ? BAR_MAX : 4 }}>
                <div className={cn('w-full rounded-[3px] transition-[height] duration-slow ease-out',
                  isToday ? 'bg-primary' : future ? 'bg-fg/[0.05]' : ms ? 'bg-fg/[0.2]' : 'bg-fg/[0.08]')}
                  style={{ height: ms > 0 ? Math.max(4, Math.round((ms / max) * BAR_MAX)) : 2 }} />
              </div>
              <span className={cn('mt-1.5 grid size-[18px] place-items-center rounded-full text-2xs leading-none',
                isToday ? 'bg-primary font-semibold text-primary-fg' : 'text-fg-subtle')}>{DOW[i][0]}</span>
            </div>
          );
        })}
      </div>

      {/* Money waiting for an invoice, all weeks together. */}
      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3.5">
        <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <span aria-hidden className="size-1.5 rounded-full bg-unbilled" />Unbilled, all weeks
        </span>
        <span className="text-md font-semibold text-fg tnum">{formatEUR(s.unbilledEur)}</span>
      </div>
    </Card>
  );
}

// One-click start of the work you repeat most (last 30 days). The list already shows the newest work,
// each row with its own continue button, so this card does not repeat it.
export function QuickStart({ items, onResumeWork, onOpenPalette }) {
  if (!items.length) return null;
  return (
    <Card className="p-2">
      <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
        <div className="flex items-baseline gap-2">
          <SectionLabel>Frequent work</SectionLabel>
          <span className="text-2xs text-fg-subtle">30 days</span>
        </div>
        {onOpenPalette && (
          <Tooltip content="Search all recent work" shortcut={<Kbd className="border-canvas/25 bg-transparent text-canvas/75">K</Kbd>}>
            <button type="button" onClick={onOpenPalette}
              className="rounded-md px-1.5 py-0.5 text-xs font-medium text-fg-muted outline-none transition-colors hover:bg-fg/[0.05] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60">
              Search
            </button>
          </Tooltip>
        )}
      </div>
      <ul>
        {items.map(({ work: w, count }) => (
          <li key={w.id}>
            <button type="button" onClick={(e) => { if (e.detail > 1) return; onResumeWork(w); }} title={[w.client, w.project, w.task].filter(Boolean).join(' · ')}
              aria-label={`Start ${workTitle(w)}, ${[w.client, w.project, w.note ? w.task : ''].filter(Boolean).join(', ')}. Logged ${count} times in 30 days`}
              className="group flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-fg/[0.04] focus-visible:bg-fg/[0.05] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60">
              <ClientDot client={w.client} className="mt-[6px]" />
              <span className="min-w-0 flex-1">
                {/* Title and count share the first line, so the meta line below gets the full width. */}
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{workTitle(w)}</span>
                  <span aria-hidden className="grid h-5 min-w-5 shrink-0 place-items-center text-2xs font-medium text-fg-subtle tnum group-hover:hidden group-focus-visible:hidden">{count}×</span>
                  <span aria-hidden className="hidden size-5 shrink-0 place-items-center rounded-full bg-brand text-brand-fg group-hover:grid group-focus-visible:grid">
                    <Play className="ml-px size-2.5" fill="currentColor" strokeWidth={0} />
                  </span>
                </span>
                {/* Client, then the project (or the activity). The full line is in the tooltip. */}
                <span className="flex min-w-0 text-xs text-fg-subtle">
                  <span className="shrink-0">{w.client}</span>
                  {(w.project || w.note) && <span className="min-w-0 truncate"><span aria-hidden className="text-fg-faint">&nbsp;·&nbsp;</span>{w.project || w.task}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Quiet reminder of the keyboard paths. Shown under the rail.
export function ShortcutHints() {
  const items = [['N', 'New'], ['K', 'Search'], ['S', 'Stop'], ['F', 'Focus']];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-2xs text-fg-subtle" aria-label="Keyboard shortcuts">
      {items.map(([k, label]) => (
        <span key={k} className="inline-flex items-center gap-1"><Kbd>{k}</Kbd>{label}</span>
      ))}
    </div>
  );
}
