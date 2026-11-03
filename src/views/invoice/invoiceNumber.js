// Invoice number suggestions and the Slovak payment reference. Pure, Node-safe.

// A 4-digit year this close to the current one is a year, not a counter.
const isYear = (s, year) => s.length === 4 && Number(s) >= year - 5 && Number(s) <= year + 1;
// A 2-digit year after a slash ("047/26") only when it is this year or one of the last few.
const isShortYear = (s, year) => s.length === 2 && ((year % 100) - Number(s) + 100) % 100 <= 5;
// A new year starts the counter at 1, padded only when the series is padded ("047" -> "001", "12" -> "1").
const restart = (digits, keepWidth) => (keepWidth || digits.startsWith('0') ? '1'.padStart(digits.length, '0') : '1');
const plusOne = (digits) => String(Number(digits) + 1).padStart(digits.length, '0');

// The number after the last one printed:
//   "2026-047" -> "2026-048", "FA0099" -> "FA0100"            (counter last)
//   "12/2026" -> "13/2026", "FA-ŠĽ 7/2026" -> "FA-ŠĽ 8/2026"    (counter first, year last: the year stays)
//   "047/26" -> "048/26"                                        (counter / 2-digit year)
// A year-based number starts again in a new year: "2025-047" -> "2026-001", "12/2025" -> "1/2026".
// No last number: "2026-001". '' when the last number has no digits to count up.
export function nextInvoiceNumber(last, year = new Date().getFullYear()) {
  const s = String(last || '').trim();
  if (!s) return `${year}-001`;
  // Year first: 2026-047, FA2026/12
  const y = /^(\D*)(\d{4})(\D+)(\d+)(\D*)$/.exec(s) || /^(\D*)(20\d\d)()(\d+)(\D*)$/.exec(s);
  if (y && isYear(y[2], year)) {
    if (Number(y[2]) < year) return y[1] + year + y[3] + restart(y[4], true) + y[5];
    return y[1] + y[2] + y[3] + plusOne(y[4]) + y[5];
  }
  // Year last: 12/2026, FA-ŠĽ 7/2026, 047-2026, 047/26
  const z = /^(.*?)(\d+)(\D+)(\d{4}|\d{2})(\D*)$/.exec(s);
  if (z && (isYear(z[4], year) || (z[4].length === 2 && z[3] === '/' && isShortYear(z[4], year)))) {
    const yy = z[4].length === 4 ? Number(z[4]) : 2000 + Number(z[4]);
    if (yy < year) return z[1] + restart(z[2], false) + z[3] + (z[4].length === 4 ? String(year) : String(year % 100).padStart(2, '0')) + z[5];
    return z[1] + plusOne(z[2]) + z[3] + z[4] + z[5];
  }
  const m = /^(.*?)(\d+)(\D*)$/.exec(s);
  if (!m) return '';
  return m[1] + plusOne(m[2]) + m[3];
}

// Slovak variabilný symbol: the digits of the invoice number, at most 10 (the last ones). '' without digits.
export function variableSymbol(number) {
  return String(number || '').replace(/\D+/g, '').slice(-10);
}

// A short fingerprint of an invoice (client + the entries on it), so reopening the dialog for the same
// work suggests the same number again (a cancelled print or a reprint), and new work gets the next one.
export function invoiceSignature(client, entries) {
  const ids = (Array.isArray(entries) ? entries : []).map(e => String(e && e.id)).sort().join(',');
  const str = `${client}|${ids}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return `${(Array.isArray(entries) ? entries.length : 0)}-${h.toString(36)}`;
}
