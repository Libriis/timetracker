import { describe, it, expect } from 'vitest';
import { crc32, epcPayload, ibanValid, payBySquare, qrMatrix, qrSVG } from './payQr.js';
import { buildPDFHTML } from '../../lib/pdf.js';

const issuer = { name: 'Studio Lumen s.r.o.', address: 'Hlavná 12', regId: '1', taxId: '2', vatId: 'SK2', iban: 'SK31 1200 0000 1987 4263 7541', email: '', phone: '', note: '' };
const e = { id: 'a', client: 'Acme', task: 'Design', note: '', start: new Date(2026, 9, 2, 9).getTime(), end: new Date(2026, 9, 2, 10).getTime(), duration: 3600000 };
const base = { client: 'Acme', entries: [e], rates: { Design: 40 }, clientRates: {}, vat: 23, rounding: 15, period: 'all', issuer, invoiceMode: true, invoiceNumber: '2026-047', issueDate: '2026-11-03', dueDate: '2026-11-17' };

describe('payment QR', () => {
  it('builds the SEPA EPC payload', () => {
    expect(epcPayload({ name: 'Studio Lumen s.r.o.', iban: 'SK31 1200 0000 1987 4263 7541', amount: 49.2, remittance: 'Invoice 2026-047' }))
      .toBe('BCD\n002\n1\nSCT\n\nStudio Lumen s.r.o.\nSK3112000000198742637541\nEUR49.20\n\n\nInvoice 2026-047');
  });

  it('computes CRC32 and a PAY by square string in base32hex', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const s = payBySquare({ amount: 49.2, iban: 'SK3112000000198742637541', dueDate: '2026-11-17', variableSymbol: '2026047', note: 'Faktúra 2026-047', name: 'Studio Lumen s.r.o.' });
    // header 0x01 0x00 (type 0 PAY, version 1 = 1.1.0, document type 0, reserved 0), then the payload length
    expect(s).toMatch(/^040[0-9A-V]+$/);
    expect(s).toBe(payBySquare({ amount: 49.2, iban: 'SK3112000000198742637541', dueDate: '2026-11-17', variableSymbol: '2026047', note: 'Faktúra 2026-047', name: 'Studio Lumen s.r.o.' }));
  });

  it('encodes a QR matrix with finder patterns', () => {
    const m = qrMatrix('HELLO WORLD');
    expect(m.length).toBe(21); // version 1
    for (const [x, y] of [[0, 0], [20, 0], [0, 20], [6, 6], [14, 0]]) expect(m[y][x]).toBe(true);
    expect(qrMatrix('x'.repeat(2000))).toBe(null);
    expect(qrSVG('HELLO')).toContain('<svg');
  });

  it('accepts only IBANs that pass the bank checksum', () => {
    expect(ibanValid('SK31 1200 0000 1987 4263 7541')).toBe(true);
    expect(ibanValid('de89 3704 0044 0532 0130 00')).toBe(true);
    expect(ibanValid('SK31 1200 0000 1987 4263 7542')).toBe(false); // one digit off
    expect(ibanValid('SK31')).toBe(false);
    expect(ibanValid('')).toBe(false);
    expect(buildPDFHTML({ ...base, issuer: { ...issuer, iban: 'SK31 1200 0000 1987 4263 7542' } })).not.toContain('<figure class="qr">');
  });

  it('puts the QR on invoices with an IBAN only', () => {
    expect(buildPDFHTML(base)).toContain('<figure class="qr">');
    expect(buildPDFHTML({ ...base, language: 'sk' })).toContain('PAY by square');
    expect(buildPDFHTML({ ...base, showQr: false })).not.toContain('<figure class="qr">');
    expect(buildPDFHTML({ ...base, invoiceMode: false })).not.toContain('<figure class="qr">');
    expect(buildPDFHTML({ ...base, issuer: { ...issuer, iban: '' } })).not.toContain('<figure class="qr">');
  });
});
