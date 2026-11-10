import { html, $ } from '../ui.js?v=202611070139';
import { parcelList, parcelPatch } from '../data/parcels.js?v=202611120700';

export function parcelFieldsHtml(dealOrList) {
  const list = Array.isArray(dealOrList) ? (dealOrList.length ? dealOrList : ['']) : parcelList(dealOrList);
  return html`<div class="span2" data-parcel-list>
    <p class="muted small">Type each parcel ID. This portal does not look one up from the address, and a value you type is kept.</p>
    ${list.map((id, i) => html`<label>Parcel ID${i ? ` ${i + 1}` : ''} <span class="muted small">(optional)</span><input name="${i ? 'parcelExtra' : 'parcelId'}" maxlength="80" value="${id}" aria-label="Parcel ID${i ? ` ${i + 1}` : ''}" data-parcel-id autocomplete="off"></label>`)}
    <p><button type="button" class="ghost" data-add-parcel>+ Parcel ID</button></p>
  </div>`;
}

export function mountParcelFields(root) {
  const btn = $('[data-add-parcel]', root);
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const n = root.querySelectorAll('[data-parcel-list] input').length + 1;
    btn.parentElement.insertAdjacentHTML('beforebegin', `<label>Parcel ID ${n} <span class="muted small">(optional)</span><input name="parcelExtra" maxlength="80" aria-label="Parcel ID ${n}" data-parcel-id autocomplete="off"></label>`);
  });
}

export function parcelsFromForm(form) {
  const data = new FormData(form);
  return parcelPatch([data.get('parcelId'), ...data.getAll('parcelExtra')]);
}
