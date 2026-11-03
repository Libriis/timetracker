import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { fromIsoDay, isoDay, UI_LOCALE } from '../../lib/format.js';
import { useMediaQuery } from '../../lib/useMediaQuery.js';
import { Button } from './Button.jsx';
import { Calendar } from './Calendar.jsx';
import { Popover, PopoverContent, PopoverTrigger } from './Popover.jsx';
import { Tooltip } from './Tooltip.jsx';

// One control for the date range: ‹ [This week · 2 – 8 Nov] › . The middle opens a popover with
// presets on the left and a range calendar on the right (21st.dev "Range calendar with presets").
// The arrows step the window back and forward (a week, a month, or the custom span).
//
// value:    { period, from, to }   period = a named preset id or 'custom'; from/to = 'YYYY-MM-DD' (custom only)
// onChange: ({ period, from, to }) => void
// presets:  ids from PRESETS below, in display order. Named periods ('today','week','month','year','all')
//           pass through as period; the rest become a custom range.

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const monthEnd = (y, m) => new Date(y, m + 1, 0);

export const PRESETS = {
  today: { label: 'Today', named: true, range: (n) => ({ from: startOfDay(n), to: startOfDay(n) }) },
  yesterday: { label: 'Yesterday', range: (n) => ({ from: addDays(startOfDay(n), -1), to: addDays(startOfDay(n), -1) }) },
  week: { label: 'This week', named: true, range: (n) => ({ from: monday(n), to: addDays(monday(n), 6) }) },
  lastWeek: { label: 'Last week', range: (n) => ({ from: addDays(monday(n), -7), to: addDays(monday(n), -1) }) },
  month: { label: 'This month', named: true, range: (n) => ({ from: new Date(n.getFullYear(), n.getMonth(), 1), to: monthEnd(n.getFullYear(), n.getMonth()) }) },
  lastMonth: { label: 'Last month', range: (n) => ({ from: new Date(n.getFullYear(), n.getMonth() - 1, 1), to: monthEnd(n.getFullYear(), n.getMonth() - 1) }) },
  last7: { label: 'Last 7 days', range: (n) => ({ from: addDays(startOfDay(n), -6), to: startOfDay(n) }) },
  last30: { label: 'Last 30 days', range: (n) => ({ from: addDays(startOfDay(n), -29), to: startOfDay(n) }) },
  year: { label: 'This year', named: true, range: (n) => ({ from: new Date(n.getFullYear(), 0, 1), to: new Date(n.getFullYear(), 11, 31) }) },
  all: { label: 'All time', named: true, range: () => null },
};

// The concrete window for a value, or null for "all time".
export function rangeOf(value, now = new Date()) {
  if (!value || value.period === 'all') return null;
  if (value.period === 'custom') {
    if (!value.from) return null;
    const from = fromIsoDay(value.from);
    const to = value.to ? fromIsoDay(value.to) : startOfDay(now);
    return { from, to: to < from ? from : to };
  }
  const p = PRESETS[value.period];
  return p ? p.range(now) : null;
}

const sameDay = (a, b) => a && b && isoDay(a) === isoDay(b);
const isWholeMonth = (r) => r.from.getDate() === 1 && sameDay(r.to, monthEnd(r.from.getFullYear(), r.from.getMonth()));
const isWholeYear = (r) => r.from.getMonth() === 0 && r.from.getDate() === 1 && r.to.getMonth() === 11 && r.to.getDate() === 31 && r.from.getFullYear() === r.to.getFullYear();

export function formatRange(r) {
  if (!r) return '';
  const y = new Date().getFullYear();
  const withYear = r.to.getFullYear() !== y || r.from.getFullYear() !== r.to.getFullYear();
  if (sameDay(r.from, r.to)) return r.from.toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  if (isWholeMonth(r)) return r.from.toLocaleDateString(UI_LOCALE, { month: 'long', year: 'numeric' });
  if (isWholeYear(r)) return String(r.from.getFullYear());
  const sameMonth = r.from.getMonth() === r.to.getMonth() && r.from.getFullYear() === r.to.getFullYear();
  const f = sameMonth ? String(r.from.getDate())
    : r.from.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', ...(r.from.getFullYear() !== r.to.getFullYear() ? { year: 'numeric' } : {}) });
  const t = r.to.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return `${f} – ${t}`;
}

// Step a window one unit back (-1) or forward (+1).
function step(r, dir) {
  if (isWholeYear(r)) { const y = r.from.getFullYear() + dir; return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) }; }
  if (isWholeMonth(r)) { const m = r.from.getMonth() + dir; const y = r.from.getFullYear(); return { from: new Date(y, m, 1), to: monthEnd(y, m) }; }
  const span = Math.round((startOfDay(r.to) - startOfDay(r.from)) / 86400000) + 1;
  return { from: addDays(r.from, dir * span), to: addDays(r.to, dir * span) };
}

// Name the preset a custom range happens to match (so "Last 7 days" keeps its name after picking it).
function matchPreset(range, presets, now) {
  if (!range) return null;
  for (const id of presets) {
    const p = PRESETS[id];
    const r = p && p.range(now);
    if (r && sameDay(r.from, range.from) && sameDay(r.to, range.to)) return id;
  }
  return null;
}

export function DateRangePicker({ value, onChange, presets = ['today', 'week', 'month', 'last7', 'last30', 'lastMonth', 'all'], className, align = 'start' }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(undefined);
  const [month, setMonth] = useState(new Date());
  const wide = useMediaQuery('(min-width: 900px)');
  const now = new Date();
  const range = rangeOf(value, now);
  const presetId = value.period !== 'custom' ? value.period : matchPreset(range, presets, now);
  const label = presetId ? PRESETS[presetId]?.label : null;
  const dates = formatRange(range);
  const canStep = !!range;
  const next = range && step(range, 1);
  const nextDisabled = !next || startOfDay(next.from) > startOfDay(now);

  const emit = (r) => onChange({ period: 'custom', from: isoDay(r.from), to: isoDay(r.to) });
  const pickPreset = (id) => {
    const p = PRESETS[id];
    if (p.named) onChange({ period: id, from: value.from || '', to: value.to || '' });
    else emit(p.range(new Date()));
    setOpen(false);
  };
  const onOpenChange = (o) => {
    setOpen(o);
    if (o) {
      setDraft(range ? { from: range.from, to: range.to } : undefined);
      setMonth(range ? (wide ? new Date(range.to.getFullYear(), range.to.getMonth() - 1, 1) : range.to) : (wide ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now));
    }
  };
  // A finished range + a click starts a new range, instead of stretching the old one.
  const onSelect = (r, day) => {
    if (draft?.from && draft?.to && !sameDay(draft.from, draft.to)) { setDraft({ from: day, to: undefined }); return; }
    setDraft(r || { from: day, to: undefined });
  };
  const apply = () => {
    if (!draft?.from) return;
    emit({ from: draft.from, to: draft.to || draft.from });
    setOpen(false);
  };
  const draftLabel = useMemo(() => (draft?.from ? formatRange({ from: draft.from, to: draft.to || draft.from }) : 'Pick a start day'), [draft]);

  const arrow = 'grid w-8 shrink-0 place-items-center text-fg-subtle outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-35';

  return (
    <div className={cn('inline-flex h-9 max-w-full items-stretch overflow-hidden rounded-lg border border-line-strong/80 bg-surface shadow-xs', className)}>
      <Tooltip content="Previous period">
        <button type="button" aria-label="Previous period" disabled={!canStep} onClick={() => emit(step(range, -1))} className={cn(arrow, 'border-r border-line')}>
          <ChevronLeft className="size-4" />
        </button>
      </Tooltip>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`Date range: ${label || ''} ${dates}`.trim()}
            className="group flex min-w-0 items-center gap-2 px-3 text-sm outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 data-[state=open]:bg-surface-2">
            <CalendarDays className="size-4 shrink-0 text-fg-subtle" />
            {label && <span className="whitespace-nowrap font-medium text-fg">{label}</span>}
            {label && dates && <span aria-hidden className="h-3.5 w-px shrink-0 bg-line-strong" />}
            {dates && <span className={cn('truncate tnum', label ? 'text-fg-muted' : 'font-medium text-fg')}>{dates}</span>}
            <ChevronDown className="size-3.5 shrink-0 text-fg-subtle transition-transform duration-base group-data-[state=open]:rotate-180" />
          </button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-auto max-w-[calc(100vw-24px)] p-0">
          <div className="flex max-sm:flex-col">
            <div className="flex shrink-0 flex-col gap-px border-line p-2 max-sm:border-b sm:w-40 sm:border-r">
              {presets.map(id => {
                const on = presetId === id;
                return (
                  <button key={id} type="button" onClick={() => pickPreset(id)} aria-pressed={on}
                    className={cn('flex h-8 items-center justify-between rounded-md px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
                      on ? 'bg-fg/[0.07] font-medium text-fg' : 'text-fg-muted hover:bg-fg/[0.05] hover:text-fg')}>
                    {PRESETS[id].label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col">
              <div className="p-3 pb-1">
                <Calendar mode="range" selected={draft} onSelect={onSelect} month={month} onMonthChange={setMonth}
                  numberOfMonths={wide ? 2 : 1} disabled={{ after: addDays(startOfDay(now), 366) }} />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
                <span className="text-sm text-fg-muted tnum">{draftLabel}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={apply} disabled={!draft?.from}>Apply</Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <Tooltip content="Next period">
        <button type="button" aria-label="Next period" disabled={nextDisabled} onClick={() => emit(next)} className={cn(arrow, 'border-l border-line')}>
          <ChevronRight className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
