import { describe, it, expect } from 'vitest';
import { buildPDFHTML, fileSlug, formatEURLocalized, monogram, pdfHTMLForFrame, tradingName } from '../../lib/pdf.js';
import { billingTotals, calcEarnings, round2 } from '../../lib/billing.js';
import { formatEUR } from '../../lib/format.js';
import { invoiceSignature, nextInvoiceNumber, variableSymbol } from './invoiceNumber.js';

const H = 3600000;
const day = (d, h) => new Date(2026, 9, d, h, 0, 0).getTime();
const entry = (id, d, h, mins, task, extra = {}) => ({
  id, client: 'Acme', task, note: 'Work', start: day(d, h), end: day(d, h) + mins * 60000, duration: mins * 60000, ...extra,
});
const rates = { Design: 40, Video: 70 };
const clientRates = { Acme: { Video: 80 } };
const issuer = { name: 'Studio Lumen s.r.o.', address: 'Hlavná 12, 060 01 Kežmarok', regId: '12345678', taxId: '2020123456', vatId: 'SK2020123456', iban: 'SK31 1200 0000 1987 4263 7541', email: '', phone: '', note: 'Thanks.' };
const base = {
  client: 'Acme', rates, clientRates, vat: 23, rounding: 15, period: 'custom', customStart: '2026-10-01', customEnd: '2026-10-31',
  issuer, invoiceMode: true, invoiceNumber: '2026-047', issueDate: '2026-11-03', dueDate: '2026-11-17',
};

describe('buildPDFHTML', () => {
  const plain = [
    entry('a', 2, 9, 50, 'Design'),             // 50 min -> 1:00 billed
    entry('b', 3, 9, 95, 'Video', { note: 'Drone <b>' }), // 95 -> 1:45 at the €80 override
    entry('c', 3, 13, 30, 'Design', { free: true }),
  ];

  it('totals match billing.js to the cent', () => {
    const html = buildPDFHTML({ ...base, entries: plain });
    const net = round2(plain.reduce((s, e) => s + calcEarnings(e, rates, clientRates, 15, { Acme: 15 }), 0));
    expect(net).toBe(180); // 1h x 40 + 1.75h x 80
    const bt = billingTotals(plain, { rates, clientRates, vat: 23, clientVat: {}, rounding: 15, clientRounding: { Acme: 15 } });
    expect(html).toContain('€180.00');
    expect(html).toContain(formatEUR(bt.vat));
    expect(html).toContain(formatEUR(bt.gross));
  });

  it('takes net, VAT and total from billingTotals, also when VAT has a half cent', () => {
    // QA case: net €602.50 at 23% (VAT 138.575). The PDF must show what every other screen shows.
    const cfg = (pct) => ({ rates: { Design: 0 }, clientRates: {}, vat: pct, clientVat: {}, rounding: 15, clientRounding: { Acme: 15 } });
    for (const [rate, pct] of [[602.5, 23], [35.5, 23], [35.5, 10], [12.3, 5], [1234.56, 20]]) {
      const e = [entry('a', 2, 9, 60, 'Design')];
      const html = buildPDFHTML({ ...base, entries: e, rates: { Design: rate }, clientRates: {}, vat: pct });
      const bt = billingTotals(e, { ...cfg(pct), rates: { Design: rate } });
      const totals = html.slice(html.indexOf('<div class="totals">'));
      expect(totals).toContain(formatEUR(bt.net));
      expect(totals).toContain(formatEUR(bt.vat));
      expect(totals).toContain(formatEUR(bt.gross));
    }
  });

  it('fills Bill to from billTo or from issuer.clientDetails', () => {
    const billTo = { name: 'Acme a.s.', address: 'Mlynská 8\n058 01 Poprad', regId: '87654321', taxId: '2120987654', vatId: 'SK2120987654' };
    const html = buildPDFHTML({ ...base, entries: plain, billTo, language: 'sk' });
    const party = html.slice(html.indexOf('Odberateľ'), html.indexOf('Údaje faktúry'));
    for (const s of ['Acme a.s.', 'Mlynská 8', '058 01 Poprad', 'IČO', '87654321', 'DIČ', 'IČ DPH', 'SK2120987654']) expect(party).toContain(s);
    const viaIssuer = buildPDFHTML({ ...base, entries: plain, issuer: { ...issuer, clientDetails: { Acme: billTo } } });
    expect(viaIssuer).toContain('Mlynská 8');
    const none = buildPDFHTML({ ...base, entries: plain });
    expect(none).not.toContain('Mlynská');
    expect(none).toContain('<div class="party-name">Acme</div>');
  });

  it('leaves activity descriptions out when asked', () => {
    const descriptions = { en: { Design: 'Layouts and type.' }, sk: {} };
    expect(buildPDFHTML({ ...base, entries: plain, descriptions })).toContain('Layouts and type.');
    expect(buildPDFHTML({ ...base, entries: plain, descriptions, showDescriptions: false })).not.toContain('Layouts and type.');
  });

  it('suggests the next invoice number', () => {
    expect(nextInvoiceNumber('', 2026)).toBe('2026-001');
    expect(nextInvoiceNumber('2026-047', 2026)).toBe('2026-048');
    expect(nextInvoiceNumber('2025-047', 2026)).toBe('2026-001');
    expect(nextInvoiceNumber('2025047', 2026)).toBe('2026001');
    expect(nextInvoiceNumber('FA0099', 2026)).toBe('FA0100');
    expect(nextInvoiceNumber('draft', 2026)).toBe('');
    // counter first, year last (a common Slovak series): the counter goes up, the year stays
    expect(nextInvoiceNumber('12/2026', 2026)).toBe('13/2026');
    expect(nextInvoiceNumber('1/2026', 2026)).toBe('2/2026');
    expect(nextInvoiceNumber('FA-ŠĽ 7/2026', 2026)).toBe('FA-ŠĽ 8/2026');
    expect(nextInvoiceNumber('047/26', 2026)).toBe('048/26');
    expect(nextInvoiceNumber('12/2025', 2026)).toBe('1/2026');
    expect(nextInvoiceNumber('099/2025', 2026)).toBe('001/2026');
    expect(nextInvoiceNumber('2026-11-003', 2026)).toBe('2026-11-004');
    expect(nextInvoiceNumber('2031', 2026)).toBe('2032');
  });

  it('derives the variabilný symbol and fingerprints an invoice', () => {
    expect(variableSymbol('FA-ŠĽ 7/2026')).toBe('72026');
    expect(variableSymbol('ABC')).toBe('');
    expect(variableSymbol('INV-2026-11-000123')).toBe('2611000123'); // 12 digits: the last 10
    const a = invoiceSignature('Acme', plain);
    expect(invoiceSignature('Acme', [...plain].reverse())).toBe(a); // order does not matter
    expect(invoiceSignature('Acme', plain.slice(1))).not.toBe(a);
    expect(invoiceSignature('Other', plain)).not.toBe(a);
  });

  it('lists complimentary work at no charge and escapes user text', () => {
    const html = buildPDFHTML({ ...base, entries: plain });
    expect(html).toContain('Complimentary');
    expect(html).toContain('€20.00'); // standard value of the free 30 min (rounded) at €40
    expect(html).toContain('Drone &lt;b&gt;');
    expect(html).not.toContain('Drone <b>');
  });

  it('keeps tracked time and clock times out when AI-assisted work is present', () => {
    const ai = [entry('a', 2, 9, 40, 'Design', { ai: true }), entry('b', 2, 11, 50, 'Design')];
    const html = buildPDFHTML({ ...base, entries: ai });
    expect(html).not.toContain('09:00–');
    expect(html).not.toMatch(/>Tracked</);
    // 40 min x1.5 = 60 min billed; 50 min -> 60 min: 2 h x €40
    expect(html).toContain('€80.00');
  });

  it('uses correct Slovak invoice terms and number format', () => {
    const html = buildPDFHTML({ ...base, entries: plain, language: 'sk' });
    for (const term of ['Faktúra', 'Dodávateľ', 'Odberateľ', 'IČO', 'DIČ', 'IČ DPH', 'IBAN', 'Dátum vystavenia', 'Dátum dodania', 'Dátum splatnosti', 'Spolu na úhradu', 'Základ dane', 'Variabilný symbol', 'DPH 23 %']) {
      expect(html).toContain(term);
    }
    expect(html).toContain('2026047'); // variabilný symbol: digits only
    expect(html.replace(/ /g, ' ')).toContain('17. 11. 2026');
    expect(formatEURLocalized(1234.5, 'sk')).toBe('1 234,50 €');
  });

  it('builds a report without issuer, VAT, dates or notes', () => {
    const html = buildPDFHTML({ ...base, entries: plain, invoiceMode: false, issuer: undefined, showVat: false, showDates: false, showNotes: false });
    expect(html).toContain('Time report');
    expect(html).not.toContain('VAT 23%');
    expect(html).not.toContain('Drone &lt;b&gt;');
    expect(html).toContain('€180.00');
  });

  it('shows the waived value of complimentary rows in the Amount column, struck through above €0.00', () => {
    const html = buildPDFHTML({ ...base, entries: plain });
    const items = /<section class="items">([\s\S]*?)<\/section>/.exec(html)[1];
    // 0.50 h x €40 = €20.00 struck through, then the €0.00 charged
    expect(items).toMatch(/<tr class="free"[\s\S]*?<s class="was"[^>]*>€20.00<\/s><span class="now">€0.00<\/span>/);
    expect(html).toContain('Complimentary work worth €20.00 is waived.');
    const sk = buildPDFHTML({ ...base, entries: plain, language: 'sk' });
    expect(sk).toMatch(/<s class="was"[^>]*>20,00\s€<\/s><span class="now">0,00\s€<\/span>/);
  });

  it('keeps long unbroken notes and date ranges inside their columns', () => {
    const url = 'Sent https://wetransfer.com/downloads/4f8a9c2e1b3d5f7a9c1e3b5d7f9a1c3e20261103101530/7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a20261103101530/a1b2c3';
    const html = buildPDFHTML({ ...base, entries: [entry('a', 2, 9, 60, 'Design', { note: url }), ...plain.slice(1)], language: 'sk' });
    expect(html).toContain('overflow-wrap: anywhere');
    // custom range 1-31 Oct: one unbreakable piece, in the details and in the Time details subtitle
    expect(html).toContain('<span class="nw">1. – 31. 10. 2026</span>');
    const sub = /<div class="log-sub">([\s\S]*?)<\/div>/.exec(html)[1];
    expect(sub).toContain('<span class="nw">1. – 31. 10. 2026</span>');
  });

  it('always prints an issue date on an invoice and never "Invalid Date"', () => {
    const html = buildPDFHTML({ ...base, entries: plain, issueDate: '', dueDate: '2026-1', language: 'sk' });
    expect(html).toContain('Dátum vystavenia');
    expect(html).not.toContain('Invalid Date');
    expect(html).not.toContain('Dátum splatnosti</span>');
  });

  it('marks a draft or a copy next to the invoice title', () => {
    expect(buildPDFHTML({ ...base, entries: plain, status: 'copy' })).toContain('<span class="status">Copy</span>');
    expect(buildPDFHTML({ ...base, entries: plain, status: 'draft', language: 'sk' })).toContain('<span class="status">Návrh</span>');
    expect(buildPDFHTML({ ...base, entries: plain })).not.toContain('class="status"');
    expect(buildPDFHTML({ ...base, entries: plain, status: 'copy', invoiceMode: false })).not.toContain('class="status"');
  });

  it('rounds VAT once, on the net total (half a cent rounds up)', () => {
    // One hour at €5,737.50: 23% VAT is exactly €1,319.625. Same rule as the Dashboard.
    const e = [entry('a', 2, 9, 60, 'Design')];
    const html = buildPDFHTML({ ...base, entries: e, rates: { Design: 5737.5 }, clientRates: {} });
    expect(html).toContain('€5,737.50');
    expect(html).toContain('€1,319.63'); // 1,319.625 -> 1,319.63
    expect(html).toContain('€7,057.13');
  });

  it('uses decimal hours with a unit everywhere and sums the Hours column in Time details', () => {
    const html = buildPDFHTML({ ...base, entries: plain });
    expect(html).not.toMatch(/>\d+:\d\d</); // no h:mm durations
    // billable 1.00 + 1.75, complimentary 0.50: the Time details total is the column sum
    expect(html).toContain('3.25<span class="u">&nbsp;h</span>');
    expect(html).toContain('2.75<span class="u">&nbsp;h</span>'); // billable time in the totals
  });

  it('prints every line as hours x rate and carries the cents to the subtotal on a Rounding line', () => {
    const e = [entry('a', 2, 9, 10, 'Design'), entry('b', 2, 10, 10, 'Design'), entry('c', 2, 11, 10, 'Design')];
    const html = buildPDFHTML({ ...base, entries: e, rounding: 0 });
    const items = /<section class="items">([\s\S]*?)<\/section>/.exec(html)[1];
    // 0.50 h x €40 = €20.00 on the line; billing.js prices each entry: 3 x €6.67 = €20.01
    expect(items).toContain('<div class="num amt">€20.00</div>');
    expect(items).toMatch(/<tr class="adj"[^>]*>[\s\S]*Rounding[\s\S]*<div class="num amt">€0.01<\/div>/);
    const totals = html.slice(html.indexOf('<div class="totals">'));
    expect(totals).toContain('€20.01');
    expect(buildPDFHTML({ ...base, entries: plain })).not.toContain('class="adj"');
    expect(buildPDFHTML({ ...base, entries: e, rounding: 0, language: 'sk' })).toContain('Zaokrúhlenie');
  });

  it('keeps every line exact and the lines summing to billingTotals', () => {
    // half-cent rates and odd minutes: 7 x 0.25 h at €30.50, rounding 15
    const e = Array.from({ length: 7 }, (_, i) => entry('h' + i, 2 + i, 9, 15, 'Edit'));
    const r = { Edit: 30.5 };
    const html = buildPDFHTML({ ...base, entries: e, rates: r, clientRates: {} });
    const items = /<section class="items">([\s\S]*?)<\/section>/.exec(html)[1];
    const amts = [...items.matchAll(/<div class="num amt">€([\d,.]+)<\/div>/g)].map(m => Number(m[1].replace(/,/g, '')));
    const bt = billingTotals(e, { rates: r, clientRates: {}, vat: 23, clientVat: {}, rounding: 15, clientRounding: { Acme: 15 } });
    expect(amts[0]).toBe(53.38); // 1.75 h x €30.50 = 53.375 -> 53.38
    expect(round2(amts.reduce((s, a) => s + a, 0))).toBe(bt.net); // 7 x 7.63 = 53.41: Rounding €0.03
    expect(amts[1]).toBe(0.03);
  });

  it('prints built-in activity names and the stock sign-off in Slovak', () => {
    const e = [entry('a', 2, 9, 60, 'Post-production'), entry('b', 2, 11, 60, 'My own task')];
    const iss = { ...issuer, note: 'Thank you for your business.' };
    const sk = buildPDFHTML({ ...base, entries: e, rates: { 'Post-production': 30, 'My own task': 20 }, issuer: iss, language: 'sk' });
    expect(sk).toContain('Postprodukcia');
    expect(sk).not.toContain('>Post-production<');
    expect(sk).toContain('My own task');
    expect(sk).toContain('Ďakujeme za spoluprácu.');
    const en = buildPDFHTML({ ...base, entries: e, rates: { 'Post-production': 30 }, issuer: iss });
    expect(en).toContain('Post-production');
    expect(en).toContain('Thank you for your business.');
    expect(buildPDFHTML({ ...base, entries: e, issuer: { ...issuer, note: 'Splatné do 14 dní.' }, language: 'sk' })).toContain('Splatné do 14 dní.');
  });

  it('prints only the real dates for a named report period', () => {
    const html = buildPDFHTML({ ...base, entries: plain, invoiceMode: false, period: 'month' });
    expect(html).not.toContain('This month');
  });

  it('gives every Time details row its date and the running sums for page breaks', () => {
    const html = buildPDFHTML({ ...base, entries: plain });
    const log = /<section class="log">([\s\S]*?)<\/section>/.exec(html)[1];
    expect((log.match(/<span class="d">/g) || []).length).toBe(plain.length);
    expect(log).toMatch(/<tr class="same free">[\s\S]*?<td class="what" data-carry="€180.00" data-carry-h="3.25"/); // 1.00 + 1.75 + 0.50 complimentary
    expect(html).toContain('<template id="tt-log-carry">');
    expect(html).toContain('<template id="tt-log-brought">');
  });

  it('names the download file in ASCII and carries the paginator', () => {
    const html = buildPDFHTML({ ...base, entries: plain, client: 'Blue Fern Café' });
    expect(html).toContain('<meta name="tt-filename" content="invoice-2026-047-blue-fern-cafe">');
    const rep = buildPDFHTML({ ...base, entries: plain, invoiceMode: false, language: 'sk', client: 'Kežmarok s.r.o.' });
    expect(rep).toMatch(/content="vykaz-prace-kezmarok-s-r-o-2026-10-03"/);
    expect(fileSlug('Ľadová Šťava')).toBe('ladova-stava');
    expect(html).toContain('<script id="tt-paginate">');
    expect(html).toContain('<template id="tt-carry">');
    expect(pdfHTMLForFrame(html)).not.toContain('<script');
  });

  it('makes a monogram from the trading name', () => {
    expect(tradingName('Studio Lumen s.r.o.')).toBe('Studio Lumen');
    expect(monogram('Studio Lumen s.r.o.')).toBe('SL');
    expect(monogram('Šimon, s. r. o.')).toBe('Š');
  });
});
