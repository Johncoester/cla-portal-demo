/* Manage columns (Janine, Nov 5; saved on the login Nov 10). Every field of the module, check to show, drag to reorder, cap 10.
 * The open list paints from this browser, then applies the login's row once. A change is saved after a short pause. */
import { html, raw, toText, $, $$ } from '../ui.js?v=202611070139';
import { COLUMN_CAP, loadColumns, scheduleColumnSave } from '../data/crm-columns.js?v=202611130300';

const storageOf = (storage) => {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
};

export function columnState(storage, userId, module, known, defaults) {
  return loadColumns(storageOf(storage), userId, module, { known, defaults });
}

export function columnChooserHtml(module, fields, visible) {
  const on = new Set(visible);
  return html`<details class="col-chooser" data-manage-cols="${module}">
    <summary>Manage columns</summary>
    <p class="muted small" data-col-cap>Check a field to show it. At most ${COLUMN_CAP}. Drag a shown field to change the order. Saved for you on this login.</p>
    <ol data-col-order>${visible.map((k) => { const f = fields.find((z) => z.key === k); return html`<li draggable="true" data-col-key="${k}">${f ? f.label : k}</li>`; })}</ol>
    <div class="col-list" data-col-picks>${fields.map((f) => html`<label class="check"><input type="checkbox" data-col-pick="${f.key}" ${on.has(f.key) ? raw('checked') : ''}> ${f.label}</label>`)}</div>
    <p><button type="button" class="ghost" data-cols-reset>Default columns</button></p>
    <p class="err-text" data-col-msg hidden></p>
  </details>`;
}

export function wireColumnChooser(root, { module, userId, fields, visible, defaults, known, onChange, storage, api }) {
  const box = $(`[data-manage-cols="${module}"]`, root); if (!box) return { setOrder() {} };
  const store = storageOf(storage);
  const say = (t) => { const p = $('[data-col-msg]', box); if (!p) return; p.hidden = !t; p.textContent = t || ''; };
  const drawOrder = (order) => { const ol = $('[data-col-order]', box); if (!ol) return;
    ol.innerHTML = toText(order.map((k) => { const f = fields.find((z) => z.key === k); return html`<li draggable="true" data-col-key="${k}">${f ? f.label : k}</li>`; }));
    $$('[data-col-pick]', box).forEach((cb) => { cb.checked = order.includes(cb.dataset.colPick); }); };
  const commit = (order, msg) => {
    const next = scheduleColumnSave({ api, storage: store, userId, module, order, known });
    drawOrder(next); say(msg || ''); onChange(next); return next;
  };
  box.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-col-pick]'); if (!cb) return;
    const key = cb.dataset.colPick; let order = [...visible];
    if (cb.checked) {
      if (order.includes(key)) return;
      if (order.length >= COLUMN_CAP) { cb.checked = false; say(`A list shows at most ${COLUMN_CAP} columns.`); return; }
      order.push(key);
    } else {
      if (order.length <= 1) { cb.checked = true; say('Keep at least one column.'); return; }
      order = order.filter((k) => k !== key);
    }
    visible = commit(order, '');
  });
  let dragKey = null;
  box.addEventListener('dragstart', (e) => { const li = e.target.closest('[data-col-key]'); if (!li) return; dragKey = li.dataset.colKey; });
  box.addEventListener('dragover', (e) => { if (e.target.closest('[data-col-key]')) e.preventDefault(); });
  box.addEventListener('drop', (e) => {
    const li = e.target.closest('[data-col-key]'); if (!li || !dragKey || li.dataset.colKey === dragKey) return;
    e.preventDefault();
    const order = [...visible]; const from = order.indexOf(dragKey); const to = order.indexOf(li.dataset.colKey);
    if (from < 0 || to < 0) return;
    order.splice(from, 1); order.splice(to, 0, dragKey); dragKey = null; visible = commit(order, '');
  });
  const reset = $('[data-cols-reset]', box);
  if (reset) reset.addEventListener('click', () => { visible = commit(defaults, ''); });
  return { setOrder(order) { visible = order.slice(); drawOrder(visible); } };
}
