/* crm-saved-filters.js : SAVED FILTERS (Janine, Nov 4 video "Custom View / Filters": Zoho's "Save filter" -> a named chip with its count).
 * Per person; a list key is a module ('contacts' ...) or 'view:<id>'. Used by crm-kit.js listView and crm-views.js. Function only. */
import { html, toText, $, $$, guard, toast, modal, closeModal } from '../ui.js?v=202611060027';
// SAVED FILTER chips (shared by the module lists and the view page). getValues() -> { name: value } of the filter bar; setValues(obj) applies one;
// count(values) -> how many rows it matches now.
export function savedFiltersHtml(listKey) {
  return html`<div class="saved-filters" data-saved-filters="${listKey}" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0"><strong class="small">Saved Filters</strong> <span data-sf-chips></span>
    <button type="button" class="ghost small" data-sf-save>Save filter</button></div>`;
}
export function wireSavedFilters(root, api, listKey, { getValues, setValues, count }) {
  const box = $(`[data-saved-filters="${listKey}"]`, root); if (!box) return; const chips = $('[data-sf-chips]', box);
  const draw = guard(async () => { const list = await api.listCrmSavedFilters(listKey);
    chips.innerHTML = toText(list.length ? list.map((f) => html`<span class="pill" data-sf="${f.id}" style="display:inline-flex;gap:4px;align-items:center"><button type="button" class="linkish" data-sf-apply="${f.id}" title="Apply this filter">${f.name} <span class="muted small" data-sf-count>${count(Object.fromEntries(f.values.map((z) => [z.name, z.value])))}</span></button>
      <button type="button" class="linkish small" data-sf-rename="${f.id}" title="Rename" aria-label="Rename ${f.name}">rename</button><button type="button" class="linkish small" data-sf-x="${f.id}" title="Remove" aria-label="Remove ${f.name}">&times;</button></span>`) : html`<span class="muted small" data-sf-none>None yet: set the filters, then Save filter.</span>`);
    list.forEach((f) => { const b = $(`[data-sf-apply="${f.id}"]`, chips); b.addEventListener('click', () => { setValues(Object.fromEntries(f.values.map((z) => [z.name, z.value]))); toast(`Filter "${f.name}" applied`); }); });
    $$('[data-sf-rename]', chips).forEach((b) => b.addEventListener('click', guard(async () => { const f = list.find((z) => z.id === b.dataset.sfRename); const n = prompt('New name', f.name); if (!n) return; await api.renameCrmSavedFilter(f.id, n); draw(); })));
    $$('[data-sf-x]', chips).forEach((b) => b.addEventListener('click', guard(async () => { const f = list.find((z) => z.id === b.dataset.sfX); if (!confirm(`Remove the saved filter "${f.name}"?`)) return; await api.retireCrmSavedFilter(f.id); toast('Saved filter removed'); draw(); }))); });
  $('[data-sf-save]', box).addEventListener('click', () => {
    const m = modal('Save filter', html`<form data-sf-form class="form-grid"><label class="span2">Filter Name<input name="name" maxlength="60" required data-sf-name></label>
      <div class="span2"><button type="button" class="ghost" data-close>Cancel</button> <button class="m-btn">Save</button></div></form>`);
    $('[data-sf-form]', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.saveCrmSavedFilter({ listKey, name: e.target.name.value, values: getValues() }); closeModal(); toast('Filter saved'); draw(); }));
  });
  draw();
}

