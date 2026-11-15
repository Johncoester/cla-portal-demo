/* County dropdown on Place Order and Edit order. Fed by allCounties() for the order's state. */
import { html, raw, toText } from '../ui.js?v=202611161500';
import { countyChoice } from '../data/county-field.js?v=202611222200';

export function countyFieldHtml(state, saved, hint) {
  const { names, selected, unmatched } = countyChoice(state, saved);
  return html`<label>County ${hint ? html`<span class="muted small">${hint}</span>` : ''}
    <select name="county" aria-label="County" data-county-select>
      <option value="">Select county</option>
      ${unmatched ? html`<option value="${unmatched}" data-county-unmatched="1" selected>${unmatched} (not matched)</option>` : ''}
      ${names.map((name) => html`<option value="${name}" ${name === selected ? raw('selected') : ''}>${name}</option>`)}
    </select>
    ${unmatched ? html`<span class="field-hint" data-county-unmatched-note>This saved county is not in CLA's list. Pick the county from the list.</span>` : ''}
  </label>`;
}

export function paintCountyOptions(select, state, saved) {
  if (!select) return;
  const { names, selected, unmatched } = countyChoice(state, saved);
  select.innerHTML = toText(html`<option value="">Select county</option>
    ${unmatched ? html`<option value="${unmatched}" data-county-unmatched="1" selected>${unmatched} (not matched)</option>` : ''}
    ${names.map((name) => html`<option value="${name}" ${name === selected ? raw('selected') : ''}>${name}</option>`)}`);
  const label = select.closest('label');
  let note = label && label.querySelector('[data-county-unmatched-note]');
  if (unmatched) {
    if (!note && label) { note = document.createElement('span'); note.className = 'field-hint'; note.dataset.countyUnmatchedNote = ''; label.appendChild(note); }
    if (note) note.textContent = "This saved county is not in CLA's list. Pick the county from the list.";
  } else if (note) note.remove();
}

export function mountCountySelect(form) {
  if (!form) return;
  const state = form.querySelector('[name="state"]');
  const county = form.querySelector('select[name="county"]');
  if (!state || !county || county.dataset.countyBound === '1') return;
  county.dataset.countyBound = '1';
  state.addEventListener('change', () => paintCountyOptions(county, state.value, county.value));
}
