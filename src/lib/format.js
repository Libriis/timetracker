// ---------- formatting helpers ----------
// The UI is English, so on-screen dates use one English locale (not the OS locale) to avoid
// mixed "Today · ut 3. 11." labels. PDF and CSV exports keep their own formatting.
export const UI_LOCALE = 'en-GB';

// Local calendar day as YYYY-MM-DD. Never use toISOString() for this: it is UTC, so between
// midnight and 01:00/02:00 (CET/CEST) it returns yesterday and month ranges shift by a day.
export function isoDay(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
// YYYY-MM-DD -> local midnight Date.
export function fromIsoDay(s) {
  return new Date(s + 'T00:00:00');
}

// Clock-style duration without a padded hour: 0:52:00, 12:05:09. For on-screen readouts.
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
// Hours and minutes: 7:14
export function formatHM(ms) {
  const m = Math.round(Math.max(0, ms) / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
// Decimal hours for KPIs: 23.8
export function formatHoursNum(ms) {
  const h = ms / 3600000;
  return h >= 100 ? Math.round(h).toLocaleString('en-US') : h.toFixed(1);
}
export function formatDayShort(ts) {
  return new Date(ts).toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
}
// Money is always shown to the cent (€232.50, €24,375.53): these are invoice amounts.
export function formatEUR(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}€${abs}`;
}
// Whole euros, for chart axes and other tight spots where cents are noise (€5,068).
export function formatEURWhole(amount) {
  const n = Math.round(Number(amount) || 0);
  return `${n < 0 ? '−' : ''}€${Math.abs(n).toLocaleString('en-US')}`;
}
// Split for display: { whole: '€5,067', cents: '.83' } so big numbers can render cents smaller.
export function splitEUR(amount) {
  const s = formatEUR(amount);
  const i = s.lastIndexOf('.');
  return { whole: s.slice(0, i), cents: s.slice(i) };
}
export function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
export function formatHours(ms) {
  const h = ms / 3600000;
  if (h < 1) return `${Math.round(ms / 60000)}m`;
  return `${h.toFixed(1)}h`;
}
export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export function formatDate(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(UI_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short' });
}
// Three-letter month for chart axes (Sep, not en-GB "Sept").
export function formatMonthShort(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short' });
}
