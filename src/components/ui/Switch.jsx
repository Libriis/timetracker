import { forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../lib/cn.js';

const ON = { brand: 'data-[state=checked]:bg-primary', ai: 'data-[state=checked]:bg-ai', free: 'data-[state=checked]:bg-free' };
const ROW_ON = { brand: 'border-line bg-surface hover:bg-surface-2', ai: 'border-ai/30 bg-ai-soft/70', free: 'border-free/30 bg-free-soft/70' };
const ICON_ON = { brand: 'text-fg-muted', ai: 'text-ai-text', free: 'text-free-text' };

// tone colors the "on" state: brand (default; neutral primary), ai, free.
export const Switch = forwardRef(function Switch({ className, tone = 'brand', size = 'md', ...props }, ref) {
  const dims = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const thumb = size === 'sm' ? 'size-3 data-[state=checked]:translate-x-3' : 'size-4 data-[state=checked]:translate-x-4';
  return (
    <SwitchPrimitive.Root ref={ref}
      className={cn(
        'peer inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none transition-colors duration-base ease-out',
        'bg-fg/[0.16] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50',
        dims, ON[tone], className,
      )}
      {...props}>
      <SwitchPrimitive.Thumb className={cn('pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-base ease-out data-[state=unchecked]:translate-x-0', thumb, tone === 'brand' && 'dark:data-[state=checked]:bg-primary-fg')} />
    </SwitchPrimitive.Root>
  );
});

// Full-width row: title + description on the left, switch on the right. The whole row toggles.
export function SwitchRow({ label, description, checked, onChange, tone = 'brand', className, icon }) {
  return (
    <label className={cn(
      'flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-base ease-out',
      checked ? ROW_ON[tone] : 'border-line bg-surface hover:bg-surface-2',
      className,
    )}>
      {icon && <span className={cn('mt-0.5 flex [&_svg]:size-4', checked ? ICON_ON[tone] : 'text-fg-subtle')}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-[17px] text-fg-subtle">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} tone={tone} className="mt-0.5" />
    </label>
  );
}
