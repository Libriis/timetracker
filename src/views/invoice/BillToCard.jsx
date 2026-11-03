import { useId } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, Building2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Field, Input, Textarea } from '../../components/ui/Input.jsx';

export const EMPTY_BILL_TO = { name: '', address: '', regId: '', taxId: '', vatId: '' };

// Trim every field and drop empty ones, so an untouched form stores nothing.
export function cleanBillTo(v) {
  const out = {};
  for (const k of Object.keys(EMPTY_BILL_TO)) {
    const s = String((v && v[k]) || '').trim();
    if (s) out[k] = s;
  }
  return out;
}

export const sameBillTo = (a, b) => JSON.stringify(cleanBillTo(a)) === JSON.stringify(cleanBillTo(b));

// "Bill to" on the invoice: the client's legal name, address and IDs. Collapsed it reads as a summary
// line; open it shows the fields. Pattern after the 21st.dev "Collapsible Form Fields" (cnippet-dev),
// ported to Radix Collapsible + our primitives. `onCommit` runs when focus leaves the card (saves it).
export function BillToCard({ client, value, onChange, onCommit, open, onOpenChange, remembers }) {
  const v = { ...EMPTY_BILL_TO, ...(value || {}) };
  const clean = cleanBillTo(v);
  const filled = !!(clean.address || clean.regId || clean.taxId || clean.vatId);
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value });
  const contentId = useId();
  const ids = [clean.regId && `Reg. no. ${clean.regId}`, clean.vatId && `VAT ID ${clean.vatId}`].filter(Boolean);
  const onBlur = (e) => {
    // Focus moved to something outside the card: save what was typed.
    if (!e.currentTarget.contains(e.relatedTarget) && onCommit) onCommit();
  };

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}
      className="overflow-hidden rounded-xl border border-line bg-surface" onBlur={onBlur}>
      <Collapsible.Trigger aria-controls={contentId}
        className={cn(
          'group flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none transition-colors duration-fast ease-out',
          'hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
        )}>
        <span className="mt-[5px] flex shrink-0"><ClientDot client={client} size={8} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{clean.name || client}</span>
          {filled ? (
            <span className="block truncate text-xs leading-5 text-fg-subtle">
              {[clean.address && clean.address.replace(/\s*\n\s*/g, ', '), ...ids].filter(Boolean).join(' · ')}
            </span>
          ) : (
            <span className="block text-xs leading-5 text-warning-text">No address or IDs yet</span>
          )}
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-fg-muted">
          {open ? 'Close' : filled ? 'Edit' : 'Add'}
          <ChevronDown className="size-3.5 transition-transform duration-base ease-out group-data-[state=open]:rotate-180" />
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content id={contentId}
        className="border-t border-line bg-surface-2/40 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <div className="space-y-3 px-3 pb-3 pt-3">
          <Field label="Legal name" hint="As registered">
            <Input value={v.name} onChange={set('name')} placeholder={client} autoComplete="off" />
          </Field>
          <Field label="Address">
            <Textarea value={v.address} onChange={set('address')} rows={2} className="min-h-[58px]"
              placeholder={'Street 1\n811 01 Bratislava'} />
          </Field>
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
            <Field label="Reg. no." hint="IČO">
              <Input value={v.regId} onChange={set('regId')} autoComplete="off" />
            </Field>
            <Field label="Tax ID" hint="DIČ">
              <Input value={v.taxId} onChange={set('taxId')} autoComplete="off" />
            </Field>
            <Field label="VAT ID" hint="IČ DPH">
              <Input value={v.vatId} onChange={set('vatId')} autoComplete="off" />
            </Field>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <Building2 className="size-3.5 shrink-0" />
            {remembers ? `Saved for your next invoices to ${client}.` : 'Used on this invoice.'}
          </p>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
