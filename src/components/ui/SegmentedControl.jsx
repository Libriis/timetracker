import { useId, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/cn.js';

// Segmented control (radiogroup) with a thumb that glides between options.
// Ported from the 21st.dev "Segmented Control" (ddoemonn): roving focus + arrow keys,
// rebuilt with a shared-layout thumb so options can have natural widths.
// options: [{ value, label, icon? }] or strings.
export function SegmentedControl({ options, value, onChange, label, size = 'md', className, fullWidth = false }) {
  const id = useId();
  const reduced = useReducedMotion();
  const refs = useRef([]);
  const opts = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));
  const index = opts.findIndex(o => o.value === value); // -1: no option highlighted
  const go = (i) => {
    const n = (i + opts.length) % opts.length;
    refs.current[n]?.focus();
    onChange(opts[n].value);
  };
  const onKeyDown = (e, i) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(opts.length - 1); }
  };
  const h = size === 'sm' ? 'h-8' : 'h-9';
  const item = size === 'sm' ? 'px-2.5 text-xs' : 'px-3 text-sm';
  return (
    <div role="radiogroup" aria-label={label}
      className={cn('relative inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-3 p-[3px]', h, fullWidth && 'flex w-full', className)}>
      {opts.map((o, i) => {
        const active = i === index;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} tabIndex={active || (index < 0 && i === 0) ? 0 : -1}
            aria-label={o.ariaLabel} title={o.title || o.ariaLabel}
            ref={(n) => { refs.current[i] = n; }}
            onClick={() => onChange(o.value)} onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium outline-none transition-colors duration-fast',
              'focus-visible:ring-2 focus-visible:ring-ring/50',
              item, fullWidth && 'flex-1',
              active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
            )}>
            {active && (
              <motion.span layoutId={`seg-${id}`} aria-hidden
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 38, mass: 0.6 }}
                className="absolute inset-0 rounded-md border border-line bg-surface shadow-sm" />
            )}
            {o.icon && <span className="relative flex [&_svg]:size-3.5">{o.icon}</span>}
            {o.label != null && <span className="relative">{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
