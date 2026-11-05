/* [SUPABASE] Admin > Offices + the closing office picker (migration 57). Same names / shapes as mock-part-offices.js. NOT run against a hosted
 * project (best effort; the mock adapter and the SQL tests are the tested parts).
 *  - public.offices / public.office_counties: CLA staff read; writes go through save_office / set_office_active / reorder_offices (Admin, Super admin).
 *  - public.closing_office_choices(deal) + closing_office_default(deal): the picker for anyone on the order (active offices + a retired one in use). */
import { OFFICE_LOCATION, officeAddress, canManageOffices, cleanOffice } from './offices.js?v=202611051418';
const row = (o, counties) => ({ id: o.id, name: o.name, addressLine1: o.address_line1, addressLine2: o.address_line2 || '', city: o.city, state: o.state, zip: o.zip,
  phone: o.main_phone || '', email: o.email || '', isMainOfficeForState: !!o.is_main_office_for_state, active: !!o.active, sortOrder: o.sort_order,
  createdAt: o.created_at, createdBy: o.created_by, updatedAt: o.updated_at, updatedBy: o.updated_by, updatedByName: o.updated_by ? 'an Admin' : 'Sample data',
  counties: counties.filter((c) => c.office_id === o.id && !c.removed_at).map((c) => ({ state: c.state, county: c.county })).sort((a, b) => a.county.localeCompare(b.county)) });
export function officesSupabase({ sb, ok, me }, base = {}) {
  const view = (o) => ({ ...o, address: officeAddress(o), countyText: o.counties.map((c) => c.county).join(', ') });
  const all = async () => { const offices = ok(await sb.from('offices').select('*').order('sort_order')) || []; const counties = ok(await sb.from('office_counties').select('*')) || [];
    return offices.map((o) => view(row(o, counties))); };
  const save = async (id, input) => { const v = cleanOffice(input);
    const newId = ok(await sb.rpc('save_office', { p_id: id, p_name: v.name, p_address_line1: v.addressLine1, p_address_line2: v.addressLine2, p_city: v.city, p_state: v.state, p_zip: v.zip,
      p_main_phone: v.phone, p_email: v.email || null, p_is_main: v.isMainOfficeForState, p_counties: v.counties.map((c) => c.county) }));
    return { ...(await all()).find((o) => o.id === newId), mainMovedFrom: [] }; };
  const choices = async (dealId) => ok(await sb.rpc('closing_office_choices', { p_deal: dealId })) || [];
  return {
    async listOffices({ includeRetired = true } = {}) { const u = await me(); const list = await all(); return { offices: list.filter((o) => includeRetired || o.active), canEdit: canManageOffices(u) }; },
    async getOffice(id) { return (await all()).find((o) => o.id === id) || null; },
    async createOffice(input) { return save(null, input); },
    async updateOffice(id, input) { return save(id, input); },
    async setOfficeActive(id, active) { ok(await sb.rpc('set_office_active', { p_id: id, p_active: !!active })); return { ...(await all()).find((o) => o.id === id), note: '' }; },
    async reorderOffices(ids) { ok(await sb.rpc('reorder_offices', { p_ids: ids })); return all(); },
    async getClosingOfficeDefault(dealId) {
      const list = (await choices(dealId)).filter((o) => o.pickable).map((o) => ({ id: o.id, name: o.name, address: o.address, state: o.state, isMainOfficeForState: o.is_main_office_for_state, stateDefault: o.is_main_office_for_state }));
      const d = (ok(await sb.rpc('closing_office_default', { p_deal: dealId })) || [])[0] || {};
      return { offices: list, officeId: d.office_id || null, reason: d.reason || 'none', text: d.office_name || 'No CLA office near this property: pick one.', officeLocation: OFFICE_LOCATION };
    },
    // proposals name their office (a retired one too)
    async listClosingProposals(dealId) { const list = base.listClosingProposals ? await base.listClosingProposals(dealId) : [];
      const names = Object.fromEntries((await choices(dealId)).map((o) => [o.id, o]));
      return list.map((p) => ({ ...p, officeName: p.officeId && names[p.officeId] ? names[p.officeId].name : '', officeRetired: !!(p.officeId && names[p.officeId] && !names[p.officeId].active) })); },
  };
}
