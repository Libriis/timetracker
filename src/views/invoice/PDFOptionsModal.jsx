import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlignLeft, CalendarDays, CircleAlert, Clock3, FileText, Info, Percent, Printer, QrCode, ReceiptText, Sparkles, StickyNote, TriangleAlert } from 'lucide-react';
import { AI_FACTOR } from '../../lib/billing.js';
import { DEFAULT_DESCRIPTIONS } from '../../lib/constants.js';
import { isoDay, fromIsoDay } from '../../lib/format.js';
import { buildPDFHTML } from '../../lib/pdf.js';
import { readUiPref, writeUiPref } from '../../lib/useMediaQuery.js';
import { cn } from '../../lib/cn.js';
import { Button } from '../../components/ui/Button.jsx';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { SectionLabel } from '../../components/ui/Card.jsx';
import { Field, Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { PDFPreview } from './PDFPreview.jsx';
import { BillToCard, EMPTY_BILL_TO, cleanBillTo, sameBillTo } from './BillToCard.jsx';
import { invoiceSignature, nextInvoiceNumber, variableSymbol } from './invoiceNumber.js';
import { ibanValid } from './payQr.js';

const PREF_KEY = 'tracker:ui:pdfOptions';
const TERMS = [7, 14, 30];
const addDays = (iso, n) => { const d = fromIsoDay(iso); d.setDate(d.getDate() + n); return isoDay(d); };

const daysBetween = (a, b) => Math.round((fromIsoDay(b) - fromIsoDay(a)) / 86400000);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One compact switch line inside a settings list. The whole line toggles.
function OptionLine({ icon, label, hint, checked, onChange, disabled }) {
  return (
    <label className={cn(
      'flex items-center gap-3 px-3 py-2.5 transition-colors duration-fast ease-out',
      disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-surface-2',
    )}>
      <span className={cn('flex shrink-0 [&_svg]:size-4', checked && !disabled ? 'text-fg-muted' : 'text-fg-subtle')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium', disabled ? 'text-fg-subtle' : 'text-fg')}>{label}</span>
        {hint && <span className="block text-xs leading-4 text-fg-subtle">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} size="sm" aria-label={label} />
    </label>
  );
}

// Options for the PDF report / invoice, with a live A4 preview of the document.
// `pdfInput` (entries, rates, vat, rounding, period, descriptions…) comes from App; without it the
// dialog still works, just without the preview.
// `initialMode` ('invoice' | 'report') opens the dialog on that document type, for example from an
// "Invoice" action; without it the dialog opens on the type used last time.
// `onSaveIssuer` (optional) stores the client's "Bill to" details in issuer.clientDetails[client]
// (an optional field of the stored supplier details, so it is in the disk backup too).
// onGenerate(options) gets options.extra = { entries, billTo, showDescriptions } for the document.
export function PDFOptionsModal({ client, entryCount, hasAi: hasAiProp, issuer, pdfInput, initialMode, onClose, onGenerate, onSaveIssuer }) {
  const todayISO = isoDay();
  const saved = useMemo(() => readUiPref(PREF_KEY, {}) || {}, []);
  const [language, setLanguage] = useState(saved.language === 'sk' ? 'sk' : 'en');
  const [showDates, setShowDates] = useState(saved.showDates ?? true);
  const [showTimes, setShowTimes] = useState(saved.showTimes ?? true);
  const [showNotes, setShowNotes] = useState(saved.showNotes ?? true);
  const [showVat, setShowVat] = useState(saved.showVat ?? true);
  const [showQr, setShowQr] = useState(saved.showQr ?? true);
  const [showDescriptions, setShowDescriptions] = useState(saved.showDescriptions ?? true);
  const [invoiceMode, setInvoiceMode] = useState(
    initialMode === 'invoice' || initialMode === 'report' ? initialMode === 'invoice' : !!saved.invoiceMode);
  const [layout, setLayout] = useState(null);
  const lastNumber = typeof saved.lastInvoiceNumber === 'string' ? saved.lastInvoiceNumber : '';
  const lastSig = typeof saved.lastInvoiceSig === 'string' ? saved.lastInvoiceSig : '';
  // The same client and entries as the last printed invoice (a cancelled print dialog, or a reprint)
  // keep that invoice's number; new work gets the next one. Printing cannot tell a cancel from a print,
  // so the number is only "used up" by printing different work.
  const [sameWork] = useState(() => {
    const all = (pdfInput && Array.isArray(pdfInput.entries)) ? pdfInput.entries : [];
    const inv = all.filter(e => e.invoiced).length;
    const startEntries = invoiceMode && inv > 0 && inv < all.length ? all.filter(e => !e.invoiced) : all;
    return !!lastNumber && !!lastSig && all.length > 0 && lastSig === invoiceSignature(client, startEntries);
  });
  const [invoiceNumber, setInvoiceNumber] = useState(() => (sameWork ? lastNumber : nextInvoiceNumber(lastNumber)));
  const [issueDate, setIssueDate] = useState(todayISO);
  const [dueDate, setDueDate] = useState(addDays(todayISO, TERMS.includes(saved.termsDays) ? saved.termsDays : 14));
  const [includeInvoiced, setIncludeInvoiced] = useState(false);
  const hasIssuer = !!(issuer && issuer.name && issuer.name.trim());
  const terms = issueDate && dueDate ? daysBetween(issueDate, dueDate) : null;

  // ----- Bill to (the client's legal details) -----
  const storedBill = (issuer && issuer.clientDetails && issuer.clientDetails[client]) || null;
  const [billTo, setBillTo] = useState(() => ({ ...EMPTY_BILL_TO, ...(storedBill || {}) }));
  const [billOpen, setBillOpen] = useState(false);
  const commitBillTo = () => {
    if (!onSaveIssuer || !issuer || sameBillTo(billTo, storedBill || {})) return;
    const details = { ...(issuer.clientDetails || {}) };
    const clean = cleanBillTo(billTo);
    if (Object.keys(clean).length) details[client] = clean; else delete details[client];
    onSaveIssuer({ ...issuer, clientDetails: details });
  };

  // ----- entries: in invoice mode, work that is already invoiced stays off unless the user adds it -----
  const allEntries = (pdfInput && pdfInput.entries) || null;
  const invoicedCount = allEntries ? allEntries.filter(e => e.invoiced).length : 0;
  const totalCount = allEntries ? allEntries.length : (entryCount || 0);
  const mixed = invoicedCount > 0 && invoicedCount < totalCount;
  const allInvoiced = totalCount > 0 && invoicedCount === totalCount;
  const dropInvoiced = invoiceMode && mixed && !includeInvoiced;
  const docEntries = useMemo(() => (allEntries && dropInvoiced ? allEntries.filter(e => !e.invoiced) : allEntries),
    [allEntries, dropInvoiced]);
  const docCount = docEntries ? docEntries.length : totalCount;
  const hasAi = docEntries ? docEntries.some(e => e.ai) : !!hasAiProp;

  // Activity descriptions exist for at least one activity on the document (custom or the defaults).
  const descLang = (pdfInput && pdfInput.descriptions && pdfInput.descriptions[language]) || DEFAULT_DESCRIPTIONS[language] || {};
  const hasDescriptions = !!(docEntries && docEntries.some(e => String(descLang[e.task] || '').trim()));

  const prefs = { language, invoiceMode, showDates, showTimes, showNotes, showVat, showQr, showDescriptions, termsDays: TERMS.includes(terms) ? terms : saved.termsDays, lastInvoiceNumber: lastNumber || undefined, lastInvoiceSig: lastSig || undefined };
  useEffect(() => {
    writeUiPref(PREF_KEY, prefs);
  }, [JSON.stringify(prefs)]); // eslint-disable-line react-hooks/exhaustive-deps

  const number = invoiceNumber.trim();
  // A mark next to the title: "Draft" while the invoice has no number (preview only, it cannot print),
  // "Copy" when every entry on it is already invoiced (the dialog says it prints a copy).
  const status = !invoiceMode ? '' : !number ? 'draft' : allInvoiced ? 'copy' : '';
  const options = { showDates, showTimes, showNotes, showVat, showQr, language, invoiceMode, invoiceNumber: number, issueDate, dueDate };
  const docBillTo = cleanBillTo(billTo);
  const hasIban = !!(issuer && String(issuer.iban || '').trim());
  // The document prints a QR only for an IBAN that passes the bank checksum and with a supplier name.
  const qrReady = hasIban && hasIssuer && ibanValid(issuer.iban);
  const qrHint = !hasIban ? 'Add an IBAN in Settings to show it'
    : !ibanValid(issuer.iban) ? 'The IBAN fails the bank check. Fix it in Settings'
      : !hasIssuer ? 'Add your name in Settings to show it'
        : language === 'sk' ? 'PAY by square with the amount due' : 'SEPA QR with the amount due';
  const missingNumber = invoiceMode && !number;
  // A Slovak invoice must carry both dates (Dátum vystavenia, Dátum splatnosti); so must ours in English.
  const missingIssue = invoiceMode && !issueDate;
  const missingDue = invoiceMode && !dueDate;
  const dueEarly = invoiceMode && !!issueDate && !!dueDate && dueDate < issueDate;
  const blocked = missingNumber ? 'An invoice needs a number.'
    : (missingIssue || missingDue) ? 'An invoice needs an issue date and a due date.'
      : dueEarly ? 'The due date is before the issue date.' : '';
  const canPrint = !blocked && docCount > 0;
  // One print per click: a double click (or a repeated Enter) must not open two print jobs.
  const printing = useRef(false);
  const generate = () => {
    if (!canPrint || printing.current) return;
    printing.current = true;
    setTimeout(() => { printing.current = false; }, 1500);
    commitBillTo();
    // Remember the printed number and what it covered: the next invoice for other work starts from the
    // one after it; reopening for the same work (a cancelled print, a reprint) suggests it again.
    if (invoiceMode && number) {
      writeUiPref(PREF_KEY, { ...prefs, lastInvoiceNumber: number, lastInvoiceSig: invoiceSignature(client, docEntries || []) });
    }
    const extra = { billTo: docBillTo, showDescriptions, status };
    if (docEntries && docEntries.length) extra.entries = docEntries;
    onGenerate({ ...options, extra });
  };
  // Slovak invoices pay by variabilný symbol: the digits of the number (at most the last 10).
  const vs = variableSymbol(number);
  const digitCount = number.replace(/\D+/g, '').length;
  const vsHelp = !invoiceMode || language !== 'sk' || !number ? null
    : !vs ? <span className="font-medium text-warning-text">No digits, so the payment has no variabilný symbol.</span>
      : digitCount > 10 ? <span className="text-warning-text">Variabilný symbol {vs}: only the last 10 digits.</span>
        : <span className="tnum">Variabilný symbol {vs}</span>;
  const numberHelp = !invoiceMode ? null
    : missingNumber ? <span className="font-medium text-danger-text">Add a number to print the invoice.</span>
      : lastNumber ? (number !== lastNumber ? `Last invoice: ${lastNumber}`
        : sameWork ? 'Same work as your last invoice, so the number stays.'
          : <span className="text-warning-text">Same number as your last invoice.</span>)
        : 'Suggested. Change it to match your own series.';
  const dateHelp = missingIssue && missingDue ? 'Add the issue date and the due date.'
    : missingIssue ? 'Add the issue date.' : missingDue ? 'Add the due date.'
      : dueEarly ? 'The due date is before the issue date.' : '';

  // The preview rebuilds only when something on the document changes (App re-renders every second
  // while a timer runs, so the memo keys on the values, not on the pdfInput object).
  const previewKey = JSON.stringify(useDeferredValue({ ...options, billTo: docBillTo, showDescriptions, status }));
  const { rates, clientRates, descriptions, period, customStart, customEnd, vat, rounding } = pdfInput || {};
  const html = useMemo(() => {
    if (!docEntries || docEntries.length === 0) return '';
    try {
      return buildPDFHTML({ entries: docEntries, rates, clientRates, descriptions, period, customStart, customEnd, vat, rounding, client, issuer, ...JSON.parse(previewKey) });
    } catch (e) { console.error(e); return ''; }
  }, [docEntries, rates, clientRates, descriptions, period, customStart, customEnd, vat, rounding, client, issuer, previewKey]);

  const changeIssue = (v) => {
    // Keep the payment terms when the issue date moves.
    if (v && issueDate && dueDate && TERMS.includes(terms)) setDueDate(addDays(v, terms));
    setIssueDate(v);
  };

  const DocIcon = invoiceMode ? ReceiptText : FileText;
  return (
    <Modal onClose={onClose} size="xl" className={html ? 'max-w-[1000px]' : undefined} bodyClassName="pt-2"
      title={invoiceMode ? 'Create invoice' : 'Create time report'} icon={<DocIcon />}
      description={(
        <span className="inline-flex items-center gap-1.5">
          <ClientDot client={client} size={7} /><span className="font-medium text-fg-muted">{client}</span>
          <span className="tnum">· {plural(docCount, 'entry', 'entries')}</span>
        </span>
      )}
      footer={(
        <>
          <span className="mr-auto hidden text-xs text-fg-subtle sm:block">
            {blocked || 'Opens the print dialog. Pick “Save as PDF” to get a file.'}
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={generate} disabled={!canPrint}>
            <Printer /> {invoiceMode ? 'Print invoice' : 'Print report'}
          </Button>
        </>
      )}>
      <div className={cn('grid gap-5', html && 'sm:grid-cols-[minmax(0,340px)_minmax(0,1fr)]')}>
        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <SectionLabel>Document</SectionLabel>
            <SegmentedControl label="Document type" fullWidth value={invoiceMode ? 'invoice' : 'report'} onChange={(v) => setInvoiceMode(v === 'invoice')}
              options={[{ value: 'report', label: 'Time report' }, { value: 'invoice', label: 'Invoice' }]} />
            <SegmentedControl label="Language" fullWidth value={language} onChange={setLanguage}
              options={[{ value: 'en', label: 'English' }, { value: 'sk', label: 'Slovenčina' }]} />
          </div>

          {/* Double billing guard: work that is already invoiced stays off a new invoice unless added on purpose. */}
          {invoiceMode && invoicedCount > 0 && (
            mixed ? (
              <div className="overflow-hidden rounded-xl border border-warning/40 bg-warning-soft">
                <div className="flex gap-2 px-3 pb-2 pt-2.5 text-xs text-warning-text">
                  <CircleAlert className="mt-px size-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold tnum">{invoicedCount} of {plural(totalCount, 'entry', 'entries')}</span> {invoicedCount === 1 ? 'is' : 'are'} already invoiced.
                    {includeInvoiced ? ' They are on this invoice too.' : ' They stay off this invoice.'}
                  </span>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-warning/25 px-3 py-2 text-xs font-medium text-fg">
                  Include invoiced entries
                  <Switch checked={includeInvoiced} onCheckedChange={setIncludeInvoiced} size="sm" aria-label="Include invoiced entries" />
                </label>
              </div>
            ) : allInvoiced ? (
              <div className="flex gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-fg-muted">
                <Info className="mt-px size-3.5 shrink-0 text-fg-subtle" />
                <span>All {plural(totalCount, 'entry', 'entries')} {totalCount === 1 ? 'is' : 'are'} already invoiced, so this prints a copy.</span>
              </div>
            ) : null
          )}

          {invoiceMode && (
            <div className="space-y-3">
              <SectionLabel>Invoice details</SectionLabel>
              {!hasIssuer && (
                <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning-text">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" />
                  <span>Your supplier details are empty. Add them in <span className="font-semibold">Settings → Supplier details</span>.</span>
                </div>
              )}
              <Field label="Invoice number" hint={language === 'sk' ? 'Also the variabilný symbol' : 'Also the payment reference'}
                help={vsHelp ? <><span className="block">{numberHelp}</span><span className="mt-0.5 block">{vsHelp}</span></> : numberHelp}>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} autoComplete="off" required
                  aria-invalid={missingNumber || undefined}
                  className={cn(missingNumber && 'border-danger/60 hover:border-danger/70 focus:border-danger/70')} />
              </Field>
              <div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Issue date">
                    <Input type="date" value={issueDate} onChange={(e) => changeIssue(e.target.value)} required
                      aria-invalid={missingIssue || undefined}
                      className={cn(missingIssue && 'border-danger/60 hover:border-danger/70 focus:border-danger/70')} />
                  </Field>
                  <Field label="Due date">
                    <Input type="date" value={dueDate} min={issueDate || undefined} onChange={(e) => setDueDate(e.target.value)} required
                      aria-invalid={missingDue || dueEarly || undefined}
                      className={cn((missingDue || dueEarly) && 'border-danger/60 hover:border-danger/70 focus:border-danger/70')} />
                  </Field>
                </div>
                {dateHelp && <p className="mt-1.5 text-xs font-medium text-danger-text" role="status">{dateHelp}</p>}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-fg-muted">Payment terms</span>
                <SegmentedControl label="Payment terms" size="sm" value={TERMS.includes(terms) ? String(terms) : ''}
                  onChange={(v) => issueDate && setDueDate(addDays(issueDate, Number(v)))}
                  options={TERMS.map(n => ({ value: String(n), label: `${n} days` }))} />
              </div>
            </div>
          )}

          {invoiceMode && (
            <div className="space-y-2">
              <SectionLabel>Bill to</SectionLabel>
              <BillToCard client={client} value={billTo} onChange={setBillTo} onCommit={commitBillTo}
                open={billOpen} onOpenChange={setBillOpen} remembers={!!onSaveIssuer} />
            </div>
          )}

          <div className="space-y-2">
            <SectionLabel>Show</SectionLabel>
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              <OptionLine icon={<Percent />} label="VAT" hint="Subtotal, VAT and the total incl. VAT" checked={showVat} onChange={setShowVat} />
              <OptionLine icon={<AlignLeft />} label="Activity descriptions" checked={hasDescriptions ? showDescriptions : false}
                onChange={setShowDescriptions} disabled={!hasDescriptions}
                hint={hasDescriptions ? 'One line under each activity' : 'None yet. Write them in Settings'} />
              <OptionLine icon={<CalendarDays />} label="Dates" hint="Entry dates and the service period" checked={showDates} onChange={setShowDates} />
              <OptionLine icon={<Clock3 />} label="Times" checked={hasAi ? false : showTimes} onChange={setShowTimes} disabled={hasAi}
                hint={hasAi ? 'Off: AI-assisted entries bill above the clock' : 'Start and end time of each entry'} />
              <OptionLine icon={<StickyNote />} label="Notes" hint="The note on each entry" checked={showNotes} onChange={setShowNotes} />
              {invoiceMode && (
                <OptionLine icon={<QrCode />} label="Payment QR" checked={qrReady ? showQr : false} onChange={setShowQr} disabled={!qrReady}
                  hint={qrHint} />
              )}
            </div>
          </div>

          {hasAi && (
            <div className="flex gap-2.5 rounded-lg border border-ai/25 bg-ai-soft px-3 py-2.5 text-xs text-fg-muted">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-ai-text" />
              <span>
                <span className="font-semibold text-ai-text">AI-assisted work bills at ×{AI_FACTOR}.</span> The document shows billed hours only, so tracked time and clock times stay out.
              </span>
            </div>
          )}
        </div>

        {html && (
          <div className="min-w-0 sm:sticky sm:top-0 sm:self-start">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Preview</SectionLabel>
              <span className="text-2xs text-fg-subtle" aria-live="polite">
                {layout?.split ? 'A4 · line items continue on page 2' : 'A4 · updates as you edit'}
              </span>
            </div>
            <PDFPreview html={html} label={invoiceMode ? 'Invoice preview' : 'Report preview'} onLayout={setLayout}
              className="h-[min(calc(88vh-200px),600px)] min-h-[280px]" />
          </div>
        )}
      </div>
    </Modal>
  );
}
