import { Children, cloneElement, forwardRef, isValidElement, useId } from 'react';
import { cn } from '../../lib/cn.js';

export const controlBase = [
  'w-full rounded-lg border border-line-strong/80 bg-surface text-fg shadow-xs',
  'placeholder:text-fg-subtle outline-none transition-[border-color,box-shadow] duration-fast ease-out',
  'hover:border-line-strong focus:border-ring/70 focus:shadow-focus',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

const sizes = {
  sm: 'h-8 px-2.5 text-sm',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-3.5 text-base',
};

// Text input. `icon` renders a leading icon inside the field; `suffix` a trailing unit (e.g. "€/h").
export const Input = forwardRef(function Input({ className, size = 'md', icon, suffix, wrapperClassName, ...props }, ref) {
  if (!icon && !suffix) {
    return <input ref={ref} className={cn(controlBase, sizes[size], 'tnum', className)} {...props} />;
  }
  return (
    <div className={cn('relative flex items-center', wrapperClassName)}>
      {icon && <span className="pointer-events-none absolute left-2.5 flex text-fg-subtle [&_svg]:size-4">{icon}</span>}
      <input ref={ref} className={cn(controlBase, sizes[size], 'tnum', icon && 'pl-8', suffix && 'pr-10', className)} {...props} />
      {suffix && <span className="pointer-events-none absolute right-3 text-xs text-fg-subtle">{suffix}</span>}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlBase, 'min-h-[76px] resize-none px-3 py-2 text-sm leading-5', className)} {...props} />;
});

export function Label({ className, children, hint, ...props }) {
  return (
    <label className={cn('mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-fg-muted', className)} {...props}>
      <span>{children}</span>
      {hint && <span className="font-normal text-fg-subtle">{hint}</span>}
    </label>
  );
}

// Label + control + optional help text, stacked. A single child control without an id gets one,
// so the label is announced and clicking it focuses the control.
export function Field({ label, hint, help, htmlFor, className, children }) {
  const autoId = useId();
  const only = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const id = htmlFor || (only && only.props.id) || (label && only ? autoId : undefined);
  const control = only && id && !only.props.id ? cloneElement(only, { id }) : children;
  return (
    <div className={cn('min-w-0', className)}>
      {label && <Label htmlFor={id} hint={hint}>{label}</Label>}
      {control}
      {help && <div className="mt-1.5 text-xs text-fg-subtle">{help}</div>}
    </div>
  );
}
