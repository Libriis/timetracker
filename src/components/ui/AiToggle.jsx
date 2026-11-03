import { Sparkles } from 'lucide-react';
import { AI_FACTOR } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { SwitchRow } from './Switch.jsx';
import { Tooltip } from './Tooltip.jsx';

// Form row (Manual entry, Edit entry).
export function AiToggle({ ai, setAi }) {
  return (
    <SwitchRow tone="ai" icon={<Sparkles />} checked={ai} onChange={setAi}
      label={`AI-assisted · ×${AI_FACTOR}`}
      description={ai
        ? `Billed at ×${AI_FACTOR} of the tracked time. The client sees only the billable time.`
        : `Turn on when AI did part of the work, so the stopwatch undersells it. Bills at ×${AI_FACTOR}.`} />
  );
}

// Compact AI ×1.5 switch for the timer bar and running timers. One control, two clear states:
// off = quiet outline with an empty track, on = violet fill with the knob moved over.
export function AiPill({ on, onToggle, size = 'md', className }) {
  return (
    <Tooltip content={on ? `AI-assisted: bills ×${AI_FACTOR} of the tracked time. Click to turn off.` : `AI-assisted? Turn on to bill ×${AI_FACTOR}.`}>
      <button type="button" role="switch" aria-checked={!!on} aria-label={`AI-assisted, bills ×${AI_FACTOR}`} onClick={onToggle}
        className={cn(
          'group inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium outline-none transition-colors duration-fast ease-out',
          'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
          size === 'sm' ? 'h-7 pl-2 pr-1 text-xs' : 'h-8 pl-2.5 pr-1.5 text-sm',
          on ? 'border-ai/35 bg-ai-soft text-ai-text hover:border-ai/55' : 'border-line-strong/80 bg-surface text-fg-muted hover:border-fg/25 hover:text-fg',
        )}>
        <Sparkles className={cn('size-3.5', on ? '' : 'text-fg-subtle group-hover:text-fg-muted')} />
        <span className="tnum">AI ×{AI_FACTOR}</span>
        <span aria-hidden className={cn('relative ml-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-base',
          on ? 'bg-ai' : 'bg-fg/[0.14]')}>
          <span className={cn('size-3 rounded-full bg-white shadow-sm transition-transform duration-base ease-out', on ? 'translate-x-3' : 'translate-x-0')} />
        </span>
      </button>
    </Tooltip>
  );
}
