import { Sparkles } from 'lucide-react';
import { AI_FACTOR, validAiFactor } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { AiFactorField } from './AiFactorPicker.jsx';
import { SwitchRow } from './Switch.jsx';
import { Tooltip } from './Tooltip.jsx';

// Form row (Manual entry, Edit timer). With `setFactor`, turning AI on shows the factor picker
// right under the row: Default (the setting) or this item's own factor. `factor` null = Default.
export function AiToggle({ ai, setAi, factor, setFactor, noun = 'entry' }) {
  const f = validAiFactor(factor) ?? AI_FACTOR;
  const picker = !!setFactor && !!ai;
  return (
    <div>
      <SwitchRow tone="ai" icon={<Sparkles />} checked={ai} onChange={setAi} className={picker ? 'rounded-b-none' : undefined}
        label={`AI-assisted · ×${f}`}
        description={ai
          ? `Billed at ×${f} of the tracked time. The client sees only the billable time.`
          : `Turn on when AI did part of the work, so the stopwatch undersells it. Bills at ×${f}.`} />
      {picker && (
        <AiFactorField value={factor} onChange={setFactor} noun={noun}
          className="rounded-b-xl border border-t-0 border-ai/30 bg-ai-soft/70 pb-3 pl-10 pr-3 pt-0.5" />
      )}
    </div>
  );
}

// Compact AI ×1.5 switch for the timer bar and running timers. One control, two clear states:
// off = quiet outline with an empty track, on = violet fill with the knob moved over.
// `factor`: the factor this item bills at (default: the setting).
export function AiPill({ on, onToggle, size = 'md', className, factor }) {
  const f = validAiFactor(factor) ?? AI_FACTOR;
  return (
    <Tooltip content={on ? `AI-assisted: bills ×${f} of the tracked time. Click to turn off.` : `AI-assisted? Turn on to bill ×${f}.`}>
      <button type="button" role="switch" aria-checked={!!on} aria-label={`AI-assisted, bills ×${f}`} onClick={onToggle}
        className={cn(
          'group inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium outline-none transition-colors duration-fast ease-out',
          'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
          size === 'sm' ? 'h-7 pl-2 pr-1 text-xs' : 'h-8 pl-2.5 pr-1.5 text-sm',
          on ? 'border-ai/35 bg-ai-soft text-ai-text hover:border-ai/55' : 'border-line-strong/80 bg-surface text-fg-muted hover:border-fg/25 hover:text-fg',
          className,
        )}>
        <Sparkles className={cn('size-3.5', on ? '' : 'text-fg-subtle group-hover:text-fg-muted')} />
        <span className="tnum">AI ×{f}</span>
        <span aria-hidden className={cn('relative ml-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-base',
          on ? 'bg-ai' : 'bg-fg/[0.14]')}>
          <span className={cn('size-3 rounded-full bg-white shadow-sm transition-transform duration-base ease-out', on ? 'translate-x-3' : 'translate-x-0')} />
        </span>
      </button>
    </Tooltip>
  );
}
