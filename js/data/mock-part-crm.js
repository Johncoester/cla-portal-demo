/* mock adapter: the CRM (John, Nov 2). FAKE DATA ONLY. Behind the `crm` feature flag (features.js): when it is off every call here refuses.
 * People are the portal's own contacts (one person per email); the CRM adds owner, account, CRM stage, last contacted, tags, notes.
 * Leads (not yet contacts) convert into a contact (+ account). Accounts = brokerages / lenders. Opportunities = the referral-partner pipeline.
 * Activities = calls / emails (logged only, never sent) / notes, Zoho-style TASKS (status, priority, reminder, repeat) and MEETINGS (no calendar
 * sync, no invitations, nothing is ever emailed) on a lead, contact (= "Client" on screen), account (= "Company") or opportunity. Attachments on records.
 * NOTHING is deleted: leads, contacts, accounts and opportunities are archived; tasks are closed; attachments and notes stay.
 * Access (mirrored by private.crm_* in migration 22): see crm.js. */
import { roleAllowed } from './role-access.js?v=202611100100';
import { CRM_OFF } from './features.js?v=202611070139';
import { dealDisplayName } from './nov5-rules.js?v=202611101015';
import { RELATIONSHIP_STATUSES, CONVERTED_STATUS, LEAD_SOURCES, ROLES_IN_COMPANY, OPP_STAGES, ACCOUNT_KIND_CODES, CRM_ENTITIES, accountKindForType, entityLabel,
  TASK_STATUSES, TASK_CLOSED, TASK_PRIORITIES, MEETING_TYPES, LINK_KEYS, LINK_FIELDS, cleanUrl, nextDue, addDaysTo, taskOpen, meetingOpen, localStamp,
  canUseCrm, crmReadOnly, CRM_OWNER_ROLES, normTags, orderTotals, REPEAT_CODES, LEAD_STATUS_DEFAULT, companyKey } from './crm.js?v=202611070139';
import { crmJaninePart, janineLazyUpgrade } from './mock-part-crm-janine.js?v=202611131200';
import { ensureSettings, findOption, defaultOption, optionsOf, optLabel, activeFields, cleanCustomValue, isBlankValue, builtinRequired, gatherCustom } from './crm-config.js?v=202611070139';
import { crmSettingsPart } from './mock-part-crm-settings.js?v=202611070139';
import { fieldCan, COMPUTED_TYPES, FILE_TYPES, IMAGE_EXT, dupKey, autoNumberText, parseFormula, evalFormula, FORMULA_BUILTINS } from './crm-fields.js?v=202611070139';
import { crmNov3bPart } from './mock-part-crm-nov3b.js?v=202611121700';
import { feedbackNov4Part } from './mock-part-feedback-nov4.js?v=202611070139';
import { crmTemplatesPart } from './mock-part-crm-templates.js?v=202611090905';
import { crmCallsPart } from './mock-part-crm-calls.js?v=202611070139';
import { callOpen, callSeconds, durationText, callStatusOf } from './crm-calls.js?v=202611070139';

export function crmPart(x, flags) {
  const { load, save: save0, nid, needUser, dealsFor, prof, nameOf, fullName, clone, now, fail, str, emailOk, localDate, C } = x;
  // Janine, Nov 3: an import PREVIEW runs the real create rules without saving (dry.on), then the in-memory copy is dropped (x.forget)
  const dry = { on: false }; const save = () => { if (!dry.on) save0(); };
  // Janine, Nov 3 (no storage bump): Zillow URL -> Zillow Profile, leads linked to their company, the import / invite logs. Lazy, idempotent, lossless.
  const db = () => { const d = load(); ['crmLeads', 'crmAccounts', 'crmOpportunities', 'crmActivities', 'crmAttachments', 'clientSalesReps', 'dealSalesPeople'].forEach((k) => { d[k] ||= []; }); janineLazyUpgrade(d); return d; };
  // CRM SETTINGS (Nov 2, Janine): picklists, custom fields, built-in field settings. Added to stored v17 data in place when first needed
  // (additive: no record changes, so the storage key stays v17). Defaults = the Zoho lists below.
  const cfg = () => { const d = db(); d.crmSettings = ensureSettings(d.crmSettings); return d.crmSettings; };
  // ---------- access ----------
  const crmUser = () => { if (!flags.crm) fail(CRM_OFF); const u = needUser(); if (!canUseCrm(u)) fail('The CRM is for CLA staff only.'); return u; };
  const crmEditor = () => { const u = crmUser(); if (crmReadOnly(u)) fail('The Processor has read-only access to the CRM.'); return u; };
  const isSales = (u) => CRM_OWNER_ROLES.includes(u.role) && !u.isAdmin;
  const salesIds = () => new Set(db().profiles.filter((p) => CRM_OWNER_ROLES.includes(p.role)).map((p) => p.id));   // incl. disabled / removed salespeople, so their records stay with the team
  const seesAllCrm = (u) => u.isAdmin || (C.runsOrders(u) && roleAllowed(u.role, 'crm') !== false);   // SQL private.crm_all (+ role_can('crm'), Nov 9)
  // owner rule: Sales Person = own; Sales Team = the sales team's (owned by any salesperson, or unowned)
  const ownerOk = (u, ownerId) => seesAllCrm(u) || ownerId === u.id || (u.role === 'Sales Team' && (!ownerId || salesIds().has(ownerId)));
  const staffLogin = (c) => { const p = c.profileId && prof(c.profileId); return !!(p && p.status !== 'removed' && !C.isOutside(p.role)); };
  const inCrm = (c) => !staffLogin(c);   // CLA staff are not CRM contacts
  // "linked to them": a client linked to this salesperson (client_sales_reps), or a person on an order this salesperson is on (deal_sales_people)
  const linked = (u, c) => { if (!CRM_OWNER_ROLES.includes(u.role)) return false; const d = db();
    if (c.profileId && d.clientSalesReps.some((l) => l.clientId === c.profileId && l.salesId === u.id)) return true;
    const mine = new Set(d.dealSalesPeople.filter((s) => s.salesId === u.id).map((s) => s.dealId));
    return d.participants.some((p) => p.contactId === c.id && mine.has(p.dealId)); };
  const contactSeen = (u, c) => inCrm(c) && (ownerOk(u, c.crmOwnerId) || linked(u, c));
  const accountSeen = (u, a) => ownerOk(u, a.ownerId) || db().contacts.some((c) => c.accountId === a.id && contactSeen(u, c));
  const leadSeen = (u, l) => ownerOk(u, l.ownerId);
  const oppSeen = (u, o) => ownerOk(u, o.ownerId) || (o.contactId && contactSeen(u, contactRow(o.contactId))) || (o.accountId && accountSeen(u, accountRow(o.accountId)));
  const contactRow = (id) => db().contacts.find((c) => c.id === id) || fail('Client not found.');
  const accountRow = (id) => db().crmAccounts.find((a) => a.id === id) || fail('Company not found.');
  const get = { lead: (u, id) => { const l = db().crmLeads.find((z) => z.id === id); if (!l || !leadSeen(u, l)) fail('Lead not found.'); return l; },
    contact: (u, id) => { const c = db().contacts.find((z) => z.id === id); if (!c || !contactSeen(u, c)) fail('Client not found.'); return c; },
    account: (u, id) => { const a = db().crmAccounts.find((z) => z.id === id); if (!a || !accountSeen(u, a)) fail('Company not found.'); return a; },
    opportunity: (u, id) => { const o = db().crmOpportunities.find((z) => z.id === id); if (!o || !oppSeen(u, o)) fail('Opportunity not found.'); return o; } };
  const entityOf = (u, entity, id) => { if (!CRM_ENTITIES.includes(entity)) fail('Unknown CRM record type.'); return get[entity](u, id); };
  const seen = (u, entity, id) => { try { entityOf(u, entity, id); return true; } catch (e) { return false; } };

  // ---------- validation ----------
  // blank owner = unassigned; on CREATE a salesperson's record defaults to themselves. A Sales Person assigns to themselves only. (= private.crm_owner_check)
  const owner = (u, v, current = null, create = false) => { let s = str(v, 60) || null;
    if (!s && create && isSales(u)) s = u.id;
    if (s && s !== current) { const p = prof(s); if (!p || p.status !== 'active' || !CRM_OWNER_ROLES.includes(p.role)) fail('The owner must be an active Sales Person or Sales Team user.'); }
    if (u.role === 'Sales Person' && !u.isAdmin && s !== current && s !== u.id) fail('A Sales Person can only assign records to themselves.');
    return s; };
  // task owner / meeting host: an active Sales Person, Sales Team or Admin login (default: me). A Sales Person assigns only to themselves.
  const assignable = (p) => !!p && p.status === 'active' && (CRM_OWNER_ROLES.includes(p.role) || !!p.isAdmin);
  const assignee = (u, v, current, label) => { const s = str(v, 60) || (current === undefined ? u.id : current) || u.id;
    if (s !== current && !assignable(prof(s))) fail(`The ${label} must be an active Sales Person, Sales Team or Admin user.`);
    if (u.role === 'Sales Person' && !u.isAdmin && s !== current && s !== u.id) fail(`A Sales Person can only make themselves the ${label}.`);
    return s; };
  const ctype = (v) => { const s = str(v, 20); if (!s) return null; if (!C.CONTACT_TYPE_CODES.includes(s)) fail('Pick a contact type from the list (Realtor, Lender or Buyer/Seller).'); return s; };
  const oneOf = (v, list, label, dflt) => { const s = str(v, 40); if (!s) { if (dflt !== undefined) return dflt; fail(`${label} is required.`); } if (!list.includes(s)) fail(`Pick a ${label.toLowerCase()} from the list.`); return s; };
  const date = (v, label, { noFuture = false } = {}) => { const s = x.dateOrNull(v, label); if (s && noFuture && s > localDate()) fail(`${label} cannot be in the future.`); return s; };
  const email = (v) => { const e = str(v, 200).toLowerCase(); if (e && !emailOk(e)) fail('Email is not valid.'); return e; };
  const emailTaken = (e, exceptContactId) => { const d = db(); return d.contacts.find((c) => c.email === e && c.id !== exceptContactId) || null; };
  const money = (v, label) => x.money(v, label);
  const ownerName = (id) => (id ? nameOf(id) : '');
  const dt = (v, label) => { const s = str(v, 20); if (!s) return null; const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(s);
    if (!m || !x.dateOrNull(m[1], label) || +m[2] > 23 || +m[3] > 59) fail(`${label} must be a real date and time.`); return s; };
  const pick = (v, list, label) => { const s = str(v, 60); if (s && !list.includes(s)) fail(`Pick a ${label} from the list.`); return s; };
  // a value from a configurable pick list (crm-config.js). Accepts the stable value or the current label. A RETIRED option is refused
  // for new entries but a record that already holds it keeps it (current). Blank -> dflt, or '' when the field is optional.
  const opt = (key, v, label, { current = undefined, dflt, required: need = false } = {}) => { const s = str(v, 80);
    if (!s) { if (dflt !== undefined) return dflt; if (need) fail(`${label} is required.`); return ''; }
    const o = findOption(cfg(), key, s); if (!o) { if (current != null && s === current) return s; fail(`Pick a ${label} from the list.`); }
    if (o.retired && o.value !== current) fail(`"${o.label}" is retired; pick another ${label.toLowerCase()}.`); return o.value; };
  // CUSTOM FIELD values: input.custom = { fieldId: value } or form keys 'cf.<fieldId>'. On create every active field is read (required ones must
  // be filled); on update only the fields sent. Values of deleted (archived) fields are never touched. Unknown keys are ignored.
  // Nov 3 (b), video 8: Edit permission per role (a field the user may not edit keeps its value; sending it is refused), computed types (formula /
  // rollup: never stored; auto-number: assigned on create), file / image (set by uploadCrmFieldFile), "Do not allow duplicate values", max characters.
  const recordsOfEntity = (entity) => { const d = db(); return entity === 'lead' ? d.crmLeads : entity === 'contact' ? d.contacts.filter(inCrm) : entity === 'account' ? d.crmAccounts : d.crmOpportunities; };
  const userOk = (id) => { const p = prof(id); return !!p && p.status === 'active' && !C.isOutside(p.role) && p.role !== 'Transaction Coordinator'; };
  const lookupOk = (target, id) => { const d = db(); return target === 'contacts' ? d.contacts.some((c) => c.id === id && inCrm(c)) : target === 'leads' ? d.crmLeads.some((l) => l.id === id)
    : target === 'accounts' ? d.crmAccounts.some((a) => a.id === id) : target === 'opportunities' ? d.crmOpportunities.some((o) => o.id === id) : target === 'deals' ? d.deals.some((q) => q.id === id) : false; };
  function applyCustom(entity, rec, input, create) {
    const u = needUser(); const given = gatherCustom(input);
    const cur = { ...(rec.custom || {}) };
    activeFields(cfg(), entity).forEach((f) => { const has = Object.prototype.hasOwnProperty.call(given, f.id);
      if (f.type === 'autonumber') { if (create && cur[f.id] == null) { f.config ||= { prefix: '', suffix: '', start: 1, next: 1 }; cur[f.id] = autoNumberText(f.config, f.config.next); f.config.next += 1; } return; }
      if (COMPUTED_TYPES.includes(f.type) || FILE_TYPES.includes(f.type)) return;
      const may = fieldCan(u, f, 'edit');
      if (!may) { if (has && !sameValue(given[f.id], cur[f.id])) fail(`You cannot change "${f.label}".`); return; }
      if (!create && !has) return;
      const useDefault = create && !has && f.defaultValue != null;   // Set Default Values (video 8)
      const v = cleanCustomValue(f, has ? given[f.id] : useDefault ? f.defaultValue : null, cur[f.id], { phone: (s, l) => x.phone(s, l), userOk, lookupOk });
      if (f.required && isBlankValue(v)) fail(`${f.label} is required.`);
      if (f.unique && !isBlankValue(v)) { const k = dupKey(f.type, v); const other = recordsOfEntity(entity).find((r) => r.id !== rec.id && dupKey(f.type, (r.custom || {})[f.id]) === k);
        if (other) fail(`${f.label} "${v}" is already used by ${recName(entity, other)}; duplicates are not allowed.`); }
      if (v === null) delete cur[f.id]; else cur[f.id] = v; });
    rec.custom = cur;
  }
  const sameValue = (a, b) => (a == null || a === '' ? b == null || b === '' : JSON.stringify(a) === JSON.stringify(b) || String(a) === String(b));
  const recName = (entity, r) => (entity === 'account' || entity === 'opportunity' ? `"${r.name}"` : `${`${r.firstName || ''} ${r.lastName || ''}`.trim()}`);
  // Clients & Leads: one email / phone across both modules (video 8). The warning names the record and its owner; nothing is saved.
  function personDup({ email: e, phone: p }, { leadId = null, contactId = null } = {}) {
    const d = db(); const ph = String(p || '').replace(/\D/g, ''); const em = String(e || '').trim().toLowerCase();
    const leadHit = (test) => d.crmLeads.find((l) => l.id !== leadId && !l.convertedAt && !l.archivedAt && test(l));
    const clientHit = (test) => d.contacts.find((c) => c.id !== contactId && inCrm(c) && !c.crmArchivedAt && test(c));
    const who = (kind, r, ownerId) => `${kind} ${`${r.firstName || ''} ${r.lastName || ''}`.trim()} (owner ${ownerId ? nameOf(ownerId) : 'none'})`;
    if (em) { const l = leadHit((z) => (z.email || '').toLowerCase() === em); if (l) fail(`This email is already used by ${who('Lead', l, l.ownerId)}. Duplicates are not allowed.`);
      const c = clientHit((z) => (z.email || '').toLowerCase() === em); if (c) fail(`This email is already used by ${who('Client', c, c.crmOwnerId)}. Duplicates are not allowed.`); }
    if (ph.length >= 7 && (cfg().dupRules || {}).phone !== false) { const same = (v) => String(v || '').replace(/\D/g, '') === ph;
      const l = leadHit((z) => same(z.phone)); if (l) fail(`This phone number is already used by ${who('Lead', l, l.ownerId)}. Duplicates are not allowed.`);
      const c = clientHit((z) => same(z.phone)); if (c) fail(`This phone number is already used by ${who('Client', c, c.crmOwnerId)}. Duplicates are not allowed.`); }
  }
  // computed custom values for display (formula, rollup). Rollups use the records the viewer may see (late-bound to the Nov 3 b part).
  const late = {};
  function withComputed(u, entity, rec, out) {
    const fs = activeFields(cfg(), entity).filter((f) => f.type === 'formula' || f.type === 'rollup'); if (!fs.length) return out;
    const custom = { ...(out.custom || {}) };
    fs.filter((f) => f.type === 'rollup').forEach((f) => { try { const v = late.rollup ? late.rollup(u, entity, rec.id, f.config) : null; if (v == null) delete custom[f.id]; else custom[f.id] = v; } catch (e) { delete custom[f.id]; } });
    const byLabel = (label) => { const l = label.toLowerCase(); const b = (FORMULA_BUILTINS[entity] || []).find(([, z]) => z.toLowerCase() === l); if (b) return out[b[0]];
      const cf = activeFields(cfg(), entity).find((z) => z.label.toLowerCase() === l); return cf ? custom[cf.id] : null; };
    fs.filter((f) => f.type === 'formula').forEach((f) => { try { const v = evalFormula(parseFormula(f.config.expression), byLabel); if (v == null) delete custom[f.id]; else custom[f.id] = v; } catch (e) { delete custom[f.id]; } });
    return { ...out, custom };
  }
  // what the viewer may see of the custom values (fields without View permission are left out)
  const visibleCustom = (u, entity, custom) => { const out = {}; const fs = (cfg().customFields || []).filter((f) => f.entity === entity);
    Object.entries(custom || {}).forEach(([k, v]) => { const f = fs.find((z) => z.id === k); if (!f || fieldCan(u, f, 'view')) out[k] = v; }); return out; };
  // the settings as one user sees them (no fields they may not view; canEdit per field)
  const cfgFor = (u) => { const c = cfg(); return { ...c, customFields: c.customFields.filter((f) => fieldCan(u, f, 'view')).map((f) => ({ ...f, canView: true, canEdit: fieldCan(u, f, 'edit') })) }; };
  const actLog = (u, entity, entityId, subject) => db().crmActivities.push({ id: nid('ca'), entity, entityId, kind: 'note', subject: str(subject, 200), body: '', status: 'done', dueDate: null, occurredOn: localDate(), ownerId: null, system: true, createdBy: u.id, createdAt: now(), doneAt: now() });

  // ---------- orders linked to people (the portal's own deals) ----------
  const ordersOf = (contactIds) => { const d = db(); const ids = new Set(contactIds); const by = new Map();
    d.participants.filter((p) => ids.has(p.contactId)).forEach((p) => { const q = d.deals.find((z) => z.id === p.dealId); if (!q) return;
      const o = by.get(q.id) || { dealId: q.id, fileNumber: q.fileNumber, address: `${q.street}, ${q.city}, ${q.state} ${q.zip}`, openDate: q.openDate, closingDate: q.closingDate || null, status: q.status, purchasePrice: q.purchasePrice == null ? null : q.purchasePrice, roles: [], people: [] };
      const c = d.contacts.find((z) => z.id === p.contactId); if (!o.roles.includes(p.role)) o.roles.push(p.role); const tag = `${c ? fullName(c) : ''}: ${p.role}`; if (!o.people.includes(tag)) o.people.push(tag); by.set(q.id, o); });
    return [...by.values()].sort((a, b) => String(b.openDate).localeCompare(String(a.openDate))); };
  const withAccess = (u, orders) => { const mine = new Set(dealsFor(u).map((q) => q.id)); return orders.map((o) => ({ ...o, canOpen: mine.has(o.dealId) })); };
  const salesRepsOf = (c) => (c.profileId ? db().clientSalesReps.filter((l) => l.clientId === c.profileId).map((l) => ({ id: l.salesId, name: nameOf(l.salesId) })) : []);
  const accName = (id) => { const a = id && db().crmAccounts.find((z) => z.id === id); return a ? a.name : ''; };

  // ---------- Zoho person fields (clients and leads share them) ----------
  // patch semantics: on create every field is read (blank = empty); on update only the keys that are present.
  const TEXT = [['title', 100], ['assistant', 100], ['licenseNo', 60], ['street', 200], ['city', 80], ['county', 60]];
  function personFields(t, input, create) {
    const has = (k) => create || input[k] !== undefined;
    TEXT.forEach(([k, max]) => { if (has(k)) t[k] = str(input[k], max); });
    if (has('zip')) { t.zip = str(input.zip, 10); if (t.zip && !/^\d{5}(-\d{4})?$/.test(t.zip)) fail('Zip Code must be 5 digits (or 5+4).'); }
    if (has('mobile')) t.mobile = x.phone(input.mobile, 'Mobile'); if (has('asstPhone')) t.asstPhone = x.phone(input.asstPhone, 'Asst Phone');
    if (has('roleInCompany')) t.roleInCompany = opt('roleInCompany', input.roleInCompany, 'Role in Company', { current: t.roleInCompany });
    if (has('state')) { const st = str(input.state, 2).toUpperCase(); if (st && !C.US_STATES.includes(st)) fail('Pick a US state.'); t.state = st; }
    if (has('agentSplit')) { const v = str(input.agentSplit, 10).replace(/%$/, ''); if (!v) t.agentSplit = null; else { const n = Number(v); if (!isFinite(n) || n < 0 || n > 100) fail('Agent Split (%) must be between 0 and 100.'); t.agentSplit = Math.round(n * 100) / 100; } }
    if (has('salesVolumeLastYear')) t.salesVolumeLastYear = money(input.salesVolumeLastYear, 'Sales Volume (Last Year)');
    if (has('dealsClosedLastYear')) { const v = str(input.dealsClosedLastYear, 10); if (!v) t.dealsClosedLastYear = null; else { const n = Number(v); if (!Number.isInteger(n) || n < 0) fail('Deals Closed (Last Year) must be a whole number.'); t.dealsClosedLastYear = n; } }
    if (has('zillowUrl')) t.zillowUrl = urlFor('Zillow URL', input.zillowUrl);
    const links = { ...(t.links || {}) }; LINK_KEYS.forEach((k) => { const v = input.links && input.links[k] !== undefined ? input.links[k] : input['links.' + k]; if (create || v !== undefined) { const u2 = urlFor((LINK_FIELDS.find(([key]) => key === k) || [, k])[1], v); if (u2) links[k] = u2; else delete links[k]; } }); t.links = links;
    // Janine, Nov 3: only Zillow Profile is shown. An older caller's Zillow URL fills Zillow Profile when that is empty (the old value stays stored, hidden).
    if (input.zillowUrl !== undefined && t.zillowUrl && !t.links.zillowProfile) t.links.zillowProfile = t.zillowUrl; if (t.zillowUrl) t.zillowMoved = true;
  }
  // Zoho mandatory fields on a client / lead: Last Name, Role in Company, Relationship Status, State
  // Last Name is always required; Role in Company, Relationship Status and State unless an Admin un-required them (CRM Settings)
  const required = (lastName, role, status, state) => { const c = cfg(); if (!lastName) fail('Last Name is required.'); if (!role && builtinRequired(c, 'roleInCompany')) fail('Role in Company is required.');
    if (!status && builtinRequired(c, 'relationshipStatus')) fail('Relationship Status is required.'); if (!state && builtinRequired(c, 'state')) fail('State is required.'); };
  const relStatus = (v, current) => opt('relationshipStatus', v, 'relationship status', { current });
  const leadStatus = (v, current) => opt('leadRelationshipStatus', v, 'relationship status', { current });   // Janine, Nov 3: the Leads list (an older value on the record is kept)
  const leadSrc = (v, current) => opt('leadSource', v, 'lead source', { current });
  const desc = (input) => (input.description !== undefined ? input.description : input.notes);
  const personOut = (r) => ({ roleInCompany: r.roleInCompany || '', title: r.title || '', mobile: r.mobile || '', assistant: r.assistant || '', asstPhone: r.asstPhone || '',
    agentSplit: r.agentSplit == null ? null : r.agentSplit, licenseNo: r.licenseNo || '', salesVolumeLastYear: r.salesVolumeLastYear == null ? null : r.salesVolumeLastYear,
    dealsClosedLastYear: r.dealsClosedLastYear == null ? null : r.dealsClosedLastYear, zillowUrl: r.zillowUrl || '', street: r.street || '', city: r.city || '', state: r.state || '', zip: r.zip || '', county: r.county || '', links: { ...(r.links || {}) } });

  // ---------- row shapes ----------
  const latestStamp = (entity, id) => {
    const times = []; const d = db();
    (d.crmActivities || []).forEach((a) => { if (a.entity === entity && a.entityId === id && a.createdAt) times.push(a.createdAt); });
    (d.crmEmails || []).forEach((m) => { if (m.entity === entity && m.entityId === id && m.createdAt) times.push(m.createdAt); });
    return times.reduce((a, b) => (a > b ? a : b), null);
  };
  const leadOut0 = (u, l) => ({ ...clone(l), ...personOut(l), name: `${l.firstName || ''} ${l.lastName || ''}`.trim(), source: l.source || '', leadSource: l.source || '', relationshipStatus: l.status, description: l.notes || '',
    lastActivityAt: latestStamp('lead', l.id), modifiedAt: l.modifiedAt || null,
    accountId: l.accountId || null, accountName: accName(l.accountId), company: accName(l.accountId) || l.company || '', companyText: l.company || '',   // Janine, Nov 3: Company = a lookup to Companies
    ownerName: ownerName(l.ownerId), converted: !!l.convertedAt, archived: !!l.archivedAt, canEdit: !crmReadOnly(u), modifiedByName: l.modifiedBy ? nameOf(l.modifiedBy) : '',
    convertedContactName: l.convertedContactId ? fullName(contactRow(l.convertedContactId)) : '', custom: visibleCustom(u, 'lead', clone(l.custom || {})) });
  const contactOut0 = (u, c) => { const o = ordersOf([c.id]); const t = orderTotals(o);
    return { id: c.id, name: fullName(c), firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, company: c.company, contactType: c.contactType || null, hasLogin: !!c.profileId,
      ...personOut(c), leadSource: c.leadSource || '', relationshipStatus: c.relationshipStatus || '', description: c.crmNotes || '',
      ownerId: c.crmOwnerId || null, ownerName: ownerName(c.crmOwnerId), accountId: c.accountId || null, accountName: accName(c.accountId), companyName: accName(c.accountId) || c.company || '',
      lastContactedOn: c.lastContactedOn || null, createdAt: c.createdAt || null, modifiedAt: c.modifiedAt || null, lastActivityAt: latestStamp('contact', c.id), tags: c.tags || [], notes: c.crmNotes || '', archived: !!c.crmArchivedAt, fromLeadId: c.crmLeadId || null,
      salesReps: salesRepsOf(c), linked: linked(u, c), orders: t.orders, volume: t.volume, canEdit: !crmReadOnly(u), custom: visibleCustom(u, 'contact', clone(c.custom || {})) }; };
  const accountOut0 = (u, a) => { const cs = db().contacts.filter((c) => c.accountId === a.id && inCrm(c)); const t = orderTotals(ordersOf(cs.map((c) => c.id)));
    return { ...clone(a), custom: visibleCustom(u, 'account', clone(a.custom || {})), ownerName: ownerName(a.ownerId), archived: !!a.archivedAt, createdAt: a.createdAt || null, modifiedAt: a.modifiedAt || null, lastActivityAt: latestStamp('account', a.id), contacts: cs.filter((c) => contactSeen(u, c)).length, orders: t.orders, volume: t.volume, canEdit: !crmReadOnly(u) }; };
  const oppOut0 = (u, o) => ({ ...clone(o), custom: visibleCustom(u, 'opportunity', clone(o.custom || {})), ownerName: ownerName(o.ownerId), contactName: o.contactId ? fullName(contactRow(o.contactId)) : '', accountName: accName(o.accountId), archived: !!o.archivedAt, canEdit: !crmReadOnly(u) });
  const leadOut = (u, l) => withComputed(u, 'lead', l, leadOut0(u, l));
  const contactOut = (u, c) => withComputed(u, 'contact', c, contactOut0(u, c));
  const accountOut = (u, a) => withComputed(u, 'account', a, accountOut0(u, a));
  const oppOut = (u, o) => withComputed(u, 'opportunity', o, oppOut0(u, o));
  const parentName = (entity, id) => { const d = db();
    if (entity === 'lead') { const l = d.crmLeads.find((z) => z.id === id); return l ? `${l.firstName || ''} ${l.lastName || ''}`.trim() : ''; }
    if (entity === 'contact') { const c = d.contacts.find((z) => z.id === id); return c ? fullName(c) : ''; }
    if (entity === 'account') return accName(id); const o = d.crmOpportunities.find((z) => z.id === id); return o ? o.name : ''; };
  const linkOf = (entity, id) => (entity === 'opportunity' ? '#/crm/pipeline' : `#/crm/${entity}s/${id}`);
  // Zoho columns: "Contact Name" = the person (client or lead); "Related To" = the company / opportunity it is about
  // video 11: a call's own Related To (company / opportunity / deal) wins over the person's company
  const relName = (e, id) => { const d = db(); if (e === 'deal') { const q = d.deals.find((z) => z.id === id); return q ? dealDisplayName(q) : ''; } return parentName(e, id); };
  const relOf = (a) => { const base = relOf0(a); if (a.kind !== 'call' || !a.relatedEntity || !a.relatedId) return base;
    return { ...base, relatedTo: relName(a.relatedEntity, a.relatedId), relatedLink: a.relatedEntity === 'deal' ? `#/crm/deals/${a.relatedId}` : linkOf(a.relatedEntity, a.relatedId) }; };
  const relOf0 = (a) => { const d = db();
    if (a.entity === 'contact') { const c = d.contacts.find((z) => z.id === a.entityId) || {}; return { contactName: c.id ? fullName(c) : '', contactLink: linkOf('contact', a.entityId),
      relatedTo: accName(c.accountId) || c.company || '', relatedLink: c.accountId ? linkOf('account', c.accountId) : '' }; }
    if (a.entity === 'lead') { const l = d.crmLeads.find((z) => z.id === a.entityId) || {}; return { contactName: parentName('lead', a.entityId), contactLink: linkOf('lead', a.entityId), relatedTo: l.company || '', relatedLink: '' }; }
    if (a.entity === 'account') return { contactName: '', contactLink: '', relatedTo: accName(a.entityId), relatedLink: linkOf('account', a.entityId) };
    const o = d.crmOpportunities.find((z) => z.id === a.entityId) || {};
    return { contactName: o.contactId ? parentName('contact', o.contactId) : '', contactLink: o.contactId ? linkOf('contact', o.contactId) : '', relatedTo: o.name || '', relatedLink: linkOf('opportunity', a.entityId) }; };
  const partOut = (p) => { const [type, id] = String(p).split(':'); const name = type === 'user' ? nameOf(id) : parentName(type, id); return { key: p, type, id, name, label: type === 'user' ? 'User' : entityLabel(type), link: type === 'user' ? '' : linkOf(type, id) }; };
  const actOut = (a) => ({ ...clone(a), ownerName: ownerName(a.ownerId), createdByName: nameOf(a.createdBy), modifiedByName: a.modifiedBy ? nameOf(a.modifiedBy) : '', hostName: a.hostId ? nameOf(a.hostId) : '',
    parentName: parentName(a.entity, a.entityId), parentLabel: entityLabel(a.entity), parentLink: linkOf(a.entity, a.entityId), ...relOf(a),
    participants: (a.participants || []).map(partOut),
    open: a.kind === 'task' ? taskOpen(a) : a.kind === 'meeting' ? meetingOpen(a, localStamp()) : a.kind === 'call' ? callOpen(a) : false,
    overdue: a.kind === 'task' && taskOpen(a) && !!a.dueDate && a.dueDate < localDate(),
    reminderDue: (a.kind === 'task' && taskOpen(a) && !!a.reminder && !!a.reminderAt && a.reminderAt <= localStamp()) || (a.kind === 'call' && callOpen(a) && !!a.callReminderAt && a.callReminderAt <= localStamp()),
    ...(a.kind === 'call' ? { callStatus: callStatusOf(a), callDurationSec: callSeconds(a), callDurationText: durationText(callSeconds(a)), relatedName: a.relatedEntity && a.relatedId ? relName(a.relatedEntity, a.relatedId) : '',
      voiceRecording: a.voiceRecording ? (a.voiceRecording.kind === 'link' ? { kind: 'link', url: a.voiceRecording.url } : { kind: 'file', name: a.voiceRecording.name, size: a.voiceRecording.size }) : null } : {}) });
  // video 11: a call shows on its Call To record and on its Related To company / opportunity (only when the viewer may see the Call To record)
  const actsFor = (pairs, u = null) => db().crmActivities.filter((a) => pairs.some(([e, id]) => (a.entity === e && a.entityId === id)
    || (a.kind === 'call' && a.relatedEntity === e && a.relatedId === id && !pairs.some(([e2, id2]) => a.entity === e2 && a.entityId === id2) && (!u || seen(u, a.entity, a.entityId))))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(actOut);
  const invitedTo = (u, pairs) => db().crmActivities.filter((a) => a.kind === 'meeting' && (a.participants || []).some((p) => pairs.some(([e, id]) => p === `${e}:${id}`)) && seen(u, a.entity, a.entityId)).map(actOut);
  const attachmentsOf = (pairs) => db().crmAttachments.filter((f) => pairs.some(([e, id]) => f.entity === e && f.entityId === id)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((f) => ({ id: f.id, entity: f.entity, entityId: f.entityId, name: f.name, mimeType: f.mimeType, size: f.size, uploadedBy: f.uploadedBy, uploadedByName: nameOf(f.uploadedBy), createdAt: f.createdAt }));
  const touch = (r, u) => { r.modifiedBy = u.id; r.modifiedAt = now(); };
  // lead -> client: a lead custom field's value goes to the client field with the same name and type (if the client has none yet). Never removes anything.
  const carryCustom = (l, c) => { const lf = activeFields(cfg(), 'lead'); const cf = activeFields(cfg(), 'contact'); c.custom ||= {};
    lf.forEach((f) => { const v = (l.custom || {})[f.id]; if (isBlankValue(v)) return; const t = cf.find((z) => z.label.toLowerCase() === f.label.toLowerCase() && z.type === f.type); if (!t || !isBlankValue(c.custom[t.id])) return;
      if (f.type === 'dropdown') { const lab = optLabel(cfg(), 'cf:' + f.id, v, { mark: false }); const o = (t.options || []).find((z) => z.label.toLowerCase() === lab.toLowerCase() && !z.retired); if (o) c.custom[t.id] = o.value; }
      else c.custom[t.id] = v; }); };
  const spawnNext = (u, t) => {   // a repeating task that is closed makes its next occurrence (until the end date, if any)
    if (!t.repeatEvery) return null; const due = nextDue(t.dueDate, t.repeatEvery, t.repeatAnchorDay); if (t.repeatUntil && due > t.repeatUntil) return null;
    const shift = (s) => { if (!s) return null; const days = Math.round((Date.parse(due) - Date.parse(t.dueDate)) / 864e5); return addDaysTo(s.slice(0, 10), days) + s.slice(10); };
    const n = { ...clone(t), id: nid('ca'), dueDate: due, status: 'Not Started', closedAt: null, cancelled: false, reminderAt: shift(t.reminderAt), repeatOf: t.repeatOf || t.id, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now(), doneAt: null };
    db().crmActivities.push(n); return n; };
  const setTaskStatus = (u, t, s) => { const was = taskOpen(t); t.status = s; let next = null;
    if (s === TASK_CLOSED) { if (was) { t.closedAt = now(); t.doneAt = t.closedAt; next = spawnNext(u, t); } } else { t.closedAt = null; t.doneAt = null; t.cancelled = false; }
    return next; };

  const taskOf = (u, id) => { const t = db().crmActivities.find((z) => z.id === id && z.kind === 'task'); if (!t || !seen(u, t.entity, t.entityId)) fail('Task not found.'); return t; };
  const yes = (v) => v === true || v === '1' || v === 'on' || v === 'true';
  // Reminder (in-portal only, never emailed) and Repeat (daily / weekly / monthly, optional end date)
  function taskExtras(t, input, create) {
    if (create || input.reminder !== undefined) { t.reminder = yes(input.reminder); t.reminderAt = t.reminder ? dt(input.reminderAt, 'Reminder') || fail('Pick the reminder date and time.') : null; }
    if (create || input.repeat !== undefined) {
      if (yes(input.repeat)) { const was = t.repeatEvery; t.repeatEvery = oneOf(input.repeatEvery, REPEAT_CODES, 'Repeat', 'weekly'); t.repeatUntil = date(input.repeatUntil, 'Repeat ends');
        if (was !== t.repeatEvery || !t.repeatAnchorDay) t.repeatAnchorDay = Number(String(t.dueDate).slice(8, 10)) || null;   // Janine, Nov 3: the series keeps its day of the month
        if (t.repeatUntil && t.repeatUntil < t.dueDate) fail('The repeat end date must be on or after the due date.'); }
      else { t.repeatEvery = null; t.repeatUntil = null; t.repeatAnchorDay = null; } }
  }
  function urlFor(label, v) { try { return cleanUrl(v); } catch (e) { return fail(`${label}: ${e.message}`); } }
  function meetingFields(u, m, input, create) {
    const has = (k) => create || input[k] !== undefined;
    if (has('location')) m.location = str(input.location, 200);
    if (has('allDay')) m.allDay = yes(input.allDay);
    if (has('meetingType')) { m.meetingType = opt('meetingType', input.meetingType, 'Type', { current: create ? undefined : m.meetingType, required: true }); }   // older logged meetings keep '' until edited
    if (has('from') || has('to') || has('allDay')) {
      const fromV = input.from !== undefined ? input.from : m.startsAt, toV = input.to !== undefined ? input.to : m.endsAt;
      if (m.allDay) { m.startsAt = date(String(fromV || '').slice(0, 10), 'From') || fail('From is required.'); m.endsAt = date(String(toV || '').slice(0, 10), 'To') || m.startsAt; }
      else { m.startsAt = dt(fromV, 'From') || fail('From (date and time) is required.'); m.endsAt = dt(toV, 'To') || fail('To (date and time) is required.'); }
      if (m.endsAt < m.startsAt) fail('"To" must be after "From".'); }
    if (has('participants')) { const list = Array.isArray(input.participants) ? input.participants : String(input.participants || '').split(',');
      const d = db(); const keep = [];
      list.map((p) => str(p, 80)).filter(Boolean).forEach((p) => { const [type, id] = p.split(':');
        if (type === 'user') { const pr = prof(id); if (!pr || pr.status !== 'active' || C.isOutside(pr.role)) fail('Participants can be leads, clients or CLA users.'); }
        else if (type === 'lead' || type === 'contact') entityOf(u, type, id); else fail('Participants can be leads, clients or CLA users.');
        if (!keep.includes(p)) keep.push(p); });
      if (keep.length > 50) fail('At most 50 participants.'); m.participants = keep; }
  }

  // COMPANIES (Janine, Nov 3): State is required (50 states + DC) and a company may not repeat an existing one: same name after normalising (case,
  // punctuation, spacing, "&" / "and", Inc / LLC / Co ...), in any state, archived ones included (restore it instead). The error carries the existing record.
  const companyDup = (name, exceptId = null) => { const k = companyKey(name); if (!k) return null; return db().crmAccounts.find((a) => a.id !== exceptId && companyKey(a.name) === k) || null; };
  function companyRules(name, state, exceptId, hint = 'open it instead') {
    if (state !== null) { if (!state) fail('State is required.'); if (!C.US_STATES.includes(state)) fail('Pick a US state (or DC).'); }
    const dup = companyDup(name, exceptId); if (!dup) return;
    const e = new Error(`A company named "${dup.name}"${dup.state ? ` (${dup.state})` : ''} already exists${dup.archivedAt ? ' (archived: restore it)' : ''}; duplicates are not allowed, ${hint}.`);
    const u = needUser(); e.duplicate = { id: dup.id, name: dup.name, state: dup.state || '', archived: !!dup.archivedAt, canOpen: accountSeen(u, dup), link: `#/crm/accounts/${dup.id}` }; throw e;
  }
  const api = {
    async crmMe() { const u = crmUser(); return { email: (prof(u.id) || {}).email || '', canEdit: !crmReadOnly(u), canConfigure: !!u.isAdmin, role: u.role, isAdmin: !!u.isAdmin, id: u.id, name: nameOf(u.id), scope: seesAllCrm(u) ? 'all' : u.role === 'Sales Team' ? 'team' : 'own' }; },
    async listCrmOwners() { crmUser(); return db().profiles.filter((p) => CRM_OWNER_ROLES.includes(p.role) && p.status === 'active').map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), role: p.role })).sort((a, b) => a.name.localeCompare(b.name)); },
    // task owners / meeting hosts (Sales Person, Sales Team, Admins) and the "Users" a meeting can include (active CLA staff)
    async listCrmAssignees() { crmUser(); return db().profiles.filter(assignable).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), role: p.role })).sort((a, b) => a.name.localeCompare(b.name)); },
    async listCrmUsers() { crmUser(); return db().profiles.filter((p) => p.status === 'active' && !C.isOutside(p.role)).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), role: p.role })).sort((a, b) => a.name.localeCompare(b.name)); },

    // ---------- leads ----------
    async listCrmLeads() { const u = crmUser(); return db().crmLeads.filter((l) => leadSeen(u, l)).map((l) => leadOut(u, l)); },
    async getCrmLead(id) { const u = crmUser(); const l = get.lead(u, id); const pairs = [['lead', l.id]];
      return { ...leadOut(u, l), activities: actsFor(pairs, u), invitedMeetings: invitedTo(u, pairs), attachments: attachmentsOf(pairs) }; },
    async createCrmLead(input) {
      const u = crmEditor(); const d = db();
      const acc = str(input.accountId, 60) ? get.account(u, str(input.accountId, 60)) : null;   // Janine, Nov 3: Company = an existing company
      if (str(input.relationshipStatus !== undefined ? input.relationshipStatus : input.status, 80) === CONVERTED_STATUS) fail('A new lead cannot start as Converted/Current Client; convert it instead.');
      const l = { id: nid('lead'), firstName: str(input.firstName, 80), lastName: str(input.lastName, 80), company: acc ? acc.name : str(input.company, 120), accountId: acc ? acc.id : null, email: email(input.email), phone: x.phone(input.phone),
        contactType: ctype(input.contactType), source: leadSrc(input.leadSource !== undefined ? input.leadSource : input.source), status: leadStatus(input.relationshipStatus !== undefined ? input.relationshipStatus : input.status, input.retainHistoricalStatus ? (input.relationshipStatus !== undefined ? input.relationshipStatus : input.status) : undefined) || (builtinRequired(cfg(), 'relationshipStatus') ? '' : defaultOption(cfg(), 'leadRelationshipStatus', LEAD_STATUS_DEFAULT)),
        ownerId: owner(u, input.ownerId, null, true), notes: str(desc(input), 4000),
        convertedAt: null, convertedContactId: null, convertedAccountId: null, archivedAt: null, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now() };
      personFields(l, input, true); applyCustom('lead', l, input, true); required(l.lastName, l.roleInCompany, l.status, l.state);
      if (l.status === CONVERTED_STATUS) fail('A new lead cannot start as Converted/Current Client; convert it instead.');
      if (l.email) { const c = emailTaken(l.email); if (c) fail(`${fullName(c)} is already a client with this email (one person per email). Open them under CRM > Clients instead.`);
        if (d.crmLeads.some((z) => z.email === l.email && !z.convertedAt && !z.archivedAt)) fail('A lead with this email already exists.'); }
      personDup(l, { leadId: l.id });
      d.crmLeads.push(l); save(); return leadOut(u, l);
    },
    async updateCrmLead(id, patch) {
      const u = crmEditor(); const d = db(); const l = get.lead(u, id); if (l.convertedAt) fail('This lead was converted; edit the client instead.'); const before = { email: l.email, phone: l.phone };
      ['firstName', 'lastName', 'company'].forEach((k) => { if (patch[k] != null) l[k] = str(patch[k], k === 'company' ? 120 : 80); });
      if (patch.accountId !== undefined) { const aid = str(patch.accountId, 60);   // Janine, Nov 3: the Company lookup; clearing it keeps an older lead's typed company text
        if (aid) { const acc = get.account(u, aid); l.accountId = acc.id; l.company = acc.name; } else { if (l.accountId && patch.company == null) l.company = ''; l.accountId = null; } }
      if (desc(patch) != null) l.notes = str(desc(patch), 4000);
      if (patch.phone != null) l.phone = x.phone(patch.phone);
      if (patch.email != null) { const e = email(patch.email); if (e && e !== l.email) { const c = emailTaken(e); if (c) fail(`${fullName(c)} is already a client with this email (one person per email).`);
        if (d.crmLeads.some((z) => z.id !== l.id && z.email === e && !z.convertedAt && !z.archivedAt)) fail('A lead with this email already exists.'); } l.email = e; }
      if (patch.contactType !== undefined) l.contactType = ctype(patch.contactType);
      const src = patch.leadSource !== undefined ? patch.leadSource : patch.source; if (src !== undefined) l.source = leadSrc(src, l.source);
      const st = patch.relationshipStatus !== undefined ? patch.relationshipStatus : patch.status; if (st !== undefined) { const was = l.status; l.status = leadStatus(st, l.status) || (builtinRequired(cfg(), 'relationshipStatus') ? '' : was);
        if (l.status === CONVERTED_STATUS && was !== CONVERTED_STATUS) fail('Use "Convert" to make a lead a client.'); }
      personFields(l, patch, false); applyCustom('lead', l, patch, false); required(l.lastName, l.roleInCompany, l.status, l.state);
      if (patch.ownerId !== undefined) l.ownerId = owner(u, patch.ownerId, l.ownerId);
      if ((patch.email != null && l.email !== before.email) || (patch.phone != null && String(l.phone || '').replace(/\D/g, '') !== String(before.phone || '').replace(/\D/g, ''))) personDup({ email: l.email !== before.email ? l.email : '', phone: String(l.phone || '').replace(/\D/g, '') !== String(before.phone || '').replace(/\D/g, '') ? l.phone : '' }, { leadId: l.id });
      touch(l, u); save(); return leadOut(u, l);
    },
    // Lead -> Client (+ Company). One person per email: if a client already has the email, pass { linkExisting: true } to attach the lead to that person instead.
    // Company: accountId (existing) or newAccountName (+ accountKind); none = client without a company. Optional opportunityName starts a pipeline card.
    // The client gets the lead's Zoho fields and keeps its Relationship Status; the lead is marked Converted/Current Client.
    async convertCrmLead(id, opts = {}) {
      const u = crmEditor(); const d = db(); const l = get.lead(u, id);
      if (l.convertedAt) fail('This lead was already converted.'); if (l.archivedAt) fail('Restore this lead before converting it.');
      let acc = null;
      if (str(opts.accountId, 60)) acc = get.account(u, str(opts.accountId, 60));
      else if (str(opts.newAccountName, 160)) { const name = str(opts.newAccountName, 160);
        const st = (str(opts.accountState, 2) || l.state || '').toUpperCase(); companyRules(name, st, null, 'pick it from the list');   // Janine, Nov 3: State required, no duplicates
        acc = { id: nid('acc'), name, kind: opt('accountKind', opts.accountKind, 'Company type', { dflt: defaultOption(cfg(), 'accountKind', accountKindForType(l.contactType)) }), phone: '', website: '', city: '', state: st, ownerId: l.ownerId, notes: '', archivedAt: null, createdBy: u.id, createdAt: now() }; }
      else if (l.accountId && opts.accountId === undefined) acc = d.crmAccounts.find((a) => a.id === l.accountId) || null;   // the lead's Company lookup
      let c = l.email ? emailTaken(l.email) : null; let linkedExisting = false;
      // Leads and Clients have separate Relationship Status lists (Janine, Nov 3): a lead value that is also an active client option is kept, else Converted/Current Client
      const cs = findOption(cfg(), 'relationshipStatus', l.status); const carry = { ...personOut(l), leadSource: l.source || '', relationshipStatus: cs && !cs.retired && cs.value === l.status ? l.status : CONVERTED_STATUS };
      if (c) { if (!opts.linkExisting) fail(`A client with this email already exists: ${fullName(c)}. Choose "Link to the existing client" (one person per email).`);
        if (!inCrm(c)) fail('That email belongs to a CLA staff login; it cannot be a CRM client.');
        if (!c.contactType && l.contactType) c.contactType = l.contactType;
        Object.entries(carry).forEach(([k, v]) => { const empty = c[k] == null || c[k] === '' || (k === 'links' && !Object.keys(c[k] || {}).length); if (empty) c[k] = v; });   // fill gaps only
        linkedExisting = true; if (!c.crmOwnerId) c.crmOwnerId = l.ownerId; if (acc && !c.accountId) c.accountId = acc.id; if (!c.crmLeadId) c.crmLeadId = l.id;
      } else {
        if (l.email && d.profiles.some((p) => p.email === l.email && p.status !== 'removed')) fail('A user with this email already exists.');
        c = { id: nid('c'), profileId: null, firstName: l.firstName, lastName: l.lastName, email: l.email, phone: l.phone, company: acc ? acc.name : l.company, contactType: l.contactType,
          crmOwnerId: l.ownerId, accountId: acc ? acc.id : null, crmStage: null, ...carry, lastContactedOn: null, tags: [], crmNotes: l.notes, crmLeadId: l.id, crmArchivedAt: null, createdBy: u.id, createdAt: now() };
        d.contacts.push(c); }
      if (acc && !d.crmAccounts.includes(acc)) d.crmAccounts.push(acc);
      carryCustom(l, c);
      let opp = null;
      if (str(opts.opportunityName, 160)) { opp = { id: nid('opp'), name: str(opts.opportunityName, 160), stage: 'New', contactId: c.id, accountId: acc ? acc.id : c.accountId || null, ownerId: l.ownerId, estVolume: null, expectedClose: null, notes: '', archivedAt: null, createdBy: u.id, createdAt: now() }; d.crmOpportunities.push(opp); }
      Object.assign(l, { convertedAt: now(), convertedContactId: c.id, convertedAccountId: acc ? acc.id : null, status: CONVERTED_STATUS }); touch(l, u);
      actLog(u, 'contact', c.id, `Converted from lead ${l.firstName || ''} ${l.lastName || ''}`.replace(/\s+/g, ' ').trim() + (acc ? ` (company ${acc.name})` : ''));
      save(); return { contactId: c.id, accountId: acc ? acc.id : null, opportunityId: opp ? opp.id : null, linkedExisting };
    },

    // ---------- contacts (the portal's contacts table; "Clients" on screen) ----------
    async listCrmContacts() { const u = crmUser(); return db().contacts.filter((c) => contactSeen(u, c)).map((c) => contactOut(u, c)); },
    async getCrmContact(id) {
      const u = crmUser(); const c = get.contact(u, id); const orders = withAccess(u, ordersOf([c.id]));
      const pairs = [['contact', c.id]]; if (c.crmLeadId) pairs.push(['lead', c.crmLeadId]);
      return { ...contactOut(u, c), account: c.accountId ? accountOut(u, accountRow(c.accountId)) : null, orders, totals: orderTotals(orders), activities: actsFor(pairs, u),
        invitedMeetings: invitedTo(u, pairs), attachments: attachmentsOf(pairs), opportunities: db().crmOpportunities.filter((o) => o.contactId === c.id).map((o) => oppOut(u, o)) };
    },
    async createCrmContact(input) {
      const u = crmEditor(); const d = db(); const e = email(input.email);
      if (e) { const c = emailTaken(e); if (c) fail(`A client with this email already exists: ${fullName(c)} (one person per email).`); if (d.profiles.some((p) => p.email === e && p.status !== 'removed')) fail('A user with this email already exists.'); }
      const acc = str(input.accountId, 60) ? get.account(u, str(input.accountId, 60)) : null;
      const c = { id: nid('c'), profileId: null, firstName: str(input.firstName, 80), lastName: str(input.lastName, 80), email: e, phone: x.phone(input.phone), company: str(input.company, 120) || (acc ? acc.name : ''),
        contactType: ctype(input.contactType), crmOwnerId: owner(u, input.ownerId, null, true), accountId: acc ? acc.id : null, crmStage: null,
        leadSource: leadSrc(input.leadSource), relationshipStatus: relStatus(input.relationshipStatus, input.retainHistoricalStatus ? input.relationshipStatus : undefined) || (builtinRequired(cfg(), 'relationshipStatus') ? '' : defaultOption(cfg(), 'relationshipStatus', 'Potential/Warm')), lastContactedOn: date(input.lastContactedOn, 'Last contacted', { noFuture: true }),
        tags: normTags(input.tags), crmNotes: str(desc(input), 4000), crmLeadId: null, crmArchivedAt: null, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now() };
      personFields(c, input, true); applyCustom('contact', c, input, true); required(c.lastName, c.roleInCompany, c.relationshipStatus, c.state);
      personDup(c, { contactId: c.id });
      d.contacts.push(c); save(); return contactOut(u, c);
    },
    // CRM fields only (name / email / phone stay with the Processor's contact edit on the order, because a contact may be a portal login)
    async updateCrmContact(id, patch) {
      const u = crmEditor(); const c = get.contact(u, id);
      if (patch.ownerId !== undefined) c.crmOwnerId = owner(u, patch.ownerId, c.crmOwnerId);
      if (patch.accountId !== undefined) c.accountId = str(patch.accountId, 60) ? get.account(u, str(patch.accountId, 60)).id : null;
      if (patch.relationshipStatus !== undefined) { const s = relStatus(patch.relationshipStatus, c.relationshipStatus || ''); if (!s && builtinRequired(cfg(), 'relationshipStatus')) fail('Relationship Status is required.');
        if (s !== (c.relationshipStatus || '')) actLog(u, 'contact', c.id, `Relationship Status set to ${optLabel(cfg(), 'relationshipStatus', s, { mark: false })}`); c.relationshipStatus = s; }
      if (patch.leadSource !== undefined) c.leadSource = leadSrc(patch.leadSource, c.leadSource);
      if (patch.lastContactedOn !== undefined) c.lastContactedOn = date(patch.lastContactedOn, 'Last contacted', { noFuture: true });
      if (patch.tags !== undefined) c.tags = normTags(patch.tags);
      if (desc(patch) != null) c.crmNotes = str(desc(patch), 4000);
      if (patch.contactType !== undefined) c.contactType = ctype(patch.contactType);
      if (patch.company != null) c.company = str(patch.company, 120);
      personFields(c, patch, false); applyCustom('contact', c, patch, false);
      if (patch.roleInCompany !== undefined && !c.roleInCompany && builtinRequired(cfg(), 'roleInCompany')) fail('Role in Company is required.');
      if (patch.state !== undefined && !c.state && builtinRequired(cfg(), 'state')) fail('State is required.');
      touch(c, u); save(); return contactOut(u, c);
    },

    // ---------- accounts ----------
    async listCrmAccounts() { const u = crmUser(); return db().crmAccounts.filter((a) => accountSeen(u, a)).map((a) => accountOut(u, a)); },
    async getCrmAccount(id) {
      const u = crmUser(); const a = get.account(u, id); const d = db(); const cs = d.contacts.filter((c) => c.accountId === a.id && inCrm(c));
      const orders = withAccess(u, ordersOf(cs.map((c) => c.id)));
      return { ...accountOut(u, a), contactList: cs.filter((c) => contactSeen(u, c)).map((c) => contactOut(u, c)), orders, totals: orderTotals(orders), activities: actsFor([['account', a.id]], u),
        invitedMeetings: [], attachments: attachmentsOf([['account', a.id]]), opportunities: d.crmOpportunities.filter((o) => o.accountId === a.id).map((o) => oppOut(u, o)) };
    },
    async createCrmAccount(input) {
      const u = crmEditor(); const d = db(); const name = str(input.name, 160) || fail('Company name is required.');
      const st = str(input.state, 2).toUpperCase(); companyRules(name, st, null);   // Janine, Nov 3: State required (50 states + DC), no duplicate companies
      const a = { id: nid('acc'), name, kind: opt('accountKind', input.kind, 'Company type', { dflt: defaultOption(cfg(), 'accountKind', 'other') }), phone: x.phone(input.phone), website: str(input.website, 200), city: str(input.city, 80), state: st,
        ownerId: owner(u, input.ownerId, null, true), notes: str(input.notes, 4000), archivedAt: null, createdBy: u.id, createdAt: now() };
      applyCustom('account', a, input, true); d.crmAccounts.push(a); save(); return accountOut(u, a);
    },
    async updateCrmAccount(id, patch) {
      const u = crmEditor(); const d = db(); const a = get.account(u, id);
      if (patch.name != null) { const n = str(patch.name, 160) || fail('Company name is required.'); if (companyKey(n) !== companyKey(a.name)) companyRules(n, null, a.id); a.name = n; }
      if (patch.kind != null) a.kind = opt('accountKind', patch.kind, 'Company type', { current: a.kind, required: true });
      if (patch.phone != null) a.phone = x.phone(patch.phone); ['website', 'city', 'notes'].forEach((k) => { if (patch[k] != null) a[k] = str(patch[k], k === 'notes' ? 4000 : 200); });
      if (patch.state != null) { const s = str(patch.state, 2).toUpperCase(); if (!s) fail('State is required.'); if (!C.US_STATES.includes(s)) fail('Pick a US state (or DC).'); a.state = s; }
      if (patch.ownerId !== undefined) a.ownerId = owner(u, patch.ownerId, a.ownerId);
      applyCustom('account', a, patch, false); touch(a, u); save(); return accountOut(u, a);
    },

    // ---------- pipeline (opportunities) ----------
    async listCrmOpportunities() { const u = crmUser(); return db().crmOpportunities.filter((o) => oppSeen(u, o)).map((o) => oppOut(u, o)); },
    async createCrmOpportunity(input) {
      const u = crmEditor(); const o = { id: nid('opp'), name: str(input.name, 160) || fail('Name is required.'), stage: opt('oppStage', input.stage, 'Stage', { dflt: defaultOption(cfg(), 'oppStage', 'New') }),
        contactId: str(input.contactId, 60) ? get.contact(u, str(input.contactId, 60)).id : null, accountId: str(input.accountId, 60) ? get.account(u, str(input.accountId, 60)).id : null,
        ownerId: owner(u, input.ownerId, null, true), estVolume: money(input.estVolume, 'Estimated volume'), expectedClose: date(input.expectedClose, 'Expected close'), notes: str(input.notes, 4000), archivedAt: null, createdBy: u.id, createdAt: now() };
      if (!o.contactId && !o.accountId) fail('Link the opportunity to a client or a company.');
      applyCustom('opportunity', o, input, true); db().crmOpportunities.push(o); save(); return oppOut(u, o);
    },
    async updateCrmOpportunity(id, patch) {
      const u = crmEditor(); const o = get.opportunity(u, id);
      if (patch.name != null) o.name = str(patch.name, 160) || fail('Name is required.');
      if (patch.stage != null) { const s = opt('oppStage', patch.stage, 'Stage', { current: o.stage, required: true }); const L = (v) => optLabel(cfg(), 'oppStage', v, { mark: false });
        if (s !== o.stage) actLog(u, 'opportunity', o.id, `Moved from ${L(o.stage)} to ${L(s)}`); o.stage = s; }
      if (patch.contactId !== undefined) o.contactId = str(patch.contactId, 60) ? get.contact(u, str(patch.contactId, 60)).id : null;
      if (patch.accountId !== undefined) o.accountId = str(patch.accountId, 60) ? get.account(u, str(patch.accountId, 60)).id : null;
      if (!o.contactId && !o.accountId) fail('Link the opportunity to a client or a company.');
      if (patch.ownerId !== undefined) o.ownerId = owner(u, patch.ownerId, o.ownerId);
      if (patch.estVolume !== undefined) o.estVolume = money(patch.estVolume, 'Estimated volume'); if (patch.expectedClose !== undefined) o.expectedClose = date(patch.expectedClose, 'Expected close');
      if (patch.notes != null) o.notes = str(patch.notes, 4000);
      applyCustom('opportunity', o, patch, false); touch(o, u); save(); return oppOut(u, o);
    },
    async moveCrmOpportunity(id, stage) { return api.updateCrmOpportunity(id, { stage }); },

    // ---------- archive (no deletes in the CRM, for anyone) ----------
    async archiveCrmRecord(entity, id, archived = true) {
      const u = crmEditor(); const r = entityOf(u, entity, id); const k = entity === 'contact' ? 'crmArchivedAt' : 'archivedAt';
      r[k] = archived ? r[k] || now() : null; actLog(u, entity, id, archived ? 'Archived' : 'Restored from archive'); save(); return { ok: true, archived: !!r[k] };
    },

    // ---------- activities: logged calls / emails / notes ----------
    async listCrmActivities(entity, id) { const u = crmUser(); entityOf(u, entity, id); return actsFor([[entity, id]], u); },
    // kind call / email (a log only: nothing is sent) / note. kind 'task' is passed on to createCrmTask (older callers).
    async logCrmActivity(input) {
      if (input.kind === 'task') return api.createCrmTask({ ...input, description: input.body });
      if (input.kind === 'meeting') fail('Use "New Meeting" for meetings.');
      const u = crmEditor(); const entity = str(input.entity, 20); const parent = entityOf(u, entity, str(input.entityId, 60));
      const kind = oneOf(input.kind, ['call', 'email', 'note'], 'Activity type');
      const a = { id: nid('ca'), entity, entityId: parent.id, kind, subject: str(input.subject, 200) || (kind === 'note' ? 'Note' : fail('Subject is required.')), body: str(input.body, 4000),
        status: 'done', dueDate: null, occurredOn: date(input.occurredOn, 'Date', { noFuture: true }) || localDate(), ownerId: u.id, system: false, createdBy: u.id, createdAt: now(), doneAt: now(), modifiedBy: u.id, modifiedAt: now() };
      if (kind === 'note' && !a.body && a.subject === 'Note') fail('Write the note first.');
      if (kind === 'call') {   // Nov 3 (b), video 7: Call Type, Call Start Time, Call Duration (minutes)
        a.callType = input.callType ? oneOf(input.callType, ['Outbound', 'Inbound', 'Missed'], 'Call type') : '';
        a.callStart = input.callStart ? dt(input.callStart, 'Call Start Time') : null; if (a.callStart && a.callStart.slice(0, 10) > localDate()) fail('Call Start Time cannot be in the future.');
        if (a.callStart) a.occurredOn = a.callStart.slice(0, 10);
        const dur = input.callDuration == null || input.callDuration === '' ? null : Number(input.callDuration); if (dur != null && (!Number.isInteger(dur) || dur < 0 || dur > 1440)) fail('Call Duration is minutes (0 to 1440).'); a.callDuration = dur;
        Object.assign(a, { callMode: 'logged', callStatus: 'Completed', callDurationSec: dur == null ? null : dur * 60, completedAt: now() }); }   // video 11 shape (this older quick-log path is kept for callers; the screens use logCrmCall)
      // a logged call / email on a contact moves its "last contacted" date forward
      if (entity === 'contact' && kind !== 'note' && (!parent.lastContactedOn || parent.lastContactedOn < a.occurredOn)) parent.lastContactedOn = a.occurredOn;
      db().crmActivities.push(a); save(); return actOut(a);
    },
    // Notes related list (Zoho). Notes are never deleted.
    async addCrmNote(entity, entityId, text) { return api.logCrmActivity({ entity, entityId, kind: 'note', subject: str(text, 4000).split('\n')[0].slice(0, 80) || 'Note', body: str(text, 4000) }); },

    // ---------- TASKS (Zoho): Subject*, Due Date*, Status, Priority, Owner, Reminder, Repeat, Description ----------
    async createCrmTask(input) {
      const u = crmEditor(); const entity = str(input.entity, 20); const parent = entityOf(u, entity, str(input.entityId, 60));
      const t = { id: nid('ca'), entity, entityId: parent.id, kind: 'task', subject: str(input.subject, 200) || fail('Subject is required.'), body: str(input.description !== undefined ? input.description : input.body, 4000),
        dueDate: date(input.dueDate, 'Due Date') || fail('Due Date is required.'), status: opt('taskStatus', input.status, 'Status', { dflt: 'Not Started' }), priority: opt('taskPriority', input.priority, 'Priority', { dflt: defaultOption(cfg(), 'taskPriority', 'High') }),
        ownerId: assignee(u, input.ownerId, undefined, 'task owner'), occurredOn: null, system: false, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now(), closedAt: null, doneAt: null };
      taskExtras(t, input, true); if (t.status === TASK_CLOSED) { t.closedAt = now(); t.doneAt = t.closedAt; }
      db().crmActivities.push(t); save(); return actOut(t);
    },
    async listCrmTasks() { const u = crmUser(); return db().crmActivities.filter((a) => a.kind === 'task' && seen(u, a.entity, a.entityId)).map(actOut); },
    async getCrmTask(id) { const u = crmUser(); return actOut(taskOf(u, id)); },
    async updateCrmTask(id, patch) {
      const u = crmEditor(); const t = taskOf(u, id); if (t.system) fail('This entry was written by the CRM and cannot be changed.');
      if (patch.subject != null) t.subject = str(patch.subject, 200) || fail('Subject is required.');
      if (patch.dueDate !== undefined) { const was = t.dueDate; t.dueDate = date(patch.dueDate, 'Due Date') || fail('Due Date is required.'); if (t.repeatEvery && t.dueDate !== was) t.repeatAnchorDay = Number(t.dueDate.slice(8, 10)); }
      if (patch.priority != null) t.priority = opt('taskPriority', patch.priority, 'Priority', { current: t.priority, required: true });
      const body = patch.description !== undefined ? patch.description : patch.body; if (body != null) t.body = str(body, 4000);
      if (patch.ownerId !== undefined) t.ownerId = assignee(u, patch.ownerId, t.ownerId, 'task owner');
      taskExtras(t, patch, false);
      let next = null; if (patch.status != null) next = setTaskStatus(u, t, opt('taskStatus', patch.status, 'Status', { current: t.status, required: true }));
      touch(t, u); save(); return { ...actOut(t), nextTaskId: next ? next.id : null };
    },
    // Close Task (Zoho button): status Completed + Closed Time; a repeating task makes its next occurrence
    async closeCrmTask(id) { return api.updateCrmTask(id, { status: TASK_CLOSED }); },
    // older callers (follow-ups): status open / done / cancelled
    async updateCrmActivity(id, patch) {
      const u = crmEditor(); const a = db().crmActivities.find((z) => z.id === id); if (!a || !seen(u, a.entity, a.entityId)) fail('Activity not found.');
      if (a.system) fail('This entry was written by the CRM and cannot be changed.');
      if (a.kind === 'task') { const p = { ...patch }; if (p.status != null) { const map = { open: 'Not Started', done: TASK_CLOSED, cancelled: TASK_CLOSED }; p.status = map[p.status] || p.status; }
        const r = await api.updateCrmTask(id, p); if (patch.status === 'cancelled') { const t = db().crmActivities.find((z) => z.id === id); t.cancelled = true; save(); } return r; }
      if (a.kind === 'meeting') return api.updateCrmMeeting(id, patch);
      if (patch.status != null || patch.dueDate !== undefined) fail('Only tasks have a status and a due date.');
      if (patch.subject != null) a.subject = str(patch.subject, 200) || fail('Subject is required.'); if (patch.body != null) a.body = str(patch.body, 4000);
      touch(a, u); save(); return actOut(a);
    },
    // My follow-ups (older screen, now Home): tasks for one owner (default: me). status open | done | all ('cancelled' = closed as cancelled)
    async listCrmFollowUps({ ownerId = '', status = 'open' } = {}) {
      const u = crmUser(); const who = ownerId || u.id;
      const st = (a) => status === 'all' || (status === 'open' ? taskOpen(a) : status === 'done' ? !taskOpen(a) && !a.cancelled : status === 'cancelled' ? !!a.cancelled : a.status === status);
      return db().crmActivities.filter((a) => a.kind === 'task' && st(a) && (who === 'all' || a.ownerId === who) && seen(u, a.entity, a.entityId)).map(actOut)
        .sort((a, b) => (b.overdue - a.overdue) || String(a.dueDate).localeCompare(String(b.dueDate)));
    },

    // ---------- MEETINGS (Zoho): Title*, Location, All Day, From*/To*, Host, Type*, Participants. NO calendar sync, NO invitations, nothing is emailed. ----------
    async createCrmMeeting(input) {
      const u = crmEditor(); const entity = str(input.entity, 20); const parent = entityOf(u, entity, str(input.entityId, 60));
      const m = { id: nid('ca'), entity, entityId: parent.id, kind: 'meeting', subject: str(input.title !== undefined ? input.title : input.subject, 200) || fail('Title is required.'), body: str(input.description !== undefined ? input.description : input.body, 4000),
        status: 'done', dueDate: null, occurredOn: null, ownerId: null, hostId: assignee(u, input.hostId, undefined, 'host'), system: false, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now(), doneAt: null };
      meetingFields(u, m, input, true); m.occurredOn = m.startsAt.slice(0, 10); m.ownerId = m.hostId;
      if (input.addClient === true || input.addClient === '1' || input.addClient === 'on') { const k = `${entity}:${parent.id}`; if (!m.participants.includes(k)) m.participants.push(k); }
      if (entity === 'contact' && m.occurredOn <= localDate() && (!parent.lastContactedOn || parent.lastContactedOn < m.occurredOn)) parent.lastContactedOn = m.occurredOn;
      db().crmActivities.push(m); save(); return actOut(m);
    },
    async getCrmMeeting(id) { const u = crmUser(); const m = db().crmActivities.find((z) => z.id === id && z.kind === 'meeting'); if (!m || !seen(u, m.entity, m.entityId)) fail('Meeting not found.'); return actOut(m); },
    async updateCrmMeeting(id, patch) {
      const u = crmEditor(); const m = db().crmActivities.find((z) => z.id === id && z.kind === 'meeting'); if (!m || !seen(u, m.entity, m.entityId)) fail('Meeting not found.');
      const title = patch.title !== undefined ? patch.title : patch.subject; if (title != null) m.subject = str(title, 200) || fail('Title is required.');
      const body = patch.description !== undefined ? patch.description : patch.body; if (body != null) m.body = str(body, 4000);
      if (patch.hostId !== undefined) m.hostId = assignee(u, patch.hostId, m.hostId, 'host');
      meetingFields(u, m, patch, false); m.occurredOn = m.startsAt.slice(0, 10); m.ownerId = m.hostId;
      touch(m, u); save(); return actOut(m);
    },

    // ---------- ATTACHMENTS (lead / client / company). File bytes go to the same IndexedDB file store as order documents. There is NO delete. ----------
    async addCrmAttachment(entity, entityId, { name, mimeType, size, dataUrl } = {}) {
      const u = crmEditor(); const parent = entityOf(u, str(entity, 20), str(entityId, 60)); if (entity === 'opportunity') fail('Attach files to the lead, client or company.');
      const full = str(name, 400).replace(/[\\/]/g, '_') || fail('A file name is required.'); const dot = full.lastIndexOf('.'); const ext = dot > 0 ? full.slice(dot + 1).toLowerCase() : '';
      if (!C.ALLOWED_UPLOAD_EXT.includes(ext)) fail(`${ext ? '.' + ext + ' files are' : 'Files without an extension are'} not allowed. Allowed: ${C.ALLOWED_UPLOAD_EXT.join(', ')}.`);
      if (!(Number(size) >= 0) || Number(size) > C.MAX_UPLOAD_BYTES) fail(`File is too large (demo limit ${Math.round(C.MAX_UPLOAD_BYTES / 1e5) / 10} MB).`);
      const f = { id: nid('cfile'), entity, entityId: parent.id, name: full.length > 200 ? full.slice(0, 199 - ext.length) + '.' + ext : full, mimeType: str(mimeType, 100) || 'application/octet-stream', size: Number(size) || 0,
        dataUrl: dataUrl || null, uploadedBy: u.id, createdAt: now() };
      await x.keepFile(f); db().crmAttachments.push(f); save(); return attachmentsOf([[entity, parent.id]]).find((z) => z.id === f.id);
    },
    async getCrmAttachmentContent(id) {
      const u = crmUser(); const f = db().crmAttachments.find((z) => z.id === id); if (!f || !seen(u, f.entity, f.entityId)) fail('Attachment not found.');
      const content = await x.fileContent(f); return { name: f.name, mimeType: f.mimeType, dataUrl: content || 'data:text/plain;charset=utf-8,' + encodeURIComponent('FAKE DEMO FILE\n' + f.name) };
    },

    // ---------- reports (orders by open date; leads by created date). Orders = the orders this person can see in the portal. ----------
    async crmReport({ from = '', to = '' } = {}) {
      const u = crmUser(); const d = db(); const f = date(from, 'From'), t = date(to, 'To'); if (f && t && f > t) fail('"From" must be on or before "To".');
      const inRange = (day) => (!f || day >= f) && (!t || day <= t);
      const deals = dealsFor(u).filter((q) => inRange(q.openDate));
      const groups = { realtor: new Map(), lender: new Map(), brokerage: new Map(), sales: new Map() };
      const add = (m, key, label, extra, q) => { const g = m.get(key) || { key, name: label, ...extra, list: [] }; if (!g.list.includes(q)) g.list.push(q); m.set(key, g); };
      deals.forEach((q) => { const ps = d.participants.filter((p) => p.dealId === q.id);
        ps.filter((p) => C.isAgent(p.role)).forEach((p) => { const c = d.contacts.find((z) => z.id === p.contactId); if (!c) return;
          add(groups.realtor, c.id, fullName(c), { company: accName(c.accountId) || c.company || '' }, q);
          const bk = c.accountId ? 'acc:' + c.accountId : c.company ? 'co:' + c.company.toLowerCase() : 'none'; add(groups.brokerage, bk, accName(c.accountId) || c.company || '(no brokerage)', {}, q); });
        const lenders = ps.filter((p) => p.role === 'Lender');
        lenders.forEach((p) => { const c = d.contacts.find((z) => z.id === p.contactId); if (c) add(groups.lender, c.id, fullName(c), { company: accName(c.accountId) || c.company || '' }, q); });
        if (!lenders.length && q.lenderName) add(groups.lender, 'name:' + q.lenderName.toLowerCase(), q.lenderContact || q.lenderName, { company: q.lenderName }, q);
        d.dealSalesPeople.filter((s) => s.dealId === q.id).forEach((s) => add(groups.sales, s.salesId, nameOf(s.salesId), {}, q)); });
      const rows = (m) => [...m.values()].map(({ list, ...g }) => ({ ...g, ...orderTotals(list) })).sort((a, b) => b.orders - a.orders || b.volume - a.volume || a.name.localeCompare(b.name));
      const leads = d.crmLeads.filter((l) => leadSeen(u, l) && !l.archivedAt && inRange(String(l.createdAt).slice(0, 10)));
      // grouped by the STABLE value, named by the current label (renames show at once; retired options are marked; values no longer in the list still count)
      const count = (key, listKey) => { const vals = optionsOf(cfg(), listKey).map((o) => o.value); leads.forEach((l) => { if (l[key] && !vals.includes(l[key])) vals.push(l[key]); });
        return vals.map((k) => { const ls = leads.filter((l) => l[key] === k); return { value: k, name: optLabel(cfg(), listKey, k), leads: ls.length, converted: ls.filter((l) => l.convertedAt).length }; }).filter((r) => r.leads); };
      const none = leads.filter((l) => !l.source);
      return { from: f, to: t, totals: orderTotals(deals), byRealtor: rows(groups.realtor), byLender: rows(groups.lender), byBrokerage: rows(groups.brokerage), bySalesperson: rows(groups.sales),
        leadsBySource: [...count('source', 'leadSource'), ...(none.length ? [{ value: '', name: '(none)', leads: none.length, converted: none.filter((l) => l.convertedAt).length }] : [])], leadsByStatus: count('status', 'leadRelationshipStatus'), leadCount: leads.length };
    },
  };
  Object.assign(api, crmSettingsPart(x, { db, cfg, crmUser }).api);
  // EMAIL TEMPLATES (Nov 3, Zoho video 6): nothing is ever sent. Template files ride in crmAttachments (entity 'template'), so getCrmAttachmentContent is extended.
  Object.assign(api, crmTemplatesPart(x, { db, cfg, crmUser, crmEditor, entityOf, leadOut, contactOut, accountOut, oppOut, actOut, baseApi: { getCrmAttachmentContent: api.getCrmAttachmentContent } }).api);
  // Nov 3 (b): Janine's videos 7, 9, 10 (search, Send Email, dashboards, reports) + file / image custom fields (video 8)
  const nb = crmNov3bPart(x, { db, cfg, cfgFor, crmUser, crmEditor, entityOf, seen, contactSeen, leadSeen, accountSeen, oppSeen, inCrm, leadOut, contactOut, accountOut, oppOut, actOut, salesOf: x.salesOf });
  Object.assign(api, nb.api);
  // video 11: Schedule a call / Log a call / Mark as Completed; CSV downloads of the lists = Admin / Super admin only
  Object.assign(api, crmCallsPart(x, { db, cfg, crmUser, crmEditor, entityOf, seen, assignee, opt, dt, actOut, leadSeen, contactSeen, accountSeen }).api);
  // Janine, Nov 3: CSV import (leads / clients / notes; Admin only), meeting invite previews (never sent), company duplicate lookup
  // John + Janine, Nov 4: custom views, saved filters, search columns, Disbursement Details (mock-part-feedback-nov4.js; migration 56)
  Object.assign(api, feedbackNov4Part(x, { db, cfgFor, crmUser, rowsOf: nb.rowsOf }).api);
  Object.assign(api, crmJaninePart(x, { db, cfg, crmUser, crmEditor, entityOf, seen, accountSeen, leadSeen, contactSeen, inCrm, actOut, dry, baseApi: api, companyDup, companyKey }).api);
  late.rollup = (u, entity, id, conf) => { const parentModule = { contact: 'contacts', lead: 'leads', account: 'accounts', opportunity: 'opportunities' }[entity];
    const kids = (nb.relMap(u, parentModule, [{ id, _contactIds: [] }], conf.related, cfgFor(u))[id]) || []; if (conf.fn === 'count') return kids.length;
    const vals = kids.map((k) => k[conf.field]).filter((v) => v != null && v !== '' && isFinite(Number(v))).map(Number); if (!vals.length) return null;
    const r = conf.fn === 'sum' ? vals.reduce((a, b) => a + b, 0) : conf.fn === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length : conf.fn === 'min' ? Math.min(...vals) : Math.max(...vals); return Math.round(r * 100) / 100; };
  // File Upload / Image Upload custom field: the file is kept in the record's attachments for good; the field points at the newest one
  api.uploadCrmFieldFile = async (entity, id, fieldId, { name, mimeType, size, dataUrl } = {}) => {
    const u = crmEditor(); const e = str(entity, 20); const rec = entityOf(u, e, str(id, 60)); const f = activeFields(cfg(), e).find((z) => z.id === str(fieldId, 60)) || fail('That field does not exist.');
    if (!FILE_TYPES.includes(f.type)) fail('That field does not take files.'); if (!fieldCan(u, f, 'edit')) fail(`You cannot change "${f.label}".`);
    const full = str(name, 400).replace(/[\\/]/g, '_') || fail('A file name is required.'); const dot = full.lastIndexOf('.'); const ext = dot > 0 ? full.slice(dot + 1).toLowerCase() : '';
    if (f.type === 'image' && !IMAGE_EXT.includes(ext)) fail(`${f.label} takes an image (${IMAGE_EXT.join(', ')}).`);
    if (f.type === 'file' && !C.ALLOWED_UPLOAD_EXT.includes(ext)) fail(`.${ext || '?'} files are not allowed. Allowed: ${C.ALLOWED_UPLOAD_EXT.join(', ')}.`);
    if (!(Number(size) >= 0) || Number(size) > C.MAX_UPLOAD_BYTES) fail('File is too large.');
    const file = { id: nid('cfile'), entity: e, entityId: rec.id, name: full.slice(0, 200), mimeType: str(mimeType, 100) || 'application/octet-stream', size: Number(size) || 0, dataUrl: dataUrl || null, uploadedBy: u.id, createdAt: now(), fieldId: f.id };
    await x.keepFile(file); db().crmAttachments.push(file); rec.custom = { ...(rec.custom || {}), [f.id]: [file.id] }; touch(rec, u); save(); return { id: file.id, name: file.name };
  };
  return api;
}
