import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '../../../lib/cn.js';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';

// Change vs an earlier stretch, as a small pill: ↗ 12%. value is a fraction (0.12 = +12%).
// goodWhen 'up' paints growth green; 'none' keeps it neutral (more hours is not good or bad).
export function Delta({ value, goodWhen = 'up', hint, className, size = 'sm' }) {
  if (value == null || !isFinite(value)) {
    return hint ? (
      <Tooltip content={hint}>
        <span tabIndex={0} className={cn('inline-flex h-5 items-center rounded-full px-1.5 text-2xs font-medium text-fg-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring/60', className)}>New</span>
      </Tooltip>
    ) : null;
  }
  const pct = Math.round(Math.abs(value) * 100);
  const flat = pct === 0;
  const up = value > 0;
  const good = goodWhen === 'none' || flat ? null : (up ? goodWhen === 'up' : goodWhen === 'down');
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const pill = (
    <span tabIndex={hint ? 0 : undefined}
      aria-label={`${flat ? 'No change' : `${up ? 'Up' : 'Down'} ${pct}%`}${hint ? `. ${hint}` : ''}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full font-semibold tnum outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        size === 'sm' ? 'h-5 pl-1 pr-1.5 text-2xs' : 'h-6 pl-1.5 pr-2 text-xs',
        good === true && 'bg-free-soft text-free-text',
        good === false && 'bg-danger-soft text-danger-text',
        good === null && 'bg-fg/[0.06] text-fg-muted',
        className,
      )}>
      <Icon aria-hidden className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={2.4} />
      {pct > 999 ? '>999' : pct}%
    </span>
  );
  return hint ? <Tooltip content={hint}>{pill}</Tooltip> : pill;
}
