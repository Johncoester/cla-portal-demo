import { tidyPersonName } from './place-order.js?v=202611247700';
/* MF-065 (Matt Landsberg, Nov 25 2026: "Have list of pre-processor options in a dropdown").
 * The Preprocessor dropdown on Place Order and on Edit order details lists every ACTIVE staff login whose
 * portal role is Preprocessor. It is not a fixed list of names: when an Admin gives another login that role,
 * the person shows up here (Refresh list picks them up without clearing the form).
 * Labels follow the other staff pickers: "Name (Role) — email". No network. */
export const PREPROCESSOR_ROLE = 'Preprocessor';
export const NO_PREPROCESSOR_HOWTO = 'An Admin can give a staff login the Preprocessor role under Users. The person then appears after Refresh list.';
export const NO_PREPROCESSOR_HINT = `No preprocessor is available for this login. ${NO_PREPROCESSOR_HOWTO}`;

export function preprocessorLabel(p) {
  const names = tidyPersonName(p);
  const email = p && p.email ? ` \u2014 ${p.email}` : '';
  return `${names.name || 'Preprocessor'} (${PREPROCESSOR_ROLE})${email}`;
}

/* list: rows from api.listPreprocessors(). keepId / keepName: the person already on the file.
 * A person who is already on the file stays selectable even if they are no longer an active Preprocessor, so opening
 * and saving the order does not silently clear them. (none) is a real choice and clears the assignment. */
export function preprocessorChoices(list, keepId, keepName) {
  const options = [{ value: '', label: '(none)' }];
  const seen = new Set();
  for (const p of list || []) {
    if (!p || !p.id || seen.has(p.id)) continue;
    if (p.role && p.role !== PREPROCESSOR_ROLE) continue;
    if (p.status && p.status !== 'active') continue;
    seen.add(p.id);
    options.push({ value: p.id, label: preprocessorLabel(p) });
  }
  const available = options.length - 1;
  const keep = keepId == null ? '' : String(keepId);
  let kept = false;
  if (keep && !seen.has(keep)) {
    options.push({ value: keep, label: `${String(keepName || '').trim() || 'Current Preprocessor'} (no longer an active Preprocessor)` });
    kept = true;
  }
  return { options, value: keep, kept, available, empty: available === 0 };
}

/* Repaint a <select> from preprocessorChoices(). Keeps the picked value when that person is still listed (or kept on the file). */
export function paintPreprocessorSelect(sel, choices, hint) {
  const want = sel.value || choices.value || '';
  sel.replaceChildren();
  for (const o of choices.options) { const opt = sel.ownerDocument.createElement('option'); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); }
  const stillThere = choices.options.some((o) => o.value === want);
  sel.value = stillThere ? want : '';
  if (hint) hint.hidden = !choices.empty;
  return { dropped: !!want && !stillThere };
}
