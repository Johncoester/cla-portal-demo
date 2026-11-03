/* [SUPABASE] CRM methods for supabase-adapter.js (John, Nov 2). Same names / shapes as mock-part-crm.js. NOT run against a hosted project.
 * Two switches must both be on: the browser flag (features.js, CLA_PORTAL_CONFIG.features.crm) and the database switch
 * (private.features 'crm', migration 22). With the browser flag off every method refuses before calling the database. */
import { CRM_OFF } from './features.js?v=202611022019';
import { canUseCrm, crmReadOnly, orderTotals, normTags, crmStageLabel } from './crm.js?v=202611022019';

export function crmSupabase({ sb, ok, camel, me, flags }) {
  const on = () => { if (!flags.crm) throw new Error(CRM_OFF); };
  const rpc = async (n, args) => { on(); return ok(await sb.rpc(n, args || {})); };
  const nameOf = (owners, id) => (owners.find((o) => o.id === id) || {}).name || '';
  let ownersCache = null; const owners = async () => (ownersCache ||= (ok(await sb.rpc('crm_owners')) || []).map((o) => ({ id: o.id, name: o.name, role: o.role })));
  const blank = (v) => (v === '' || v === undefined ? null : v);
  const leadRow = (l, os) => ({ ...camel(l), name: `${l.first_name} ${l.last_name}`.trim(), ownerName: nameOf(os, l.owner_id), converted: !!l.converted_at, archived: !!l.archived_at });
  const contactRow = (c) => ({ ...c, stageLabel: crmStageLabel(c.stage) });
  const acts = async (pairs) => { const rows = []; for (const [e, id] of pairs) rows.push(...(ok(await sb.from('crm_activities').select('*').eq('entity', e).eq('entity_id', id)) || []));
    const os = await owners(); const today = new Date().toISOString().slice(0, 10);
    return camel(rows).map((a) => ({ ...a, ownerName: nameOf(os, a.ownerId), createdByName: nameOf(os, a.createdBy), overdue: a.kind === 'task' && a.status === 'open' && a.dueDate < today }))
      .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))); };
  const leadIn = (v) => { const o = {}; [['firstName', 'first_name'], ['lastName', 'last_name'], ['company', 'company'], ['email', 'email'], ['phone', 'phone'], ['source', 'source'], ['status', 'status'], ['notes', 'notes']]
    .forEach(([k, c]) => { if (v[k] != null) o[c] = String(v[k]).trim(); }); if (v.email != null) o.email = String(v.email).trim().toLowerCase();
    if (v.contactType !== undefined) o.contact_type = blank(v.contactType); if (v.ownerId !== undefined) o.owner_id = blank(v.ownerId); return o; };
  const accIn = (v) => { const o = {}; ['name', 'kind', 'phone', 'website', 'city', 'state', 'notes'].forEach((k) => { if (v[k] != null) o[k] = String(v[k]).trim(); }); if (v.ownerId !== undefined) o.owner_id = blank(v.ownerId); return o; };
  const oppIn = (v) => { const o = {}; if (v.name != null) o.name = String(v.name).trim(); if (v.stage != null) o.stage = v.stage; if (v.notes != null) o.notes = v.notes;
    [['contactId', 'contact_id'], ['accountId', 'account_id'], ['ownerId', 'owner_id'], ['expectedClose', 'expected_close']].forEach(([k, c]) => { if (v[k] !== undefined) o[c] = blank(v[k]); });
    if (v.estVolume !== undefined) o.est_volume = blank(String(v.estVolume).replace(/[$,]/g, '')); return o; };
  return {
    async crmMe() { on(); const u = await me(); if (!canUseCrm(u)) throw new Error('The CRM is for CLA staff only.');
      return { canEdit: !crmReadOnly(u), role: u.role, isAdmin: !!u.isAdmin, id: u.id, scope: u.isAdmin || u.role === 'Processor' ? 'all' : u.role === 'Sales Team' ? 'team' : 'own' }; },
    async listCrmOwners() { on(); return owners(); },
    async listCrmLeads() { on(); const os = await owners(); return (ok(await sb.from('crm_leads').select('*')) || []).map((l) => leadRow(l, os)); },
    async getCrmLead(id) { on(); const os = await owners(); const l = ok(await sb.from('crm_leads').select('*').eq('id', id).maybeSingle()); if (!l) throw new Error('Lead not found.');
      return { ...leadRow(l, os), activities: await acts([['lead', id]]) }; },
    async createCrmLead(v) { on(); const os = await owners(); return leadRow(ok(await sb.from('crm_leads').insert(leadIn(v)).select('*').single()), os); },
    async updateCrmLead(id, v) { on(); const os = await owners(); return leadRow(ok(await sb.from('crm_leads').update(leadIn(v)).eq('id', id).select('*').single()), os); },
    async convertCrmLead(id, opts = {}) { return camel(await rpc('crm_convert_lead', { p_lead: id, p: opts })); },
    async listCrmContacts() { return (await rpc('crm_contact_list')).map(contactRow); },
    async getCrmContact(id) { const c = contactRow(await rpc('crm_contact_detail', { p_id: id })); const pairs = [['contact', id]]; if (c.fromLeadId) pairs.push(['lead', c.fromLeadId]);
      const account = c.accountId ? (await rpc('crm_account_list')).find((a) => a.id === c.accountId) || null : null;
      const opportunities = camel(ok(await sb.from('crm_opportunities').select('*').eq('contact_id', id)) || []);
      return { ...c, account: account && camel(account), totals: orderTotals(c.orders), activities: await acts(pairs), opportunities }; },
    async createCrmContact(v) { const id = await rpc('crm_create_contact', { p: { ...v, tags: normTags(v.tags) } }); return contactRow(await rpc('crm_contact_detail', { p_id: id })); },
    async updateCrmContact(id, v) { const p = { ...v }; if (p.tags !== undefined) p.tags = normTags(p.tags); await rpc('crm_update_contact', { p_id: id, p }); return contactRow(await rpc('crm_contact_detail', { p_id: id })); },
    async listCrmAccounts() { return camel(await rpc('crm_account_list')); },
    async getCrmAccount(id) { const a = camel((await rpc('crm_account_list')).find((x) => x.id === id)); if (!a) throw new Error('Account not found.'); const d = await rpc('crm_account_detail', { p_id: id });
      return { ...a, contactList: d.contactList.map(contactRow), orders: d.orders, totals: orderTotals(d.orders), activities: await acts([['account', id]]),
        opportunities: camel(ok(await sb.from('crm_opportunities').select('*').eq('account_id', id)) || []) }; },
    async createCrmAccount(v) { on(); return camel(ok(await sb.from('crm_accounts').insert(accIn(v)).select('*').single())); },
    async updateCrmAccount(id, v) { on(); return camel(ok(await sb.from('crm_accounts').update(accIn(v)).eq('id', id).select('*').single())); },
    async listCrmOpportunities() { on(); const os = await owners(); return camel(ok(await sb.from('crm_opportunities').select('*, contact:contacts(first_name, last_name), account:crm_accounts(name)')) || [])
      .map((o) => ({ ...o, ownerName: nameOf(os, o.ownerId), contactName: o.contact ? `${o.contact.firstName} ${o.contact.lastName}`.trim() : '', accountName: o.account ? o.account.name : '', archived: !!o.archivedAt })); },
    async createCrmOpportunity(v) { on(); return camel(ok(await sb.from('crm_opportunities').insert(oppIn(v)).select('*').single())); },
    async updateCrmOpportunity(id, v) { on(); return camel(ok(await sb.from('crm_opportunities').update(oppIn(v)).eq('id', id).select('*').single())); },
    async moveCrmOpportunity(id, stage) { on(); return camel(ok(await sb.from('crm_opportunities').update({ stage }).eq('id', id).select('*').single())); },
    async archiveCrmRecord(entity, id, archived = true) { return { ok: true, archived: await rpc('crm_archive', { p_entity: entity, p_id: id, p_archived: archived }) }; },
    async listCrmActivities(entity, id) { on(); return acts([[entity, id]]); },
    async logCrmActivity(v) { on(); const task = v.kind === 'task';
      return camel(ok(await sb.from('crm_activities').insert({ entity: v.entity, entity_id: v.entityId, kind: v.kind, subject: v.subject, body: v.body || '', status: task ? 'open' : 'done',
        due_date: task ? blank(v.dueDate) : null, occurred_on: task ? null : blank(v.occurredOn), owner_id: task ? blank(v.ownerId) : null }).select('*').single())); },
    async updateCrmActivity(id, v) { on(); const o = {}; if (v.status != null) o.status = v.status; if (v.dueDate !== undefined) o.due_date = v.dueDate; if (v.subject != null) o.subject = v.subject; if (v.body != null) o.body = v.body; if (v.ownerId !== undefined) o.owner_id = blank(v.ownerId);
      return camel(ok(await sb.from('crm_activities').update(o).eq('id', id).select('*').single())); },
    async listCrmFollowUps({ ownerId = '', status = 'open' } = {}) {
      const rows = camel(await rpc('crm_follow_ups', { p_owner: ownerId && ownerId !== 'all' ? ownerId : null, p_status: status, p_all: ownerId === 'all' }));
      return rows.map((a) => ({ ...a, parentLink: `#/crm/${a.entity === 'opportunity' ? 'pipeline' : a.entity + 's'}/${a.entity === 'opportunity' ? '' : a.entityId}` })); },
    async crmReport({ from = '', to = '' } = {}) { return rpc('crm_report', { p_from: from || null, p_to: to || null }); },
  };
}
