import { forwardRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { clientColor } from '../../lib/colors.js';
import { Label } from './Input.jsx';

const triggerSizes = {
  sm: 'h-8 pl-2.5 pr-2 text-sm',
  md: 'h-9 pl-3 pr-2.5 text-sm',
  lg: 'h-11 pl-3.5 pr-3 text-base',
};

const norm = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

// Styled select (Radix). Options: strings or { value, label, color?, icon? }.
// clientDots: show each option's client color dot (skips the value 'all').
// Values must be non-empty strings.
export function Select({ label, value, onChange, options, size = 'md', placeholder, className, triggerClassName, clientDots = false, align = 'start', icon, title, disabled, contentClassName, 'aria-label': ariaLabel }) {
  const opts = options.map(norm);
  const current = opts.find(o => o.value === value);
  const dotFor = (o) => o.color || (clientDots && o.value !== 'all' ? clientColor(o.value) : null);
  const control = (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel || label || placeholder}
        title={title}
        className={cn(
          'group inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-line-strong/80 bg-surface text-left text-fg shadow-xs outline-none',
          'transition-[border-color,box-shadow,background-color] duration-fast ease-out hover:border-line-strong hover:bg-surface-2',
          'focus-visible:border-ring/70 focus-visible:shadow-focus data-[state=open]:border-ring/70 data-[state=open]:shadow-focus',
          'disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-fg-subtle',
          triggerSizes[size], triggerClassName,
        )}>
        <span className="flex min-w-0 items-center gap-2">
          {icon && <span className="flex text-fg-subtle [&_svg]:size-4">{icon}</span>}
          {current && dotFor(current) && <Dot color={dotFor(current)} />}
          <span className="truncate"><SelectPrimitive.Value placeholder={placeholder}>{current ? current.label : undefined}</SelectPrimitive.Value></span>
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-fg-subtle transition-transform duration-base ease-out group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} align={align}
          className={cn(
            'relative z-[70] max-h-[min(var(--radix-select-content-available-height),360px)] min-w-[var(--radix-select-trigger-width)] max-w-[22rem] overflow-hidden',
            'rounded-xl border border-line bg-surface-raised text-fg shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-[0.97] data-[state=open]:zoom-in-[0.97] data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
            contentClassName,
          )}>
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-fg-subtle"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {opts.map(o => (
              <SelectItem key={o.value} value={o.value} dot={dotFor(o)} icon={o.icon}>{o.label}</SelectItem>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-fg-subtle"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
  if (!label) return <div className={cn('min-w-0', className)}>{control}</div>;
  return (
    <div className={cn('min-w-0', className)}>
      <Label>{label}</Label>
      {control}
    </div>
  );
}

export const SelectItem = forwardRef(function SelectItem({ children, dot, icon, className, ...props }, ref) {
  return (
    <SelectPrimitive.Item ref={ref}
      className={cn(
        'relative flex h-8 cursor-default select-none items-center gap-2 rounded-lg pl-2.5 pr-8 text-sm text-fg outline-none',
        'data-[highlighted]:bg-fg/[0.06] data-[state=checked]:font-medium data-[disabled]:opacity-50',
        className,
      )}
      {...props}>
      {icon && <span className="flex text-fg-subtle [&_svg]:size-4">{icon}</span>}
      {dot && <Dot color={dot} />}
      <SelectPrimitive.ItemText><span className="truncate">{children}</span></SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex text-fg"><Check className="size-4" /></SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});

function Dot({ color }) {
  return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />;
}
