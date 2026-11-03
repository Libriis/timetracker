import { forwardRef, useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { clientColor } from '../../lib/colors.js';
import { Popover, PopoverContent, PopoverTrigger } from './Popover.jsx';

const norm = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

// Searchable picker (cmdk in a popover). Ported from the 21st.dev / shadcn combobox pattern.
//  - options: strings or { value, label, color?, hint? }
//  - clientDots: color dot per option from the client name
//  - allowCustom: typing a new value offers "Use “…”" (free text, e.g. a new project)
//  - clearLabel: adds an item that sets the value to '' (e.g. "No project")
//  - variant: 'field' (form control) | 'pill' (compact chip used in the timer bar)
export const Combobox = forwardRef(function Combobox({
  value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', emptyText = 'No matches.',
  clientDots = false, allowCustom = false, clearLabel, icon, variant = 'field', size = 'md',
  className, contentClassName, align = 'start', label, title,
}, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const opts = options.map(norm);
  const current = opts.find(o => o.value === value) || (value ? { value, label: value } : null);
  const dotFor = (o) => o && (o.color || (clientDots ? clientColor(o.value) : null));
  const pick = (v) => { onChange(v); setOpen(false); setQuery(''); };
  const q = query.trim();
  const exact = opts.some(o => o.label.toLowerCase() === q.toLowerCase());

  const triggerCls = variant === 'pill'
    ? cn(
      'group inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none transition-colors duration-fast ease-out',
      'focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:border-line-strong data-[state=open]:bg-surface-2',
      current ? 'border-line-strong/80 bg-surface text-fg hover:bg-surface-2' : 'border-dashed border-line-strong text-fg-subtle hover:border-fg-faint hover:text-fg-muted',
    )
    : cn(
      'group inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-line-strong/80 bg-surface text-left shadow-xs outline-none',
      'transition-[border-color,box-shadow,background-color] duration-fast ease-out hover:border-line-strong hover:bg-surface-2',
      'focus-visible:border-ring/70 focus-visible:shadow-focus data-[state=open]:border-ring/70 data-[state=open]:shadow-focus',
      size === 'sm' ? 'h-8 pl-2.5 pr-2 text-sm' : 'h-9 pl-3 pr-2.5 text-sm',
    );

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <button ref={ref} type="button" aria-label={label || placeholder} title={title} className={cn(triggerCls, className)}>
          <span className="flex min-w-0 items-center gap-1.5">
            {icon && <span className={cn('flex [&_svg]:size-3.5', current ? 'text-fg-subtle' : '')}>{icon}</span>}
            {current && dotFor(current) && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dotFor(current) }} />}
            <span className={cn('truncate', !current && variant === 'field' && 'text-fg-subtle')}>{current ? current.label : placeholder}</span>
          </span>
          <ChevronDown className={cn('size-3.5 shrink-0 text-fg-subtle transition-transform duration-base ease-out group-data-[state=open]:rotate-180', variant === 'field' && 'size-4')} />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className={cn('w-[min(20rem,calc(100vw-24px))] p-0', contentClassName)}>
        <Command loop className="flex flex-col" filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 shrink-0 text-fg-subtle" />
            <Command.Input value={query} onValueChange={setQuery} placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle" />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1">
            {/* With free text allowed, the "Use …" row replaces the empty message (no blank band). */}
            {!(allowCustom && q) && <Command.Empty className="px-3 py-6 text-center text-sm text-fg-subtle">{emptyText}</Command.Empty>}
            {allowCustom && q && !exact && (
              <Command.Item value={`__custom__${q}`} onSelect={() => pick(q)} forceMount
                className="flex h-9 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm text-fg outline-none data-[selected=true]:bg-fg/[0.06]">
                <Plus className="size-4 text-fg-muted" />
                <span className="truncate">Use “{q}”</span>
              </Command.Item>
            )}
            {clearLabel && value && (
              <Command.Item value={`__clear__ ${clearLabel}`} onSelect={() => pick('')}
                className="flex h-9 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm text-fg-muted outline-none data-[selected=true]:bg-fg/[0.06]">
                <X className="size-4 text-fg-subtle" />
                <span className="truncate">{clearLabel}</span>
              </Command.Item>
            )}
            {opts.map(o => (
              <Command.Item key={o.value} value={o.label} onSelect={() => pick(o.value)}
                className="flex h-9 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm text-fg outline-none data-[selected=true]:bg-fg/[0.06]">
                {dotFor(o) ? <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dotFor(o) }} /> : null}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-xs text-fg-subtle">{o.hint}</span>}
                {o.value === value && <Check className="size-4 text-fg" />}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
