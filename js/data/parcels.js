/* Parcel IDs on the deal. The first one is also deals.parcel_id so older readers stay correct.
 * There is no parcel lookup in this portal: city, state, ZIP and county come from the typed
 * address and the bundled Census ZIP table. A parcel number is always typed. */
import { cleanParcel } from './address-fill.js?v=202611120900';

const MAX = 12;

export function parcelList(deal) {
  const stored = Array.isArray(deal && deal.parcelIds) ? deal.parcelIds : [];
  const ids = [];
  const push = (raw) => {
    const id = cleanParcel(raw);
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(deal && deal.parcelId);
  stored.forEach(push);
  return ids.length ? ids : [''];
}

export function parcelInput(input = {}) {
  if (Array.isArray(input.parcelIds) && input.parcelIds.length) return parcelPatch(input.parcelIds);
  return parcelPatch([input.parcelId]);
}

export function parcelPatch(list) {
  const ids = [];
  for (const raw of list || []) {
    const id = cleanParcel(raw);
    if (!id || ids.includes(id)) continue;
    if (ids.length >= MAX) throw new Error('A file can have at most 12 parcel IDs.');
    ids.push(id);
  }
  return { parcelId: ids[0] || '', parcelIds: ids };
}
