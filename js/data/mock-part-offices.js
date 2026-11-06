/* OFFICES, mock adapter (mirrors public.offices / public.office_counties, migration 57). John, Nov 4: "In the admin section create a way for us
 * to add offices so we can add them in that show in the scheduling section." Admin > Offices adds, edits, reorders, retires and reactivates.
 * The 5 starting offices are SAMPLE placeholders ("(sample)"); added lazily to stored data (no storage version bump, like the underwriter splits).
 * Rules (same as SQL): CLA staff read, Admins / Super admins write; NO deletes (an office is retired; a county taken off an office keeps its row
 * with removedAt); at most one active main office per state (setting a new one moves the flag); a county is served by one active office at most. */
import { SAMPLE_OFFICES, cleanOffice, canManageOffices, OFFICE_ADMIN_ONLY, officeAddress, officeSort, normCounty, nearestOffice, OFFICE_LOCATION } from './offices.js?v=202611060013';
const SEED_AT = '2026-11-04T12:00:00Z';
export function ensureOffices(d) {
  if (!Array.isArray(d.offices)) d.offices = SAMPLE_OFFICES.map(({ counties, ...o }) => ({ ...o, active: true, createdAt: SEED_AT, createdBy: null, updatedAt: SEED_AT, updatedBy: null }));
  if (!Array.isArray(d.officeCounties)) d.officeCounties = SAMPLE_OFFICES.flatMap((o) => o.counties.map((c) => ({ officeId: o.id, state: c.state, county: c.county, addedAt: SEED_AT, addedBy: null, removedAt: null, removedBy: null })));
  return d;
}
// the office records with their current counties (pure over the stored data)
export function officeRows(d) { ensureOffices(d);
  return d.offices.map((o) => ({ ...o, counties: d.officeCounties.filter((c) => c.officeId === o.id && !c.removedAt).map((c) => ({ state: c.state, county: c.county })).sort((a, b) => a.county.localeCompare(b.county)) })).sort(officeSort); }
export const officeById = (d, id) => (ensureOffices(d).offices.find((o) => o.id === id) || null);
export const officeNameOf = (d, id) => (id ? (officeById(d, id) || {}).name || '' : '');
export function officesPart({ load, save, needUser, nid, now, fail, nameOf, isStaffView }) {
  const db = () => ensureOffices(load());
  const admin = () => { const u = needUser(); if (!canManageOffices(u)) fail(OFFICE_ADMIN_ONLY); return u; };
  const view = (o) => ({ ...o, address: officeAddress(o), createdByName: o.createdBy ? nameOf(o.createdBy) : 'Sample data', updatedByName: o.updatedBy ? nameOf(o.updatedBy) : 'Sample data',
    countyText: o.counties.map((c) => c.county).join(', ') });
  const rows = () => officeRows(db());
  const one = (id) => rows().find((o) => o.id === id) || fail('Office not found.');
  const clean = (input) => { try { return cleanOffice(input); } catch (e) { return fail(e.message); } };
  // a county can be served by one ACTIVE office only
  const countyClash = (officeId, counties) => { const live = rows().filter((o) => o.active && o.id !== officeId);
    const hits = counties.map((c) => { const by = live.find((o) => o.counties.some((z) => z.state === c.state && normCounty(z.county) === normCounty(c.county))); return by ? `${c.county} (${c.state}) is already served by ${by.name}` : null; }).filter(Boolean);
    if (hits.length) fail(`${hits.join('; ')}. Take it off that office first.`); };
  // set the office's counties: new rows for added ones, removedAt on dropped ones, a re-added county gets its row back (never deleted)
  const setCounties = (d, officeId, counties, u) => { const t = now();
    const cur = d.officeCounties.filter((c) => c.officeId === officeId);
    cur.forEach((c) => { const keep = counties.some((z) => z.state === c.state && normCounty(z.county) === normCounty(c.county));
      if (!keep && !c.removedAt) { c.removedAt = t; c.removedBy = u.id; } if (keep && c.removedAt) { c.removedAt = null; c.removedBy = null; c.addedAt = t; c.addedBy = u.id; } });
    counties.forEach((z) => { if (!cur.some((c) => c.state === z.state && normCounty(c.county) === normCounty(z.county))) d.officeCounties.push({ officeId, state: z.state, county: z.county, addedAt: t, addedBy: u.id, removedAt: null, removedBy: null }); }); };
  // one active main office per state: making this one main clears the others (returns their names for the message)
  const moveMain = (d, o, u) => { if (!o.isMainOfficeForState || !o.active) return [];
    return d.offices.filter((z) => z.id !== o.id && z.state === o.state && z.active && z.isMainOfficeForState).map((z) => { z.isMainOfficeForState = false; z.updatedAt = now(); z.updatedBy = u.id; return z.name; }); };
  return {
    // Admin > Offices (and any CLA staff, read only). Retired offices are listed too (marked), for the admin page.
    async listOffices({ includeRetired = true } = {}) { const u = needUser(); if (!isStaffView(u)) fail('The office list is for CLA staff.');
      const list = rows().filter((o) => includeRetired || o.active).map(view);
      return { offices: list, canEdit: canManageOffices(u) }; },
    async getOffice(id) { const u = needUser(); if (!isStaffView(u)) fail('The office list is for CLA staff.'); return view(one(id)); },
    async createOffice(input = {}) { const u = admin(); const v = clean(input); countyClash(null, v.counties); const d = db();
      if (d.offices.some((o) => o.active && o.name.toLowerCase() === v.name.toLowerCase())) fail('An active office already has that name.');
      const t = now(); const { counties, ...rec } = v;
      const o = { id: nid('off'), ...rec, active: true, sortOrder: Math.max(0, ...d.offices.map((z) => z.sortOrder || 0)) + 1, createdAt: t, createdBy: u.id, updatedAt: t, updatedBy: u.id };
      d.offices.push(o); setCounties(d, o.id, counties, u); const moved = moveMain(d, o, u);
      save(); return { ...view(one(o.id)), mainMovedFrom: moved }; },
    async updateOffice(id, input = {}) { const u = admin(); const d = db(); const o = officeById(d, id) || fail('Office not found.');
      const v = clean(input); if (o.active) countyClash(id, v.counties);
      if (d.offices.some((z) => z.id !== id && z.active && z.name.toLowerCase() === v.name.toLowerCase())) fail('An active office already has that name.');
      const { counties, ...rec } = v; Object.assign(o, rec, { updatedAt: now(), updatedBy: u.id }); setCounties(d, id, counties, u); const moved = moveMain(d, o, u);
      save(); return { ...view(one(id)), mainMovedFrom: moved }; },
    // retire (active = false) or reactivate. Never deleted. A retired office stays on closings that already use it.
    async setOfficeActive(id, active) { const u = admin(); const d = db(); const o = officeById(d, id) || fail('Office not found.'); const on = !!active;
      if (o.active === on) return view(one(id));
      let note = '';
      if (on) { countyClash(id, one(id).counties);
        if (o.isMainOfficeForState && d.offices.some((z) => z.id !== id && z.active && z.state === o.state && z.isMainOfficeForState)) { o.isMainOfficeForState = false; note = `Another office is already the ${o.state} main office, so this one was reactivated as a regular office.`; } }
      o.active = on; o.updatedAt = now(); o.updatedBy = u.id; save(); return { ...view(one(id)), note }; },
    // the order on the closing picker and the Offices page: ids in the new order (every office, retired too)
    async reorderOffices(ids = []) { const u = admin(); const d = db(); const list = [...new Set((ids || []).map(String))];
      if (list.length !== d.offices.length || !list.every((id) => d.offices.some((o) => o.id === id))) fail('Send every office once, in the new order.');
      list.forEach((id, i) => { const o = officeById(d, id); if (o.sortOrder !== i + 1) { o.sortOrder = i + 1; o.updatedAt = now(); o.updatedBy = u.id; } });
      save(); return rows().map(view); },
  };
}
// the closing picker's data for one deal (used by mock-part-matt.js): the ACTIVE offices + the nearest one; currentIds = offices already on this
// deal's closing / proposals (shown by name even when retired, never offered as a new pick)
export function closingOfficeChoices(d, deal) {
  const all = officeRows(d); const live = all.filter((o) => o.active);
  return { offices: live.map((o) => ({ id: o.id, name: o.name, address: officeAddress(o), state: o.state, isMainOfficeForState: !!o.isMainOfficeForState, stateDefault: !!o.isMainOfficeForState,
    counties: o.counties })), ...nearestOffice(deal, live), officeLocation: OFFICE_LOCATION };
}
