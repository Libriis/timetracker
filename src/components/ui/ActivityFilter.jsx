import { useState } from 'react';
import { ChevronDown, ListFilter } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Checkbox } from './Checkbox.jsx';
import { Popover, PopoverContent, PopoverTrigger } from './Popover.jsx';

// File-name part for exports when some activities are hidden, e.g. "excl-web-production".
export function excludedSuffix(excluded, options) {
  const active = excluded.filter(t => options.includes(t));
  if (active.length === 0) return '';
  return 'excl-' + active.map(t => t.replace(/[^a-z0-9]+/gi, '-').toLowerCase()).join('-');
}

// Activity (task) filter: a checkbox list. Unticked activities are hidden.
// Stores the EXCLUDED names, so a new activity is shown by default.
export function ActivityFilter({ options, excluded, onChange, align = 'left', size = 'md' }) {
  const [open, setOpen] = useState(false);
  const active = excluded.filter(t => options.includes(t));
  const shown = options.filter(t => !active.includes(t));
  const label = active.length === 0 ? 'All activities'
    : shown.length === 0 ? 'No activities'
    : shown.length === 1 ? `Only ${shown[0]}`
    : active.length === 1 ? `All except ${active[0]}`
    : shown.length < active.length ? `${shown.length} of ${options.length} activities`
    : `All except ${active.length} activities`;
  const toggle = (t) => onChange(excluded.includes(t) ? excluded.filter(x => x !== t) : [...excluded, t]);
  const filtered = active.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title={filtered ? `Hidden: ${active.join(', ')}` : 'Filter by activity'}
          className={cn(
            'group inline-flex max-w-[16rem] items-center gap-1.5 whitespace-nowrap rounded-lg border shadow-xs outline-none transition-colors duration-fast',
            'focus-visible:border-ring/70 focus-visible:shadow-focus data-[state=open]:shadow-focus',
            size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-9 px-3 text-sm',
            filtered ? 'border-fg/30 bg-surface text-fg hover:bg-surface-2' : 'border-line-strong/80 bg-surface text-fg hover:bg-surface-2',
          )}>
          <ListFilter className={cn('size-4 shrink-0', filtered ? '' : 'text-fg-subtle')} />
          <span className="truncate">{label}</span>
          {filtered && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-2xs font-semibold text-primary-fg tnum">{active.length}</span>}
          <ChevronDown className="size-3.5 shrink-0 opacity-60 transition-transform duration-base group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align === 'right' ? 'end' : 'start'} className="w-72 p-1.5">
        <div className="mb-1 flex items-center justify-between border-b border-line px-2 pb-2 pt-1">
          <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">Show activities</span>
          <button type="button" onClick={() => onChange([])} disabled={!filtered}
            className={cn('text-xs font-medium', filtered ? 'text-fg underline decoration-fg/30 underline-offset-2 hover:decoration-fg' : 'cursor-default text-fg-subtle')}>Show all</button>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {options.map(t => {
            const on = !excluded.includes(t);
            return (
              <div key={t} className="group flex h-9 items-center gap-2 rounded-lg px-2 hover:bg-fg/[0.05]">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox checked={on} onCheckedChange={() => toggle(t)} />
                  <span className={cn('truncate', on ? 'text-fg' : 'text-fg-subtle line-through')}>{t}</span>
                </label>
                <button type="button" onClick={() => onChange(options.filter(o => o !== t))} title={`Show only ${t}`}
                  className="rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle opacity-0 transition hover:bg-fg/[0.06] hover:text-fg focus:opacity-100 group-hover:opacity-100">Only</button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
