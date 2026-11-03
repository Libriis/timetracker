import { forwardRef } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { popoverSurface } from './Popover.jsx';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export const DropdownMenuContent = forwardRef(function DropdownMenuContent({ className, align = 'end', sideOffset = 6, ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.Content ref={ref} align={align} sideOffset={sideOffset} collisionPadding={8}
        className={cn(popoverSurface, 'min-w-[11rem] p-1', className)} {...props} />
    </Menu.Portal>
  );
});

const itemCls = 'relative flex h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 text-sm text-fg outline-none data-[highlighted]:bg-fg/[0.06] data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:text-fg-subtle';

export const DropdownMenuItem = forwardRef(function DropdownMenuItem({ className, danger, shortcut, children, ...props }, ref) {
  return (
    <Menu.Item ref={ref} className={cn(itemCls, danger && 'text-danger-text data-[highlighted]:bg-danger-soft [&_svg]:text-danger-text', className)} {...props}>
      {children}
      {shortcut && <span className="ml-auto pl-4 text-xs text-fg-subtle">{shortcut}</span>}
    </Menu.Item>
  );
});

export const DropdownMenuCheckboxItem = forwardRef(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <Menu.CheckboxItem ref={ref} className={cn(itemCls, 'pl-8', className)} {...props}>
      <span className="absolute left-2.5 flex"><Menu.ItemIndicator><Check className="!text-fg" /></Menu.ItemIndicator></span>
      {children}
    </Menu.CheckboxItem>
  );
});

export function DropdownMenuLabel({ className, ...props }) {
  return <Menu.Label className={cn('px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />;
}
