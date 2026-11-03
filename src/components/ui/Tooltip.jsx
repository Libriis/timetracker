import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/cn.js';

export function TooltipProvider({ children }) {
  return <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={150}>{children}</TooltipPrimitive.Provider>;
}

// <Tooltip content="Pause">{trigger}</Tooltip>. The trigger must accept a ref (button, span …).
export function Tooltip({ content, children, side = 'top', align = 'center', shortcut, className, delay }) {
  if (!content) return children;
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} align={align} sideOffset={6} collisionPadding={8}
          className={cn(
            'z-[80] flex max-w-xs items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs font-medium text-canvas shadow-md',
            'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
            className,
          )}>
          {content}
          {shortcut && <span className="text-canvas/60">{shortcut}</span>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
