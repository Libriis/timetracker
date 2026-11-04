import { forwardRef, memo, useEffect, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as HoverCard from '@radix-ui/react-hover-card';
import { CopyPlus, ExternalLink, Gift, Lock, Pause, Pencil, Play, Sparkles, Square, Trash2 } from 'lucide-react';
import { entryAiFactor } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { clientColor } from '../../lib/colors.js';
import { formatClock, formatEUR, formatHM } from '../../lib/format.js';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { popoverSurface } from '../../components/ui/Popover.jsx';
import { MIN_MS, clockHM, fmtDayShort, textWidth } from './calendarUtils.js';

// Tinted block surface from the client color (--c). Stronger tint in dark mode so it reads on near-black.
const tint = [
  '[background:color-mix(in_srgb,var(--c)_12%,rgb(var(--surface)))]',
  'dark:[background:color-mix(in_srgb,var(--c)_19%,rgb(var(--surface)))]',
  'hover:[background:color-mix(in_srgb,var(--c)_18%,rgb(var(--surface)))]',
  'dark:hover:[background:color-mix(in_srgb,var(--c)_26%,rgb(var(--surface)))]',
  '[border-color:color-mix(in_srgb,var(--c)_30%,transparent)]',
].join(' ');
// Paused timers: hatched and dashed, so they never read as finished, billed work.
const pausedSurface = [
  '[background:repeating-linear-gradient(135deg,color-mix(in_srgb,var(--c)_13%,rgb(var(--surface)))_0_6px,rgb(var(--surface))_6px_11px)]',
  'dark:[background:repeating-linear-gradient(135deg,color-mix(in_srgb,var(--c)_20%,rgb(var(--surface)))_0_6px,rgb(var(--surface))_6px_11px)]',
  'border-dashed [border-color:color-mix(in_srgb,var(--c)_55%,transparent)]',
].join(' ');

export const blockTitle = (it) => it.note || it.project || it.task || 'Untitled';

// Live numbers for a block: entries are fixed, timers read the clock.
function numbersOf(it, now) {
  if (it.kind === 'entry') return { ms: it.duration, amount: it.amount, billableMs: it.billableMs, rate: it.rate, roundMin: it.roundMin };
  const l = it.live(now || Date.now());
  return { ms: l.elapsedMs, amount: l.amount, billableMs: l.billableMs, rate: l.rate, roundMin: l.roundMin };
}

const CLAMP = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' };
// Small font sizes used in blocks; widths are measured with the same values.
const F = { title: 12, tiny: 11.5, dur: 11.5, meta: 11 };
const ICON_CHIP = 18; // a 16px badge plus its gap
const SAFE = 3; // tabular digits and rounding

function Badges({ it, iconOnly = false }) {
  return (
    <>
      {it.ai && (
        <span title={`AI-assisted, bills ×${entryAiFactor(it)}`} className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded bg-ai-soft px-1 text-[10px] font-semibold leading-none text-ai-text">
          <Sparkles className="size-2.5" />{!iconOnly && 'AI'}
        </span>
      )}
      {it.free && (
        <span title="Free of charge" className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded bg-free-soft px-1 text-[10px] font-semibold leading-none text-free-text">
          <Gift className="size-2.5" />{!iconOnly && 'Free'}
        </span>
      )}
      {it.invoiced && (
        <span title="Invoiced (locked on the calendar)" className="inline-flex h-4 shrink-0 items-center rounded bg-invoiced-soft px-1 text-invoiced-text">
          <Lock className="size-2.5" />
        </span>
      )}
    </>
  );
}

// Status mark in front of the title: a pulsing dot while running, a pause glyph while paused.
function Status({ kind, className }) {
  if (kind === 'running') return <span aria-hidden className={cn('size-1.5 shrink-0 animate-pulse-dot rounded-full bg-brand', className)} />;
  if (kind === 'paused') return <Pause aria-hidden className={cn('size-3 shrink-0 fill-current text-warning-text', className)} strokeWidth={0} />;
  return null;
}

// A paused timer on the grid: pause mark, time so far and a Resume button inside the block.
// Wide lanes add the title; the hover card and the timer bar carry the rest.
function PausedBody({ it, title, duration, widthPx, heightPx, onResumeTimer }) {
  const room = widthPx - 14;
  // From about 64px of text room the card names the timer (truncated), so two paused timers can be told apart.
  const withTitle = room >= 64;
  const slim = room < 52;
  // Second row: time, client, Resume. The client shows in full when it can: the button drops its word
  // before the client gets cut.
  const durW = textWidth(duration, F.dur, 600) + SAFE;
  const clientW = textWidth(it.client || '', F.meta, 400) + SAFE;
  const resumeW = 14 + 12 + textWidth('Resume', F.meta, 600);
  const clientFull = withTitle && durW + 6 + clientW + 6 + 24 <= room;
  const resumeText = clientFull ? durW + 6 + clientW + 6 + resumeW <= room : room >= textWidth(duration, F.dur, 600) + 70;
  const showClient = clientFull || (withTitle && room >= textWidth(duration, F.dur, 600) + 130);
  const resumeBtn = (full) => onResumeTimer && (
    <button type="button" aria-label={`Resume ${title}`} title="Resume"
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onResumeTimer(); }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn('inline-flex h-5 shrink-0 items-center justify-center gap-1 rounded-[5px] bg-brand-soft text-[11px] font-semibold text-brand-text outline-none transition-colors duration-fast hover:bg-brand/20 focus-visible:ring-2 focus-visible:ring-ring/60',
        full ? 'w-full' : resumeText ? 'px-1.5' : 'w-6')}>
      <Play className="size-2.5" fill="currentColor" strokeWidth={0} />{!full && resumeText && 'Resume'}
    </button>
  );
  const resume = resumeBtn(false);
  const time = <span className="shrink-0 text-[11.5px] font-semibold leading-4 text-warning-text tnum">{duration}</span>;
  if (slim) {
    // A slim lane next to entries: pause mark and time on top (time alone, or the mark alone, when
    // narrower), a full-width Resume under it. The hatching says "paused" too.
    const dw = textWidth(duration, F.dur, 600);
    const fits = widthPx - 8 >= dw + 1;
    const mark = !fits || widthPx - 8 >= dw + 16;
    return (
      <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1 pt-px">
        <div className="flex min-w-0 items-center justify-center gap-1">
          {mark && <Pause aria-hidden className="size-3 shrink-0 fill-current text-warning-text" strokeWidth={0} />}
          {fits && time}
        </div>
        <span className="sr-only">{title}, paused</span>
        {onResumeTimer && heightPx >= 40 && resumeBtn(true)}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-between gap-1">
      <div className="flex min-w-0 items-center gap-1 leading-4">
        <Pause aria-hidden className="size-3 shrink-0 fill-current text-warning-text" strokeWidth={0} />
        {withTitle ? <span className="min-w-0 truncate text-xs font-medium text-fg">{title}</span> : time}
        <span className="sr-only">, paused</span>
      </div>
      {(withTitle || resume) && heightPx >= 40 && (
        <div className="flex min-w-0 items-center gap-1.5">
          {withTitle && time}
          {showClient && <span className="min-w-0 truncate text-[11px] leading-4 text-fg-subtle">{it.client}</span>}
          {resume && <span className={cn('flex', withTitle && 'ml-auto')}>{resume}</span>}
        </div>
      )}
    </div>
  );
}

// The visual block. Height and measured text width decide what fits: the title always wins,
// then the tracked time, then the amount, then the client (its color already marks the block).
const BlockBody = forwardRef(function BlockBody({ it, piece, style, heightPx: boxH, widthPx, now, ghost, dimmed, interactive, onPointerDown, onResizeDown, onResumeTimer, onKeyDown, label, className, ...rest }, ref) {
  const { kind } = it;
  const running = kind === 'running';
  const paused = kind === 'paused';
  const nums = numbersOf(it, now);
  const duration = formatHM(nums.ms);
  const money = it.free ? 'Free' : formatEUR(nums.amount);
  const title = blockTitle(it);
  // A drag preview leads with where the block will land.
  const head = ghost && piece.first ? `${clockHM(it.start)} – ${clockHM(it.rawEnd ?? it.end)}` : null;
  const headOnly = head && boxH < 36;
  const heightPx = head && !headOnly ? boxH - 16 : boxH;
  const tiny = heightPx < 34;
  const sticky = !ghost && !tiny && !paused;
  const two = !tiny && heightPx < 60;
  // 34 to 37px (45 minutes at the default zoom): two lines only fit with tighter padding.
  const shortTwo = two && heightPx < 38;
  const roomy = heightPx >= 96 && widthPx > 90;
  const wide = widthPx >= 360;
  const compact = wide && heightPx < 46; // two short lines in day view
  const hasBadges = it.ai || it.free || it.invoiced;
  const timeText = `${clockHM(it.start)} – ${clockHM(it.rawEnd ?? it.end)}`;

  // Text room: block width minus the borders, the color rail and padding.
  const room = widthPx - 17;
  const statusW = kind === 'entry' ? 0 : 10;
  const durW = textWidth(duration, F.dur, 600) + SAFE;
  const moneyW = textWidth(money, F.meta, 400) + SAFE;
  const pausedW = paused ? textWidth('Paused', F.meta, 500) + 8 : 0;
  const badgeW = (it.ai ? ICON_CHIP : 0) + (it.invoiced ? ICON_CHIP : 0); // Free shows as the amount text
  const durTone = running ? 'text-brand-text' : paused ? 'text-warning-text' : 'text-fg';

  // Tiny: one line. Title first; time and money join only if the whole title still fits.
  let tinyDur = false;
  let tinyMoney = false;
  if (tiny) {
    const titleW = textWidth(title, F.tiny, 500) + statusW;
    tinyDur = titleW + 6 + durW <= room;
    tinyMoney = tinyDur && !paused && titleW + 6 + durW + 8 + moneyW <= room;
    // A title too long for the block truncates anyway: then keep the time if a useful bit of title stays.
    if (!tinyDur && titleW > room && room - durW - 6 >= 72) tinyDur = true;
  }
  // Number row (two-line and tall blocks): time left, money right, client between when it fits.
  const rowMoney = !paused && durW + pausedW + 10 + moneyW <= room;
  const rowBadges = rowMoney && badgeW > 0 && durW + 10 + moneyW + badgeW <= room;
  const clientW = textWidth(it.client || '', F.meta, 400);
  // Narrow but tall: money moves to its own line under the time when the block has the height.
  const metaLines = two ? 0 : (heightPx >= 78 && it.note && it.project ? 2 : 1);
  const usedH = 12 + (roomy ? 30 : 15) + metaLines * 14 + 2 + 3 + 16;
  const stackMoney = !tiny && !two && !wide && !paused && !rowMoney && heightPx >= usedH + 14 && moneyW <= room;
  const rowClient = two && durW + pausedW + 14 + clientW + (rowMoney ? 10 + moneyW : 0) + (rowBadges ? badgeW : 0) <= room;
  // Narrow blocks (side by side, or narrow columns): a title that does not fit on one line wraps over
  // the lines the block has, and the client line and even the number row give way to it.
  const titleW = textWidth(title, F.title, 500) + statusW;
  const narrowWrap = !tiny && !wide && !paused && room < 72 && titleW > room;
  const lineH = 15;
  const linesFit = Math.floor((heightPx - 10) / lineH);
  const needLines = Math.min(4, Math.ceil(titleW / Math.max(1, room)) + (titleW > room * 1.6 ? 1 : 0));
  const wrapLines = narrowWrap ? Math.max(1, Math.min(needLines, linesFit - 1 >= needLines ? needLines : linesFit)) : 0;
  const wrapRow = !narrowWrap || linesFit - wrapLines >= 1;
  // A tall narrow block keeps one client line under the wrapped title when there is room for it.
  const wrapMeta = narrowWrap && !two && linesFit - wrapLines >= 3;
  const wrapMoney = !narrowWrap || wrapLines * lineH + (wrapMeta ? 14 : 0) + 16 + 14 + 10 <= heightPx;

  const moneyEl = (cls) => (
    <span className={cn('shrink-0 tnum', it.free ? 'font-medium text-free-text' : 'text-fg-muted', cls)}>{money}</span>
  );
  const pausedTag = paused && <span className="shrink-0 text-[11px] font-medium leading-4 text-warning-text">Paused</span>;

  return (
    <div ref={ref} data-slot="block" data-kind={kind} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={label}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown}
      style={{ '--c': clientColor(it.client), ...style }}
      className={cn(
        // overflow-clip (not hidden) keeps the block from becoming a scroll box, so its text can stick.
        'group/block absolute z-[2] flex select-none overflow-clip rounded-[7px] border text-left outline-none',
        'transition-[background,box-shadow,opacity] duration-fast ease-out',
        'focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
        paused ? pausedSurface : tint,
        interactive && 'cursor-pointer hover:z-20 hover:shadow-md',
        ghost && 'z-40 shadow-lg ring-1 ring-fg/10',
        dimmed && 'opacity-35',
        !piece.first && 'rounded-t-none border-t-0',
        !piece.last && 'rounded-b-none border-b-0',
        className,
      )}
      {...rest}>
      {/* Client color rail */}
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px] bg-[var(--c)]', paused && 'opacity-60')} />
      <div className={cn('relative flex min-w-0 flex-1 flex-col', paused ? (widthPx < 66 ? 'px-[3px]' : 'pl-2 pr-1') : 'pl-[9px]', wide ? 'pr-2.5' : !paused && 'pr-1.5', (tiny || headOnly) ? 'justify-center py-0' : compact ? 'py-[3px]' : shortTwo ? 'py-[2px]' : 'py-[5px]',
        // Taller blocks: the text sticks under the day headers while the block is cut by the top edge.
        sticky && 'sticky top-[var(--cal-head,0px)] self-start')}>
        {head && !headOnly && (
          <div className="mb-px flex min-w-0 items-center text-[11.5px] font-semibold leading-[15px] text-fg tnum"><span className="truncate">{head}</span></div>
        )}
        {headOnly ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4">
            <span className="shrink-0 font-semibold text-fg tnum">{head}</span>
            <span className="min-w-0 truncate text-fg-muted">{title}</span>
          </div>
        ) : paused ? (
          <PausedBody it={it} title={title} duration={duration} widthPx={widthPx} heightPx={heightPx} onResumeTimer={onResumeTimer} />
        ) : tiny && wide ? (
          // Day view, short entry: one row with everything.
          <div className="flex min-w-0 items-center gap-2 text-xs leading-4">
            <Status kind={kind} />
            <span className="max-w-[55%] shrink-0 truncate font-medium text-fg">{title}</span>
            <span className="min-w-0 flex-1 truncate text-fg-muted">{[it.client, it.note ? it.project : null, it.task].filter(Boolean).join(' · ')}</span>
            {pausedTag}
            {hasBadges && <span className="flex shrink-0 items-center gap-1"><Badges it={it} iconOnly /></span>}
            <span className={cn('shrink-0 font-semibold tnum', durTone)}>{duration}</span>
            {moneyEl('w-[68px] text-right')}
          </div>
        ) : tiny ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4">
            <Status kind={kind} />
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{title}</span>
            {tinyDur && <span className={cn('shrink-0 font-semibold tnum', durTone)}>{duration}</span>}
            {tinyMoney && moneyEl('ml-0.5 text-[11px]')}
          </div>
        ) : wide ? (
          // Wide (day view): details left, numbers right.
          <div className="flex min-w-0 items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className={cn('flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-fg', compact ? 'leading-4' : 'leading-[17px]')}>
                <Status kind={kind} />
                <span className="min-w-0 truncate">{title}</span>
                {pausedTag}
                {hasBadges && <span className="flex shrink-0 items-center gap-1 pl-1"><Badges it={it} /></span>}
              </div>
              {(
                <div className={cn('min-w-0 truncate text-xs text-fg-muted', compact ? 'leading-[14px]' : 'mt-0.5 leading-4')}>
                  {[it.client, it.note ? it.project : null, it.task].filter(Boolean).join(' · ')}
                  <span className="text-fg-subtle tnum"> · {running ? `since ${clockHM(it.start)}` : paused ? `started ${clockHM(it.start)}` : timeText}</span>
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className={cn('text-[13px] font-semibold tnum', durTone, compact ? 'leading-4' : 'leading-[17px]')}>{duration}</div>
              <div className={cn('text-xs tnum', compact ? 'leading-[14px]' : 'mt-0.5 leading-4', it.free ? 'font-medium text-free-text' : 'text-fg-muted')}>{paused ? `${money} so far` : money}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 items-start gap-1.5 text-xs font-medium leading-[15px] text-fg">
              <Status kind={kind} className={running ? 'mt-[5px]' : 'mt-[2px]'} />
              <span className={cn('min-w-0', narrowWrap ? cn(CLAMP[wrapLines], '[hyphens:auto] [overflow-wrap:anywhere]') : roomy ? 'line-clamp-2 [overflow-wrap:anywhere]' : 'truncate')}>{title}</span>
            </div>
            {wrapMeta && <div className="mt-0.5 min-w-0 truncate text-[11px] leading-[14px] text-fg-muted">{it.client}</div>}
            {!two && !narrowWrap && (
              heightPx >= 78 && it.note && it.project ? (
                <>
                  <div className="mt-0.5 min-w-0 truncate text-[11px] leading-[14px] text-fg-muted">{it.client}</div>
                  <div className="min-w-0 truncate text-[11px] leading-[14px] text-fg-muted">{it.project}</div>
                </>
              ) : (
                <div className="mt-0.5 min-w-0 truncate text-[11px] leading-[14px] text-fg-muted">
                  {it.note ? [it.client, it.project].filter(Boolean).join(' · ') : it.client}
                </div>
              )
            )}
            {wrapRow && <div className={cn('flex min-w-0 items-center gap-1.5 text-[11px] leading-4', shortTwo ? 'mt-0' : two || narrowWrap ? 'mt-px' : 'mt-[3px]')}>
              <span className={cn('shrink-0 text-[11.5px] font-semibold tnum', durTone)}>{duration}</span>
              {pausedTag}
              {rowClient && <span className="min-w-0 truncate text-fg-muted">{it.client}</span>}
              {(rowMoney || rowBadges) && (
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  {rowBadges && <span className="flex items-center gap-0.5"><Badges it={{ ...it, free: false }} iconOnly /></span>}
                  {rowMoney && moneyEl()}
                </span>
              )}
            </div>}
            {wrapRow && wrapMoney && stackMoney && <div className="min-w-0 text-[11px] leading-[14px]">{moneyEl()}</div>}
          </>
        )}
      </div>
      {onResizeDown && piece.last && (
        <span aria-hidden onPointerDown={onResizeDown}
          className={cn('absolute inset-x-0 bottom-0 z-10 cursor-ns-resize', tiny ? 'h-[5px]' : 'h-[7px]')}>
          {!tiny && <span className="absolute bottom-[3px] left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-fg/30 opacity-0 transition-opacity duration-fast group-hover/block:opacity-100" />}
        </span>
      )}
    </div>
  );
});

const menuItem = 'relative flex h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 text-sm text-fg outline-none data-[highlighted]:bg-fg/[0.06] [&_svg]:size-4 [&_svg]:text-fg-subtle';

function Row({ label, children, strong, className }) {
  return (
    <>
      <span className="text-fg-subtle">{label}</span>
      <span className={cn('text-right tnum', strong ? 'font-semibold text-fg' : 'text-fg', className)}>{children}</span>
    </>
  );
}

// Detail card on hover: everything the block had to cut, plus how the amount was reached.
function Details({ it, now }) {
  const { kind } = it;
  const timer = kind !== 'entry';
  const nums = numbersOf(it, now);
  const pauses = kind === 'entry' ? (it.rawEnd - it.start) - it.duration : 0;
  const why = [it.ai && `AI ×${entryAiFactor(it)}`, nums.roundMin > 0 && `${nums.roundMin} min rounding`].filter(Boolean).join(', ');
  const billableDiffers = Math.abs(nums.billableMs - nums.ms) >= MIN_MS;
  return (
    <div className="w-72 p-3.5">
      <div className="flex items-start gap-2">
        <ClientDot client={it.client} className="mt-[6px]" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5 text-fg [overflow-wrap:anywhere]">{blockTitle(it)}</div>
          <div className="mt-0.5 text-xs text-fg-muted">{[it.client, it.project].filter(Boolean).join(' · ')}</div>
          <div className="text-xs text-fg-subtle">{it.task}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-2.5 text-xs">
        <Row label="When">
          {fmtDayShort(new Date(it.start))} · {clockHM(it.start)} – {kind === 'running' ? 'now' : kind === 'paused' ? 'paused' : clockHM(it.rawEnd ?? it.end)}
        </Row>
        <Row label="Tracked" strong className={kind === 'running' ? 'text-brand-text' : kind === 'paused' ? 'text-warning-text' : undefined}>
          {timer ? formatClock(nums.ms) : formatHM(nums.ms)}
        </Row>
        {pauses >= MIN_MS && <Row label="Pauses" className="text-fg-muted">{formatHM(pauses)} not billed</Row>}
        {!it.free && billableDiffers && <Row label="Billable">{formatHM(nums.billableMs)} <span className="text-fg-subtle">({why})</span></Row>}
        {!it.free && nums.rate > 0 && <Row label="Rate" className="text-fg-muted">{formatEUR(nums.rate)}/h</Row>}
        <Row label={timer ? 'So far' : 'Amount'} strong className={it.free ? 'text-free-text' : undefined}>
          {it.free ? `Free (${formatEUR(0)})` : formatEUR(nums.amount)}
        </Row>
      </div>
      {(it.ai || it.free || it.invoiced || kind === 'paused') && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {kind === 'paused' && <span className="inline-flex h-5 items-center gap-1 rounded-md bg-warning-soft px-1.5 text-2xs font-medium text-warning-text"><Pause className="size-3 fill-current" strokeWidth={0} />Paused</span>}
          {it.ai && <span className="inline-flex h-5 items-center gap-1 rounded-md bg-ai-soft px-1.5 text-2xs font-medium text-ai-text"><Sparkles className="size-3" />AI ×{entryAiFactor(it)}</span>}
          {it.free && <span className="inline-flex h-5 items-center gap-1 rounded-md bg-free-soft px-1.5 text-2xs font-medium text-free-text"><Gift className="size-3" />Free</span>}
          {it.invoiced && <span className="inline-flex h-5 items-center gap-1 rounded-md bg-invoiced-soft px-1.5 text-2xs font-medium text-invoiced-text"><Lock className="size-3" />Invoiced</span>}
        </div>
      )}
      <div className="mt-3 text-2xs text-fg-subtle">
        {kind === 'running' ? 'Running now. Pause or stop it in the bar above, or right-click.'
          : kind === 'paused' ? 'Paused. Press Resume to carry on.'
            : it.invoiced ? 'Click to edit. Invoiced entries do not move by drag.'
              : pauses >= MIN_MS ? 'Click to edit. Drag to move. Resizing bills the whole new span.'
                : 'Click to edit. Drag to move, drag the bottom edge to resize.'}
      </div>
    </div>
  );
}

// Hover cards live in their own host that never takes pointer events, so a card can never sit on
// top of a menu or dialog and swallow its clicks (the card's own style says the same, as Radix
// sets pointer-events inline while a modal layer is open).
let cardHost = null;
function getCardHost() {
  if (typeof document === 'undefined') return undefined;
  if (!cardHost || !cardHost.isConnected) {
    cardHost = document.createElement('div');
    cardHost.setAttribute('data-calendar-cards', '');
    cardHost.style.pointerEvents = 'none';
    document.body.appendChild(cardHost);
  }
  return cardHost;
}
// Any menu, dialog or popover on screen wins over a hover card.
const layerOpen = () => typeof document !== 'undefined'
  && !!document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]');

// One block on the grid, with a hover card and a right-click menu.
export const EventBlock = memo(function EventBlock({
  piece, top, height, leftPct, widthPct, widthPx, now, dimmed, dragging,
  onBlockDown, onResizeDown, onEdit, onDelete, onResume, onDuplicate, onOpenTimer, timerActions,
}) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const it = piece.item;
  const timer = it.kind !== 'entry';
  const style = { top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 6px)` };
  const nums = numbersOf(it, now);
  const state = it.kind === 'running' ? 'running' : it.kind === 'paused' ? 'paused' : formatHM(it.duration);
  const money = it.free ? 'free' : formatEUR(nums.amount);
  const label = `${blockTitle(it)}, ${it.client}, ${it.task}. ${clockHM(it.start)} to ${it.kind === 'running' ? 'now' : clockHM(it.rawEnd ?? it.end)}, ${state}, ${money}. ${timer ? 'Open the timer.' : 'Press Enter to edit, Delete to remove.'}`;
  const ta = timer && timerActions ? timerActions : null;

  const cardOpen = hover && !dragging && !menuOpen;
  // While the card shows: any press, key or new layer (menu, dialog) closes it at once.
  useEffect(() => {
    if (!cardOpen) return undefined;
    const close = () => setHover(false);
    const onLayer = () => { if (layerOpen()) close(); };
    const mo = new MutationObserver(onLayer);
    mo.observe(document.body, { childList: true });
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('contextmenu', close, true);
    return () => {
      mo.disconnect();
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('contextmenu', close, true);
    };
  }, [cardOpen]);

  const onKeyDown = (e) => {
    setHover(false);
    // A held key must not open the editor or the delete dialog again and again.
    if (e.repeat && ['Enter', ' ', 'Delete', 'Backspace'].includes(e.key)) { e.preventDefault(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (timer) onOpenTimer(); else onEdit(it.entry); }
    else if (!timer && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); onDelete(it.entry); }
  };

  const body = (
    <BlockBody it={it} piece={piece} style={style} heightPx={height} widthPx={widthPx} now={now}
      dimmed={dimmed} interactive label={label} onKeyDown={onKeyDown}
      onPointerDown={(e) => { setHover(false); onBlockDown(e, piece); }}
      onResumeTimer={ta?.resume && it.kind === 'paused' ? () => ta.resume(it.timer) : null}
      onResizeDown={timer || it.invoiced || !it.entry?.id ? null : (e) => onResizeDown(e, piece)} />
  );

  return (
    <ContextMenu.Root onOpenChange={(o) => { setMenuOpen(o); if (o) setHover(false); }}>
      <HoverCard.Root openDelay={450} closeDelay={80} open={cardOpen}
        onOpenChange={(o) => { if (!o) setHover(false); else if (!layerOpen()) setHover(true); }}>
        <ContextMenu.Trigger asChild>
          <HoverCard.Trigger asChild>{body}</HoverCard.Trigger>
        </ContextMenu.Trigger>
        <HoverCard.Portal container={getCardHost()}>
          <HoverCard.Content side="right" align="start" sideOffset={8} collisionPadding={12}
            style={{ pointerEvents: 'none' }} className={cn(popoverSurface, 'pointer-events-none')}>
            <Details it={it} now={now} />
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
      <ContextMenu.Portal>
        <ContextMenu.Content collisionPadding={8} className={cn(popoverSurface, 'min-w-[12rem] p-1')}>
          {timer ? (
            <>
              {ta && it.kind === 'running' && ta.pause && <ContextMenu.Item className={menuItem} onSelect={() => ta.pause(it.timer)}><Pause />Pause timer</ContextMenu.Item>}
              {ta && it.kind === 'paused' && ta.resume && <ContextMenu.Item className={menuItem} onSelect={() => ta.resume(it.timer)}><Play />Resume timer</ContextMenu.Item>}
              {ta?.stop && <ContextMenu.Item className={menuItem} onSelect={() => ta.stop(it.timer)}><Square />Stop and save</ContextMenu.Item>}
              {ta && (ta.pause || ta.resume || ta.stop) && <ContextMenu.Separator className="-mx-1 my-1 h-px bg-line" />}
              <ContextMenu.Item className={menuItem} onSelect={onOpenTimer}><ExternalLink />Open the Timer page</ContextMenu.Item>
            </>
          ) : (
            <>
              <ContextMenu.Item className={menuItem} onSelect={() => onEdit(it.entry)}><Pencil />Edit entry<span className="ml-auto pl-4 text-xs text-fg-subtle">Enter</span></ContextMenu.Item>
              <ContextMenu.Item className={menuItem} onSelect={() => onResume(it.entry)}><Play />Continue (start timer)</ContextMenu.Item>
              <ContextMenu.Item className={menuItem} onSelect={() => onDuplicate(it.entry)}><CopyPlus />Duplicate</ContextMenu.Item>
              <ContextMenu.Separator className="-mx-1 my-1 h-px bg-line" />
              <ContextMenu.Item className={cn(menuItem, 'text-danger-text data-[highlighted]:bg-danger-soft [&_svg]:text-danger-text')} onSelect={() => onDelete(it.entry)}>
                <Trash2 />Delete<span className="ml-auto pl-4 text-xs text-danger-text/70">Del</span>
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

// Drag preview of a block (moving or resizing). Never interactive.
export function GhostBlock({ piece, top, height, leftPct, widthPct, widthPx, now }) {
  const style = { top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 6px)` };
  return <BlockBody it={piece.item} piece={piece} style={style} heightPx={height} widthPx={widthPx} now={now} ghost className="pointer-events-none" />;
}
