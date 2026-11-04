import { useState, useRef } from 'react';
import { Check, Copy, Download, Info, ReceiptText } from 'lucide-react';
import { buildInvoiceLines, round2 } from '../../lib/billing.js';
import { formatEUR, isoDay } from '../../lib/format.js';
import { Button } from '../../components/ui/Button.jsx';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { readUiPref, writeUiPref } from '../../lib/useMediaQuery.js';
import { clientMoney } from './logModel.js';

// UI-only preference (never in backups): show the Hours column. Off hides it on screen,
// in "Copy for Excel" and in the CSV, for invoices where the client should not see hours.
const SHOW_HOURS_KEY = 'tracker:ui:invoiceLinesShowHours';

export function InvoiceLinesModal({ entries, rates, clientRates, vat, clientVat, rounding, clientRounding, csvFormat, onClose }) {
  const [includeFree, setIncludeFree] = useState(false);
  const [showHours, setShowHoursState] = useState(() => readUiPref(SHOW_HOURS_KEY, true) !== false);
  const setShowHours = (v) => { setShowHoursState(v); writeUiPref(SHOW_HOURS_KEY, v); };
  const [copied, setCopied] = useState(false);
  const taRef = useRef(null);
  const excel = csvFormat === 'excel-sk';
  const dec = (n, dp = 2) => { const s = Number(n).toFixed(dp); return excel ? s.replace('.', ',') : s; };
  const { lines, totalNet, totalVat, totalGross, totalHours } = buildInvoiceLines(entries, { rates, clientRates, vat, clientVat, rounding, clientRounding, includeFree });
  // The Log (and the PDF invoice) add exact amounts per client and round once; these lines round
  // per line, so qty × rate is exact. When that moves a cent, say by how much, in plain words.
  const cfg = { rates, clientRates, vat, clientVat, rounding, clientRounding };
  const log = clientMoney(entries, cfg);
  const diffGross = round2(totalGross - log.gross);
  const diffNet = round2(totalNet - log.net);
  const off = (d) => Math.abs(d) >= 0.005;
  const centsOff = lines.length > 0 && (off(diffGross) || off(diffNet));
  const word = (d) => `${formatEUR(Math.abs(d))} ${d > 0 ? 'more' : 'less'}`;

  // Hours to as many decimals as it takes for hours × rate to give the line's net to the cent
  // (2 for quarter hours, up to 6 for odd minutes), on screen, in the clipboard and in the CSV.
  const hoursDp = (l) => {
    if (l.free || !l.rate) return 2;
    for (let dp = 2; dp <= 6; dp++) {
      if (Math.abs(round2(Number(l.hours.toFixed(dp)) * l.rate) - l.net) < 0.001) return dp;
    }
    return 6;
  };
  const qty = (l) => dec(l.hours, hoursDp(l));

  const header = ['Description', ...(showHours ? ['Hours'] : []), 'Rate (EUR/h)', 'Net (EUR)', 'VAT %', 'Gross (EUR)'];
  const rows = lines.map(l => [l.desc, ...(showHours ? [qty(l)] : []), dec(l.rate), dec(l.net), String(l.vatPct), dec(l.gross)]);
  const tsv = [header, ...rows].map(r => r.join('\t')).join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(tsv); setCopied(true); setTimeout(() => setCopied(false), 2000); return; } catch (e) { /* fall back */ }
    if (taRef.current) { taRef.current.focus(); taRef.current.select(); try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* manual */ } }
  };
  const exportCSV = () => {
    const sep = excel ? ';' : ',';
    const body = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(sep)).join('\r\n');
    const csv = (excel ? 'sep=;\r\n' : '') + body;
    const blob = new Blob([excel ? '﻿' + csv : csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invoice-lines-${isoDay()}.csv`; a.click();
    // Let the download start before the blob goes away (WebView2 can read it a tick later).
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const th = 'whitespace-nowrap px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle';
  return (
    <Modal title="Invoice lines" size="xl" icon={<ReceiptText />}
      description="Grouped by project and activity from the current Log filter. Hours are billable hours after rounding, with enough decimals that hours × rate gives the net to the cent."
      onClose={onClose}
      footer={(
        <>
          <div className="mr-auto flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
              <Checkbox checked={showHours} onCheckedChange={(v) => setShowHours(!!v)} />
              Show hours
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
              <Checkbox checked={includeFree} onCheckedChange={(v) => setIncludeFree(!!v)} />
              Include complimentary work as €0 lines
            </label>
          </div>
          <Button variant="secondary" onClick={(ev) => { if (ev.detail <= 1) exportCSV(); }} disabled={lines.length === 0}><Download /> Export CSV</Button>
          <Button variant="primary" onClick={copy} disabled={lines.length === 0}>
            {copied ? <><Check /> Copied</> : <><Copy /> Copy for Excel</>}
          </Button>
        </>
      )}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2/70">
            <tr className="text-left">
              <th className={th}>Description</th>
              {showHours && <th className={`${th} text-right`}>Hours</th>}
              <th className={`${th} text-right`}>Rate</th>
              <th className={`${th} text-right`}>Net</th>
              <th className={`${th} text-right`}>VAT %</th>
              <th className={`${th} text-right`}>VAT</th>
              <th className={`${th} text-right`}>Gross</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => (
              <tr key={i} className="hover:bg-surface-2/50">
                <td className="px-3 py-2.5 text-fg">{l.desc}</td>
                {showHours && <td className="whitespace-nowrap px-3 py-2.5 text-right text-fg tnum">{qty(l)} h</td>}
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-fg-subtle tnum">{l.free ? '—' : formatEUR(l.rate)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-fg tnum">{formatEUR(l.net)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-fg-subtle tnum">{l.vatPct}%</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-fg-muted tnum">{formatEUR(l.vatAmt)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-fg tnum">{formatEUR(l.gross)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={showHours ? 7 : 6} className="px-3 py-8 text-center text-fg-subtle">No billable lines for this filter.</td></tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot className="border-t border-line-strong bg-surface-2/70 font-semibold">
              <tr>
                <td className="px-3 py-3 text-fg">Total</td>
                {showHours && <td className="whitespace-nowrap px-3 py-3 text-right text-fg tnum">{dec(totalHours)} h</td>}
                <td></td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-fg tnum">{formatEUR(totalNet)}</td>
                <td></td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-fg-muted tnum">{formatEUR(totalVat)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-fg tnum">{formatEUR(totalGross)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {centsOff && (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-[18px] text-fg-subtle">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="tnum">
            Lines are rounded per line:{' '}
            {off(diffNet) && <>net <span className="font-medium text-fg-muted">{word(diffNet)}</span></>}
            {off(diffNet) && off(diffGross) && ', '}
            {off(diffGross) && <>incl. VAT <span className="font-medium text-fg-muted">{word(diffGross)}</span></>}
            {' '}than the Log total ({formatEUR(log.net)} net, {formatEUR(log.gross)} incl. VAT).
          </span>
        </p>
      )}

      <textarea ref={taRef} readOnly value={tsv} aria-hidden="true" tabIndex={-1}
        className="pointer-events-none absolute h-px w-px opacity-0" />
    </Modal>
  );
}
