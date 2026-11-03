import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

// Button. Variants: primary (neutral graphite, one per screen; orange is reserved for start/record), secondary (bordered surface), ghost, subtle (filled neutral),
// danger, danger-ghost, link. Sizes: xs, sm, md (default), lg, icon-xs, icon-sm, icon, icon-lg.
export const buttonVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium',
    'rounded-lg outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out',
    'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover',
        secondary: 'border border-line-strong/80 bg-surface text-fg shadow-xs hover:bg-surface-2 hover:border-line-strong',
        subtle: 'bg-surface-3 text-fg hover:bg-fg/[0.08]',
        ghost: 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg',
        danger: 'bg-danger text-white shadow-xs hover:bg-danger-hover',
        'danger-ghost': 'text-fg-muted hover:bg-danger-soft hover:text-danger-text',
        'brand-soft': 'bg-brand-soft text-brand-text hover:bg-brand/20',
        link: 'h-auto px-0 text-fg underline decoration-fg/30 underline-offset-4 hover:decoration-fg active:translate-y-0',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-8 px-3 text-sm [&_svg]:size-4',
        md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-base rounded-xl [&_svg]:size-[18px]',
        'icon-xs': 'size-7 [&_svg]:size-3.5',
        'icon-sm': 'size-8 [&_svg]:size-4',
        icon: 'size-9 [&_svg]:size-4',
        'icon-lg': 'size-11 rounded-xl [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export const Button = forwardRef(function Button({ className, variant, size, asChild = false, type, ...props }, ref) {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} type={asChild ? undefined : (type || 'button')} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
