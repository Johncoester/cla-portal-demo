// ui.js : tiny helpers. Every value interpolated through html`` is HTML-escaped unless wrapped in raw().
// (The old portal's stored-XSS findings came from unescaped echoes; escaping is the default here.)
// HOTFIX live28 (Nov 4): "already safe HTML" is recognised by a GLOBAL brand (Symbol.for), not by `instanceof Safe`. GitHub Pages' CDN ignores the
// ?v= query when caching, so right after a publish an edge can serve an old copy of one page module (importing ui.js?v=<old>) next to a new app.js
// (importing ui.js?v=<new>). That loads ui.js twice = two different Safe classes, and the page's whole body failed `instanceof` and was escaped into
// visible text ('<section class="modules-page" ...'). A Symbol.for key is shared by every copy of this module and can never come from JSON / stored
// data (JSON has no symbols), so user input still cannot mark itself as safe.
const SAFE = Symbol.for('cla-portal.safe-html');
class Safe { constructor(s) { this.s = s; Object.defineProperty(this, SAFE, { value: true }); } toString() { return this.s; } }
// LEGACY: a Safe built by an OLDER copy of ui.js (before this brand; e.g. a stale CDN copy during the next publish) is a real class instance named Safe.
// JSON / localStorage can only make plain objects (Object.prototype), so this cannot be forged from stored data either.
const legacySafe = (v) => { const p = Object.getPrototypeOf(v); return !!p && p !== Object.prototype && p.constructor && p.constructor.name === 'Safe' && Object.keys(v).length === 1 && typeof v.s === 'string'; };
export const isSafe = (v) => !!v && typeof v === 'object' && typeof v.s === 'string' && (v[SAFE] === true || legacySafe(v));
export const raw = (s) => new Safe(String(s));
export const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (isSafe(v) ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
export const html = (strings, ...vals) => new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ''), ''));
export const toText = (v) => part(v);

export const fmtDate = (d) => { if (!d) return ''; const m = String(d).slice(0, 10).split('-'); return m.length === 3 ? `${m[1]}/${m[2]}/${m[0]}` : String(d); };
export const fmtDateTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
export const fmtMoney = (n) => { if (n == null || n === '') return ''; const v = Number(n); const cents = Math.round(v * 100) % 100 !== 0;   // show cents only when there are any
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }); };
export const fmtSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : !n ? '0 KB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// John, t1500u: save errors in plain English, technical detail kept out of the main sentence, and the message stays
// until the user dismisses it. Database / PostgREST wording is mapped here; our own messages pass through unchanged.
const COLUMN_WORDS = { id: 'ID', zip: 'ZIP', emd: 'EMD', tc: 'TC', url: 'URL', ssn: 'SSN' };
const columnLabel = (col) => String(col || '').split('_').filter(Boolean).map((w, i) => COLUMN_WORDS[w] || (i ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
export function plainError(input) {
  const raw = String(input && typeof input === 'object' ? (input.message || input.error_description || input.details || '') : (input == null ? '' : input)).trim();
  const code = input && typeof input === 'object' ? String(input.code || '') : '';
  const said = (text) => ({ text, detail: raw });
  let m;
  if ((m = /null value in column "([^"]+)"(?: of relation "[^"]+")? violates not-null constraint/i.exec(raw)) || code === '23502') {
    const field = m ? columnLabel(m[1]) : '';
    return said(field ? `This was not saved: ${field} is required. Fill it in and try again.` : 'This was not saved: a required field is empty. Fill it in and try again.');
  }
  if (code === '23505' || /duplicate key value violates unique constraint/i.test(raw)) {
    const key = /Key \(([^)]+)\)=/i.exec(raw) || /unique constraint "[a-z]+_([a-z_]+?)_(?:uq|key|unique|idx)"/i.exec(raw);
    const what = key ? columnLabel(key[1].split(',')[0].trim()).toLowerCase() : '';
    return said(what ? `This was not saved: another record already uses this ${what}. Use the existing one or change it.` : 'This was not saved: it would create a duplicate of a record that already exists.');
  }
  if (code === '42501' || /row-level security|permission denied|violates row level security/i.test(raw)) {
    return said('This was not saved: your login is not allowed to change this. Ask CLA Title if you think you should be able to.');
  }
  if (code === '23503' || /violates foreign key constraint/i.test(raw)) return said('This was not saved: it points to something that was removed. Refresh the page and try again.');
  if (code === '23514' || /violates check constraint/i.test(raw)) return said('This was not saved: one of the values is not allowed here. Check the fields and try again.');
  if (code === '22P02' || /invalid input syntax for type/i.test(raw)) return said('This was not saved: one of the values is not in the right format. Check the fields and try again.');
  if (/JWT expired|invalid JWT|refresh token/i.test(raw)) return said('Your sign-in has expired. Sign in again, then retry.');
  if (/Failed to fetch|NetworkError|Load failed|network request failed/i.test(raw)) return said('Could not reach the server. Check your connection and try again.');
  return { text: raw || 'Something went wrong. Try again.', detail: '' };
}
export function toast(msg, kind = 'ok') {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + kind;
  if (kind !== 'err') { t.textContent = msg; box.appendChild(t); setTimeout(() => t.remove(), 3000); return t; }
  const { text, detail } = plainError(msg);
  for (const old of box.querySelectorAll('.toast.err')) if (old.dataset.msg === text) old.remove();   // one copy of the same error
  t.dataset.msg = text; t.setAttribute('role', 'alert');
  const line = document.createElement('span'); line.className = 'toast-text'; line.textContent = text; t.appendChild(line);
  const x = document.createElement('button'); x.type = 'button'; x.className = 'toast-x'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '\u00d7';
  x.addEventListener('click', () => t.remove()); t.appendChild(x);
  if (detail && detail !== text) {
    const more = document.createElement('details'); more.className = 'toast-detail';
    const sum = document.createElement('summary'); sum.textContent = 'Technical details'; more.appendChild(sum);
    const pre = document.createElement('div'); pre.textContent = detail; more.appendChild(pre); t.appendChild(more);
  }
  box.appendChild(t); return t;
}
// Wrap an async action: shows errors as a toast instead of breaking the page.
export const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message || String(e), 'err'); } };

export function modal(title, bodyHtml, { wide = false } = {}) {
  closeModal();
  const el = document.createElement('div'); el.className = 'modal-back'; el.id = 'modal';
  el.innerHTML = toText(html`<div class="modal-box ${wide ? 'wide' : ''}" role="dialog" aria-label="${title}"><div class="modal-head"><h3>${title}</h3><button class="modal-x" data-close aria-label="Close">&times;</button></div><div class="modal-body">${bodyHtml}</div></div>`);
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(el); const f = $('input,select,textarea', el); if (f) f.focus(); return el;
}
export function closeModal() { const m = $('#modal'); if (m) m.remove(); }
export const options = (list, selected, label = (x) => x, value = (x) => x) => list.map((x) => html`<option value="${value(x)}" ${String(value(x)) === String(selected) ? raw('selected') : ''}>${label(x)}</option>`);
export const pill = (text, cls = '') => html`<span class="pill ${cls}">${text}</span>`;
