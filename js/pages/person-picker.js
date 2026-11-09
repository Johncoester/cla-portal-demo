// Type-to-search person picker (John, Nov 2): replaces the long contact dropdowns for Buyer, Seller, Buyer Agent and Listing Agent.
// Searches name, email, phone (digits) and company / brokerage as you type; arrow keys + Enter or a click select; Escape closes.
// Only the first MAX matches are drawn, so it stays fast with thousands of contacts. The chosen contact id goes into a hidden input (name = the field).
// Francis, Nov 9: when there is no match, offer "Add … as a new person" in the list so a party can be created from the field itself
// (Buyers & Sellers / Agents / Lender) without leaving for "Add new user".
import { html, toText, $, toast } from '../ui.js?v=202611070139';
import { fmtPhone, contactTypeLabel } from '../data/constants.js?v=202611090935';

const MAX = 25;
const digits = (s) => String(s || '').replace(/\D/g, '');
export const personLabel = (c) => `${c.firstName || ''} ${c.lastName || ''}`.trim() || (c.company || '').trim() || 'Unnamed contact';
const detail = (c) => [contactTypeLabel(c.contactType), c.email, fmtPhone(c.phone), c.company].filter(Boolean).join(' \u00b7 ');
// every word typed must match somewhere (name, email, company), or a 3+ digit run must be in the phone number
export function matchPeople(list, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return list;
  return list.filter((c) => { const hay = `${c.firstName} ${c.lastName} ${c.email || ''} ${c.company || ''}`.toLowerCase(); const ph = digits(c.phone);
    return words.every((w) => hay.includes(w) || (digits(w).length >= 3 && digits(w) === w.replace(/[-().\s]/g, '') && ph.includes(digits(w)))); });
}

// "Warren Spencer" -> first Warren, last Spencer; a single word is first name only; company-style names still split the same way
// (caller can put the whole typed string in company when creating a lender).
export function splitPersonName(q) {
  const parts = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export const pickerHtml = (name, label, { hint = 'Type a name, email, phone or brokerage' } = {}) => html`<div class="picker" data-picker="${name}">
  <label>${label}<input type="text" class="picker-q" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" placeholder="${hint}" aria-label="${label}"></label>
  <input type="hidden" name="${name}" value=""><ul class="picker-list" role="listbox" hidden></ul>
  <div class="picker-chosen muted small" data-chosen></div></div>`;

// el = the .picker element; source() = the current list of people to search (may change, e.g. after "Add new user")
// onCreate(typed) optional: when the typed text has no match and the user picks "Add …", called with the typed string;
//   may return a contact (or a Promise of one). When it returns a contact, the picker selects it.
export function mountPicker(el, source, { onSet, onCreate, createVerb = 'person', allowCreate } = {}) {   // onSet(contact) after a pick (Matt, Nov 3 (b): Lender fills its phone / email)
  // allowCreate() optional: Contacts hides inline create for Transaction Coordinator (needs an Admin-made TC login).
  // createVerb may be a string or () => string so the Contacts role dropdown can switch lender vs person.
  const q = $('.picker-q', el); const hid = $('input[type=hidden]', el); const ul = $('.picker-list', el); const chosen = $('[data-chosen]', el);
  let hits = []; let active = -1; let creating = false;
  const close = () => { ul.hidden = true; q.setAttribute('aria-expanded', 'false'); active = -1; };
  const typed = () => q.value.trim();
  const createOk = () => !!onCreate && (typeof allowCreate !== 'function' || allowCreate());
  const verb = () => (typeof createVerb === 'function' ? createVerb() : createVerb);
  const draw = () => {
    const all = matchPeople(source(), q.value); hits = all.slice(0, MAX); const canCreate = createOk() && !!typed() && !hits.length;
    active = hits.length || canCreate ? Math.max(0, Math.min(active, (hits.length || 1) - 1)) : -1;
    const createRow = canCreate
      ? html`<li role="option" data-create="1" aria-selected="${active === 0 ? 'true' : 'false'}" class="${active === 0 ? 'active' : ''}"><strong>Add "${typed()}" as a new ${verb()}</strong> <span class="muted small">Creates a contact and puts them on this order</span></li>`
      : (!hits.length ? html`<li class="muted small" data-none>No match.${createOk() ? '' : (onCreate ? ' Pick someone from the list.' : ' Use "Add new user" below to add this person.')}</li>` : '');
    ul.innerHTML = toText(hits.length ? html`${hits.map((c, i) => html`<li role="option" data-id="${c.id}" aria-selected="${i === active ? 'true' : 'false'}" class="${i === active ? 'active' : ''}"><strong>${personLabel(c)}</strong> <span class="muted small">${detail(c)}</span></li>`)}${all.length > MAX ? html`<li class="muted small" data-more>${all.length - MAX} more &mdash; keep typing to narrow down</li>` : ''}`
      : createRow);
    ul.hidden = false; q.setAttribute('aria-expanded', 'true'); };
  const set = (c) => { hid.value = c ? c.id : ''; q.value = c ? personLabel(c) : ''; chosen.textContent = c ? `Selected: ${personLabel(c)}${detail(c) ? ' (' + detail(c) + ')' : ''}` : '';
    el.toggleAttribute('data-selected', !!c); close(); if (onSet && c) onSet(c); };
  const create = async () => {
    if (!onCreate || creating) return; const name = typed(); if (!name) return;
    creating = true; chosen.textContent = 'Adding\u2026';
    try {
      const c = await onCreate(name);
      if (c && c.id) { if (!source().some((p) => p.id === c.id)) { /* caller usually pushes */ } set(c); }
      else { chosen.textContent = ''; draw(); }
    } catch (e) { chosen.textContent = ''; throw e; }
    finally { creating = false; }
  };
  q.addEventListener('input', () => { if (hid.value) { hid.value = ''; chosen.textContent = ''; el.removeAttribute('data-selected'); } active = 0; draw(); });
  q.addEventListener('focus', () => { if (!hid.value) draw(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (ul.hidden) draw();
      const n = hits.length || (createOk() && typed() ? 1 : 0); if (!n) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; draw();
    } else if (e.key === 'Enter') {
      e.preventDefault(); if (ul.hidden) return;
      if (hits[active]) set(hits[active]);
      else if (!hits.length && createOk() && typed()) create().catch((err) => toast(err.message || String(err), 'err'));
    } else if (e.key === 'Escape') { if (!ul.hidden) { e.preventDefault(); close(); } } });
  ul.addEventListener('mousedown', (e) => {
    const createLi = e.target.closest('li[data-create]');
    if (createLi) { e.preventDefault(); create().catch((err) => toast(err.message || String(err), 'err')); return; }
    const li = e.target.closest('li[data-id]'); if (!li) return; e.preventDefault(); set(hits.find((c) => c.id === li.dataset.id));
  });
  q.addEventListener('blur', () => setTimeout(close, 150));
  return { set, get value() { return hid.value; }, get typed() { return q.value.trim(); }, el };
}
