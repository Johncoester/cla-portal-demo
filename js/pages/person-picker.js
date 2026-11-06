// Type-to-search person picker (John, Nov 2): replaces the long contact dropdowns for Buyer, Seller, Buyer Agent and Listing Agent.
// Searches name, email, phone (digits) and company / brokerage as you type; arrow keys + Enter or a click select; Escape closes.
// Only the first MAX matches are drawn, so it stays fast with thousands of contacts. The chosen contact id goes into a hidden input (name = the field).
import { html, toText, $ } from '../ui.js?v=202611061918';
import { fmtPhone, contactTypeLabel } from '../data/constants.js?v=202611061918';

const MAX = 25;
const digits = (s) => String(s || '').replace(/\D/g, '');
export const personLabel = (c) => `${c.firstName} ${c.lastName}`.trim();
const detail = (c) => [contactTypeLabel(c.contactType), c.email, fmtPhone(c.phone), c.company].filter(Boolean).join(' \u00b7 ');
// every word typed must match somewhere (name, email, company), or a 3+ digit run must be in the phone number
export function matchPeople(list, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return list;
  return list.filter((c) => { const hay = `${c.firstName} ${c.lastName} ${c.email || ''} ${c.company || ''}`.toLowerCase(); const ph = digits(c.phone);
    return words.every((w) => hay.includes(w) || (digits(w).length >= 3 && digits(w) === w.replace(/[-().\s]/g, '') && ph.includes(digits(w)))); });
}

export const pickerHtml = (name, label, { hint = 'Type a name, email, phone or brokerage' } = {}) => html`<div class="picker" data-picker="${name}">
  <label>${label}<input type="text" class="picker-q" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" placeholder="${hint}" aria-label="${label}"></label>
  <input type="hidden" name="${name}" value=""><ul class="picker-list" role="listbox" hidden></ul>
  <div class="picker-chosen muted small" data-chosen></div></div>`;

// el = the .picker element; source() = the current list of people to search (may change, e.g. after "Add new user")
export function mountPicker(el, source, { onSet } = {}) {   // onSet(contact) after a pick (Matt, Nov 3 (b): Lender fills its phone / email)
  const q = $('.picker-q', el); const hid = $('input[type=hidden]', el); const ul = $('.picker-list', el); const chosen = $('[data-chosen]', el);
  let hits = []; let active = -1;
  const close = () => { ul.hidden = true; q.setAttribute('aria-expanded', 'false'); active = -1; };
  const draw = () => {
    const all = matchPeople(source(), q.value); hits = all.slice(0, MAX); active = hits.length ? Math.max(0, Math.min(active, hits.length - 1)) : -1;
    ul.innerHTML = toText(hits.length ? html`${hits.map((c, i) => html`<li role="option" data-id="${c.id}" aria-selected="${i === active ? 'true' : 'false'}" class="${i === active ? 'active' : ''}"><strong>${personLabel(c)}</strong> <span class="muted small">${detail(c)}</span></li>`)}${all.length > MAX ? html`<li class="muted small" data-more>${all.length - MAX} more &mdash; keep typing to narrow down</li>` : ''}`
      : html`<li class="muted small" data-none>No match. Use "Add new user" below to add this person.</li>`);
    ul.hidden = false; q.setAttribute('aria-expanded', 'true'); };
  const set = (c) => { hid.value = c ? c.id : ''; q.value = c ? personLabel(c) : ''; chosen.textContent = c ? `Selected: ${personLabel(c)}${detail(c) ? ' (' + detail(c) + ')' : ''}` : '';
    el.toggleAttribute('data-selected', !!c); close(); if (onSet && c) onSet(c); };
  q.addEventListener('input', () => { if (hid.value) { hid.value = ''; chosen.textContent = ''; el.removeAttribute('data-selected'); } active = 0; draw(); });
  q.addEventListener('focus', () => { if (!hid.value) draw(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (ul.hidden) draw(); if (!hits.length) return; active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!ul.hidden && hits[active]) set(hits[active]); }
    else if (e.key === 'Escape') { if (!ul.hidden) { e.preventDefault(); close(); } } });
  ul.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-id]'); if (!li) return; e.preventDefault(); set(hits.find((c) => c.id === li.dataset.id)); });
  q.addEventListener('blur', () => setTimeout(close, 150));
  return { set, get value() { return hid.value; }, get typed() { return q.value.trim(); }, el };
}
