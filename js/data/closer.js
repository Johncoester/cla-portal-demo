/* Closer on an order (MF-011). A dropdown of active CLA staff that also accepts a typed name.
 * The stored name is what people read. closerProfileId is set only when that name is one active staff member.
 * A typed name that is not in the list is kept, with no staff id. Nothing here calls the network. */
import { STAFF_ACCOUNT_ROLES } from './constants.js?v=202611090935';

export const CLOSER_NAME_MAX = 120;
export const CLOSER_STAFF_ROLES = STAFF_ACCOUNT_ROLES;

const clean = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CLOSER_NAME_MAX);
const personName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.replace(/\s+/g, ' ').trim();
const baseLabel = (s) => `${s.name || personName(s)} (${s.role})`;

/* One option per active staff row. Two people with the same name and role get a short id so the list can tell them apart. */
export function closerChoices(staff) {
  const rows = (staff || []).filter((s) => s && s.id && CLOSER_STAFF_ROLES.includes(s.role) && (s.status || 'active') === 'active').map((s) => ({
    id: s.id, role: s.role, name: personName(s),
  })).filter((s) => s.name);
  const counts = new Map();
  for (const s of rows) counts.set(baseLabel(s), (counts.get(baseLabel(s)) || 0) + 1);
  return rows.map((s) => ({ ...s, label: counts.get(baseLabel(s)) > 1 ? `${baseLabel(s)} ${String(s.id).slice(0, 8)}` : baseLabel(s) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* What the box shows. A linked staff member shows their list label so the dropdown matches. A typed name shows as typed. */
export function closerInputValue(current, choices) {
  const id = current && current.closerProfileId;
  const hit = id ? (choices || []).find((c) => c.id === id) : null;
  if (hit) return hit.label;
  return clean(current && current.closerName);
}

/* text is the box. choices are active staff. current is what the file already has, so an inactive person stays linked until the name changes. */
export function resolveCloser(text, choices, current = {}) {
  const raw = clean(text);
  if (!raw) return { closerName: '', closerProfileId: null };
  const list = choices || [];
  const byLabel = list.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  if (byLabel) return { closerName: byLabel.name, closerProfileId: byLabel.id };
  const byName = list.filter((c) => c.name.toLowerCase() === raw.toLowerCase());
  if (byName.length === 1) return { closerName: byName[0].name, closerProfileId: byName[0].id };
  const kept = clean(current.closerName);
  if (current.closerProfileId && kept.toLowerCase() === raw.toLowerCase()) return { closerName: kept, closerProfileId: current.closerProfileId };
  return { closerName: raw, closerProfileId: null };
}
