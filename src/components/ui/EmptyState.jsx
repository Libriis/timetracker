import { cn } from '../../lib/cn.js';

// Empty / zero-data state: icon in a soft tile, a title, one line of help, optional action.
export function EmptyState({ icon, title, description, action, className, compact = false, children }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-6 py-8' : 'px-8 py-14', className)}>
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-subtle shadow-xs [&_svg]:size-5">
          {icon}
        </div>
      )}
      {title && <div className="text-base font-semibold text-fg">{title}</div>}
      {description && <p className="mt-1 max-w-sm text-sm text-fg-subtle text-balance">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
      {children}
    </div>
  );
}
