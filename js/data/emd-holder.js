/* MF-063 (Matt Landsberg, Portal Feedback Nov 25 2026): EMD held by is a fixed list.
 * "No EMD" stores amount $0 and due date empty, shown as N/A. Older typed-in holders stay until someone edits. */
export const EMD_HOLDER_OPTIONS = [
  'CLA Title',
  'Listing Agent',
  "Buyer's Agent",
  'No EMD',
  'Other Title Company or Attorney',
];

const LEGACY = {
  cla: 'CLA Title',
  'cla title': 'CLA Title',
  'cla title & escrow': 'CLA Title',
  'cla title and escrow': 'CLA Title',
  'listing brokerage': 'Listing Agent',
  'listing agent': 'Listing Agent',
  'buyer brokerage': "Buyer's Agent",
  "buyer's agent": "Buyer's Agent",
  'buyers agent': "Buyer's Agent",
  'no emd': 'No EMD',
  'no earnest': 'No EMD',
  'none': 'No EMD',
};

export function emdHolderCanonical(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (EMD_HOLDER_OPTIONS.includes(raw)) return raw;
  return LEGACY[raw.toLowerCase()] || '';
}

/** Value for the dropdown: a list option only when the saved text already matches one. Older typed-in text stays until someone picks a list option. */
export function emdHolderSelectValue(stored) {
  return String(stored == null ? '' : stored).trim();
}

export function isNoEmd(value) {
  return emdHolderCanonical(value) === 'No EMD' || emdHolderSelectValue(value) === 'No EMD';
}

/** Label for read-only views. Maps obvious older wording; leaves anything else as it was saved. */
export function emdHolderDisplay(value) {
  const raw = String(value == null ? '' : value).trim();
  return emdHolderCanonical(raw) || raw;
}

export function emdDueDisplay(due, holder, format = (v) => v) {
  if (isNoEmd(holder)) return 'N/A';
  if (due == null || String(due).trim() === '') return '';
  return format(due) || '';
}

export function emdHolderOptions(stored) {
  const selected = emdHolderSelectValue(stored);
  const options = EMD_HOLDER_OPTIONS.slice();
  if (selected && !options.includes(selected)) options.unshift(selected);
  return { selected, options, isNoEmd: selected === 'No EMD' };
}

/** Shared select markup. `h` is the page's html tagged template; `raw` writes the selected attribute. */
export function emdHolderSelect(h, raw, stored, { name = 'emdHeldBy', label = 'EMD held by', aria = 'EMD held by' } = {}) {
  const { selected, options } = emdHolderOptions(stored);
  return h`<label>${label}<select name="${name}" aria-label="${aria}" data-emd-holder><option value="">Choose…</option>${options.map((o) => h`<option value="${o}" ${o === selected ? raw('selected') : ''}>${o}</option>`)}</select></label>`;
}

export function applyNoEmdToForm(f, heldKey = 'emdHeldBy') {
  if (!f || !isNoEmd(f[heldKey])) return f;
  f[heldKey] = 'No EMD';
  f.emdAmount = 0;
  f.emdDueDate = '';
  f.emdDueOn = '';
  return f;
}

export function wireEmdHolderFields(root, { held = 'emdHeldBy', amount = 'emdAmount', due = 'emdDueDate' } = {}) {
  if (!root) return;
  const sel = root.querySelector(`[name="${held}"]`);
  const amt = root.querySelector(`[name="${amount}"]`);
  const dueEl = root.querySelector(`[name="${due}"]`);
  if (!sel) return;
  const apply = () => {
    const off = isNoEmd(sel.value);
    if (amt) {
      if (off) { amt.value = '0'; amt.setAttribute('readonly', 'readonly'); }
      else amt.removeAttribute('readonly');
    }
    if (dueEl) {
      if (off) {
        dueEl.setAttribute('data-emd-due-kind', dueEl.getAttribute('type') || 'date');
        dueEl.type = 'text';
        dueEl.value = 'N/A';
        dueEl.setAttribute('readonly', 'readonly');
      } else {
        const kind = dueEl.getAttribute('data-emd-due-kind') || 'date';
        if (dueEl.value === 'N/A') dueEl.value = '';
        dueEl.type = kind;
        dueEl.removeAttribute('readonly');
      }
    }
  };
  sel.addEventListener('change', apply);
  apply();
}
