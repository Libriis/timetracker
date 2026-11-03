// Payment QR codes for the invoice: the SEPA "EPC QR" (GiroCode) and the Slovak "PAY by square".
// Pure functions, no DOM, no dependencies: src/lib/pdf.js imports this, and pdf.js must stay
// importable from plain Node. The QR encoder follows the ISO/IEC 18004 model (byte and
// alphanumeric mode, error correction M); PAY by square packs its payload with a minimal LZMA
// encoder (literals only, plus the end marker), which every LZMA decoder reads.

// ---------- QR code ----------
const ECC_M_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28];
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21];
const MAX_VERSION = 25;
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const rawModules = (v) => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
};
const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC_M_PER_BLOCK[v] * BLOCKS_M[v];

const gfMul = (x, y) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
};
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = gfMul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0);
    div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

// Encode text as a QR matrix (array of rows of booleans, dark = true). Alphanumeric mode when the
// text fits that set (PAY by square strings do), byte mode (UTF-8) otherwise. Returns null when too long.
export function qrMatrix(text) {
  const s = String(text);
  const alnum = s.length > 0 && [...s].every(c => ALNUM.includes(c));
  const bytes = alnum ? null : Array.from(new TextEncoder().encode(s));
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };

  let ver = 1;
  const countBits = (v) => (alnum ? (v <= 9 ? 9 : 11) : (v <= 9 ? 8 : 16));
  const payloadBits = alnum ? Math.floor(s.length / 2) * 11 + (s.length % 2) * 6 : bytes.length * 8;
  for (; ver <= MAX_VERSION; ver++) if (4 + countBits(ver) + payloadBits <= dataCodewords(ver) * 8) break;
  if (ver > MAX_VERSION) return null;

  put(alnum ? 2 : 4, 4);
  put(alnum ? s.length : bytes.length, countBits(ver));
  if (alnum) {
    for (let i = 0; i + 1 < s.length; i += 2) put(ALNUM.indexOf(s[i]) * 45 + ALNUM.indexOf(s[i + 1]), 11);
    if (s.length % 2) put(ALNUM.indexOf(s[s.length - 1]), 6);
  } else bytes.forEach(b => put(b, 8));
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Error correction, split into blocks and interleaved.
  const numBlocks = BLOCKS_M[ver], eccLen = ECC_M_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - raw % numBlocks, shortLen = Math.floor(raw / numBlocks);
  const div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= numShort) codewords.push(b[i]); });
  }

  // Function patterns.
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  const drawFormat = (mask) => {
    const d = (0 << 3) | mask; // level M = 00
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    const bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3);
      set(a, c, dark); set(c, a, dark);
    }
  }

  // Data, in the zigzag order.
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && bi < codewords.length * 8) { m[y][x] = ((codewords[bi >>> 3] >>> (7 - (bi & 7))) & 1) === 1; bi++; }
    }
  }

  // Pick the mask with the lowest penalty.
  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => (((x + y) % 2) + (x * y) % 3) % 2 === 0,
  ];
  const applyMask = (k) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x];
  };
  const penalty = () => {
    let p = 0, dark = 0;
    const lines = [];
    for (let y = 0; y < size; y++) lines.push(m[y].map(v => (v ? 1 : 0)).join(''));
    for (let x = 0; x < size; x++) lines.push(m.map(r => (r[x] ? 1 : 0)).join(''));
    for (const l of lines) {
      for (const run of l.match(/0{5,}|1{5,}/g) || []) p += run.length - 2;
      let i = -1;
      while ((i = l.indexOf('1011101', i + 1)) !== -1) {
        if (l.slice(Math.max(0, i - 4), i) === '0000' || l.slice(i + 7, i + 11) === '0000') p += 40;
      }
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    applyMask(k); drawFormat(k);
    const p = penalty();
    if (p < bestP) { bestP = p; best = k; }
    applyMask(k);
  }
  applyMask(best); drawFormat(best);
  return m;
}

// An SVG for the matrix: white quiet zone of `quiet` modules, dark runs merged into one path.
export function qrSVG(text, { px = 76, quiet = 3, title = '' } = {}) {
  const m = qrMatrix(text);
  if (!m) return '';
  const n = m.length + quiet * 2;
  let d = '';
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img"${title ? ` aria-label="${esc(title)}"` : ''}><rect width="${n}" height="${n}" rx="1.2" fill="#fff"/><path d="${d}" fill="#131316"/></svg>`;
}

// ---------- payloads ----------
const cleanIban = (iban) => String(iban || '').replace(/\s+/g, '').toUpperCase();

// An IBAN a bank app accepts: country code, check digits, 11 to 30 letters or digits, and the ISO 13616
// mod-97 checksum. A payment QR with a mistyped IBAN would be refused by the bank, so the invoice only
// prints a QR for an IBAN that passes.
export function ibanValid(iban) {
  const s = cleanIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let mod = 0;
  for (const ch of digits) mod = (mod * 10 + Number(ch)) % 97;
  return mod === 1;
}
const amountStr = (a) => (Math.round((Number(a) || 0) * 100) / 100).toFixed(2);

// SEPA credit transfer QR (EPC069-12, version 002: the BIC may be left out inside the EEA).
export function epcPayload({ name, iban, amount, remittance = '', bic = '' }) {
  const clip = (v, n) => Array.from(String(v || '').replace(/[\r\n]+/g, ' ').trim()).slice(0, n).join('');
  return ['BCD', '002', '1', 'SCT', clip(bic, 11), clip(name, 70), cleanIban(iban), `EUR${amountStr(amount)}`, '', '', clip(remittance, 140)].join('\n');
}

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Raw LZMA1 stream (lc=3, lp=0, pb=2) holding the bytes as literals, closed with the end marker.
export function lzmaLiterals(bytes) {
  const out = [];
  let low = 0, range = 0xffffffff, cache = 0, cacheSize = 1;
  const shiftLow = () => {
    const lo32 = low % 0x100000000, hi = Math.floor(low / 0x100000000);
    if (lo32 < 0xff000000 || hi !== 0) {
      let temp = cache;
      do { out.push((temp + hi) & 0xff); temp = 0xff; } while (--cacheSize !== 0);
      cache = Math.floor(lo32 / 0x1000000) & 0xff;
    }
    cacheSize++;
    low = (lo32 % 0x1000000) * 256;
  };
  const bit = (probs, i, b) => {
    const p = probs[i], bound = (range >>> 11) * p;
    if (b === 0) { range = bound; probs[i] = p + ((2048 - p) >>> 5); } else { low += bound; range = (range - bound) >>> 0; probs[i] = p - (p >>> 5); }
    if (range < 0x1000000) { range = (range * 256) >>> 0; shiftLow(); }
  };
  const direct = (value, n) => {
    for (let i = n - 1; i >= 0; i--) {
      range >>>= 1;
      if ((value >>> i) & 1) low += range;
      if (range < 0x1000000) { range = (range * 256) >>> 0; shiftLow(); }
    }
  };
  const P = (n) => new Array(n).fill(1024);
  const isMatch = P(12 << 4), isRep = P(12), lenChoice = P(1), lenLow = Array.from({ length: 16 }, () => P(8));
  const posSlot = Array.from({ length: 4 }, () => P(64)), align = P(16), lit = P(0x300 << 3);
  const tree = (probs, value, numBits) => {
    let mm = 1;
    for (let i = numBits - 1; i >= 0; i--) { const b = (value >>> i) & 1; bit(probs, mm, b); mm = (mm << 1) | b; }
  };
  let prev = 0, pos = 0;
  for (const byte of bytes) {
    bit(isMatch, (0 << 4) + (pos & 3), 0); // state stays 0 after literals
    const base = 0x300 * (prev >>> 5);
    let sym = 1;
    for (let i = 7; i >= 0; i--) { const b = (byte >>> i) & 1; bit(lit, base + sym, b); sym = (sym << 1) | b; }
    prev = byte; pos++;
  }
  // End marker: a match of length 2 at distance 0xFFFFFFFF.
  bit(isMatch, (0 << 4) + (pos & 3), 1);
  bit(isRep, 0, 0);
  bit(lenChoice, 0, 0);
  tree(lenLow[pos & 3], 0, 3);
  tree(posSlot[0], 63, 6);
  direct(0x3ffffff, 26);
  let mm = 1;
  for (let i = 0; i < 4; i++) { bit(align, mm, 1); mm = (mm << 1) | 1; }
  for (let i = 0; i < 5; i++) shiftLow();
  return out;
}

// PAY by square (Slovak banking standard): tab-separated payment order, CRC32, LZMA, base32hex.
export function payBySquare({ amount, iban, bic = '', dueDate = '', variableSymbol = '', note = '', name = '' }) {
  const fields = [
    '', // invoice id
    '1', // payments
    '1', // payment order
    amountStr(amount),
    'EUR',
    String(dueDate || '').replace(/-/g, ''), // YYYYMMDD
    String(variableSymbol || '').replace(/\D+/g, '').slice(0, 10),
    '', // constant symbol
    '', // specific symbol
    '', // originator's reference (SEPA), not used with the symbols
    Array.from(String(note || '')).slice(0, 140).join(''),
    '1', // bank accounts
    cleanIban(iban),
    String(bic || ''),
    '0', // standing order extension
    '0', // direct debit extension
    Array.from(String(name || '')).slice(0, 70).join(''), // beneficiary name
    '', // beneficiary address line 1
    '', // beneficiary address line 2
  ];
  const data = Array.from(new TextEncoder().encode(fields.join('\t').replace(/[\r\n]+/g, ' ')));
  const crc = crc32(data);
  const total = [crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff, ...data];
  // Header: by square type 0 (PAY) | version 1 (1.1.0, the version that has the beneficiary name and
  // address fields above), then document type 0 | reserved 0. A parser that trusts the version keeps the name.
  const PBS_VERSION = 0x01;
  const bytes = [(0x0 << 4) | PBS_VERSION, 0x00, total.length & 0xff, (total.length >>> 8) & 0xff, ...lzmaLiterals(total)];
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
  let bitsStr = bytes.map(b => b.toString(2).padStart(8, '0')).join('');
  bitsStr += '0'.repeat((5 - bitsStr.length % 5) % 5);
  let outStr = '';
  for (let i = 0; i < bitsStr.length; i += 5) outStr += ALPHA[parseInt(bitsStr.slice(i, i + 5), 2)];
  return outStr;
}
