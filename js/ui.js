// ui.js : tiny helpers. Every value interpolated through html`` is HTML-escaped unless wrapped in raw().
// (The old portal's stored-XSS findings came from unescaped echoes; escaping is the default here.)
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
export const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
export const html = (strings, ...vals) => new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ''), ''));
export const toText = (v) => part(v);

export const fmtDate = (d) => { if (!d) return ''; const m = String(d).slice(0, 10).split('-'); return m.length === 3 ? `${m[1]}/${m[2]}/${m[0]}` : String(d); };
export const fmtDateTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
export const fmtMoney = (n) => (n == null || n === '' ? '' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }));
export const fmtSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const formData = (form) => Object.fromEntries(new FormData(form).entries());

export function toast(msg, kind = 'ok') {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
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
