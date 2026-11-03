// Report / invoice HTML builder and the print + download helpers.
// Keep this module pure: no JSX, no React, no Tauri imports. It must stay importable from plain Node
// (node -e "import('./src/lib/pdf.js')") so invoices can be rendered headlessly.
import { round2, getRate, billableDuration, calcEarnings, calcStandardValue, billingTotals } from './billing.js';
import { DEFAULT_DESCRIPTIONS, DEFAULT_ISSUER } from './constants.js';
import { formatEUR } from './format.js';
// Base64 Geist (latin + latin-ext). Lives in the invoice folder; plain string constants, Node-safe.
import { GEIST_LATIN_WOFF2, GEIST_LATIN_EXT_WOFF2 } from '../views/invoice/pdfFonts.js';
// Payment QR (SEPA EPC QR and the Slovak PAY by square). Pure functions, Node-safe.
import { qrSVG, epcPayload, payBySquare, ibanValid } from '../views/invoice/payQr.js';
// The Slovak variabilný symbol (digits of the invoice number). Pure, Node-safe; the dialog shows the same value.
import { variableSymbol } from '../views/invoice/invoiceNumber.js';

// ---------- i18n ----------
// Older keys stay (other code may read them); the document uses the newer ones below each block.
export const PDF_TRANSLATIONS = {
  en: {
    title: 'Time report',
    generated: 'Generated',
    today: 'Today',
    week: 'This week',
    month: 'This month',
    year: 'This year',
    all: 'All time',
    customRange: 'Custom range',
    summary: 'Summary',
    billableTime: 'Billable time',
    totalTime: 'Total time',
    sessions: 'sessions',
    session: 'session',
    complimentary: 'complimentary',
    netAmount: 'Net amount',
    exclVat: 'excl. VAT',
    totalToInvoice: 'Total to invoice',
    totalAmount: 'Total',
    inclVat: (vat) => `incl. ${vat}% VAT`,
    billingPolicy: 'Rounding',
    billingPolicyText: (rounding) => `Each session is rounded up to the next ${rounding}-minute block.`,
    complimentaryHead: 'Complimentary work included',
    complimentaryBody: (count, inPeriod) => `${count} ${count === 1 ? 'session is' : 'sessions are'} provided free of charge${inPeriod ? ' in this period' : ''}.`,
    complimentaryValue: 'Standard value of complimentary work',
    breakdownByTask: 'Breakdown by activity',
    task: 'Activity',
    sessionsCol: 'Sessions',
    tracked: 'Tracked',
    billable: 'Billed',
    hours: 'Hours',
    rate: 'Rate / h',
    net: 'Amount',
    subtotalNet: 'Subtotal',
    vatLabel: (vat) => `VAT ${vat}%`,
    totalInclVat: 'Total incl. VAT',
    detailedLog: 'Time details',
    date: 'Date',
    time: 'Time',
    taskNote: 'Activity and note',
    taskOnly: 'Activity',
    complimentaryBadge: 'Complimentary',
    activityDescriptions: 'Activity descriptions',
    printBtn: 'Print or save as PDF',
    closeBtn: 'Close',
    footer: 'Time report',
    invoiceTitle: 'Invoice',
    invoiceFooter: 'Invoice',
    supplier: 'From',
    billTo: 'Bill to',
    invoiceNo: 'Invoice no.',
    issueDate: 'Issue date',
    dueDate: 'Due date',
    regId: 'Reg. no.',
    taxId: 'Tax ID',
    vatId: 'VAT ID',
    iban: 'IBAN',
    locale: 'en-GB',
    // document v2
    amountDue: 'Amount due',
    numberShort: 'No.',
    dueOn: (d) => `Due ${d}`,
    supplyDate: 'Supply date',
    period: 'Service period',
    reportPeriod: 'Period',
    details: 'Details',
    client: 'Client',
    preparedBy: 'Prepared by',
    payment: 'Payment details',
    method: 'Method',
    bankTransfer: 'Bank transfer',
    reference: 'Reference',
    totalDue: 'Total due',
    total: 'Total',
    billableTimeRow: 'Billable time',
    noCharge: 'No charge',
    complimentaryNote: (value) => `Complimentary work worth ${value} is waived.`,
    attachmentTo: (no) => (no ? `Attachment to invoice ${no}` : 'Attachment to the invoice'),
    page: 'Page',
    of: 'of',
    hoursUnit: 'h',
    // page breaks (round 2)
    carried: 'Carried forward',
    carriedNote: 'Continues on the next page',
    brought: 'Brought forward',
    continued: (title) => `${title}, continued`,
    waived: (value) => `${value} waived`,
    perEntryNote: 'Each entry is priced from its exact time and rounded to the cent, so a line can differ from hours × rate by a few cents.',
    fileInvoice: 'invoice',
    fileReport: 'time-report',
    scanToPay: 'Scan to pay',
    qrName: 'SEPA QR',
    // round 4
    rounding: 'Rounding',
    roundingNote: 'Each entry is priced to the cent',
    // round 5
    statusDraft: 'Draft',
    statusCopy: 'Copy',
    waivedSr: 'Standard value, not charged',
  },
  sk: {
    title: 'Výkaz odpracovaného času',
    generated: 'Vygenerované',
    today: 'Dnes',
    week: 'Tento týždeň',
    month: 'Tento mesiac',
    year: 'Tento rok',
    all: 'Celé obdobie',
    customRange: 'Vlastné obdobie',
    summary: 'Súhrn',
    billableTime: 'Fakturovateľný čas',
    totalTime: 'Celkový čas',
    sessions: 'záznamov',
    session: 'záznam',
    complimentary: 'bezplatne',
    netAmount: 'Suma bez DPH',
    exclVat: 'bez DPH',
    totalToInvoice: 'Celková suma',
    totalAmount: 'Spolu',
    inclVat: (vat) => `vrátane DPH ${vat} %`,
    billingPolicy: 'Zaokrúhľovanie',
    billingPolicyText: (rounding) => `Každý záznam sa zaokrúhľuje nahor na celé ${rounding}-minútové bloky.`,
    complimentaryHead: 'Práce poskytnuté bezplatne',
    complimentaryBody: (count, inPeriod) => `${count} ${count === 1 ? 'záznam je' : (count >= 2 && count <= 4 ? 'záznamy sú' : 'záznamov je')} poskytnut${count === 1 ? 'ý' : (count >= 2 && count <= 4 ? 'é' : 'ých')} bezplatne${inPeriod ? ' v tomto období' : ''}.`,
    complimentaryValue: 'Štandardná hodnota bezplatne poskytnutej práce',
    breakdownByTask: 'Rozpis podľa činností',
    task: 'Činnosť',
    sessionsCol: 'Počet',
    tracked: 'Zaznamenané',
    billable: 'Fakturované',
    hours: 'Hodiny',
    rate: 'Sadzba / h',
    net: 'Suma',
    subtotalNet: 'Základ dane',
    vatLabel: (vat) => `DPH ${vat} %`,
    totalInclVat: 'Spolu s DPH',
    detailedLog: 'Rozpis odpracovaného času',
    date: 'Dátum',
    time: 'Čas',
    taskNote: 'Činnosť a poznámka',
    taskOnly: 'Činnosť',
    complimentaryBadge: 'Bezplatne',
    activityDescriptions: 'Vysvetlivky činností',
    printBtn: 'Tlačiť alebo uložiť ako PDF',
    closeBtn: 'Zavrieť',
    footer: 'Výkaz odpracovaného času',
    invoiceTitle: 'Faktúra',
    invoiceFooter: 'Faktúra',
    supplier: 'Dodávateľ',
    billTo: 'Odberateľ',
    invoiceNo: 'Faktúra č.',
    issueDate: 'Dátum vystavenia',
    dueDate: 'Dátum splatnosti',
    regId: 'IČO',
    taxId: 'DIČ',
    vatId: 'IČ DPH',
    iban: 'IBAN',
    locale: 'sk-SK',
    // document v2
    amountDue: 'Suma na úhradu',
    numberShort: 'Číslo',
    dueOn: (d) => `Splatné ${d}`,
    supplyDate: 'Dátum dodania',
    period: 'Obdobie',
    reportPeriod: 'Obdobie',
    details: 'Údaje faktúry',
    client: 'Klient',
    preparedBy: 'Vypracoval',
    payment: 'Platobné údaje',
    method: 'Forma úhrady',
    bankTransfer: 'Bankový prevod',
    reference: 'Variabilný symbol',
    totalDue: 'Spolu na úhradu',
    total: 'Spolu',
    billableTimeRow: 'Fakturovaný čas',
    noCharge: 'Bez poplatku',
    complimentaryNote: (value) => `Bezplatne poskytnutá práca v hodnote ${value} sa neúčtuje.`,
    attachmentTo: (no) => (no ? `Príloha k faktúre č. ${no}` : 'Príloha k faktúre'),
    page: 'Strana',
    of: 'z',
    hoursUnit: 'h',
    // page breaks (round 2)
    carried: 'Prenos',
    carriedNote: 'Pokračuje na ďalšej strane',
    brought: 'Prenos z predchádzajúcej strany',
    continued: (title) => `${title}, pokračovanie`,
    waived: (value) => `Hodnota ${value} sa neúčtuje`,
    perEntryNote: 'Každý záznam sa oceňuje podľa presného času a zaokrúhľuje na centy, preto sa suma riadku môže od hodín × sadzby líšiť o pár centov.',
    fileInvoice: 'faktura',
    fileReport: 'vykaz-prace',
    scanToPay: 'Zaplaťte cez QR',
    qrName: 'PAY by square',
    // round 4
    rounding: 'Zaokrúhlenie',
    roundingNote: 'Každý záznam je ocenený na centy',
    // round 5
    statusDraft: 'Návrh',
    statusCopy: 'Kópia',
    waivedSr: 'Štandardná hodnota, neúčtuje sa',
  },
};

// The built-in activity names (constants.js DEFAULT_TASKS, whose descriptions already ship in both
// languages) and the stock sign-off, in the other language, so a Slovak document does not mix in English.
// Only exact matches change: names and notes the user wrote print as written.
const BUILTIN_TASK_NAMES = {
  sk: {
    'Pre-production': 'Predprodukcia',
    'Production (Photography)': 'Produkcia (fotografia)',
    'Production (Videography)': 'Produkcia (video)',
    'Post-production': 'Postprodukcia',
    'META Ads': 'Reklamy META',
  },
};
const STOCK_NOTES = [
  { en: 'Thank you for your business.', sk: 'Ďakujeme za spoluprácu.' },
  { en: 'Thank you!', sk: 'Ďakujeme!' },
];
export function localTaskName(task, language) {
  const map = BUILTIN_TASK_NAMES[language];
  return (map && Object.prototype.hasOwnProperty.call(map, task)) ? map[task] : task;
}
export function localNote(note, language) {
  const s = String(note || '').trim();
  const key = s.toLowerCase();
  const hit = STOCK_NOTES.find(p => p.en.toLowerCase() === key || p.sk.toLowerCase() === key);
  return hit ? hit[language === 'sk' ? 'sk' : 'en'] : s;
}

export function formatHoursDecimalLocalized(h, language) {
  if (language === 'sk') return h.toFixed(2).replace('.', ',') + ' h';
  return h.toFixed(2) + ' h';
}

// Document dates: EN "3 Nov 2026", SK "3. 11. 2026" (the Slovak business format).
const DATE_OPTS = { en: { day: 'numeric', month: 'short', year: 'numeric' }, sk: { day: 'numeric', month: 'numeric', year: 'numeric' } };
export function formatPDFDateLocalized(iso, language) {
  const d = new Date(iso + 'T00:00:00');
  return formatPDFDateFromTsLocalized(d, language);
}

// Spaces inside a date are non-breaking, so a date never splits across two lines.
export function formatPDFDateFromTsLocalized(d, language) {
  const sk = language === 'sk';
  return d.toLocaleDateString(sk ? 'sk-SK' : 'en-GB', sk ? DATE_OPTS.sk : DATE_OPTS.en).replace(/\s/g, ' ');
}

export function formatEURLocalized(amount, language) {
  if (language !== 'sk') return formatEUR(amount);
  // Slovak format, always to the cent: 1 234,56 €
  const n = Number(amount) || 0;
  const formatted = Math.abs(n).toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${formatted}\u00a0€`;
}

// ---------- report output ----------
// Print a generated report by loading it into a hidden iframe and invoking the print
// dialog. This works both in a plain browser and inside the Tauri webview (WebView2),
// where window.open is unreliable / blocked. Falls back to downloading the HTML.
export function printReportHTML(html, client, onMessage) {
  // The frame gets the document without its inline script (the packaged app's CSP may block inline
  // scripts in the frame); doPrint paginates it from here instead. A download keeps the script.
  const standalone = html;
  html = pdfHTMLForFrame(html);
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // Off-screen but with a real A4-ish size so the webview actually lays the page out for printing.
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';
    document.body.appendChild(iframe);

    // document.write into the same-origin blank frame — avoids srcdoc/CSP frame-src issues in the packaged app.
    const doc = iframe.contentWindow ? iframe.contentWindow.document : iframe.contentDocument;
    if (!doc) { try { document.body.removeChild(iframe); } catch (e) {} downloadReportHTML(standalone, client, onMessage); return; }
    doc.open();
    doc.write(html);
    doc.close();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try { document.body.removeChild(iframe); } catch (e) { /* already removed */ }
    };

    const doPrint = () => {
      const frameWin = iframe.contentWindow;
      if (!frameWin) { cleanup(); downloadReportHTML(standalone, client, onMessage); return; }
      // Split page 1 now that the font has loaded, so it never runs past the paper.
      try { paginatePDF(frameWin.document); } catch (err) { console.error(err); }
      frameWin.onafterprint = cleanup;
      try {
        frameWin.focus();
        frameWin.print();
      } catch (err) {
        console.error(err);
        cleanup();
        downloadReportHTML(standalone, client, onMessage);
        return;
      }
      setTimeout(cleanup, 120000); // safety net if onafterprint never fires
    };

    // Give the webview a moment to render the written document before invoking print, and let the
    // embedded font finish decoding (capped, so a stuck font never blocks printing).
    setTimeout(() => {
      let fonts = null;
      try { fonts = iframe.contentWindow && iframe.contentWindow.document.fonts; } catch (e) { fonts = null; }
      if (fonts && fonts.ready && typeof fonts.ready.then === 'function') {
        let done = false;
        const go = () => { if (done) return; done = true; doPrint(); };
        fonts.ready.then(go, go);
        setTimeout(go, 1200);
      } else {
        doPrint();
      }
    }, 300);
  } catch (err) {
    console.error(err);
    downloadReportHTML(standalone, client, onMessage);
  }
}

// ASCII file-name slug: "Blue Fern Café" -> "blue-fern-cafe", "Kežmarok" -> "kezmarok".
export function fileSlug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l').replace(/[đĐ]/g, 'd').replace(/ß/g, 'ss').replace(/[æÆ]/g, 'ae').replace(/[øØ]/g, 'o')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function downloadReportHTML(html, client, onMessage) {
  // buildPDFHTML names the file in a meta tag (invoice-2026-047-tatra-outdoor); older HTML falls back to the client.
  const m = /<meta name="tt-filename" content="([^"]*)"/.exec(String(html));
  const name = (m && m[1]) || ['report', fileSlug(client), new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const msg = 'Could not open the print dialog, so the document was downloaded as HTML. Open it and press Ctrl+P to save a PDF.';
  if (onMessage) onMessage(msg, 'err'); else alert(msg);
}

// The document HTML without its inline pagination script, for writing into an in-app frame.
// The caller then runs paginatePDF(frame.document) itself.
export function pdfHTMLForFrame(html) {
  return String(html || '').replace(/<script id="tt-paginate">[\s\S]*?<\/script>/, '');
}

// ---------- pagination ----------
// The document is paginated here, page by page, instead of leaving breaks to the browser. That is the
// only way to get what a printed invoice needs: a "Carried forward" / "Brought forward" row at every
// break, the totals never alone on a page, the Time details total never alone, the date repeated on the
// first row of each page, and an exact page count for page 1.
// - Page 1 prints with no top or bottom page margin (that keeps the browser's own header and footer off
//   every page) and draws its own footer. It holds the masthead, the line items that fit and, when
//   everything fits, the totals.
// - Line items that do not fit go to continuation sheets (.sheet.cont). The totals and payment block go
//   after the last line item and take at least the last MINLAST rows with them to a new page.
// - The Time details are split the same way (.sheet.log-cont); the total row takes the last rows along.
// Every sheet is measured to fit one printed page (A4 minus the margins, with a few px of slack), so the
// browser never has to break one by itself. Rows never split.
// It runs from the document's own script (standalone file), from printReportHTML and from the preview.
// It must stay self-contained (it is inlined with toString): no outer references, ES5 syntax only.
// Returns the number of line-item rows kept on page 1, or -1 when the line items did not have to move.
export function paginatePDF(doc) {
  var first = doc.querySelector('.sheet.first');
  var body = first && first.querySelector('.sheet-body');
  if (!body) return -1;
  var logSheet = doc.querySelector('.sheet.log-sheet');
  var logBody = logSheet && logSheet.querySelector('.sheet-body');
  var k, m;

  // Undo an earlier pass, so the split can be redone (for example once the font has loaded).
  var old = doc.querySelectorAll('.sheet.gen, .sheet > .pfoot');
  for (k = 0; k < old.length; k++) old[k].parentNode.removeChild(old[k]);
  var restore = function (el) {
    if (!el) return;
    if (el.__ttOriginal != null) el.innerHTML = el.__ttOriginal; else el.__ttOriginal = el.innerHTML;
  };
  restore(body);
  restore(logBody);
  first.removeAttribute('data-split');
  first.classList.remove('fit');
  if (logSheet) logSheet.classList.remove('merged');
  doc.documentElement.setAttribute('data-paginated', '1');

  var MM = 96 / 25.4;
  var CAP1 = (297 - 1 - 15 - 17) * MM - 3; // page 1: A4 minus its 15 mm top padding, the 17 mm footer band, 1 mm slack
  var CAPN = (297 - 15 - 17) * MM - 4;     // later pages: inside the 15 mm / 17 mm @page margins
  var MINLAST = 2;                          // rows that travel with the totals (and with the Time details total)
  var WIDTH = (210 - 32) + 'mm';            // the printed content width (A4 minus 2 x 16 mm), in screen and print media
  var hOf = function (el) { return el.getBoundingClientRect().height; };
  var tpl = function (id) { var el = doc.getElementById(id); return el ? el.innerHTML : ''; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var ATTR = { amount: 'data-carry', hours: 'data-carry-h', tracked: 'data-carry-t' };
  // The running sums sit on the row (line items) or on one of its cells (Time details).
  var fill = function (html, row) {
    var src = row && (row.hasAttribute('data-carry') ? row : row.querySelector('[data-carry]'));
    return html.replace(/\{(amount|hours|tracked)\}/g, function (all, key) { return esc(src ? src.getAttribute(ATTR[key]) : ''); });
  };
  var addRow = function (tb, html) { tb.insertAdjacentHTML('beforeend', html); return tb.lastElementChild; };
  var newSheet = function (after, cls) {
    var s = doc.createElement('div');
    s.className = 'sheet gen ' + cls;
    var b = doc.createElement('div');
    b.className = 'sheet-body';
    b.style.width = WIDTH;
    s.appendChild(b);
    after.parentNode.insertBefore(s, after.nextSibling);
    return s;
  };
  var newTable = function (b, sectionClass, head, thead) {
    var sec = doc.createElement('section');
    sec.className = sectionClass;
    if (head) sec.insertAdjacentHTML('beforeend', head);
    var table = doc.createElement('table');
    table.appendChild(thead.cloneNode(true));
    var tb = doc.createElement('tbody');
    table.appendChild(tb);
    sec.appendChild(table);
    b.appendChild(sec);
    return { table: table, tb: tb };
  };

  // Lays `rows` out over pages. A page is { body, tb, cap, first, drop }; each page keeps room for the carry
  // row while rows remain. When the last rows are placed, closeIn adds the closing block (totals, or the
  // log total); if it does not fit, the last rows (up to MINLAST) move with it to a new page.
  // Row heights are measured once, so a page is filled in one go and then corrected by measuring it.
  var flow = function (o) {
    var rows = o.rows, n = rows.length, page = o.page, i = 0, guard = 0;
    var rh = [];
    for (k = 0; k < n; k++) rh.push(hOf(rows[k]));
    for (k = 0; k < n; k++) rows[k].parentNode.removeChild(rows[k]);
    var carryH = 0;
    if (n && o.carry) {
      var h0 = hOf(page.body);
      var probe = addRow(page.tb, fill(o.carry, rows[0]));
      carryH = hOf(page.body) - h0;
      page.tb.removeChild(probe);
    }
    var over = function (pg, next) { return hOf(pg.body) + (next < n ? carryH : 0) > pg.cap; };
    while (guard++ < n + 10) {
      var start = i;
      if (i < n && page.tb) {
        var room = page.cap - hOf(page.body), used = 0, j = i;
        while (j < n && used + rh[j] + (j + 1 < n ? carryH : 0) <= room) { used += rh[j]; j++; }
        var frag = doc.createDocumentFragment();
        for (k = i; k < j; k++) frag.appendChild(rows[k]);
        page.tb.appendChild(frag);
        while (j > i && over(page, j)) { j--; page.tb.removeChild(rows[j]); }
        while (j < n) {
          page.tb.appendChild(rows[j]);
          if (over(page, j + 1)) { page.tb.removeChild(rows[j]); break; }
          j++;
        }
        // Every page takes at least one row (page 1 may hand all of them on). A row taller than a page
        // cannot happen with real data; if it did, the browser would break it.
        if (j === i && !(page.first && o.emptyFirstOk)) { page.tb.appendChild(rows[j]); j++; }
        // Widows: the next page (the last one) must open with at least MINLAST rows, and a row marked
        // .adj (the Rounding line) never opens a page on its own: hand rows on from this page instead.
        if (j < n) {
          var hand = Math.max(0, MINLAST - (n - j));
          if (/\badj\b/.test(rows[j].className)) hand = Math.max(hand, 1);
          hand = Math.min(hand, j - i - 1);
          for (m = 0; m < hand; m++) { j--; page.tb.removeChild(rows[j]); }
        }
        i = j;
      }
      var placed = i - start, moved = 0;
      if (i >= n) {
        o.closeIn(page);
        if (hOf(page.body) <= page.cap || (placed === 0 && !page.first)) break;
        o.closeOut(page);
        if (placed <= 1) moved = page.first && o.emptyFirstOk ? placed : 0;
        else moved = Math.min(MINLAST, placed - 1);
        for (m = 0; m < moved; m++) page.tb.removeChild(rows[i - 1 - m]);
        i -= moved;
      }
      var kept = placed - moved;
      if (kept > 0 && o.carry) {
        var carry = addRow(page.tb, fill(o.carry, rows[i - 1]));
        while (kept > 1 && hOf(page.body) > page.cap) {
          page.tb.removeChild(carry);
          i--; kept--;
          page.tb.removeChild(rows[i]);
          carry = addRow(page.tb, fill(o.carry, rows[i - 1]));
        }
      }
      if (kept === 0 && page.drop) page.drop();
      page = o.next(i > 0 ? rows[i - 1] : null, n - i);
    }
  };

  // ----- page 1 and the line items -----
  var keep = -1;
  body.style.width = WIDTH;
  var fits = hOf(body) <= CAP1;
  if (!fits) {
    // A little too tall: a tighter rhythm (.fit) often keeps everything on page 1. Otherwise split.
    first.classList.add('fit');
    fits = hOf(body) <= CAP1;
    if (!fits) first.classList.remove('fit');
  }
  if (!fits) {
    var items = body.querySelector('.items');
    var closing = body.querySelector('.closing');
    var itb = items ? items.querySelector('tbody') : null;
    var ithead = items ? items.querySelector('thead') : null;
    var irows = itb ? Array.prototype.slice.call(itb.children) : [];
    if (closing) closing.parentNode.removeChild(closing);
    var lastItems = first;
    var page1 = { body: body, tb: itb, cap: CAP1, first: true,
      drop: function () { if (items && items.parentNode) items.parentNode.removeChild(items); } };
    flow({
      rows: irows, page: page1, carry: tpl('tt-carry'), emptyFirstOk: true,
      closeIn: function (pg) { if (closing) pg.body.appendChild(closing); },
      closeOut: function () { if (closing && closing.parentNode) closing.parentNode.removeChild(closing); },
      next: function (prev, remaining) {
        lastItems = newSheet(lastItems, 'cont');
        var b = lastItems.firstChild;
        b.insertAdjacentHTML('beforeend', tpl('tt-cont-head'));
        var pg = { body: b, tb: null, cap: CAPN, first: false };
        if (ithead && (prev || remaining > 0)) {
          pg.tb = newTable(b, 'items', '', ithead).tb;
          if (prev) addRow(pg.tb, fill(tpl('tt-brought'), prev));
        }
        return pg;
      },
    });
    keep = 0;
    if (items && items.parentNode && itb) {
      for (k = 0; k < itb.children.length; k++) if (!/\bcarry\b/.test(itb.children[k].className)) keep++;
    }
    first.setAttribute('data-split', String(keep));
  }

  // A table never gets wider than the paper: if something in it still cannot wrap, fix the layout so
  // the columns keep their set widths and the activity column takes what is left.
  var clamp = function (table, box) {
    if (table && box && table.getBoundingClientRect().width > box.getBoundingClientRect().width + 0.5) table.style.tableLayout = 'fixed';
  };

  // ----- a short document fits on one page -----
  // When page 1 kept everything and the Time details fit under the totals too, they move onto page 1
  // and the separate sheet is hidden, so a short invoice prints as "Page 1 of 1".
  var merged = false;
  if (keep === -1 && logBody) {
    var lsec = logBody.querySelector('section.log');
    if (lsec) {
      logBody.style.width = WIDTH;
      clamp(lsec.querySelector('table'), logBody);
      var copy = lsec.cloneNode(true);
      copy.className += ' inline';
      body.appendChild(copy);
      var wasFit = first.classList.contains('fit');
      merged = hOf(body) <= CAP1;
      if (!merged && !wasFit) {
        first.classList.add('fit');
        merged = hOf(body) <= CAP1;
        if (!merged) first.classList.remove('fit');
      }
      if (merged) logSheet.classList.add('merged');
      else body.removeChild(copy);
    }
  }

  // ----- Time details -----
  if (logBody && !merged) {
    logBody.style.width = WIDTH;
    var ltable = logBody.querySelector('table');
    clamp(ltable, logBody);
    if (ltable && ltable.tHead && ltable.tBodies.length && hOf(logBody) > CAPN) {
      // Lock the column widths (from the full table), so every page's table wraps the text the same way.
      var cells = ltable.tHead.rows[0].cells, widths = [];
      for (k = 0; k < cells.length; k++) widths.push(/\bwhat\b/.test(cells[k].className) ? '' : cells[k].getBoundingClientRect().width + 'px');
      ltable.style.tableLayout = 'fixed';
      for (k = 0; k < cells.length; k++) cells[k].style.width = widths[k];
      var lthead = ltable.tHead, lfoot = ltable.tFoot, ltb = ltable.tBodies[0];
      var lrows = Array.prototype.slice.call(ltb.children);
      if (lfoot) ltable.removeChild(lfoot);
      var lastLog = logSheet;
      flow({
        rows: lrows, page: { body: logBody, tb: ltb, table: ltable, cap: CAPN, first: false }, carry: tpl('tt-log-carry'), emptyFirstOk: false,
        closeIn: function (pg) { if (lfoot) pg.table.appendChild(lfoot); },
        closeOut: function () { if (lfoot && lfoot.parentNode) lfoot.parentNode.removeChild(lfoot); },
        next: function (prev) {
          lastLog = newSheet(lastLog, 'log-cont');
          var b = lastLog.firstChild;
          var t = newTable(b, 'log', tpl('tt-log-cont'), lthead);
          t.table.style.tableLayout = 'fixed';
          if (prev) addRow(t.tb, fill(tpl('tt-log-brought'), prev));
          return { body: b, tb: t.tb, table: t.table, cap: CAPN, first: false };
        },
      });
    }
  }

  // ----- page numbers -----
  // Page 1 has no page margin, so it prints its own "Page 1 of N". Later pages get theirs from the @page
  // margin boxes in print; on screen (preview, downloaded file) each sheet shows the same footer.
  var sheets = doc.querySelectorAll('.sheet:not(.merged)');
  var foot = first.querySelector('.sheet-foot');
  if (foot) {
    var total = sheets.length, word = foot.getAttribute('data-page') || 'Page', of = foot.getAttribute('data-of') || 'of';
    var pgEl = foot.querySelector('.pg');
    if (pgEl) pgEl.textContent = word + ' 1 ' + of + ' ' + total;
    for (k = 1; k < sheets.length; k++) {
      var pf = doc.createElement('div');
      pf.className = 'pfoot';
      pf.setAttribute('aria-hidden', 'true');
      var l = doc.createElement('span'); l.textContent = foot.getAttribute('data-left') || '';
      var r = doc.createElement('span'); r.textContent = word + ' ' + (k + 1) + ' ' + of + ' ' + total;
      pf.appendChild(l); pf.appendChild(r);
      sheets[k].appendChild(pf);
    }
  }
  var all = doc.querySelectorAll('.sheet');
  for (k = 0; k < all.length; k++) { var sb = all[k].querySelector('.sheet-body'); if (sb) sb.style.width = ''; }
  return keep;
}

// ---------- helpers ----------
const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A CSS string literal (for @page margin boxes). "<" is escaped so a name can never close the <style>.
const cssString = (s) => '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3C ') + '"';

const LEGAL_SUFFIX = /[,\s]+(s\.\s?r\.\s?o\.?|spol\.\s?s\s?r\.\s?o\.?|a\.\s?s\.?|k\.\s?s\.?|v\.\s?o\.\s?s\.?|ltd\.?|llc|gmbh|inc\.?|plc|s\.\s?a\.?|sro)\s*$/i;
// "Studio Lumen s.r.o." -> "Studio Lumen" (the trading name for the wordmark; the legal name stays in "From").
export function tradingName(name) {
  let s = String(name || '').trim();
  for (let i = 0; i < 2; i++) s = s.replace(LEGAL_SUFFIX, '').trim();
  return s || String(name || '').trim();
}
// Two-letter monogram from the trading name: "Studio Lumen" -> "SL", "Kovo" -> "K".
export function monogram(name) {
  const words = tradingName(name).split(/[\s\-–—&+/]+/).filter(w => /[\p{L}\p{N}]/u.test(w));
  const first = (w) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ''))[0] || '';
  return words.slice(0, 2).map(first).join('').toUpperCase();
}

const pad2 = (n) => String(n).padStart(2, '0');
const clock = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

// "1–31 Oct 2026" / "28 Sep – 3 Oct 2026" / "1. – 31. 10. 2026" / "28. 9. – 3. 10. 2026"
// Every space in a range is non-breaking (also after the dash), so a range never splits over two lines.
function formatRange(a, b, language) {
  const sk = language === 'sk';
  const full = (d) => formatPDFDateFromTsLocalized(d, language);
  if (!a || !b) return '';
  if (a.getFullYear() !== b.getFullYear()) return `${full(a)} – ${full(b)}`;
  if (a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) return full(a);
  if (sk) {
    if (a.getMonth() === b.getMonth()) return `${a.getDate()}. – ${full(b)}`;
    return `${a.getDate()}. ${a.getMonth() + 1}. – ${full(b)}`;
  }
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${full(b)}`;
  const dm = a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace(/\s/g, ' ');
  return `${dm} – ${full(b)}`;
}

// ---------- PDF builder ----------
// billTo (optional): the client's legal details for "Bill to" { name, address, regId, taxId, vatId }.
// Without it the builder reads issuer.clientDetails[client] (saved from the invoice dialog), else shows the name only.
// showDescriptions: the activity description line under each line item (default on).
// status (optional, invoices only): 'draft' (no number yet: the in-app preview) or 'copy' (every entry is
// already invoiced, so this is a reprint), shown as a small mark next to the title. Anything else: no mark.
export function buildPDFHTML({ client, entries, rates, clientRates, vat, rounding, period, customStart, customEnd, showDates = true, showTimes = true, showNotes = true, showVat = true, showQr = true, showDescriptions = true, language = 'en', descriptions = DEFAULT_DESCRIPTIONS, issuer = DEFAULT_ISSUER, invoiceMode = false, invoiceNumber = '', issueDate = '', dueDate: dueDateIn = '', billTo = null, status = '' }) {
  const lang = language === 'sk' ? 'sk' : 'en';
  // Dates come as YYYY-MM-DD; anything else (cleared, half typed) is left out rather than printed as "Invalid Date".
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDateIn || '')) ? dueDateIn : '';
  const t = PDF_TRANSLATIONS[lang];
  const esc = escapeHTML;
  const fmtEUR = (a) => formatEURLocalized(a, lang);
  const num2 = (n) => (lang === 'sk' ? n.toFixed(2).replace('.', ',') : n.toFixed(2));
  // Hours are decimal everywhere in the document, always with the unit (a lighter "h"), so 0.75 h never
  // reads as 0:75 and no column mixes h:mm with decimals.
  const hrs = (h) => `${num2(h)}<span class="u">&nbsp;h</span>`;
  const fmtDay = (ts) => formatPDFDateFromTsLocalized(new Date(ts), lang);
  const iss = { ...DEFAULT_ISSUER, ...(issuer || {}) };
  const list = Array.isArray(entries) ? entries : [];
  const vatPct = Number(vat) || 0;

  // ----- money: THE billing rule (billing.js billingTotals), so every screen shows the same cents -----
  // The caller passes this client's effective VAT and rounding, so no per-client overrides are needed here.
  const tempClientRounding = { [client]: rounding };
  const money = billingTotals(list, { rates, clientRates, vat: vatPct, clientVat: {}, rounding, clientRounding: tempClientRounding });
  const totalNet = money.net;
  const totalVatAmount = money.vat;
  const totalGross = money.gross;
  const amountDue = showVat ? totalGross : totalNet;
  const complimentaryCount = list.filter(e => e.free).length;

  // Billable entries grouped by activity (task)
  const byTask = {};
  list.forEach(e => {
    if (e.free) return;
    if (!byTask[e.task]) byTask[e.task] = { ms: 0, billableMs: 0, earnings: 0, count: 0, rate: getRate(e.client, e.task, rates, clientRates) };
    byTask[e.task].ms += e.duration;
    byTask[e.task].billableMs += billableDuration(e, rounding);
    byTask[e.task].earnings += calcEarnings(e, rates, clientRates, rounding, tempClientRounding);
    byTask[e.task].count += 1;
  });
  // Largest billed hours first, so the order matches the Hours column the client reads.
  const sortedTasks = Object.entries(byTask).sort((a, b) => (b[1].billableMs - a[1].billableMs) || (b[1].earnings - a[1].earnings));

  // Complimentary entries grouped by activity: listed for transparency, billed at 0.
  const freeByTask = {};
  list.forEach(e => {
    if (!e.free) return;
    if (!freeByTask[e.task]) freeByTask[e.task] = { billableMs: 0, value: 0, count: 0, rate: getRate(e.client, e.task, rates, clientRates) };
    freeByTask[e.task].billableMs += billableDuration(e, rounding);
    freeByTask[e.task].value += calcStandardValue(e, rates, clientRates, rounding, tempClientRounding);
    freeByTask[e.task].count += 1;
  });
  const freeTasks = Object.entries(freeByTask).sort((a, b) => b[1].billableMs - a[1].billableMs);

  const billableEntriesCount = list.filter(e => !e.free).length;
  const billableTotalMs = list.reduce((s, e) => e.free ? s : s + e.duration, 0);
  const billableTotalHours = list.reduce((s, e) => e.free ? s : s + billableDuration(e, rounding), 0) / 3600000;
  const showRoundingNote = rounding > 0 && billableTotalMs !== Math.round(billableTotalHours * 3600000);
  // AI-assisted work is billed above the stopwatch, so the raw tracked time must never reach the
  // client: no "tracked" column and no per-entry clock times that would contradict the billed hours.
  const hasAi = list.some(e => e.ai);
  const showTracked = showRoundingNote && !hasAi;
  const showEntryTimes = showTimes && !hasAi;

  // ----- dates -----
  const starts = list.map(e => e.start).filter(Number.isFinite);
  // reduce, not Math.min(...starts): a spread of tens of thousands of entries can overflow the call stack.
  const firstDate = starts.length ? new Date(starts.reduce((a, b) => (b < a ? b : a))) : null;
  const lastDate = starts.length ? new Date(starts.reduce((a, b) => (b > a ? b : a))) : null;
  const entriesRange = formatRange(firstDate, lastDate, lang);
  const customRange = (period === 'custom' && customStart && customEnd)
    ? formatRange(new Date(customStart + 'T00:00:00'), new Date(customEnd + 'T00:00:00'), lang) : '';
  // On paper, relative words ("This month") mean nothing a week later: show the actual dates.
  const servicePeriod = customRange || entriesRange;
  const spansYears = firstDate && lastDate && firstDate.getFullYear() !== lastDate.getFullYear();
  const logDate = (ts) => {
    const d = new Date(ts);
    if (lang === 'sk') return `${d.getDate()}. ${d.getMonth() + 1}.${spansYears ? ` ${d.getFullYear()}` : ''}`;
    return d.toLocaleDateString('en-GB', spansYears ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  };
  const logWeekday = (ts) => new Date(ts).toLocaleDateString(lang === 'sk' ? 'sk-SK' : 'en-GB', { weekday: 'short' });
  const generatedAt = new Date().toLocaleString(t.locale, { day: 'numeric', month: lang === 'sk' ? 'numeric' : 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const sessionWord = (count) => {
    if (lang !== 'sk') return count === 1 ? t.session : t.sessions;
    if (count === 1) return 'záznam';
    if (count >= 2 && count <= 4) return 'záznamy';
    return 'záznamov';
  };

  // ----- identity -----
  const hasIssuer = !!String(iss.name || '').trim();
  const brandName = hasIssuer ? tradingName(iss.name) : '';
  const mark = hasIssuer ? monogram(iss.name) : '';
  const docTitle = invoiceMode ? t.invoiceTitle : t.title;
  const number = String(invoiceNumber || '').trim();
  // Slovak payment reference (variabilný symbol) is numeric, max 10 digits.
  const vs = variableSymbol(number);
  const reference = lang === 'sk' ? vs : number;
  // An invoice always carries its issue date (Dátum vystavenia). The dialog requires one; a caller that
  // leaves it out gets the day the document is made, which is when it is issued.
  const issuedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(issueDate || '')) ? issueDate
    : (invoiceMode ? (() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })() : '');
  const footerLeft = invoiceMode
    ? [t.invoiceTitle + (number ? ` ${number}` : ''), client].filter(Boolean).join('  ·  ')
    : [t.title, client].filter(Boolean).join('  ·  ');
  const firstPageRight = `${t.generated} ${generatedAt}`;
  const pageTitle = invoiceMode
    ? `${t.invoiceTitle}${number ? ` ${number}` : ''} - ${client}`
    : `${t.title} - ${client}${showDates && servicePeriod ? ` - ${servicePeriod}` : ''}`;
  // Download name (ASCII): invoice-2026-047-tatra-outdoor / time-report-tatra-outdoor-2026-10-31.
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fileName = [invoiceMode ? t.fileInvoice : t.fileReport, invoiceMode ? fileSlug(number) : '', fileSlug(client),
    invoiceMode && number ? '' : isoOf(invoiceMode && issuedOn ? new Date(issuedOn + 'T00:00:00') : (lastDate || new Date()))]
    .filter(Boolean).join('-');
  const continuedTitle = t.continued(invoiceMode ? `${t.invoiceTitle}${number ? ` ${number}` : ''}` : t.title);

  // Activity descriptions, shown under each line item (and for complimentary-only activities too).
  const langDescriptions = (descriptions && descriptions[lang]) || DEFAULT_DESCRIPTIONS[lang] || DEFAULT_DESCRIPTIONS.en;
  const descOf = (task) => (showDescriptions ? String((langDescriptions && langDescriptions[task]) || '').trim() : '');
  // Built-in activity names print in the document's language; the user's own names print as written.
  const taskName = (task) => localTaskName(task, lang);

  const addressLines = String(iss.address || '').split(/\n/).map(s => s.trim()).filter(Boolean);
  // Label / value pairs for a two-column grid (.kv-grid): label column sizes to its longest label.
  const kv = (label, value, cls = '') => (value && String(value).trim())
    ? `<span class="k ${cls}">${esc(label)}</span><span class="v ${cls}">${esc(value)}</span>` : '';
  // A date range never breaks inside ("1. –" at a line end, "31. 10. 2026" on the next): after a dash
  // the browser may break even before a no-break space, so the whole range sits in a nowrap span.
  // Only in the narrow Details column may a long range across two years break after its dash, where
  // each line then holds a full date.
  const nobr = (s) => `<span class="nw">${esc(s)}</span>`;
  const periodHTML = servicePeriod ? nobr(servicePeriod) : '';

  // ----- masthead + hero -----
  const contact = [iss.email, iss.phone].filter(v => v && String(v).trim());
  const masthead = (hasIssuer || contact.length) ? `
  <header class="mast">
    ${hasIssuer ? `<div class="brand"><div class="mark" aria-hidden="true">${esc(mark)}</div><div class="brand-name">${esc(brandName)}</div></div>` : '<div></div>'}
    ${contact.length ? `<div class="contact">${contact.map(c => `<div>${esc(c)}</div>`).join('')}</div>` : ''}
  </header>` : '';

  const heroRight = invoiceMode ? `
      <div class="due">
        <div class="label">${esc(t.amountDue)}</div>
        <div class="due-amount num">${fmtEUR(amountDue)}</div>
        ${dueDate ? `<div class="due-date">${esc(t.dueOn(formatPDFDateLocalized(dueDate, lang)))}</div>` : ''}
      </div>` : `
      <div class="due">
        <div class="label">${esc(showVat ? t.totalInclVat : t.total)}</div>
        <div class="due-amount num">${fmtEUR(amountDue)}</div>
        <div class="due-date num">${hrs(billableTotalHours)} · ${billableEntriesCount} ${esc(sessionWord(billableEntriesCount))}</div>
      </div>`;

  const statusWord = invoiceMode ? ({ draft: t.statusDraft, copy: t.statusCopy }[status] || '') : '';
  const statusMark = statusWord ? `<span class="status">${esc(statusWord)}</span>` : '';
  const hero = `
  <section class="hero">
    <div class="hero-title">
      <h1>${esc(docTitle)}${statusMark}</h1>
      ${invoiceMode
        ? (number ? `<div class="doc-no">${esc(t.numberShort)} <span class="num">${esc(number)}</span></div>` : '')
        : `<div class="doc-no">${esc(client)}</div>`}
    </div>
    ${heroRight}
  </section>`;

  // ----- parties / details grid -----
  const supplierIds = `${kv(t.regId, iss.regId)}${kv(t.taxId, iss.taxId)}${kv(t.vatId, iss.vatId)}`;
  const supplierBlock = hasIssuer ? `
    <div class="col">
      <div class="label">${esc(t.supplier)}</div>
      <div class="party-name">${esc(iss.name)}</div>
      ${addressLines.map(l => `<div class="line">${esc(l)}</div>`).join('')}
      ${supplierIds ? `<div class="kv-grid ids">${supplierIds}</div>` : ''}
    </div>` : '';
  // Bill to: the client's legal name, address and IDs in the same label / value grid as "From".
  const billSrc = (billTo && typeof billTo === 'object') ? billTo
    : (iss.clientDetails && typeof iss.clientDetails === 'object' && iss.clientDetails[client]) || {};
  const billStr = (k) => String((billSrc && billSrc[k]) || '').trim();
  const billName = billStr('name') || client;
  const billLines = billStr('address').split(/\n/).map(s => s.trim()).filter(Boolean);
  const billIds = `${kv(t.regId, billStr('regId'))}${kv(t.taxId, billStr('taxId'))}${kv(t.vatId, billStr('vatId'))}`;
  const billed = !!(billLines.length || billIds);
  const clientBlock = `
    <div class="col">
      <div class="label">${esc(invoiceMode ? t.billTo : t.client)}</div>
      <div class="party-name">${esc(billName)}</div>
      ${billLines.map(l => `<div class="line">${esc(l)}</div>`).join('')}
      ${billIds ? `<div class="kv-grid ids">${billIds}</div>` : ''}
    </div>`;
  const detailsBlock = invoiceMode ? `
    <div class="col">
      <div class="label">${esc(t.details)}</div>
      <div class="kv-grid details">${issuedOn ? kv(t.issueDate, formatPDFDateLocalized(issuedOn, lang)) : ''}${lastDate ? kv(t.supplyDate, fmtDay(lastDate)) : ''}${dueDate ? kv(t.dueDate, formatPDFDateLocalized(dueDate, lang)) : ''}${showDates && servicePeriod ? `<span class="k wrap">${esc(t.period)}</span><span class="v wrap">${servicePeriod.length > 21 ? esc(servicePeriod) : periodHTML}</span>` : ''}</div>
    </div>` : '';
  // Report: the hero already names the client and the period, so the grid adds who and when.
  const reportBlocks = invoiceMode ? [] : [
    // Only the real dates: a relative word ("This month") means nothing on paper a week later.
    showDates && servicePeriod ? `
    <div class="col">
      <div class="label">${esc(t.reportPeriod)}</div>
      <div class="line">${periodHTML}</div>
    </div>` : '',
    hasIssuer ? `
    <div class="col">
      <div class="label">${esc(t.preparedBy)}</div>
      <div class="line">${esc(iss.name)}</div>
      ${addressLines.map(l => `<div class="line muted">${esc(l)}</div>`).join('')}
    </div>` : '',
    `
    <div class="col">
      <div class="label">${esc(t.generated)}</div>
      <div class="line">${esc(generatedAt)}</div>
    </div>`,
  ].filter(Boolean);
  const parties = invoiceMode
    ? `<section class="parties${hasIssuer ? (billed ? ' billed' : '') : ' two'}">${supplierBlock}${clientBlock}${detailsBlock}</section>`
    : `<section class="parties${reportBlocks.length === 3 ? '' : ' two'}">${reportBlocks.join('')}</section>`;

  // ----- line items -----
  const hoursHead = showTracked ? t.billable : t.hours;
  // Running amount: if page 1 has to break, the paginator writes it into the "Carried forward" /
  // "Brought forward" rows (data-carry). Only money carries over: the Hours column also lists
  // complimentary time, so a carried hour sum would not match "Billable time".
  let runAmount = 0;
  const carryAttrs = (amount) => {
    runAmount = round2(runAmount + amount);
    return ` data-carry="${esc(fmtEUR(runAmount))}"`;
  };
  // Every line is exactly the printed hours × the printed rate, to the cent, as an accountant checks it.
  // billing.js prices each entry to the cent from its exact time (the totals rule), so the lines can sum to
  // a few cents more or less than billingTotals: a "Rounding" line carries that difference, and the lines
  // then add up to the subtotal exactly. Integer cents, so no float drift.
  const lineCents = (h, rate) => Math.round(Math.round(Number(h.toFixed(2)) * 100) * Math.round((Number(rate) || 0) * 100) / 100);
  let lineSumCents = 0;
  // Each line item is one table row (so rows never split and the paginator can move them) holding a
  // grid: name | [tracked] | hours | rate | amount on the first line, and the description below it,
  // running under the Hours and Rate columns too, so most descriptions fit on one line.
  const irow = `irow${showTracked ? ' tracked' : ''}`;
  const itemRows = sortedTasks.map(([task, tt]) => {
    const desc = descOf(task);
    const h = tt.billableMs / 3600000;
    const cents = lineCents(h, tt.rate);
    lineSumCents += cents;
    return `
      <tr${carryAttrs(cents / 100)}><td><div class="${irow}">
        <div class="item-name">${esc(taskName(task))}<span class="count">${tt.count} ${esc(sessionWord(tt.count))}</span></div>
        ${showTracked ? `<div class="num muted">${hrs(tt.ms / 3600000)}</div>` : ''}
        <div class="num">${hrs(h)}</div>
        <div class="num muted">${fmtEUR(tt.rate)}</div>
        <div class="num amt">${fmtEUR(cents / 100)}</div>
        ${desc ? `<div class="item-desc">${esc(desc)}</div>` : ''}
      </div></td></tr>`;
  }).join('');
  const roundingCents = Math.round(totalNet * 100) - lineSumCents;
  // Complimentary work: listed for transparency. The Amount column shows what it would have cost
  // (hours × rate, struck through) above the €0.00 charged, so the goodwill reads in the money column.
  // The note under the payment block sums those same struck amounts.
  let freeLineCents = 0;
  const freeRows = freeTasks.map(([task, f]) => {
    const desc = sortedTasks.some(([k]) => k === task) ? '' : descOf(task);
    const h = f.billableMs / 3600000;
    const was = lineCents(h, f.rate);
    freeLineCents += was;
    return `
      <tr class="free"${carryAttrs(0)}><td><div class="${irow}">
        <div class="item-name">${esc(taskName(task))}<span class="tag">${esc(t.complimentaryBadge)}</span><span class="count">${f.count} ${esc(sessionWord(f.count))}</span></div>
        ${showTracked ? '<div class="num muted"></div>' : ''}
        <div class="num">${hrs(h)}</div>
        <div class="num muted">${fmtEUR(f.rate)}</div>
        <div class="num amt">${was > 0 ? `<s class="was" title="${esc(t.waivedSr)}">${fmtEUR(was / 100)}</s><span class="now">${fmtEUR(0)}</span>` : fmtEUR(0)}</div>
        ${desc ? `<div class="item-desc">${esc(desc)}</div>` : ''}
      </div></td></tr>`;
  }).join('');
  // The rounding line: last, so the running amount (Carried forward) ends on the subtotal.
  const roundingRow = roundingCents !== 0 && sortedTasks.length ? `
      <tr class="adj"${carryAttrs(roundingCents / 100)}><td><div class="${irow}">
        <div class="adj-name">${esc(t.rounding)}<span class="count">${esc(t.roundingNote)}</span></div>
        ${showTracked ? '<div class="num muted"></div>' : ''}
        <div class="num"></div>
        <div class="num muted"></div>
        <div class="num amt">${fmtEUR(roundingCents / 100)}</div>
      </div></td></tr>` : '';
  const itemsTable = (sortedTasks.length || freeTasks.length) ? `
  <section class="items">
    <table>
      <thead>
        <tr><th><div class="${irow}">
          <span>${esc(t.task)}</span>
          ${showTracked ? `<span class="num">${esc(t.tracked)}</span>` : ''}
          <span class="num">${esc(hoursHead)}</span>
          <span class="num">${esc(t.rate)}</span>
          <span class="num">${esc(t.net)}</span>
        </div></th></tr>
      </thead>
      <tbody>${itemRows}${freeRows}${roundingRow}</tbody>
    </table>
  </section>` : '';
  // Row templates for the paginator ({amount} is filled from the last row kept on page 1).
  const carryRow = (cls, label, note) => `<tr class="carry ${cls}"><td><div class="${irow}">
        <div class="carry-cell"><span class="carry-label">${esc(label)}</span>${note ? `<span class="carry-note">${esc(note)}</span>` : ''}</div>
        <div class="num amt">{amount}</div>
      </div></td></tr>`;
  const itemTemplates = itemsTable ? `
<template id="tt-carry">${carryRow('out', t.carried, t.carriedNote)}</template>
<template id="tt-brought">${carryRow('in', t.brought, '')}</template>` : '';
  const contHead = `<template id="tt-cont-head"><div class="cont-head"><h2>${esc(continuedTitle)}</h2><div class="cont-sub">${esc([client, invoiceMode && dueDate ? t.dueOn(formatPDFDateLocalized(dueDate, lang)) : ''].filter(Boolean).join('  ·  '))}</div></div></template>`;

  // ----- totals + payment -----
  const finalLabel = invoiceMode ? t.totalDue : (showVat ? t.totalInclVat : t.total);
  const totals = `
    <div class="totals">
      <div class="trow muted"><span>${esc(t.billableTimeRow)}</span><span class="num">${hrs(billableTotalHours)}</span></div>
      ${showVat ? `
      <div class="trow"><span>${esc(t.subtotalNet)}</span><span class="num">${fmtEUR(totalNet)}</span></div>
      <div class="trow"><span>${esc(t.vatLabel(vatPct))}</span><span class="num">${fmtEUR(totalVatAmount)}</span></div>` : ''}
      <div class="trow grand"><span>${esc(finalLabel)}</span><span class="num">${fmtEUR(amountDue)}</span></div>
    </div>`;
  const hasPayment = invoiceMode && (String(iss.iban || '').trim() || reference);
  // Scan-to-pay QR with the amount due. Slovak invoices carry PAY by square, the format every Slovak
  // banking app reads. English invoices go to clients abroad, so they carry the SEPA EPC QR (GiroCode),
  // the format banks across the euro area read. Only with a valid IBAN (mod-97 checksum), a payee name
  // and something to pay. Both payloads are verified by decoding the printed image (work/invoice/r4/qrtest).
  const ibanOk = ibanValid(iss.iban);
  const payNote = `${t.invoiceTitle}${number ? ` ${number}` : ''}`;
  const qr = (showQr && invoiceMode && ibanOk && hasIssuer && amountDue > 0 && amountDue < 1e9) ? qrSVG(lang === 'sk'
    ? payBySquare({ amount: amountDue, iban: iss.iban, dueDate, variableSymbol: vs, note: number ? payNote : '', name: iss.name })
    : epcPayload({ name: iss.name, iban: iss.iban, amount: amountDue, remittance: number ? payNote : '' }),
  { px: 86, quiet: 3, title: `${t.scanToPay}: ${t.qrName}` }) : '';
  // With a QR the IBAN gets its own line (label above), so it never wraps next to the code.
  const payment = !hasPayment ? '' : qr ? `
    <div class="pay has-qr">
      <div class="pay-main">
        <div class="label">${esc(t.payment)}</div>
        <div class="pay-iban"><span class="k">${esc(t.iban)}</span><span class="v">${esc(iss.iban)}</span></div>
        <div class="kv-grid">${kv(t.method, t.bankTransfer)}${kv(t.reference, reference)}</div>
      </div>
      <figure class="qr">${qr}<figcaption>${esc(lang === 'sk' ? t.qrName : t.scanToPay)}</figcaption></figure>
    </div>` : `
    <div class="pay">
      <div class="label">${esc(t.payment)}</div>
      <div class="kv-grid">${String(iss.iban || '').trim() ? kv(t.method, t.bankTransfer) : ''}${kv(t.iban, iss.iban, 'iban')}${kv(t.reference, reference)}</div>
    </div>`;
  const notes = [
    complimentaryCount > 0 && freeLineCents > 0 ? esc(t.complimentaryNote(fmtEUR(freeLineCents / 100))) : '',
    showRoundingNote ? esc(t.billingPolicyText(rounding)) : '',
  ].filter(Boolean);
  const signOff = localNote(iss.note, lang);
  const thanks = invoiceMode && signOff ? `<p class="thanks">${esc(signOff)}</p>` : '';
  const closing = `
  <section class="closing">
    <div class="closing-left">
      ${payment}
      ${(thanks || notes.length) ? `<div class="notes">${thanks}${notes.map(n => `<p>${n}</p>`).join('')}</div>` : ''}
    </div>
    ${totals}
  </section>`;

  // ----- time details (detailed log) -----
  // Every row carries its date; CSS shows it on the first row of a day and on the first row of each
  // printed page (a day can run across a page break), so no page starts with an undated row.
  // Running sums (data-carry*) feed the Carried forward / Brought forward rows at each page break.
  let prevDay = '';
  let logHoursSum = 0, logTrackedSum = 0, logCents = 0;
  const logRows = list.map(e => {
    const rate = getRate(e.client, e.task, rates, clientRates);
    const billableMs = billableDuration(e, rounding);
    const earned = e.free ? 0 : calcEarnings(e, rates, clientRates, rounding, tempClientRounding);
    logHoursSum += billableMs / 3600000;
    logTrackedSum += e.duration / 3600000;
    logCents += Math.round(earned * 100);
    const dk = dayKey(e.start);
    const newDay = dk !== prevDay;
    prevDay = dk;
    const carry = ` data-carry="${esc(fmtEUR(logCents / 100))}" data-carry-h="${num2(logHoursSum)}"${showTracked ? ` data-carry-t="${num2(logTrackedSum)}"` : ''}`;
    return `
      <tr class="${newDay ? 'day' : 'same'}${e.free ? ' free' : ''}">
        ${showDates ? `<td class="date"><span class="d">${esc(logDate(e.start))}</span><span class="wd">${esc(logWeekday(e.start))}</span></td>` : ''}
        ${showEntryTimes ? `<td class="time num">${clock(e.start)}–${clock(e.end)}</td>` : ''}
        <td class="what"${carry}><span class="act">${esc(taskName(e.task))}</span>${e.free ? `<span class="tag">${esc(t.complimentaryBadge)}</span>` : ''}${showNotes && e.note ? `<span class="note">${esc(e.note)}</span>` : ''}</td>
        ${showTracked ? `<td class="num muted">${hrs(e.duration / 3600000)}</td>` : ''}
        <td class="num">${hrs(billableMs / 3600000)}</td>
        <td class="num muted">${fmtEUR(rate)}</td>
        <td class="num amt">${fmtEUR(earned)}</td>
      </tr>`;
  }).join('');
  // The total row sums its columns: complimentary hours are in the Hours column, so they are in its total.
  const logCols = (showDates ? 1 : 0) + (showEntryTimes ? 1 : 0) + 1;
  const logSub = [invoiceMode ? esc(t.attachmentTo(number)) : '', esc(client), showDates ? periodHTML : ''].filter(Boolean).join('  ·  ');
  // Page-break rows for the Time details: the running hours and amount, like the Total row below.
  const logCarryRow = (cls, label, note) => `<tr class="carry ${cls}"><td colspan="${logCols}"><span class="carry-label">${esc(label)}</span>${note ? `<span class="carry-note">${esc(note)}</span>` : ''}</td>${showTracked ? '<td class="num muted">{tracked}<span class="u">&nbsp;h</span></td>' : ''}<td class="num">{hours}<span class="u">&nbsp;h</span></td><td></td><td class="num amt">{amount}</td></tr>`;
  const logSection = `
  <section class="log">
    <div class="log-head">
      <h2>${esc(t.detailedLog)}</h2>
      <div class="log-sub">${logSub}</div>
    </div>
    <table>
      <thead>
        <tr>
          ${showDates ? `<th class="w-date${spansYears ? ' wide' : ''}">${esc(t.date)}</th>` : ''}
          ${showEntryTimes ? `<th class="w-time">${esc(t.time)}</th>` : ''}
          <th class="what">${esc(showNotes ? t.taskNote : t.taskOnly)}</th>
          ${showTracked ? `<th class="num w-h">${esc(t.tracked)}</th>` : ''}
          <th class="num w-h">${esc(hoursHead)}</th>
          <th class="num w-r">${esc(t.rate)}</th>
          <th class="num w-a">${esc(t.net)}</th>
        </tr>
      </thead>
      <tbody>${logRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="${logCols}">${esc(t.total)}${showVat ? ` <span class="muted">(${esc(t.exclVat)})</span>` : ''}</td>
          ${showTracked ? `<td class="num muted">${hrs(logTrackedSum)}</td>` : ''}
          <td class="num">${hrs(logHoursSum)}</td>
          <td></td>
          <td class="num amt">${fmtEUR(totalNet)}</td>
        </tr>
      </tfoot>
    </table>
  </section>`;
  const templates = `${itemTemplates}
${contHead}
<template id="tt-log-carry">${logCarryRow('out', t.carried, t.carriedNote)}</template>
<template id="tt-log-brought">${logCarryRow('in', t.brought, '')}</template>
<template id="tt-log-cont"><div class="cont-head"><h2>${esc(t.continued(t.detailedLog))}</h2><div class="cont-sub">${logSub}</div></div></template>`;

  const fontFaces = `
@font-face { font-family: 'Geist Doc'; font-style: normal; font-weight: 100 900; font-display: swap;
  src: url(data:font/woff2;base64,${GEIST_LATIN_WOFF2}) format('woff2');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: 'Geist Doc'; font-style: normal; font-weight: 100 900; font-display: swap;
  src: url(data:font/woff2;base64,${GEIST_LATIN_EXT_WOFF2}) format('woff2');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }`;

  const FONT = `'Geist Doc', 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
  const marginBox = `font-family: ${FONT}; font-size: 7pt; color: #8b8b93; letter-spacing: 0.01em;`;

  return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="tt-filename" content="${esc(fileName)}">
<title>${esc(pageTitle)}</title>
<style>${fontFaces}
@page {
  size: A4;
  margin: 15mm 16mm 17mm;
  @bottom-left { content: ${cssString(footerLeft)}; ${marginBox} vertical-align: top; padding-top: 5mm; }
  @bottom-right { content: ${cssString(t.page + ' ')} counter(page) ${cssString(' ' + t.of + ' ')} counter(pages); ${marginBox} vertical-align: top; padding-top: 5mm; }
}
/* No top/bottom margin on page 1: the browser then has no room for its own header and footer
   (date, title, about:blank) and leaves them off every page. Page 1 draws its spacing and footer itself. */
@page :first {
  margin-top: 0; margin-bottom: 0;
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}
:root {
  --ink: #131316; --ink-2: #3a3a40; --muted: #6b6b73; --faint: #9a9aa2;
  --line: #e6e6e9; --line-2: #d6d6db; --tint: #f5f5f6;
  --free: #0b7a52; --free-soft: #e8f6ef;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
/* Long unbroken text (a link in a note, a long name or number) wraps inside its column instead of
   widening it: with "anywhere" it also stops counting toward a column's minimum width, so no table or
   grid can grow past the paper. Numbers stay on one line (.num is nowrap). */
body { overflow-wrap: anywhere; }
body { font-family: ${FONT}; color: var(--ink); font-size: 9pt; line-height: 1.5; font-weight: 400;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-feature-settings: 'ss01' 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
p, figure { margin: 0; }
h1, h2 { margin: 0; font-weight: 600; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.u { color: var(--faint); font-weight: 400; }
.muted { color: var(--muted); }
.label { font-size: 7pt; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--muted); margin-bottom: 7px; }

/* masthead */
.mast { display: flex; justify-content: space-between; align-items: center; padding-bottom: 22px; }
.brand { display: flex; align-items: center; gap: 10px; }
.mark { width: 30px; height: 30px; border-radius: 8px; background: var(--ink); color: #fff; display: grid; place-items: center;
  font-size: 10.5pt; font-weight: 600; letter-spacing: -0.02em; line-height: 1; }
.brand-name { font-size: 12pt; font-weight: 600; letter-spacing: -0.015em; }
.contact { text-align: right; font-size: 8pt; line-height: 1.55; color: var(--muted); }

/* hero */
.hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding-bottom: 20px; border-bottom: 1.5px solid var(--ink); }
.hero h1 { font-size: 28pt; line-height: 1; letter-spacing: -0.035em; font-weight: 600; }
.hero-title { min-width: 0; }
.status { display: inline-block; margin-left: 12px; padding: 4px 9px 3px; border: 1px solid var(--line-2); border-radius: 999px;
  font-size: 7pt; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; line-height: 1.2; color: var(--ink-2);
  vertical-align: 7pt; white-space: nowrap; }
.doc-no { margin-top: 9px; font-size: 9.5pt; color: var(--muted); text-align: left; }
.due { text-align: right; }
.due .label { margin-bottom: 4px; }
.due-amount { font-size: 22pt; line-height: 1.1; font-weight: 600; letter-spacing: -0.02em; }
.due-date { margin-top: 6px; font-size: 9pt; color: var(--ink-2); font-weight: 500; }

/* parties */
/* One right-hand column (250px) runs down the page: details, the number columns and the totals share it. */
.parties { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 250px; column-gap: 28px; padding: 17px 0 20px; }
.parties.two { grid-template-columns: minmax(0, 1fr) 250px; column-gap: 44px; }
.parties.billed { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 250px; }
.parties .col { min-width: 0; }
.party-name { font-size: 10.5pt; font-weight: 600; letter-spacing: -0.01em; line-height: 1.35; margin-bottom: 2px; }
.line { color: var(--ink-2); }
.line.muted { color: var(--muted); }
.ids { margin-top: 7px; }
.col > .label + .ids { margin-top: 0; }
.kv-grid { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 18px; row-gap: 2px; }
.kv-grid .v.wrap { white-space: normal !important; }
.nw { white-space: nowrap; }
.kv-grid .k { color: var(--muted); white-space: nowrap; }
.kv-grid .v { font-variant-numeric: tabular-nums; color: var(--ink); }
.kv-grid .strong { font-weight: 600; color: var(--ink); }
.kv-grid.details .v { text-align: right; white-space: nowrap; }

/* tables */
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tfoot { display: table-row-group; }
th { font-size: 7pt; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--muted); text-align: left;
  padding: 0 0 8px; border-bottom: 1px solid var(--ink); }
th.num, td.num { padding-left: 14px; }
td { vertical-align: top; }
tr { break-inside: avoid; page-break-inside: avoid; }
.w-h { width: 70px; } .w-r { width: 84px; } .w-a { width: 96px; }
.w-t { width: 70px; }
.amt { color: var(--ink); font-weight: 500; }
.tag { display: inline-block; margin-left: 8px; padding: 0 6px; border-radius: 4px; background: var(--free-soft); color: var(--free);
  font-size: 6.5pt; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; line-height: 15px; vertical-align: 1px; }

/* line items: one grid per row; the columns match the totals column (250px = hours + rate + amount) */
.items th, .items td { padding-left: 0; padding-right: 0; }
.irow { display: grid; grid-template-columns: minmax(0, 1fr) 70px 84px 96px; align-items: baseline; }
.irow.tracked { grid-template-columns: minmax(0, 1fr) 88px 88px 84px 96px; }
.irow > .num { padding-left: 12px; }
.items td { padding-top: 9px; padding-bottom: 9px; border-bottom: 1px solid var(--line); font-size: 9.5pt; }
.items .item-name { font-weight: 500; letter-spacing: -0.005em; min-width: 0; }
.items .count { margin-left: 8px; font-size: 8pt; font-weight: 400; color: var(--muted); white-space: nowrap; }
.items .item-desc { grid-column: 1 / -1; margin-top: 2px; font-size: 8pt; line-height: 1.4; color: var(--muted); text-wrap: pretty; }
.items tr.free .item-name { color: var(--ink-2); }
.items tr.free .amt { color: var(--ink-2); font-weight: 400; }
/* complimentary: the value it would have cost, struck through, above the 0.00 charged */
.items tr.free .amt .was { display: block; color: var(--muted); text-decoration: line-through; text-decoration-thickness: 1px;
  text-decoration-color: var(--faint); }
.items tr.free .amt .now { display: block; margin-top: 2px; font-size: 8.5pt; line-height: 1.35; color: var(--ink); font-weight: 500; }
/* the amount cell takes two grid rows, so a description runs beside the 0.00 instead of below it */
.items tr.free .irow > .amt { grid-row: span 2; }
.items tr.free .item-desc { grid-column: 1 / -2; }
/* page break inside the line items: carried forward (end of page 1) / brought forward (top of the next page) */
.items .carry-cell { grid-column: 1 / -2; }
.items tr.carry td { border-bottom: 0; padding-top: 10px; padding-bottom: 4px; font-weight: 600; }
.items tr.carry.out td { border-top: 1.5px solid var(--ink); }
.items tr.carry.in td { border-bottom: 1px solid var(--line); padding-top: 9px; padding-bottom: 9px; color: var(--ink-2); }
.items tr.carry .carry-note { margin-left: 10px; font-size: 8pt; font-weight: 400; color: var(--muted); }
/* the rounding line: the cents between the lines (hours x rate) and the subtotal */
.items .adj-name { min-width: 0; color: var(--ink-2); }
.items tr.adj .amt { font-weight: 400; color: var(--ink-2); }
/* page 1, tighter: set by the paginator when the normal rhythm runs a little past the sheet */
.fit .mast { padding-bottom: 16px; }
.fit .hero { padding-bottom: 16px; }
.fit .parties { padding: 14px 0 16px; }
.fit .items td { padding-top: 6px; padding-bottom: 6px; }
.fit .items .item-desc { margin-top: 1px; line-height: 1.35; }
.fit .closing { padding-top: 12px; }
.fit .notes { margin-top: 10px; }
.cont-head { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; padding-bottom: 16px; }
.cont-head h2 { font-size: 15pt; letter-spacing: -0.02em; flex: 0 1 auto; min-width: 0; }
.cont-sub { flex: 1 1 auto; min-width: 0; font-size: 8.5pt; color: var(--muted); text-align: right; }

/* closing: payment + totals */
.closing { display: grid; grid-template-columns: 1fr 250px; gap: 44px; align-items: start; padding-top: 14px; break-inside: avoid; page-break-inside: avoid; }
.pay { background: var(--tint); border-radius: 10px; padding: 13px 16px 12px; }
.pay .kv-grid { row-gap: 3px; column-gap: 22px; }
.pay .v.iban { font-weight: 600; letter-spacing: 0.02em; }
.pay.has-qr { display: flex; align-items: center; gap: 14px; padding: 12px 12px 12px 16px; }
.pay-main { flex: 1 1 auto; min-width: 0; }
.pay-iban { margin-bottom: 5px; }
.pay-iban .k { display: block; color: var(--muted); font-size: 8pt; line-height: 1.3; }
.pay-iban .v { display: block; white-space: nowrap; font-size: 10pt; font-weight: 600; letter-spacing: 0.015em; font-variant-numeric: tabular-nums; }
.pay .qr { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.pay .qr svg { display: block; }
.pay .qr figcaption { font-size: 6.5pt; line-height: 1.2; font-weight: 500; color: var(--muted); letter-spacing: 0.01em; white-space: nowrap; }
.trow { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; font-size: 9.5pt; }
.trow.muted { color: var(--muted); }
.trow.grand { margin-top: 8px; padding-top: 10px; border-top: 1.5px solid var(--ink); font-size: 13pt; font-weight: 600; letter-spacing: -0.015em; }
.notes { margin-top: 12px; font-size: 8pt; color: var(--muted); line-height: 1.5; text-wrap: pretty; }
.closing-left > .notes:first-child { margin-top: 2px; }
.notes .thanks { color: var(--ink-2); font-size: 9pt; font-weight: 500; margin-bottom: 4px; }

/* time details */
.log { padding-top: 0; }
.log-head { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; padding-bottom: 12px; }
.log h2 { font-size: 15pt; letter-spacing: -0.02em; flex: none; white-space: nowrap; }
.log-sub { flex: 1 1 auto; min-width: 0; font-size: 8.5pt; color: var(--muted); text-align: right; }
.log td { padding-top: 1.5px; padding-bottom: 1.5px; font-size: 8.5pt; }
.log tbody tr.day td { border-top: 1px solid var(--line); padding-top: 5px; }
.log tbody tr:has(+ tr.day) td, .log tbody tr:has(+ tr.carry) td, .log tbody tr:last-child td { padding-bottom: 5px; }
.log tbody tr:first-child td { border-top: 0; }
/* the date shows on a day's first row, and again on the first row of each page */
.log tbody tr.same .date > span { display: none; }
.log tbody tr.same:first-child .date > span, .log tbody tr.carry + tr.same .date > span { display: inline; }
.log tbody tr.carry + tr td { padding-top: 5px; }
/* page break inside the Time details: running hours and amount */
.log tr.carry td { font-weight: 600; white-space: nowrap; }
.log tr.carry.out td { border-top: 1px solid var(--ink); padding-top: 6px; padding-bottom: 2px; }
.log tr.carry.in td { border-bottom: 1px solid var(--line); padding-top: 2px; padding-bottom: 6px; color: var(--ink-2); }
.log tr.carry .carry-note { margin-left: 10px; font-weight: 400; color: var(--muted); }
.log .w-date { width: 78px; } .log .w-date.wide { width: 108px; } .log .w-time { width: 78px; }
/* a gutter after the date and the time, so the columns never touch even when the table is tight */
.log td.date, .log th.w-date, .log td.time, .log th.w-time { padding-right: 10px; }
.log td.what { overflow-wrap: anywhere; }
/* numbers take what they need (auto layout still widens a column for a long value); the note gets the rest */
.log .w-h { width: 66px; } .log .w-r { width: 74px; } .log .w-a { width: 86px; }
.log .date { white-space: nowrap; }
.log .date .d { font-weight: 500; }
.log .date .wd { margin-left: 5px; color: var(--faint); }
.log .time { text-align: left; padding-left: 0; color: var(--muted); }
.log .act { font-weight: 500; }
.log .note { color: var(--muted); }
.log .note::before { content: '—'; margin: 0 6px; color: var(--faint); }
.log tfoot td { border-top: 1px solid var(--ink); padding-top: 9px; font-weight: 600; font-size: 9pt; }
/* a short document: the Time details follow the totals on page 1 (the paginator moves them there) */
.sheet-body > .log.inline { margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--line); }
.log.inline h2 { font-size: 12pt; }
.log.inline .log-sub { display: none; }
.sheet.merged { display: none !important; }

/* page 1 footer: in the flow, pinned to the bottom of the sheet, where the margin boxes sit on later pages */
.sheet.first { display: flex; flex-direction: column; }
.sheet-foot { flex: none; margin-top: auto; height: 17mm; padding-top: 5mm; display: flex; justify-content: space-between; gap: 16px;
  font-size: 7pt; color: #8b8b93; letter-spacing: 0.01em; break-inside: avoid; }
.sheet-foot .pg:not(:empty) { margin-left: 14px; }
.sheet-body { display: flow-root; }
/* later sheets on screen (preview, downloaded file): the footer the @page margin boxes print on paper */
.pfoot { display: none; }

/* screen: paper sheets on a desk; print: the page itself */
@media screen {
  html { background: #e8e8eb; }
  body { padding: 72px 16px 40px; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 24px; background: #fff; padding: 15mm 16mm 17mm;
    box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 28px rgba(0,0,0,.08); border-radius: 2px; position: relative; }
  .sheet.first { padding-bottom: 0; }
  .pfoot { position: absolute; left: 16mm; right: 16mm; bottom: 0; height: 17mm; padding-top: 5mm; display: flex; justify-content: space-between;
    gap: 16px; font-size: 7pt; color: #8b8b93; letter-spacing: 0.01em; }
  .print-bar { position: fixed; top: 16px; left: 0; right: 0; z-index: 2; display: flex; justify-content: center; gap: 8px; }
  .print-bar button { font: 500 9.5pt ${FONT}; padding: 8px 16px; border-radius: 999px; border: 1px solid transparent; cursor: pointer;
    background: var(--ink); color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
  .print-bar button:hover { background: #2a2a30; }
  .print-bar button.secondary { background: #fff; color: var(--ink); border-color: var(--line-2); }
  .print-bar button.secondary:hover { background: var(--tint); }
  /* in-app live preview: the app paints the desk, so the frame stays transparent (matching color scheme) */
  html[data-embed] { background: transparent; color-scheme: light dark; overflow: hidden; }
  html[data-embed] body { padding: 0; }
  html[data-embed] .print-bar { display: none; }
  html[data-embed] .sheet { margin: 0 0 20px; border-radius: 3px; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.08); }
  html[data-embed] .sheet:last-child { margin-bottom: 0; }
  html[data-embed] .sheet + .sheet { border-top: 0; }
  @media (max-width: 820px) {
    body { padding: 0; }
    .sheet { margin: 0 auto; box-shadow: none; border-radius: 0; }
    .sheet + .sheet { border-top: 8px solid #e8e8eb; }
    .print-bar { top: auto; bottom: 16px; }
  }
}
@media print {
  .print-bar { display: none; }
  .sheet { padding: 0; }
  .sheet.first { padding-top: 15mm; min-height: calc(297mm - 1mm); }
  .sheet + .sheet { break-before: page; page-break-before: always; }
}
</style></head><body>
<div class="print-bar">
  <button onclick="window.print()">${esc(t.printBtn)}</button>
  <button class="secondary" onclick="window.close()">${esc(t.closeBtn)}</button>
</div>
<div class="sheet first">
  <div class="sheet-body">
  ${masthead}
  ${hero}
  ${parties}
  ${itemsTable}
  ${closing}
  </div>
  <footer class="sheet-foot" data-left="${esc(footerLeft)}" data-page="${esc(t.page)}" data-of="${esc(t.of)}"><span>${esc(footerLeft)}</span><span>${esc(firstPageRight)}<span class="pg"></span></span></footer>
</div>
<div class="sheet log-sheet">
  <div class="sheet-body">
  ${logSection}
  </div>
</div>${templates}
<script id="tt-paginate">(function () { var paginate = ${paginatePDF.toString()};
  var run = function () { try { paginate(document); } catch (e) { /* the document still prints, unsplit */ } };
  run();
  try { if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(run); } catch (e) { /* no font loading API */ }
})();</script>
</body></html>`;
}
