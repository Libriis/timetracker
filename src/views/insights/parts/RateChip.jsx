import { cn } from '../../../lib/cn.js';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';
import { LOW_RATE_PCT } from '../insightsData.js';

// Rate health of a client against the studio average, as a colored chip with the % in words.
// health comes from buildInsights (rateHealth on the rounded %, last 12 months), the same rule and
// window the "Needs attention" rate check uses: a red chip always has a matching attention row.
// Green: at or above the average. Amber: up to 15% below. Red: further below.
// No health (too little tracked time to judge): the % shows in a neutral chip.

const TONE = {
  good: 'bg-free-soft text-free-text',
  fair: 'bg-warning-soft text-warning-text',
  low: 'bg-danger-soft text-danger-text',
  none: 'bg-fg/[0.06] text-fg-muted',
};
const WORD = { good: 'at or above average', fair: 'slightly below average', low: 'well below average', none: 'too little time to judge' };

export function RateChip({ vs, health, hint, className }) {
  if (vs == null || !isFinite(vs)) return <span className="text-xs text-fg-subtle">–</span>;
  const h = health || 'none';
  const pct = Math.round(vs * 100);
  const text = pct === 0 ? 'avg' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
  const chip = (
    <span tabIndex={hint ? 0 : undefined} aria-label={`${text === 'avg' ? 'Average' : text}, ${WORD[h]}${hint ? `. ${hint}` : ''}`}
      className={cn('inline-flex h-6 min-w-[3.25rem] items-center justify-center rounded-md px-2 text-xs font-semibold tnum outline-none focus-visible:ring-2 focus-visible:ring-ring/60', TONE[h], className)}>
      {text}
    </span>
  );
  return hint ? <Tooltip content={hint}>{chip}</Tooltip> : chip;
}

export function RateLegend({ className }) {
  return (
    <ul aria-label="Chip colors" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-subtle', className)}>
      <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-[3px] bg-free" />Avg or above</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-[3px] bg-warning" />Up to {Math.abs(LOW_RATE_PCT)}% below</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-[3px] bg-danger" />Further below</li>
    </ul>
  );
}
