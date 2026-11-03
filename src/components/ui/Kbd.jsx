import { cn } from '../../lib/cn.js';

export function Kbd({ className, ...props }) {
  return <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1 font-sans text-2xs font-medium text-fg-subtle', className)} {...props} />;
}
