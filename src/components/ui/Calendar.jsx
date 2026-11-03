import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '../../lib/cn.js';
import { buttonVariants } from './Button.jsx';

// Month grid on react-day-picker v9. Ported from the 21st.dev "Calendar [React Day Picker]" (originui):
// range selection with joined start/middle/end cells, a dot under today, Monday-first weeks.
//   <Calendar mode="range" selected={{from,to}} onSelect={...} numberOfMonths={2} />
export function Calendar({ className, classNames, showOutsideDays = true, components, ...props }) {
  const base = {
    months: 'relative flex flex-col gap-4 sm:flex-row',
    month: 'w-full',
    month_caption: 'relative z-20 mx-10 mb-1 flex h-9 items-center justify-center',
    caption_label: 'text-sm font-semibold text-fg',
    nav: 'absolute top-0 z-10 flex w-full justify-between',
    button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'text-fg-subtle hover:text-fg'),
    button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'text-fg-subtle hover:text-fg'),
    weekdays: 'flex',
    weekday: 'size-9 p-0 text-2xs font-medium text-fg-subtle grid place-items-center',
    week: 'flex',
    day_button: cn(
      'relative flex size-9 items-center justify-center whitespace-nowrap rounded-lg p-0 text-sm text-fg tnum outline-none',
      'transition-[color,background-color,border-radius] duration-fast hover:bg-fg/[0.06]',
      'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/60',
      'group-data-[selected]:bg-primary group-data-[selected]:text-primary-fg',
      'group-data-[disabled]:pointer-events-none group-data-[disabled]:text-fg/25',
      'group-data-[outside]:text-fg-subtle group-data-[outside]:group-data-[selected]:text-primary-fg',
      'group-[.range-start:not(.range-end)]:rounded-e-none group-[.range-end:not(.range-start)]:rounded-s-none',
      'group-[.range-middle]:rounded-none group-data-[selected]:group-[.range-middle]:bg-fg/[0.08] group-data-[selected]:group-[.range-middle]:text-fg',
    ),
    day: 'group size-9 px-0 text-sm',
    range_start: 'range-start',
    range_end: 'range-end',
    range_middle: 'range-middle',
    today: cn(
      '*:after:pointer-events-none *:after:absolute *:after:bottom-1 *:after:start-1/2 *:after:z-10 *:after:size-[3px] *:after:-translate-x-1/2',
      '*:after:rounded-full *:after:bg-brand [&[data-selected]:not(.range-middle)>*]:after:bg-primary-fg',
    ),
    outside: '',
    hidden: 'invisible',
  };
  const merged = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, classNames?.[k] ? cn(v, classNames[k]) : v]));
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn('w-fit', className)}
      classNames={merged}
      components={{
        Chevron: ({ orientation, ...p }) => (orientation === 'left'
          ? <ChevronLeft size={16} strokeWidth={2} aria-hidden {...p} />
          : <ChevronRight size={16} strokeWidth={2} aria-hidden {...p} />),
        ...components,
      }}
      {...props}
    />
  );
}
