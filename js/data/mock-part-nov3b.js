/* mock adapter: Matt Landsberg's Nov 3 (b) Processor notes. FAKE DATA ONLY.
 *  - listSourceOptions: the "Source of business" choices for Place Order / Edit order = the CRM Settings "Lead Source" pick list (Admin-editable on
 *    CRM -> Settings: add, rename, reorder, retire). Active options only; a retired value already on an order is still shown there by the screen.
 *    Readable by anyone who places or edits orders (Processor, Admin, Super admin), even when the CRM feature itself is switched off.
 * Order fields (sourceOfBusiness, lenderPhone / lenderEmail at placement) and buyer / seller entities live in createDeal / updateDeal / addParticipant.
 * Mirrored in SQL by public.source_of_business_options() (migration 31). */
import { ensureSettings, activeOptions, optionsOf } from './crm-config.js?v=202611061842';
import { parseReferral } from './place-order.js?v=202611061842';
import { ENTITY_TYPES, entityPrefill } from './templates.js?v=202611061842';

export const sourceOptionsOf = (d) => activeOptions(ensureSettings(JSON.parse(JSON.stringify(d.crmSettings || null))), 'leadSource').map((o) => ({ value: o.value, label: o.label }));
// a source value is OK when blank, unchanged, or an ACTIVE Lead Source option; returns the stored value
export function checkSource(d, v, current, fail) {
  const s = String(v == null ? '' : v).trim(); if (!s || s === (current || '')) return s;
  if (parseReferral(s)) return s;
  const all = optionsOf(ensureSettings(JSON.parse(JSON.stringify(d.crmSettings || null))), 'leadSource');
  const o = all.find((z) => z.value === s) || all.find((z) => z.label.toLowerCase() === s.toLowerCase());
  if (!o || o.retired) fail('Source of business: pick one from the list.'); return o.value;
}
// A buyer / seller who is an ENTITY (Place Order "+ Add entity" on that row): entity name (required), type, and the Entity Representative
// (name, title or role, phone xxx-xxx-xxxx, email). null / {} / no name = not an entity. Only Client-Buyer / Client-Seller rows carry one.
export const ENTITY_ROLES = ['Client-Buyer', 'Client-Seller'];
export function cleanEntity(e, role, { fail, str, emailOk, phone }) {
  if (e == null || e === '' || (typeof e === 'object' && !Object.values(e).some((v) => String(v == null ? '' : v).trim()))) return null;
  if (typeof e !== 'object') fail('Entity details are not valid.');
  if (!ENTITY_ROLES.includes(role)) fail('Only a buyer or a seller can be an entity.');
  const name = str(e.name, 200) || fail('Entity name is required (or remove the entity).'); const type = str(e.type, 40);
  if (type && !ENTITY_TYPES.includes(type)) fail('Entity type: pick one from the list.');
  const repEmail = str(e.repEmail, 200).toLowerCase(); if (repEmail && !emailOk(repEmail)) fail("Entity Representative's email is not valid.");
  return { name, type, repName: str(e.repName, 120), repTitle: str(e.repTitle, 120), repPhone: phone(e.repPhone, "Entity Representative's phone"), repEmail };
}
export function mattNov3b(x) {
  const { load, save, needUser, needProcessor, log, fullName, clone, fail, C } = x;
  return {
    async listSourceOptions() { const u = needUser(); if (!(u.isAdmin || C.runsOrders(u))) fail('Only a Processor or Admin can place orders.'); return sourceOptionsOf(load()); },
    // Processor / Admin: set, change or clear (null) the entity on a buyer / seller row of an order. Answers already saved on intake forms are not changed;
    // an untouched Personal information copy (nothing saved yet) gets the entity pre-filled, like at placement.
    async setParticipantEntity(dealId, participantId, entity) {
      const u = needProcessor(); const d = load(); d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      const p = d.participants.find((z) => z.id === participantId && z.dealId === dealId) || fail('Participant not found.');
      p.entity = cleanEntity(entity, p.role, x); const c = d.contacts.find((z) => z.id === p.contactId);
      if (p.entity) d.tasks.filter((t) => t.participantId === p.id && t.kind === 'form' && t.status === 'todo' && !t.savedAt && !Object.keys(t.formData || {}).length).forEach((t) => {
        const tp = d.taskTemplates.find((z) => z.id === t.templateId); const pre = tp && entityPrefill(p.entity, tp.fields); if (pre) t.formData = pre; });
      log(dealId, u.id, 'participant.entity', 'contact', p.contactId, p.entity ? `${c ? fullName(c) : 'Participant'} (${p.role}) is the entity ${p.entity.name}` : `${c ? fullName(c) : 'Participant'} (${p.role}): entity removed`);
      save(); return clone(p.entity);
    },
  };
}
