/* Manage columns (Janine, Nov 5; saved on the login Nov 10). Every field of the module, check to show, drag to reorder, cap 10.
 * The open list paints from this browser, then applies the login's row once. A change is saved after a short pause. */
import { html, raw, toText, $, $$ } from '../ui.js?v=202611161500';
import { COLUMN_CAP, loadColumns, scheduleColumnSave } from '../data/crm-columns.js?v=202611160300';

const storageOf = (storage) => {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
};

export function columnState(storage, userId, module, known, defaults) {
  return loadColumns(storageOf(storage), userId, module, { known, defaults });
}

// The All list and Choose Columns on a custom view share this row. The row is the drag handle.
// ArrowUp and ArrowDown move the focused row, the keyboard path for the same reorder.
export function columnOrderItem(key, label, extra = '') {
  return html`<li draggable="true" tabindex="0" data-col-key="${key}" data-vcol="${key}">${label}${extra}</li>`;
}

export function reorderColumns(order, fromKey, toKey) {
  const next = (Array.isArray(order) ? order : []).slice();
  const from = next.indexOf(fromKey);
  const to = next.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return null;
  next.splice(from, 1);
  next.splice(to, 0, fromKey);
  return next;
}

const rowOf = (box, target) => {
  const el = target && target.closest ? target : (target && target.parentElement);
  if (!el || !el.closest) return null;
  const li = el.closest('[data-col-key]');
  return li && box.contains(li) ? li : null;
};

export function wireColumnDrag(box, { getOrder, setOrder } = {}) {
  if (!box || !box.addEventListener || typeof getOrder !== 'function' || typeof setOrder !== 'function') return;
  let dragKey = null;
  const blocked = (target) => !!(target && target.closest && target.closest('button, a, input, select, textarea'));
  box.addEventListener('dragstart', (e) => {
    const li = rowOf(box, e.target); if (!li || blocked(e.target)) return;
    dragKey = li.dataset.colKey;
    try { if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey); } } catch { /* a synthetic event has no dataTransfer */ }
  });
  box.addEventListener('dragover', (e) => { if (rowOf(box, e.target)) e.preventDefault(); });
  box.addEventListener('drop', (e) => {
    const li = rowOf(box, e.target); if (!li || !dragKey) return;
    e.preventDefault();
    const next = reorderColumns(getOrder(), dragKey, li.dataset.colKey);
    dragKey = null;
    if (next) setOrder(next);
  });
  box.addEventListener('dragend', () => { dragKey = null; });
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const li = rowOf(box, e.target); if (!li || blocked(e.target)) return;
    const order = getOrder() || [];
    const from = order.indexOf(li.dataset.colKey);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    e.preventDefault();
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = reorderColumns(order, li.dataset.colKey, order[to]);
    if (!next) return;
    setOrder(next);
    const again = box.querySelector('[data-col-key="' + li.dataset.colKey + '"]');
    if (again && again.focus) again.focus();
  });
}

export function columnChooserHtml(module, fields, visible) {
  const on = new Set(visible);
  return html`<details class="col-chooser" data-manage-cols="${module}">
    <summary>Manage columns</summary>
    <p class="muted small" data-col-cap>Check a field to show it. At most ${COLUMN_CAP}. Drag a shown field to change the order. Saved for you on this login.</p>
    <ol data-col-order>${visible.map((k) => { const f = fields.find((z) => z.key === k); return columnOrderItem(k, f ? f.label : k); })}</ol>
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
    ol.innerHTML = toText(order.map((k) => { const f = fields.find((z) => z.key === k); return columnOrderItem(k, f ? f.label : k); }));
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
  wireColumnDrag(box, { getOrder: () => visible.slice(), setOrder: (order) => { visible = commit(order, ''); } });
  const reset = $('[data-cols-reset]', box);
  if (reset) reset.addEventListener('click', () => { visible = commit(defaults, ''); });
  return { setOrder(order) { visible = order.slice(); drawOrder(visible); } };
}
