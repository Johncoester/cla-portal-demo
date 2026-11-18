// FF-092 (Francis Santos, Nov 17 2026, 1:37 PM ET): Place Order picks salespeople from a search box.
// Each chosen person is still a salesIds value, the same ids the order already saves. The list itself
// is whoever Place Order already loaded (active Sales Person and Sales Team for this login). This control does not add roles.
import { html, toText, $ } from '../ui.js?v=202611161500';

const MAX = 25;

export function salesPersonName(person) {
  return `${person.firstName || ''} ${person.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'Unnamed';
}

export function salesPersonLabel(person) {
  const name = salesPersonName(person);
  return person.role ? `${name} (${person.role})` : name;
}

// Every word must match the name, the role, or the email. A blank search is the whole list.
export function filterSalesPeople(list, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list || [];
  return (list || []).filter((p) => {
    const hay = `${p.firstName || ''} ${p.lastName || ''} ${p.role || ''} ${p.email || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function salesMultiHtml(staff) {
  const empty = !staff.length;
  return html`<div class="picker" data-sales-multi>
    <label>Search<span class="muted small"> (name or role)</span>
      <input type="text" class="picker-q" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="sales-people-list" autocomplete="off" placeholder="Type a name" aria-label="Search salespeople on this order" ${empty ? 'disabled' : ''}></label>
    <ul class="picker-list" id="sales-people-list" role="listbox" aria-multiselectable="true" aria-label="Salespeople" hidden></ul>
    <div class="tc-chips" data-sales-chips aria-live="polite"></div>
    <div data-sales-values></div>
    ${empty ? html`<p class="muted" data-no-sales>No salespeople are available for this login.</p>` : ''}</div>`;
}

// el is [data-sales-multi]. people is the staff list already allowed on this order.
export function mountSalesMulti(el, people) {
  const list = [...(people || [])];
  const selected = new Set();
  const q = $('.picker-q', el);
  const ul = $('.picker-list', el);
  const chips = $('[data-sales-chips]', el);
  const values = $('[data-sales-values]', el);
  let hits = [];
  let active = -1;
  let open = false;

  const chosen = () => list.filter((p) => selected.has(p.id));
  const paintValues = () => { values.innerHTML = toText(html`${chosen().map((p) => html`<input type="hidden" name="salesIds" value="${p.id}">`)}`); };
  const paintChips = () => {
    chips.innerHTML = toText(chosen().length ? html`${chosen().map((p) => html`<span class="pill" data-sales-chip="${p.id}">${salesPersonLabel(p)} <button type="button" class="ghost small" data-sales-remove="${p.id}" aria-label="Remove ${salesPersonLabel(p)}">Remove</button></span>`)}` : '');
  };
  const close = () => { open = false; ul.hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); active = -1; };
  const paintList = () => {
    const typed = q.value.trim();
    const all = filterSalesPeople(list, typed);
    hits = all.slice(0, MAX);
    if (active >= hits.length) active = hits.length ? hits.length - 1 : -1;
    const rows = hits.length
      ? html`${hits.map((p, i) => html`<li id="sales-people-opt-${i}" role="option" data-id="${p.id}" aria-selected="${selected.has(p.id) ? 'true' : 'false'}" class="${i === active ? 'active' : ''}"><strong>${salesPersonName(p)}</strong> <span class="muted small">${p.role || ''}${selected.has(p.id) ? ' · Selected' : ''}</span></li>`)}${all.length > MAX ? html`<li class="muted small" data-more>${all.length - MAX} more — keep typing to narrow down</li>` : ''}`
      : html`<li class="muted small" data-none>${typed ? 'No match. Try another name.' : 'No salespeople are available for this login.'}</li>`;
    ul.innerHTML = toText(rows);
    ul.hidden = false;
    open = true;
    q.setAttribute('aria-expanded', 'true');
    if (hits[active]) q.setAttribute('aria-activedescendant', `sales-people-opt-${active}`);
    else q.removeAttribute('aria-activedescendant');
    const current = ul.querySelector('.active');
    if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
  };
  const paint = () => { paintValues(); paintChips(); if (open) paintList(); };
  const changed = () => { paint(); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const toggle = (id) => {
    if (!id || !list.some((p) => p.id === id)) return;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    q.value = '';
    close();
    changed();
  };
  const ensure = (person) => {
    if (!person || !person.id) return;
    if (!list.some((p) => p.id === person.id)) list.push(person);
    const empty = $('[data-no-sales]', el);
    if (empty) empty.remove();
    q.disabled = false;
    selected.add(person.id);
    close();
    changed();
  };

  let skipOpen = false;
  q.addEventListener('focus', () => { if (skipOpen) { skipOpen = false; return; } if (!q.disabled) { active = 0; paintList(); } });
  q.addEventListener('input', () => { active = 0; paintList(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (!open) {
        const n = filterSalesPeople(list, q.value).slice(0, MAX).length;
        active = (e.key === 'End' || e.key === 'ArrowUp') && n ? n - 1 : 0;
        paintList();
        return;
      }
      if (!hits.length) return;
      if (e.key === 'Home') active = 0;
      else if (e.key === 'End') active = hits.length - 1;
      else active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      paintList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!open) { active = 0; paintList(); }
      if (hits[active]) toggle(hits[active].id);
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); close(); }
    }
  });
  ul.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    e.preventDefault();
    toggle(li.dataset.id);
  });
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sales-remove]');
    if (!btn) return;
    selected.delete(btn.dataset.salesRemove);
    close();
    changed();
    skipOpen = true;
    q.focus();
  });
  q.addEventListener('blur', () => setTimeout(() => { if (!el.contains(document.activeElement)) close(); }, 150));

  return {
    addAndSelect: ensure,
    restore(ids) {
      selected.clear();
      for (const id of ids || []) if (list.some((p) => p.id === id)) selected.add(id);
      paint();
    },
    labels: () => chosen().map(salesPersonLabel),
  };
}
