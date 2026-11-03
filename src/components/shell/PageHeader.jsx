import { cn } from '../../lib/cn.js';

// Top of every view: title + one-line description on the left, actions on the right.
// Toolbars (filters) go in `children`, rendered under the title row.
export function PageHeader({ title, description, actions, children, className }) {
  return (
    <header className={cn('mb-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-fg">{title}</h1>
          {description && <p className="mt-1 text-sm text-fg-subtle tnum">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

// Standard content column for a view.
export function Page({ className, children, width = 'default' }) {
  return (
    <div className={cn('mx-auto w-full px-5 pb-16 pt-7 sm:px-8', width === 'narrow' ? 'max-w-[880px]' : 'max-w-[1240px]', className)}>
      {children}
    </div>
  );
}
