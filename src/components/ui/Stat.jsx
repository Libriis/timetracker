import { cn } from '../../lib/cn.js';
import { splitEUR } from '../../lib/format.js';

// Number display: small label, big tabular value, optional sub line and trend.
// tone: 'default' | 'brand' | 'free' | 'ai'
export function Stat({ label, value, unit, sub, trend, tone = 'default', size = 'md', className, icon }) {
  const toneCls = { default: 'text-fg', brand: 'text-brand-text', free: 'text-free-text', ai: 'text-ai-text' }[tone];
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
        {icon && <span className="flex [&_svg]:size-3.5">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('mt-1.5 flex items-baseline gap-1 font-semibold tnum', size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl', toneCls)}>
        <span className="truncate">{value}</span>
        {unit && <span className="text-base font-medium text-fg-subtle">{unit}</span>}
      </div>
      {(sub || trend) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle tnum">
          {trend}
          {sub && <span className="truncate">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// Up/down delta: value is a fraction (0.12 = +12%).
export function Trend({ value, goodWhen = 'up', label }) {
  if (value == null || !isFinite(value)) return null;
  const up = value >= 0;
  const good = (up && goodWhen === 'up') || (!up && goodWhen === 'down');
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium', good ? 'text-free-text' : 'text-danger-text')}>
      <span aria-hidden>{up ? '↑' : '↓'}</span>{Math.abs(value * 100).toFixed(0)}%
      {label && <span className="ml-1 font-normal text-fg-subtle">{label}</span>}
    </span>
  );
}

// Money with smaller cents: €5,067.83 → "€5,067" + ".83". Keeps big numbers calm but exact.
export function Amount({ value, className, centsClassName }) {
  const { whole, cents } = splitEUR(value);
  return (
    <span className={cn('tnum', className)}>
      {whole}<span className={cn('text-[0.66em] font-medium opacity-60', centsClassName)}>{cents}</span>
    </span>
  );
}
