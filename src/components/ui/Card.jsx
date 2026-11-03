import { cn } from '../../lib/cn.js';

// Surface container. Compose: <Card><CardHeader title description actions /><CardBody>…</CardBody></Card>
export function Card({ className, as: Comp = 'section', ...props }) {
  return <Comp className={cn('rounded-xl border border-line bg-surface shadow-card', className)} {...props} />;
}

export function CardHeader({ title, description, actions, icon, className, children }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-4', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 flex text-fg-subtle [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          {title && <h3 className="text-base font-semibold tracking-[-0.01em] text-fg">{title}</h3>}
          {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }) {
  return <div className={cn('px-5 pb-5 pt-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-line px-5 py-3', className)} {...props} />;
}

// Uppercase micro heading used inside cards and panels.
export function SectionLabel({ className, ...props }) {
  return <div className={cn('text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle', className)} {...props} />;
}
