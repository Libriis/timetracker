import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';
import { clientColor } from '../../lib/colors.js';

// Small status label. Semantic variants map to billing states:
// ai (AI-assisted ×1.5), free (complimentary), invoiced, paused, brand, neutral, outline, danger, warning.
export const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-medium leading-none [&_svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-fg/[0.06] text-fg-muted',
        outline: 'border border-line-strong text-fg-muted',
        brand: 'bg-brand-soft text-brand-text',
        ai: 'bg-ai-soft text-ai-text',
        free: 'bg-free-soft text-free-text',
        invoiced: 'bg-invoiced-soft text-invoiced-text',
        paused: 'bg-warning-soft text-warning-text',
        danger: 'bg-danger-soft text-danger-text',
        warning: 'bg-warning-soft text-warning-text',
      },
      size: {
        sm: 'h-[18px] px-1.5 text-2xs',
        md: 'h-[22px] px-2 text-xs',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'sm' },
  },
);

export function Badge({ variant, size, className, ...props }) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

// Client color dot. Color comes from the client name (src/lib/colors.js).
export function ClientDot({ client, color, size = 8, className, pulse = false }) {
  return (
    <span aria-hidden className={cn('inline-block shrink-0 rounded-full', pulse && 'animate-pulse-dot', className)}
      style={{ width: size, height: size, background: color || clientColor(client) }} />
  );
}

// "● Client" label, optionally followed by a project. Text keeps the fg color; the dot carries identity.
export function ClientTag({ client, project, className, muted = false, size = 'sm' }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', size === 'sm' ? 'text-sm' : 'text-base', className)}>
      <ClientDot client={client} />
      <span className={cn('truncate', muted ? 'text-fg-muted' : 'text-fg')}>{client}</span>
      {project && (
        <>
          <span aria-hidden className="text-fg-faint">·</span>
          <span className="truncate text-fg-muted">{project}</span>
        </>
      )}
    </span>
  );
}

// Project chip with the client's color as a tinted fill.
export function ProjectChip({ client, project, className }) {
  const c = clientColor(client);
  return (
    <span className={cn('inline-flex h-[22px] min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium', className)}
      style={{ background: `color-mix(in srgb, ${c} 12%, transparent)`, color: `color-mix(in srgb, ${c} 78%, rgb(var(--fg)))` }}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: c }} />
      <span className="truncate">{project}</span>
    </span>
  );
}
