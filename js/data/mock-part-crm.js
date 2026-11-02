/* mock adapter: the CRM (John, Nov 2). FAKE DATA ONLY. Behind the `crm` feature flag (features.js): when it is off every call here refuses.
 * People are the portal's own contacts (one person per email); the CRM adds owner, account, CRM stage, last contacted, tags, notes.
 * Leads (not yet contacts) convert into a contact (+ account). Accounts = brokerages / lenders. Opportunities = the referral-partner pipeline.
 * Activities = calls / emails (logged only, never sent) / meetings / notes / follow-up tasks on a lead, contact, account or opportunity.
 * NOTHING is deleted: leads, contacts, accounts and opportunities are archived; tasks are done or cancelled.
 * Access (mirrored by private.crm_* in migration 22): see crm.js. */
import { CRM_OFF } from './features.js?v=202611021647';
import { LEAD_STATUSES, LEAD_SOURCES, CRM_STAGE_CODES, crmStageLabel, OPP_STAGES, ACTIVITY_KIND_CODES, TASK_STATES, ACCOUNT_KIND_CODES, CRM_ENTITIES, accountKindForType,
  canUseCrm, crmReadOnly, CRM_OWNER_ROLES, normTags, orderTotals } from './crm.js?v=202611021647';

export function crmPart(x, flags) {
  const { load, save, nid, needUser, dealsFor, prof, nameOf, fullName, clone, now, fail, str, emailOk, localDate, C } = x;
  const db = () => { const d = load(); ['crmLeads', 'crmAccounts', 'crmOpportunities', 'crmActivities', 'clientSalesReps', 'dealSalesPeople'].forEach((k) => { d[k] ||= []; }); return d; };
  // ---------- access ----------
  const crmUser = () => { if (!flags.crm) fail(CRM_OFF); const u = needUser(); if (!canUseCrm(u)) fail('The CRM is for CLA staff only.'); return u; };
  const crmEditor = () => { const u = crmUser(); if (crmReadOnly(u)) fail('The Processor has read-only access to the CRM.'); return u; };
  const isSales = (u) => CRM_OWNER_ROLES.includes(u.role) && !u.isAdmin;
  const salesIds = () => new Set(db().profiles.filter((p) => CRM_OWNER_ROLES.includes(p.role)).map((p) => p.id));   // incl. disabled / removed salespeople, so their records stay with the team
  const seesAllCrm = (u) => u.isAdmin || u.role === 'Processor';
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
  const contactRow = (id) => db().contacts.find((c) => c.id === id) || fail('Contact not found.');
  const accountRow = (id) => db().crmAccounts.find((a) => a.id === id) || fail('Account not found.');
  const get = { lead: (u, id) => { const l = db().crmLeads.find((z) => z.id === id); if (!l || !leadSeen(u, l)) fail('Lead not found.'); return l; },
    contact: (u, id) => { const c = db().contacts.find((z) => z.id === id); if (!c || !contactSeen(u, c)) fail('Contact not found.'); return c; },
    account: (u, id) => { const a = db().crmAccounts.find((z) => z.id === id); if (!a || !accountSeen(u, a)) fail('Account not found.'); return a; },
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
  const ctype = (v) => { const s = str(v, 20); if (!s) return null; if (!C.CONTACT_TYPE_CODES.includes(s)) fail('Pick a contact type from the list (Realtor, Lender or Buyer/Seller).'); return s; };
  const oneOf = (v, list, label, dflt) => { const s = str(v, 40); if (!s) { if (dflt !== undefined) return dflt; fail(`${label} is required.`); } if (!list.includes(s)) fail(`Pick a ${label.toLowerCase()} from the list.`); return s; };
  const date = (v, label, { noFuture = false } = {}) => { const s = x.dateOrNull(v, label); if (s && noFuture && s > localDate()) fail(`${label} cannot be in the future.`); return s; };
  const email = (v) => { const e = str(v, 200).toLowerCase(); if (e && !emailOk(e)) fail('Email is not valid.'); return e; };
  const emailTaken = (e, exceptContactId) => { const d = db(); return d.contacts.find((c) => c.email === e && c.id !== exceptContactId) || null; };
  const money = (v, label) => x.money(v, label);
  const ownerName = (id) => (id ? nameOf(id) : '');
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

  // ---------- row shapes ----------
  const leadOut = (u, l) => ({ ...clone(l), name: `${l.firstName} ${l.lastName}`.trim(), ownerName: ownerName(l.ownerId), converted: !!l.convertedAt, archived: !!l.archivedAt, canEdit: !crmReadOnly(u),
    convertedContactName: l.convertedContactId ? fullName(contactRow(l.convertedContactId)) : '' });
  const contactOut = (u, c) => { const o = ordersOf([c.id]); const t = orderTotals(o);
    return { id: c.id, name: fullName(c), firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, company: c.company, contactType: c.contactType || null, hasLogin: !!c.profileId,
      ownerId: c.crmOwnerId || null, ownerName: ownerName(c.crmOwnerId), accountId: c.accountId || null, accountName: accName(c.accountId), stage: c.crmStage || null, stageLabel: crmStageLabel(c.crmStage),
      lastContactedOn: c.lastContactedOn || null, tags: c.tags || [], notes: c.crmNotes || '', archived: !!c.crmArchivedAt, fromLeadId: c.crmLeadId || null,
      salesReps: salesRepsOf(c), linked: linked(u, c), orders: t.orders, volume: t.volume, canEdit: !crmReadOnly(u) }; };
  const accountOut = (u, a) => { const cs = db().contacts.filter((c) => c.accountId === a.id && inCrm(c)); const t = orderTotals(ordersOf(cs.map((c) => c.id)));
    return { ...clone(a), ownerName: ownerName(a.ownerId), archived: !!a.archivedAt, contacts: cs.filter((c) => contactSeen(u, c)).length, orders: t.orders, volume: t.volume, canEdit: !crmReadOnly(u) }; };
  const oppOut = (u, o) => ({ ...clone(o), ownerName: ownerName(o.ownerId), contactName: o.contactId ? fullName(contactRow(o.contactId)) : '', accountName: accName(o.accountId), archived: !!o.archivedAt, canEdit: !crmReadOnly(u) });
  const parentName = (entity, id) => { const d = db();
    if (entity === 'lead') { const l = d.crmLeads.find((z) => z.id === id); return l ? `${l.firstName} ${l.lastName}`.trim() : ''; }
    if (entity === 'contact') { const c = d.contacts.find((z) => z.id === id); return c ? fullName(c) : ''; }
    if (entity === 'account') return accName(id); const o = d.crmOpportunities.find((z) => z.id === id); return o ? o.name : ''; };
  const actOut = (a) => ({ ...clone(a), ownerName: ownerName(a.ownerId), createdByName: nameOf(a.createdBy), parentName: parentName(a.entity, a.entityId), parentLink: `#/crm/${a.entity === 'opportunity' ? 'pipeline' : a.entity + 's'}/${a.entity === 'opportunity' ? '' : a.entityId}`,
    overdue: a.kind === 'task' && a.status === 'open' && !!a.dueDate && a.dueDate < localDate() });
  const actsFor = (pairs) => db().crmActivities.filter((a) => pairs.some(([e, id]) => a.entity === e && a.entityId === id)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(actOut);

  const api = {
    async crmMe() { const u = crmUser(); return { canEdit: !crmReadOnly(u), role: u.role, isAdmin: !!u.isAdmin, id: u.id, scope: seesAllCrm(u) ? 'all' : u.role === 'Sales Team' ? 'team' : 'own' }; },
    async listCrmOwners() { crmUser(); return db().profiles.filter((p) => CRM_OWNER_ROLES.includes(p.role) && p.status === 'active').map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), role: p.role })).sort((a, b) => a.name.localeCompare(b.name)); },

    // ---------- leads ----------
    async listCrmLeads() { const u = crmUser(); return db().crmLeads.filter((l) => leadSeen(u, l)).map((l) => leadOut(u, l)); },
    async getCrmLead(id) { const u = crmUser(); const l = get.lead(u, id); return { ...leadOut(u, l), activities: actsFor([['lead', l.id]]) }; },
    async createCrmLead(input) {
      const u = crmEditor(); const d = db();
      const l = { id: nid('lead'), firstName: str(input.firstName, 80) || fail('First name is required.'), lastName: str(input.lastName, 80), company: str(input.company, 120), email: email(input.email), phone: x.phone(input.phone),
        contactType: ctype(input.contactType), source: oneOf(input.source, LEAD_SOURCES, 'Source', 'Other'), status: oneOf(input.status, LEAD_STATUSES, 'Status', 'New'), ownerId: owner(u, input.ownerId, null, true), notes: str(input.notes, 4000),
        convertedAt: null, convertedContactId: null, convertedAccountId: null, archivedAt: null, createdBy: u.id, createdAt: now() };
      if (l.email) { const c = emailTaken(l.email); if (c) fail(`${fullName(c)} is already a contact with this email (one person per email). Open them under CRM > Contacts instead.`);
        if (d.crmLeads.some((z) => z.email === l.email && !z.convertedAt && !z.archivedAt)) fail('A lead with this email already exists.'); }
      d.crmLeads.push(l); save(); return leadOut(u, l);
    },
    async updateCrmLead(id, patch) {
      const u = crmEditor(); const d = db(); const l = get.lead(u, id); if (l.convertedAt) fail('This lead was converted; edit the contact instead.');
      ['firstName', 'lastName', 'company', 'notes'].forEach((k) => { if (patch[k] != null) l[k] = str(patch[k], k === 'notes' ? 4000 : 120); }); if (!l.firstName) fail('First name is required.');
      if (patch.phone != null) l.phone = x.phone(patch.phone);
      if (patch.email != null) { const e = email(patch.email); if (e && e !== l.email) { const c = emailTaken(e); if (c) fail(`${fullName(c)} is already a contact with this email (one person per email).`);
        if (d.crmLeads.some((z) => z.id !== l.id && z.email === e && !z.convertedAt && !z.archivedAt)) fail('A lead with this email already exists.'); } l.email = e; }
      if (patch.contactType !== undefined) l.contactType = ctype(patch.contactType);
      if (patch.source != null) l.source = oneOf(patch.source, LEAD_SOURCES, 'Source'); if (patch.status != null) l.status = oneOf(patch.status, LEAD_STATUSES, 'Status');
      if (patch.ownerId !== undefined) l.ownerId = owner(u, patch.ownerId, l.ownerId);
      save(); return leadOut(u, l);
    },
    // Lead -> Contact (+ Account). One person per email: if a contact already has the email, pass { linkExisting: true } to attach the lead to that person instead.
    // Account: accountId (existing) or newAccountName (+ accountKind); none = contact without an account. Optional opportunityName starts a pipeline card.
    async convertCrmLead(id, opts = {}) {
      const u = crmEditor(); const d = db(); const l = get.lead(u, id);
      if (l.convertedAt) fail('This lead was already converted.'); if (l.archivedAt) fail('Restore this lead before converting it.');
      let acc = null;
      if (str(opts.accountId, 60)) acc = get.account(u, str(opts.accountId, 60));
      else if (str(opts.newAccountName, 160)) { const name = str(opts.newAccountName, 160);
        const dup = d.crmAccounts.find((a) => a.name.toLowerCase() === name.toLowerCase() && !a.archivedAt); if (dup) fail(`An account named "${dup.name}" already exists; pick it from the list.`);
        acc = { id: nid('acc'), name, kind: oneOf(opts.accountKind, ACCOUNT_KIND_CODES, 'Account type', accountKindForType(l.contactType)), phone: '', website: '', city: '', state: '', ownerId: l.ownerId, notes: '', archivedAt: null, createdBy: u.id, createdAt: now() }; }
      let c = l.email ? emailTaken(l.email) : null; let linkedExisting = false;
      if (c) { if (!opts.linkExisting) fail(`A contact with this email already exists: ${fullName(c)}. Choose "Link to the existing contact" (one person per email).`);
        if (!inCrm(c)) fail('That email belongs to a CLA staff login; it cannot be a CRM contact.');
        if (!c.contactType && l.contactType) c.contactType = l.contactType;
        linkedExisting = true; if (!c.crmOwnerId) c.crmOwnerId = l.ownerId; if (!c.crmStage) c.crmStage = 'prospect'; if (acc && !c.accountId) c.accountId = acc.id; if (!c.crmLeadId) c.crmLeadId = l.id;
      } else {
        if (l.email && d.profiles.some((p) => p.email === l.email && p.status !== 'removed')) fail('A user with this email already exists.');
        c = { id: nid('c'), profileId: null, firstName: l.firstName, lastName: l.lastName, email: l.email, phone: l.phone, company: acc ? acc.name : l.company, contactType: l.contactType,
          crmOwnerId: l.ownerId, accountId: acc ? acc.id : null, crmStage: 'prospect', lastContactedOn: null, tags: [], crmNotes: l.notes, crmLeadId: l.id, crmArchivedAt: null, createdBy: u.id, createdAt: now() };
        d.contacts.push(c); }
      if (acc && !d.crmAccounts.includes(acc)) d.crmAccounts.push(acc);
      let opp = null;
      if (str(opts.opportunityName, 160)) { opp = { id: nid('opp'), name: str(opts.opportunityName, 160), stage: 'New', contactId: c.id, accountId: acc ? acc.id : c.accountId || null, ownerId: l.ownerId, estVolume: null, expectedClose: null, notes: '', archivedAt: null, createdBy: u.id, createdAt: now() }; d.crmOpportunities.push(opp); }
      Object.assign(l, { convertedAt: now(), convertedContactId: c.id, convertedAccountId: acc ? acc.id : null, status: 'Qualified' });   // a converted lead counts as qualified
      actLog(u, 'contact', c.id, `Converted from lead ${l.firstName} ${l.lastName}`.trim() + (acc ? ` (account ${acc.name})` : ''));
      save(); return { contactId: c.id, accountId: acc ? acc.id : null, opportunityId: opp ? opp.id : null, linkedExisting };
    },

    // ---------- contacts (the portal's contacts table) ----------
    async listCrmContacts() { const u = crmUser(); return db().contacts.filter((c) => contactSeen(u, c)).map((c) => contactOut(u, c)); },
    async getCrmContact(id) {
      const u = crmUser(); const c = get.contact(u, id); const orders = withAccess(u, ordersOf([c.id]));
      const pairs = [['contact', c.id]]; if (c.crmLeadId) pairs.push(['lead', c.crmLeadId]);
      return { ...contactOut(u, c), account: c.accountId ? accountOut(u, accountRow(c.accountId)) : null, orders, totals: orderTotals(orders), activities: actsFor(pairs),
        opportunities: db().crmOpportunities.filter((o) => o.contactId === c.id).map((o) => oppOut(u, o)) };
    },
    async createCrmContact(input) {
      const u = crmEditor(); const d = db(); const e = email(input.email);
      if (e) { const c = emailTaken(e); if (c) fail(`A contact with this email already exists: ${fullName(c)} (one person per email).`); if (d.profiles.some((p) => p.email === e && p.status !== 'removed')) fail('A user with this email already exists.'); }
      const acc = str(input.accountId, 60) ? get.account(u, str(input.accountId, 60)) : null;
      const c = { id: nid('c'), profileId: null, firstName: str(input.firstName, 80) || fail('First name is required.'), lastName: str(input.lastName, 80), email: e, phone: x.phone(input.phone), company: str(input.company, 120) || (acc ? acc.name : ''),
        contactType: ctype(input.contactType), crmOwnerId: owner(u, input.ownerId, null, true), accountId: acc ? acc.id : null, crmStage: oneOf(input.stage, CRM_STAGE_CODES, 'CRM stage', 'prospect'), lastContactedOn: date(input.lastContactedOn, 'Last contacted', { noFuture: true }),
        tags: normTags(input.tags), crmNotes: str(input.notes, 4000), crmLeadId: null, crmArchivedAt: null, createdBy: u.id, createdAt: now() };
      d.contacts.push(c); save(); return contactOut(u, c);
    },
    // CRM fields only (name / email / phone stay with the Processor's contact edit on the order, because a contact may be a portal login)
    async updateCrmContact(id, patch) {
      const u = crmEditor(); const c = get.contact(u, id);
      if (patch.ownerId !== undefined) c.crmOwnerId = owner(u, patch.ownerId, c.crmOwnerId);
      if (patch.accountId !== undefined) c.accountId = str(patch.accountId, 60) ? get.account(u, str(patch.accountId, 60)).id : null;
      if (patch.stage !== undefined) { const s = oneOf(patch.stage, CRM_STAGE_CODES, 'CRM stage', null); if (s !== (c.crmStage || null)) actLog(u, 'contact', c.id, `CRM stage set to ${crmStageLabel(s) || 'not set'}`); c.crmStage = s; }
      if (patch.lastContactedOn !== undefined) c.lastContactedOn = date(patch.lastContactedOn, 'Last contacted', { noFuture: true });
      if (patch.tags !== undefined) c.tags = normTags(patch.tags);
      if (patch.notes != null) c.crmNotes = str(patch.notes, 4000);
      if (patch.contactType !== undefined) c.contactType = ctype(patch.contactType);
      if (patch.company != null) c.company = str(patch.company, 120);
      save(); return contactOut(u, c);
    },

    // ---------- accounts ----------
    async listCrmAccounts() { const u = crmUser(); return db().crmAccounts.filter((a) => accountSeen(u, a)).map((a) => accountOut(u, a)); },
    async getCrmAccount(id) {
      const u = crmUser(); const a = get.account(u, id); const d = db(); const cs = d.contacts.filter((c) => c.accountId === a.id && inCrm(c));
      const orders = withAccess(u, ordersOf(cs.map((c) => c.id)));
      return { ...accountOut(u, a), contactList: cs.filter((c) => contactSeen(u, c)).map((c) => contactOut(u, c)), orders, totals: orderTotals(orders), activities: actsFor([['account', a.id]]),
        opportunities: d.crmOpportunities.filter((o) => o.accountId === a.id).map((o) => oppOut(u, o)) };
    },
    async createCrmAccount(input) {
      const u = crmEditor(); const d = db(); const name = str(input.name, 160) || fail('Account name is required.');
      const dup = d.crmAccounts.find((a) => a.name.toLowerCase() === name.toLowerCase() && !a.archivedAt); if (dup) fail(`An account named "${dup.name}" already exists.`);
      const a = { id: nid('acc'), name, kind: oneOf(input.kind, ACCOUNT_KIND_CODES, 'Account type', 'other'), phone: x.phone(input.phone), website: str(input.website, 200), city: str(input.city, 80), state: str(input.state, 2).toUpperCase(),
        ownerId: owner(u, input.ownerId, null, true), notes: str(input.notes, 4000), archivedAt: null, createdBy: u.id, createdAt: now() };
      if (a.state && !C.US_STATES.includes(a.state)) fail('Pick a US state.');
      d.crmAccounts.push(a); save(); return accountOut(u, a);
    },
    async updateCrmAccount(id, patch) {
      const u = crmEditor(); const d = db(); const a = get.account(u, id);
      if (patch.name != null) { const n = str(patch.name, 160) || fail('Account name is required.'); if (d.crmAccounts.some((z) => z.id !== a.id && !z.archivedAt && z.name.toLowerCase() === n.toLowerCase())) fail(`An account named "${n}" already exists.`); a.name = n; }
      if (patch.kind != null) a.kind = oneOf(patch.kind, ACCOUNT_KIND_CODES, 'Account type');
      if (patch.phone != null) a.phone = x.phone(patch.phone); ['website', 'city', 'notes'].forEach((k) => { if (patch[k] != null) a[k] = str(patch[k], k === 'notes' ? 4000 : 200); });
      if (patch.state != null) { const s = str(patch.state, 2).toUpperCase(); if (s && !C.US_STATES.includes(s)) fail('Pick a US state.'); a.state = s; }
      if (patch.ownerId !== undefined) a.ownerId = owner(u, patch.ownerId, a.ownerId);
      save(); return accountOut(u, a);
    },

    // ---------- pipeline (opportunities) ----------
    async listCrmOpportunities() { const u = crmUser(); return db().crmOpportunities.filter((o) => oppSeen(u, o)).map((o) => oppOut(u, o)); },
    async createCrmOpportunity(input) {
      const u = crmEditor(); const o = { id: nid('opp'), name: str(input.name, 160) || fail('Name is required.'), stage: oneOf(input.stage, OPP_STAGES, 'Stage', 'New'),
        contactId: str(input.contactId, 60) ? get.contact(u, str(input.contactId, 60)).id : null, accountId: str(input.accountId, 60) ? get.account(u, str(input.accountId, 60)).id : null,
        ownerId: owner(u, input.ownerId, null, true), estVolume: money(input.estVolume, 'Estimated volume'), expectedClose: date(input.expectedClose, 'Expected close'), notes: str(input.notes, 4000), archivedAt: null, createdBy: u.id, createdAt: now() };
      if (!o.contactId && !o.accountId) fail('Link the opportunity to a contact or an account.');
      db().crmOpportunities.push(o); save(); return oppOut(u, o);
    },
    async updateCrmOpportunity(id, patch) {
      const u = crmEditor(); const o = get.opportunity(u, id);
      if (patch.name != null) o.name = str(patch.name, 160) || fail('Name is required.');
      if (patch.stage != null) { const s = oneOf(patch.stage, OPP_STAGES, 'Stage'); if (s !== o.stage) actLog(u, 'opportunity', o.id, `Moved from ${o.stage} to ${s}`); o.stage = s; }
      if (patch.contactId !== undefined) o.contactId = str(patch.contactId, 60) ? get.contact(u, str(patch.contactId, 60)).id : null;
      if (patch.accountId !== undefined) o.accountId = str(patch.accountId, 60) ? get.account(u, str(patch.accountId, 60)).id : null;
      if (!o.contactId && !o.accountId) fail('Link the opportunity to a contact or an account.');
      if (patch.ownerId !== undefined) o.ownerId = owner(u, patch.ownerId, o.ownerId);
      if (patch.estVolume !== undefined) o.estVolume = money(patch.estVolume, 'Estimated volume'); if (patch.expectedClose !== undefined) o.expectedClose = date(patch.expectedClose, 'Expected close');
      if (patch.notes != null) o.notes = str(patch.notes, 4000);
      save(); return oppOut(u, o);
    },
    async moveCrmOpportunity(id, stage) { return api.updateCrmOpportunity(id, { stage }); },

    // ---------- archive (no deletes in the CRM, for anyone) ----------
    async archiveCrmRecord(entity, id, archived = true) {
      const u = crmEditor(); const r = entityOf(u, entity, id); const k = entity === 'contact' ? 'crmArchivedAt' : 'archivedAt';
      r[k] = archived ? r[k] || now() : null; actLog(u, entity, id, archived ? 'Archived' : 'Restored from archive'); save(); return { ok: true, archived: !!r[k] };
    },

    // ---------- activities and follow-ups ----------
    async listCrmActivities(entity, id) { const u = crmUser(); entityOf(u, entity, id); return actsFor([[entity, id]]); },
    async logCrmActivity(input) {
      const u = crmEditor(); const entity = str(input.entity, 20); const parent = entityOf(u, entity, str(input.entityId, 60));
      const kind = oneOf(input.kind, ACTIVITY_KIND_CODES, 'Activity type'); const task = kind === 'task';
      const parentOwner = entity === 'contact' ? parent.crmOwnerId : parent.ownerId;
      const a = { id: nid('ca'), entity, entityId: parent.id, kind, subject: str(input.subject, 200) || fail('Subject is required.'), body: str(input.body, 4000),
        status: task ? 'open' : 'done', dueDate: task ? date(input.dueDate, 'Due date') || fail('A follow-up task needs a due date.') : null,
        occurredOn: task ? null : date(input.occurredOn, 'Date', { noFuture: true }) || localDate(), ownerId: task ? owner(u, input.ownerId || (isSales(u) ? u.id : parentOwner), null, true) : u.id,
        system: false, createdBy: u.id, createdAt: now(), doneAt: task ? null : now() };
      if (task && !a.ownerId) fail('Pick who owns this follow-up.');
      // a logged call / email / meeting on a contact moves its "last contacted" date forward
      if (entity === 'contact' && ['call', 'email', 'meeting'].includes(kind) && (!parent.lastContactedOn || parent.lastContactedOn < a.occurredOn)) parent.lastContactedOn = a.occurredOn;
      db().crmActivities.push(a); save(); return actOut(a);
    },
    async updateCrmActivity(id, patch) {
      const u = crmEditor(); const a = db().crmActivities.find((z) => z.id === id); if (!a || !seen(u, a.entity, a.entityId)) fail('Activity not found.');
      if (a.system) fail('This entry was written by the CRM and cannot be changed.');
      if (patch.status != null) { if (a.kind !== 'task') fail('Only follow-up tasks have a status.'); const s = oneOf(patch.status, TASK_STATES, 'Status'); a.status = s; a.doneAt = s === 'done' ? now() : null; }
      if (patch.dueDate !== undefined) { if (a.kind !== 'task') fail('Only follow-up tasks have a due date.'); a.dueDate = date(patch.dueDate, 'Due date') || fail('A follow-up task needs a due date.'); }
      if (patch.subject != null) a.subject = str(patch.subject, 200) || fail('Subject is required.'); if (patch.body != null) a.body = str(patch.body, 4000);
      if (patch.ownerId !== undefined && a.kind === 'task') a.ownerId = owner(u, patch.ownerId, a.ownerId) || fail('Pick who owns this follow-up.');
      save(); return actOut(a);
    },
    // My follow-ups: OPEN tasks for one owner (default: me), overdue first. ownerId 'all' = every open task this person can see.
    async listCrmFollowUps({ ownerId = '', status = 'open' } = {}) {
      const u = crmUser(); const who = ownerId || u.id;
      return db().crmActivities.filter((a) => a.kind === 'task' && (status === 'all' || a.status === status) && (who === 'all' || a.ownerId === who) && seen(u, a.entity, a.entityId)).map(actOut)
        .sort((a, b) => (b.overdue - a.overdue) || String(a.dueDate).localeCompare(String(b.dueDate)));
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
      const count = (key, list) => list.map((k) => { const ls = leads.filter((l) => l[key] === k); return { name: k, leads: ls.length, converted: ls.filter((l) => l.convertedAt).length }; }).filter((r) => r.leads);
      return { from: f, to: t, totals: orderTotals(deals), byRealtor: rows(groups.realtor), byLender: rows(groups.lender), byBrokerage: rows(groups.brokerage), bySalesperson: rows(groups.sales),
        leadsBySource: count('source', LEAD_SOURCES), leadsByStatus: count('status', LEAD_STATUSES), leadCount: leads.length };
    },
  };
  return api;
}
