import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const SPRING = { type: 'spring', stiffness: 460, damping: 38, mass: 0.9 };
const WIDTHS = { sm: 'max-w-sm', md: 'max-w-[480px]', lg: 'max-w-2xl', xl: 'max-w-3xl' };

// Dialog. Mount it to open it, unmount (or onClose) to close: callers render it conditionally.
// Radix handles the portal, focus trap, Esc and outside click; motion handles the entrance.
// Ported from the 21st.dev "Animated Dialog" (rmahammad): pinned header + footer, only the body scrolls.
//   <Modal title description onClose footer={<Buttons/>} size="md|lg|xl" icon>body</Modal>
// `wide` (legacy) = size "xl". `describeBody`: the body text is the dialog's description (ConfirmDialog).
export function Modal({ title, description, children, onClose, wide, size, footer, icon, className, bodyClassName, describeBody = false }) {
  const reduce = useReducedMotion();
  const w = WIDTHS[size || (wide ? 'xl' : 'md')];
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div className="fixed inset-0 z-50 bg-[rgb(10_10_14/0.42)] backdrop-blur-[3px]"
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }} />
        </DialogPrimitive.Overlay>
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content asChild
            // Focus goes to [data-autofocus] when a dialog marks one (ConfirmDialog: Cancel), otherwise to
            // the dialog itself, never to the close button. Tab then walks the fields in order.
            onOpenAutoFocus={(e) => {
              const root = e.currentTarget;
              const el = root?.querySelector?.('[data-autofocus]');
              e.preventDefault();
              if (el) el.focus(); else root?.focus?.({ preventScroll: true });
            }}
            // No description and no describing body: say so, so Radix links nothing (no echo of the title).
            {...(!description && !describeBody ? { 'aria-describedby': undefined } : {})}
            tabIndex={-1}>
            <motion.div
              className={cn(
                'pointer-events-auto relative flex max-h-[min(88vh,820px)] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised text-fg shadow-xl outline-none',
                w, className,
              )}
              initial={reduce ? false : { opacity: 0, scale: 0.97, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : SPRING}>
              <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5 pr-14">
                {icon && <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-muted [&_svg]:size-[18px]">{icon}</div>}
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-lg font-semibold text-fg">{title}</DialogPrimitive.Title>
                  {description && !describeBody && <DialogPrimitive.Description className="mt-0.5 text-sm text-fg-subtle">{description}</DialogPrimitive.Description>}
                </div>
              </div>
              <DialogPrimitive.Close aria-label="Close"
                className="absolute right-3.5 top-3.5 grid size-8 place-items-center rounded-lg text-fg-subtle outline-none transition-colors hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50">
                <X className="size-4" />
              </DialogPrimitive.Close>
              {describeBody
                ? <DialogPrimitive.Description asChild><div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1', bodyClassName)}>{children}</div></DialogPrimitive.Description>
                : <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1', bodyClassName)}>{children}</div>}
              {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3.5">{footer}</div>}
            </motion.div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
