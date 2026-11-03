// MONEY INPUTS WITH COMMAS (Matt, Nov 3 (b): purchase price, loan amount, EMD amount). Any <input data-money> shows 485,000 / 1,250,000.50 while typing
// (app.js formats on every input and on blur, keeping the cursor after the same digit); the value sent to the data layer is clean: moneyClean('485,000') = '485000'.
// Pure helpers (no DOM at import) so the unit tests can use them.
export const moneyClean = (v) => String(v == null ? '' : v).replace(/[$,\s]/g, '');
// '1234567.891' -> '1,234,567.89'; keeps a trailing '.' while typing; drops anything that is not a digit or the first '.'
export function moneyTyping(v) {
  const s = String(v == null ? '' : v).replace(/[^\d.]/g, ''); if (!s) return '';
  const dot = s.indexOf('.'); const intPart = (dot < 0 ? s : s.slice(0, dot)).replace(/^0+(?=\d)/, ''); const dec = dot < 0 ? null : s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  const grouped = (intPart || (dec != null ? '0' : '')).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec == null ? grouped : `${grouped}.${dec}`;
}
// number (or '') -> what the box shows when a form opens (e.g. Edit order): 485000 -> '485,000', 10000.5 -> '10,000.50'
export const moneyShow = (n) => { if (n == null || n === '') return ''; const v = Number(n); if (!isFinite(v)) return String(n);
  const cents = Math.round(v * 100) % 100 !== 0; return v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }); };
// format an input in place, keeping the caret after the same number of digits / dot
export function formatMoneyInput(el) {
  const before = el.value; const next = moneyTyping(before); if (next === before) return;
  const pos = el.selectionStart == null ? before.length : el.selectionStart; const keep = before.slice(0, pos).replace(/[^\d.]/g, '').length;
  el.value = next; let i = 0, n = 0; while (i < next.length && n < keep) { if (/[\d.]/.test(next[i])) n++; i++; }
  try { if (document.activeElement === el) el.setSelectionRange(i, i); } catch (e) { /* type=number etc. */ }
}
