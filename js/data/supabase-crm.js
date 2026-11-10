/* [SUPABASE] CRM methods for supabase-adapter.js (John, Nov 2; Zoho-style update with migration 24; CRM Settings + custom fields with migration 25). Same names / shapes as mock-part-crm.js.
 * NOT run against a hosted project (best effort; the mock adapter is the tested one). Two switches must both be on: the browser flag
 * (features.js, CLA_PORTAL_CONFIG.features.crm, OFF in supabase mode) and the database switch (private.features 'crm', migration 22).
 * With the browser flag off every method refuses before calling the database. Meetings never send invitations; nothing is emailed. */
import { CRM_OFF } from './features.js?v=202611070139';
import { canUseCrm, crmReadOnly, orderTotals, normTags, crmStageLabel, LINK_KEYS, taskOpen, meetingOpen, localStamp, entityLabel, TASK_CLOSED } from './crm.js?v=202611070139';
import { localDate, runsOrders as runsOrdersCI } from './constants.js?v=202611101015';
import { ensureSettings, activeFields, cleanCustomValue, cleanLabel, gatherCustom } from './crm-config.js?v=202611070139';
import { crmTemplatesSupabase } from './supabase-crm-templates.js?v=202611101015';
import { crmCallsSupabase } from './supabase-crm-calls.js?v=202611070139';
import { withDealName } from './crm-columns.js?v=202611102745';
import { crmJanineSupabase } from './supabase-crm-janine.js?v=202611102745';
import { crmSurfaceSupabase } from './supabase-crm-surface.js?v=202611102745';

export function crmSupabase({ sb, ok, camel, me, flags }) {
  const on = () => { if (!flags.crm) throw new Error(CRM_OFF); };
  const rpc = async (n, args) => { on(); return ok(await sb.rpc(n, args || {})); };
  const nameOf = (people, id) => (people.find((o) => o.id === id) || {}).name || '';
  let ownersCache = null; const owners = async () => (ownersCache ||= (ok(await sb.rpc('crm_owners')) || []).map((o) => ({ id: o.id, name: o.name, role: o.role })));
  let staffCache = null; const staff = async () => (staffCache ||= (ok(await sb.rpc('crm_assignees')) || []).map((o) => ({ id: o.id, name: o.name, role: o.role })));
  const blank = (v) => (v === '' || v === undefined ? null : v);
  const num = (v) => (v == null || String(v).trim() === '' ? null : String(v).replace(/[$,\s%]/g, ''));
  const linksIn = (v) => { const l = {}; LINK_KEYS.forEach((k) => { const x = v.links && v.links[k] !== undefined ? v.links[k] : v['links.' + k]; if (x != null && String(x).trim()) l[k] = String(x).trim(); }); return l; };
  const hasLinks = (v) => !!v.links || LINK_KEYS.some((k) => v['links.' + k] !== undefined);
  // person (Zoho) fields: screen names -> lead columns (the client RPCs take the screen names directly)
  const PERSON = [['roleInCompany', 'role_in_company'], ['title', 'title'], ['mobile', 'mobile'], ['assistant', 'assistant'], ['asstPhone', 'asst_phone'], ['licenseNo', 'license_no'],
    ['zillowUrl', 'zillow_url'], ['street', 'crm_street'], ['city', 'crm_city'], ['state', 'crm_state'], ['zip', 'crm_zip'], ['county', 'crm_county']];
  const personOut = (r) => ({ roleInCompany: r.role_in_company || '', title: r.title || '', mobile: r.mobile || '', assistant: r.assistant || '', asstPhone: r.asst_phone || '',
    agentSplit: r.agent_split == null ? null : Number(r.agent_split), licenseNo: r.license_no || '', salesVolumeLastYear: r.sales_volume_last_year == null ? null : Number(r.sales_volume_last_year),
    dealsClosedLastYear: r.deals_closed_last_year, zillowUrl: r.zillow_url || '', street: r.crm_street || '', city: r.crm_city || '', state: r.crm_state || '', zip: r.crm_zip || '', county: r.crm_county || '', links: r.links || {} });
  const leadRow = (l, os) => ({ ...camel(l), ...personOut(l), name: `${l.first_name} ${l.last_name}`.trim(), ownerName: nameOf(os, l.owner_id), converted: !!l.converted_at, archived: !!l.archived_at,
    leadSource: l.source, relationshipStatus: l.status, description: l.notes, accountId: l.account_id || null, accountName: l.account_id ? l.company : '', companyText: l.account_id ? '' : l.company });
  const contactRow = (c) => ({ ...c, stageLabel: crmStageLabel(c.stage) });
  const linkOf = (e, id) => (e === 'opportunity' ? '#/crm/pipeline' : `#/crm/${e === 'lead' ? 'leads' : e === 'contact' ? 'contacts' : 'accounts'}/${id}`);
  const actOut = (a, ppl) => { const now = localStamp(); const r = camel(a);
    return { ...r, ownerName: nameOf(ppl, r.ownerId), createdByName: nameOf(ppl, r.createdBy), modifiedByName: nameOf(ppl, r.modifiedBy), hostName: nameOf(ppl, r.hostId),
      startsAt: r.startsAt ? String(r.startsAt).slice(0, r.allDay ? 10 : 16) : null, endsAt: r.endsAt ? String(r.endsAt).slice(0, r.allDay ? 10 : 16) : null,
      reminderAt: r.reminderAt ? String(r.reminderAt).slice(0, 16) : null, parentLabel: entityLabel(r.entity), parentLink: linkOf(r.entity, r.entityId),
      open: r.kind === 'task' ? taskOpen(r) : r.kind === 'meeting' ? meetingOpen({ ...r, startsAt: String(r.startsAt || '').slice(0, 16), endsAt: String(r.endsAt || '').slice(0, 16) }, now) : false,
      overdue: r.kind === 'task' && taskOpen(r) && !!r.dueDate && r.dueDate < localDate(), reminderDue: r.kind === 'task' && taskOpen(r) && !!r.reminder && !!r.reminderAt && String(r.reminderAt).slice(0, 16) <= now,
      participants: (r.participants || []).map((p) => { const [type, id] = p.split(':'); return { key: p, type, id, name: type === 'user' ? nameOf(ppl, id) : '', label: type === 'user' ? 'User' : entityLabel(type), link: type === 'user' ? '' : linkOf(type, id) }; }) }; };
  const acts = async (pairs) => { const rows = []; for (const [e, id] of pairs) rows.push(...(ok(await sb.from('crm_activities').select('*').eq('entity', e).eq('entity_id', id)) || []));
    const ppl = await staff(); return rows.map((a) => actOut(a, ppl)).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))); };
  const files = async (pairs) => { const rows = []; for (const [e, id] of pairs) rows.push(...(ok(await sb.from('crm_attachments').select('id, entity, entity_id, name, mime_type, size, uploaded_by, created_at').eq('entity', e).eq('entity_id', id)) || []));
    const ppl = await staff(); return camel(rows).map((f) => ({ ...f, uploadedByName: nameOf(ppl, f.uploadedBy) })); };
  const invited = async (e, id) => { const ppl = await staff(); return (await rpc('crm_invited_meetings', { p_entity: e, p_id: id })).map((a) => actOut(a, ppl)); };
  const leadIn = (v) => { const o = {}; [['firstName', 'first_name'], ['lastName', 'last_name'], ['company', 'company'], ['email', 'email'], ['phone', 'phone'], ...PERSON]
    .forEach(([k, c]) => { if (v[k] != null) o[c] = String(v[k]).trim(); }); if (v.email != null) o.email = String(v.email).trim().toLowerCase(); if (o.crm_state) o.crm_state = o.crm_state.toUpperCase();
    const src = v.leadSource !== undefined ? v.leadSource : v.source; if (src != null) o.source = src; const st = v.relationshipStatus !== undefined ? v.relationshipStatus : v.status; if (st != null) o.status = st;
    const d = v.description !== undefined ? v.description : v.notes; if (d != null) o.notes = d;
    if (v.agentSplit !== undefined) o.agent_split = num(v.agentSplit); if (v.salesVolumeLastYear !== undefined) o.sales_volume_last_year = num(v.salesVolumeLastYear);
    if (v.dealsClosedLastYear !== undefined) o.deals_closed_last_year = num(v.dealsClosedLastYear); if (hasLinks(v)) o.links = linksIn(v);
    if (v.contactType !== undefined) o.contact_type = blank(v.contactType); if (v.ownerId !== undefined) o.owner_id = blank(v.ownerId);
    if (v.accountId !== undefined) { o.account_id = blank(v.accountId); delete o.company; }   // Janine, Nov 3: Company lookup (migration 37 sets the name)
    if (v.zillowUrl !== undefined && hasLinks(v) && !o.links.zillowProfile && o.zillow_url) o.links.zillowProfile = o.zillow_url; return o; };
  const contactIn = (v) => { const p = {}; Object.entries(v).forEach(([k, x]) => { if (!k.startsWith('links.')) p[k] = x; }); if (hasLinks(v)) p.links = linksIn(v); if (p.tags !== undefined) p.tags = normTags(p.tags); return p; };
  const accIn = (v) => { const o = {}; ['name', 'kind', 'phone', 'website', 'city', 'state', 'notes'].forEach((k) => { if (v[k] != null) o[k] = String(v[k]).trim(); }); if (v.ownerId !== undefined) o.owner_id = blank(v.ownerId); return o; };
  const oppIn = (v) => { const o = {}; if (v.name != null) o.name = String(v.name).trim(); if (v.stage != null) o.stage = v.stage; if (v.notes != null) o.notes = v.notes;
    [['contactId', 'contact_id'], ['accountId', 'account_id'], ['ownerId', 'owner_id'], ['expectedClose', 'expected_close']].forEach(([k, c]) => { if (v[k] !== undefined) o[c] = blank(v[k]); });
    if (v.estVolume !== undefined) o.est_volume = blank(String(v.estVolume).replace(/[$,]/g, '')); return o; };
  const yes = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
  const taskIn = (v, create) => { const o = {}; if (v.subject != null) o.subject = String(v.subject).trim(); if (v.dueDate !== undefined) o.due_date = blank(v.dueDate);
    if (v.status != null) o.status = v.status; if (v.priority != null) o.priority = v.priority; const d = v.description !== undefined ? v.description : v.body; if (d != null) o.body = d;
    if (v.ownerId !== undefined) o.owner_id = blank(v.ownerId);
    if (create || v.reminder !== undefined) { o.reminder = yes(v.reminder); o.reminder_at = o.reminder ? blank(v.reminderAt) : null; }
    if (create || v.repeat !== undefined || v.repeatEvery !== undefined) { const r = v.repeat !== undefined ? yes(v.repeat) : !!v.repeatEvery; o.repeat_every = r ? v.repeatEvery || 'weekly' : ''; o.repeat_until = r ? blank(v.repeatUntil) : null; }
    return o; };
  const meetingIn = (v, create) => { const o = {}; const t = v.title !== undefined ? v.title : v.subject; if (t != null) o.subject = String(t).trim(); if (v.location != null) o.location = v.location;
    if (create || v.allDay !== undefined) o.all_day = yes(v.allDay); if (v.from !== undefined) o.starts_at = blank(v.from); if (v.to !== undefined) o.ends_at = blank(v.to);
    if (v.meetingType != null) o.meeting_type = v.meetingType; if (v.hostId !== undefined) o.host_id = blank(v.hostId); const d = v.description !== undefined ? v.description : v.body; if (d != null) o.body = d;
    if (v.participants !== undefined) o.participants = (Array.isArray(v.participants) ? v.participants : String(v.participants || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
    return o; };
  const one = async (q) => ok(await q.select('*').single());
  // TEST CRM tables have no last-activity column. List filters still offer Last Activity Time, filled from crm_activities.
  const withActivity = async (rows, entity) => {
    const ids = (rows || []).map((r) => r && r.id).filter(Boolean);
    const best = new Map();
    if (ids.length) {
      try {
        const acts = ok(await sb.from('crm_activities').select('entity_id,occurred_on,created_at').eq('entity', entity).in('entity_id', ids)) || [];
        acts.forEach((a) => { const stamp = a.occurred_on || a.created_at || ''; const prev = best.get(a.entity_id) || ''; if (String(stamp) > String(prev)) best.set(a.entity_id, stamp); });
      } catch { /* a missing activities read leaves the filter blank, not broken */ }
    }
    return (rows || []).map((r) => ({ ...r, lastActivityAt: best.get(r.id) || r.lastActivityAt || null }));
  };
  // ---------- CRM Settings (migration 25) ----------
  const settingsRaw = async () => ensureSettings(await rpc('crm_settings'));
  // custom values from a form ({custom: {...}} and / or 'cf.<id>' keys), cleaned like the mock; the database checks them again
  const customIn = async (entity, v) => { const given = gatherCustom(v); if (!Object.keys(given).length) return null;
    const out = {}; activeFields(await settingsRaw(), entity).forEach((f) => { if (Object.prototype.hasOwnProperty.call(given, f.id)) out[f.id] = cleanCustomValue(f, given[f.id]); }); return out; };
  const withCustom = async (entity, o, v) => { const c = await customIn(entity, v); if (c) o.custom = c; return o; };
  const noCf = (v) => { const o = {}; Object.entries(v).forEach(([k, x]) => { if (!k.startsWith('cf.')) o[k] = x; }); return o; };
  const opts = async (key) => ok(await sb.from('crm_picklist_options').select('*').eq('list_key', key).order('position')) || [];   // a list key or 'cf:<field id>'
  const optOut = (o) => ({ value: o.value, label: o.label, retired: !!o.retired });
  const swap = async (table, rows, i, j, match) => { if (i < 0 || j < 0 || j >= rows.length) return;
    const a = rows[i].position; let b = rows[j].position; if (a === b) b += 1;
    ok(await match(sb.from(table).update({ position: b }), rows[i])); ok(await match(sb.from(table).update({ position: a }), rows[j])); };
  const fieldRow = (f) => ({ id: f.id, entity: f.entity, label: f.label, type: f.type, required: f.required, section: f.section, position: f.position, showInList: f.show_in_list, archivedAt: f.archived_at });
  const api = {
    async getCrmSettings() { return settingsRaw(); },
    async addCrmOption(key, label) { on(); const l = cleanLabel(label, 'The option'); const list = await opts(key);
      const same = list.find((o) => o.label.toLowerCase() === l.toLowerCase());
      if (same) { if (!same.retired) throw new Error(`"${same.label}" is already in the list.`); return optOut(await one(sb.from('crm_picklist_options').update({ retired: false }).eq('list_key', key).eq('value', same.value))); }
      let value = l; let n = 2; while (list.some((o) => o.value === value)) value = `${l} #${n++}`;
      return optOut(await one(sb.from('crm_picklist_options').insert({ list_key: key, value, label: l }))); },
    async renameCrmOption(key, value, label) { on(); return optOut(await one(sb.from('crm_picklist_options').update({ label: cleanLabel(label, 'The option') }).eq('list_key', key).eq('value', value))); },
    async retireCrmOption(key, value, retired = true) { on(); return optOut(await one(sb.from('crm_picklist_options').update({ retired: !!retired }).eq('list_key', key).eq('value', value))); },
    async moveCrmOption(key, value, to) { on(); const list = await opts(key); const i = list.findIndex((o) => o.value === value);
      await swap('crm_picklist_options', list, i, to === 'up' ? i - 1 : i + 1, (q, r) => q.eq('list_key', key).eq('value', r.value)); return (await opts(key)).map(optOut); },
    async createCrmField(v = {}) { const options = Array.isArray(v.options) ? v.options : String(v.options || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const id = await rpc('crm_create_field', { p: { entity: v.entity, label: v.label, type: v.type, required: v.required === true || v.required === 'on' || v.required === '1', section: v.section || '',
        showInList: v.showInList === undefined ? true : v.showInList === true || v.showInList === 'on' || v.showInList === '1', options } });
      return fieldRow(ok(await sb.from('crm_custom_fields').select('*').eq('id', id).single())); },
    async updateCrmField(id, v = {}) { on(); const o = {}; if (v.label !== undefined) o.label = cleanLabel(v.label, 'The field'); if (v.required !== undefined) o.required = v.required === true || v.required === 'on' || v.required === '1';
      if (v.section !== undefined) o.section = v.section; if (v.showInList !== undefined) o.show_in_list = v.showInList === true || v.showInList === 'on' || v.showInList === '1';
      if (v.type !== undefined) o.type = v.type; return fieldRow(await one(sb.from('crm_custom_fields').update(o).eq('id', id))); },
    async archiveCrmField(id, archived = true) { on(); return fieldRow(await one(sb.from('crm_custom_fields').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id))); },
    async moveCrmField(id, to) { on(); const f = ok(await sb.from('crm_custom_fields').select('*').eq('id', id).single());
      const list = ok(await sb.from('crm_custom_fields').select('*').eq('entity', f.entity).is('archived_at', null).order('position')) || []; const i = list.findIndex((z) => z.id === id);
      await swap('crm_custom_fields', list, i, to === 'up' ? i - 1 : i + 1, (q, r) => q.eq('id', r.id)); return fieldRow(f); },
    async setCrmBuiltinField(scope, key, v = {}) { on(); const o = {}; if (v.hidden !== undefined) o.hidden = !!v.hidden && v.hidden !== '0'; if (v.required !== undefined) o.required = !!v.required && v.required !== '0';
      const r = await one(sb.from('crm_field_settings').update(o).eq('scope', scope).eq('key', key)); return { hidden: r.hidden, required: r.required }; },
    async crmMe() { on(); const u = await me(); if (!canUseCrm(u)) throw new Error('The CRM is for CLA staff only.');
      return { email: u.email || '', canEdit: !crmReadOnly(u), canConfigure: !!u.isAdmin, role: u.role, isAdmin: !!u.isAdmin, id: u.id, name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(), scope: u.isAdmin || runsOrdersCI(u) ? 'all' : u.role === 'Sales Team' ? 'team' : 'own' }; },
    async listCrmOwners() { on(); return owners(); },
    async listCrmAssignees() { on(); return staff(); },
    async listCrmUsers() { on(); return staff(); },   // participants: the CLA staff the caller can pick (other users can be added by an Admin later)
    async listCrmLeads() { on(); const os = await owners(); return withActivity((ok(await sb.from('crm_leads').select('*')) || []).map((l) => leadRow(l, os)), 'lead'); },
    async getCrmLead(id) { on(); const os = await owners(); const l = ok(await sb.from('crm_leads').select('*').eq('id', id).maybeSingle()); if (!l) throw new Error('Lead not found.');
      return { ...leadRow(l, os), activities: await acts([['lead', id]]), invitedMeetings: await invited('lead', id), attachments: await files([['lead', id]]) }; },
    async createCrmLead(v) { on(); const os = await owners(); return leadRow(await one(sb.from('crm_leads').insert(await withCustom('lead', leadIn(v), v))), os); },
    async updateCrmLead(id, v) { on(); const os = await owners(); return leadRow(await one(sb.from('crm_leads').update(await withCustom('lead', leadIn(v), v)).eq('id', id)), os); },
    async convertCrmLead(id, opts = {}) { return camel(await rpc('crm_convert_lead', { p_lead: id, p: opts })); },
    async listCrmContacts() { return withActivity((await rpc('crm_contact_list')).map(contactRow), 'contact'); },
    async getCrmContact(id) { const c = contactRow(await rpc('crm_contact_detail', { p_id: id })); const pairs = [['contact', id]]; if (c.fromLeadId) pairs.push(['lead', c.fromLeadId]);
      const account = c.accountId ? (await rpc('crm_account_list')).find((a) => a.id === c.accountId) || null : null;
      const opportunities = camel(ok(await sb.from('crm_opportunities').select('*').eq('contact_id', id)) || []);
      return { ...c, account: account && camel(account), totals: orderTotals(c.orders), activities: await acts(pairs), opportunities, invitedMeetings: await invited('contact', id), attachments: await files(pairs) }; },
    async createCrmContact(v) { const id = await rpc('crm_create_contact', { p: await withCustom('contact', contactIn(noCf(v)), v) }); return contactRow(await rpc('crm_contact_detail', { p_id: id })); },
    async updateCrmContact(id, v) { await rpc('crm_update_contact', { p_id: id, p: await withCustom('contact', contactIn(noCf(v)), v) }); return contactRow(await rpc('crm_contact_detail', { p_id: id })); },
    async listCrmAccounts() { return withActivity(camel(await rpc('crm_account_list')), 'account'); },
    async getCrmAccount(id) { const a = camel((await rpc('crm_account_list')).find((x) => x.id === id)); if (!a) throw new Error('Company not found.'); const d = await rpc('crm_account_detail', { p_id: id });
      return { ...a, contactList: d.contactList.map(contactRow), orders: d.orders, totals: orderTotals(d.orders), activities: await acts([['account', id]]), invitedMeetings: [], attachments: await files([['account', id]]),
        opportunities: camel(ok(await sb.from('crm_opportunities').select('*').eq('account_id', id)) || []) }; },
    async createCrmAccount(v) { on(); return camel(await one(sb.from('crm_accounts').insert(await withCustom('account', accIn(v), v)))); },
    async updateCrmAccount(id, v) { on(); return camel(await one(sb.from('crm_accounts').update(await withCustom('account', accIn(v), v)).eq('id', id))); },
    async listCrmOpportunities() { on(); const os = await owners(); return withActivity(camel(ok(await sb.from('crm_opportunities').select('*, contact:contacts(first_name, last_name), account:crm_accounts(name)')) || [])
      .map((o) => ({ ...o, ownerName: nameOf(os, o.ownerId), contactName: o.contact ? `${o.contact.firstName} ${o.contact.lastName}`.trim() : '', accountName: o.account ? o.account.name : '', archived: !!o.archivedAt })), 'opportunity'); },
    async createCrmOpportunity(v) { on(); return camel(await one(sb.from('crm_opportunities').insert(await withCustom('opportunity', oppIn(v), v)))); },
    async updateCrmOpportunity(id, v) { on(); return camel(await one(sb.from('crm_opportunities').update(await withCustom('opportunity', oppIn(v), v)).eq('id', id))); },
    async moveCrmOpportunity(id, stage) { on(); return camel(await one(sb.from('crm_opportunities').update({ stage }).eq('id', id))); },
    async archiveCrmRecord(entity, id, archived = true) { return { ok: true, archived: await rpc('crm_archive', { p_entity: entity, p_id: id, p_archived: archived }) }; },
    async listCrmActivities(entity, id) { on(); return acts([[entity, id]]); },
    // call / email / note logs (a task goes to createCrmTask; meetings use createCrmMeeting)
    async logCrmActivity(v) { on(); if (v.kind === 'task') return this.createCrmTask(v); if (v.kind === 'meeting') throw new Error('Use + Meeting to add a meeting.');
      return actOut(await one(sb.from('crm_activities').insert({ entity: v.entity, entity_id: v.entityId, kind: v.kind, subject: v.subject, body: v.body || '', status: 'done', occurred_on: blank(v.occurredOn) })), await staff()); },
    async addCrmNote(entity, entityId, text) { on(); const t = String(text || '').trim(); if (!t) throw new Error('Write a note first.');
      return actOut(await one(sb.from('crm_activities').insert({ entity, entity_id: entityId, kind: 'note', subject: t.slice(0, 200), body: t.length > 200 ? t : '', status: 'done' })), await staff()); },
    async createCrmTask(v) { on(); return actOut(await one(sb.from('crm_activities').insert({ entity: v.entity, entity_id: v.entityId, kind: 'task', ...taskIn(v, true) })), await staff()); },
    async listCrmTasks() { on(); const ppl = await staff(); return (ok(await sb.from('crm_activities').select('*').eq('kind', 'task')) || []).map((a) => actOut(a, ppl)); },
    async getCrmTask(id) { on(); const a = ok(await sb.from('crm_activities').select('*').eq('id', id).eq('kind', 'task').maybeSingle()); if (!a) throw new Error('Task not found.'); return actOut(a, await staff()); },
    async updateCrmTask(id, v) { on(); const before = ok(await sb.from('crm_activities').select('status').eq('id', id).maybeSingle());
      const r = actOut(await one(sb.from('crm_activities').update(taskIn(v, false)).eq('id', id)), await staff());
      let nextTaskId = null; if (before && before.status !== TASK_CLOSED && r.status === TASK_CLOSED) nextTaskId = ((ok(await sb.from('crm_activities').select('id').eq('repeat_of', id)) || [])[0] || {}).id || null;
      return { ...r, nextTaskId }; },
    async closeCrmTask(id) { return camel(await rpc('crm_close_task', { p_id: id })); },
    async updateCrmActivity(id, v) { return this.updateCrmTask(id, v); },
    async createCrmMeeting(v) { on(); const o = meetingIn(v, true); if (yes(v.addClient) && (v.entity === 'lead' || v.entity === 'contact')) o.participants = [...new Set([...(o.participants || []), `${v.entity}:${v.entityId}`])];
      return actOut(await one(sb.from('crm_activities').insert({ entity: v.entity, entity_id: v.entityId, kind: 'meeting', status: 'done', ...o })), await staff()); },
    async getCrmMeeting(id) { on(); const a = ok(await sb.from('crm_activities').select('*').eq('id', id).eq('kind', 'meeting').maybeSingle()); if (!a) throw new Error('Meeting not found.'); return actOut(a, await staff()); },
    async updateCrmMeeting(id, v) { on(); return actOut(await one(sb.from('crm_activities').update(meetingIn(v, false)).eq('id', id)), await staff()); },
    async listCrmFollowUps({ ownerId = '', status = 'open' } = {}) {
      const rows = camel(await rpc('crm_follow_ups', { p_owner: ownerId && ownerId !== 'all' ? ownerId : null, p_status: status, p_all: ownerId === 'all' }));
      return rows.map((a) => ({ ...a, parentLink: linkOf(a.entity, a.entityId) })); },
    // Attachments: the row is written here; the bytes need a private 'crm' storage bucket, which is not set up yet (the CRM is off in supabase mode).
    async addCrmAttachment() { on(); throw new Error('CRM attachments are not set up on this portal yet.'); },
    async getCrmAttachmentContent() { on(); throw new Error('CRM attachments are not set up on this portal yet.'); },
    async crmReport({ from = '', to = '' } = {}) { return rpc('crm_report', { p_from: from || null, p_to: to || null }); },
    // John, Nov 3 (migration 32): CRM Deals list with filters. public.crm_deals() applies the scope (a Sales Person gets only their own deals) on the server.
    async listCrmDeals(f = {}) { const rows = await rpc('crm_deals', { p_status: f.status || null, p_owner: f.ownerId || null, p_client: f.clientId || null, p_source: f.source || null });
      return withActivity((rows || []).map((r) => withDealName({ ...r, _link: `#/crm/deals/${r.id}`, _portalLink: `#/deals/${r.id}`, _clientLink: '' })), 'deal'); },
    async listCrmDealFilters() { return rpc('crm_deal_filters'); },
    // One crm_deals call (the same scope as the list). One deal_contacts call for this deal only. No per-row helper.
    async getCrmDeal(id) {
      on(); const want = String(id || '').trim(); if (!want) throw new Error('Deal not found.');
      let raw = await rpc('crm_deals', { p_status: 'All', p_owner: null, p_client: null, p_source: null });
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
      const row = (Array.isArray(raw) ? raw : []).find((r) => r && r.id === want); if (!row) throw new Error('Deal not found.');
      let people = [];
      try {
        const contacts = await rpc('deal_contacts', { p_deal: want }) || [];
        people = (Array.isArray(contacts) ? contacts : []).filter((r) => r && !r.removed).map((r) => ({
          role: r.role || '', name: `${r.first_name || ''} ${r.last_name || ''}`.trim(), email: r.contact_hidden ? '' : (r.email || ''),
          link: r.contact_id ? `#/crm/contacts/${r.contact_id}` : '' }));
      } catch { people = []; }
      if (!people.length) {
        if (row.clientName) people.push({ role: 'Client', name: row.clientName, email: '', link: '' });
        if (row.contactName) people.push({ role: 'Agent', name: row.contactName, email: '', link: '' });
      }
      const emails = await this.listCrmEmails('deal', want); const u = await me();
      return withDealName({ ...row, _link: `#/crm/deals/${row.id}`, _portalLink: `#/deals/${row.id}`, people, emails: Array.isArray(emails) ? emails : [], notes: row.notes || '', canEdit: !crmReadOnly(u) });
    },
    async listCrmEmails(entity, id) {
      on(); const e = String(entity || ''); const rid = String(id || '');
      if (!['lead', 'contact', 'account', 'deal', 'opportunity'].includes(e) || !rid) return [];
      try {
        const rows = ok(await sb.from('crm_emails').select('id, from_email, to_emails, cc_emails, bcc_emails, subject, body_html, status, scheduled_at, created_at').eq('entity', e).eq('entity_id', rid).order('created_at', { ascending: false })) || [];
        return rows.map((r) => { const row = camel(r); const status = row.status || 'drafted'; const list = (v) => (Array.isArray(v) ? v : []);
          return { id: row.id, subject: row.subject || '', to: list(row.toEmails), cc: list(row.ccEmails), bcc: list(row.bccEmails), from: row.fromEmail || '',
            status, statusLabel: status === 'scheduled' ? 'Scheduled (not sent)' : 'Drafted (not sent)', scheduledAt: row.scheduledAt || null, createdAt: row.createdAt || null,
            createdByName: '', attachments: [], html: row.bodyHtml || '', notice: 'Not sent: Gmail is not connected yet. The email was saved on this record only.' }; });
      } catch { return []; }
    },
    async noteCrmRecent() { on(); return { ok: true }; },
    async crmRelatedEmails(entity, id) {
      on(); const e = String(entity || '');
      if (e === 'lead') { const rows = await this.listCrmLeads(); const r = rows.find((z) => z.id === id); return r && r.email ? [{ name: r.name, email: r.email, contactId: '' }] : []; }
      if (e === 'contact') { const rows = await this.listCrmContacts(); const r = rows.find((z) => z.id === id); return r && r.email ? [{ name: r.name, email: r.email, contactId: r.id }] : []; }
      if (e === 'account') { const rows = await this.listCrmContacts(); return rows.filter((r) => r.accountId === id && r.email).map((r) => ({ name: r.name, email: r.email, contactId: r.id })); }
      if (e === 'opportunity') { const rows = await this.listCrmOpportunities(); const r = rows.find((z) => z.id === id); if (!r || !r.contactId) return []; const people = await this.listCrmContacts(); const c = people.find((z) => z.id === r.contactId); return c && c.email ? [{ name: c.name, email: c.email, contactId: c.id }] : []; }
      if (e === 'deal') { const rows = ok(await sb.rpc('deal_contacts', { p_deal: id })) || []; return rows.filter((r) => r.email && !r.contact_hidden).map((r) => ({ name: `${r.first_name || ''} ${r.last_name || ''}`.trim(), email: r.email, contactId: r.contact_id || '' })); }
      return [];
    },
    async saveCrmEmail(input = {}) {
      on(); const u = await me(); const entity = String(input.entity || '');
      if (!['lead', 'contact', 'account', 'deal'].includes(entity)) throw new Error('Email drafts are stored for a lead, client, company, or deal. An opportunity draft is stored on its client.');
      const to = [...new Set((Array.isArray(input.to) ? input.to : String(input.to || '').split(/[,;\s]+/)).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
      if (!to.length) throw new Error('Add at least one To address.');
      const subject = String(input.subject || '').replace(/[\r\n]/g, ' ').trim();
      if (!subject) throw new Error('Subject is required.');
      const row = ok(await sb.from('crm_emails').insert({ entity, entity_id: input.entityId, from_email: String(u.email || '').toLowerCase(), to_emails: to, cc_emails: [], bcc_emails: [], subject: subject.slice(0, 250), body_html: String(input.html || '').slice(0, 200000), status: 'drafted', scheduled_at: null, created_by: u.id }).select('id, status').single());
      return { id: row.id, status: 'drafted', emailed: false };
    },
  };
  // Nov 3 (migration 27): email templates. Nothing is ever sent.
  Object.assign(api, crmTemplatesSupabase({ sb, ok, camel, me, on, one, self: api }));
  // Nov 3 (migration 33): calls (Zoho video 11) + Admin-only list CSV downloads. Nothing is ever sent.
  Object.assign(api, crmCallsSupabase({ sb, ok, camel, on, one, actOut, staff }));
  Object.assign(api, crmJanineSupabase({ sb, ok, camel, on, rpc, me, self: api }));   // Janine, Nov 3 (migration 37)
  Object.assign(api, crmSurfaceSupabase({ sb, ok, camel, me, on, self: api }));
  return api;
}
