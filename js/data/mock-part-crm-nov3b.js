/* mock adapter: CRM Nov 3 (b) (Janine / John; Zoho videos 7, 9, 10). FAKE DATA ONLY. Behind the `crm` flag; CLA staff only (TC and outside users: none).
 *  * GLOBAL SEARCH (name, email, phone by digits) over Clients, Leads, Companies, Deals (= the portal's orders), Tasks, Meetings, Calls; only records
 *    the viewer may see. Recent items and recent searches per user.
 *  * SEND EMAIL from a client / lead / company / opportunity / deal: NOTHING IS SENT (Gmail is not connected). Send = "Drafted (not sent)",
 *    Schedule = "Scheduled (not sent)"; the email is kept on the record's Emails list for good, with its attachments (never deleted).
 *  * DASHBOARDS (built-in + your own; Only me / All Users / Custom; lock for shared users) with Chart, KPI, Target Meter and Funnel components.
 *  * REPORTS (folders, columns, row groups, aggregates, AND / OR filters, sharing); Export only for Admin / Super admin.
 * Nothing here deletes: dashboards, components and reports are RETIRED (hidden, restorable). Mirrored by migration 30. */
import { MODULE_CODES, moduleName, SEARCH_MODULES, REPORT_MODULES, DASH_MODULES, SEARCH_COLUMNS, SEARCH_KEYS, SEARCH_MAX, parseQuery, searchMatch, moduleFields, reportFields,
  RELATED, joinRows, runReport, reportCsv, cleanCriteria, applyCriteria, criteriaText, chartData, measureOf, measureLabel, groupOf, display, dealStageOf, CALL_TYPES,
  COMPONENT_CODES, CHART_CODES, VISIBILITY, DEPARTMENTS, SHARE_ROLES, dashboardVisible, dashboardEditable, reportVisible, NUMERIC, isDateType, BUCKETS, AGG_FNS, CF_ENTITY_OF, DEFAULT_COLUMNS } from './crm-analytics.js?v=202611041856';
import { ensureNov3b } from './crm-nov3b.js?v=202611041856';
import { flattenCustom, optLabel, optionsOf } from './crm-config.js?v=202611041856';
import { sanitizeHtml, htmlToText, GMAIL_NOTE, isPersonalFolder, personalFolderId } from './crm-templates.js?v=202611041856';
import { crmReadOnly, CRM_OWNER_ROLES } from './crm.js?v=202611041856';

export const SEND_NOTE = 'Not sent: Gmail is not connected yet. The email was saved on this record only.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENTITY_MODULE = { contact: 'contacts', lead: 'leads', account: 'accounts', opportunity: 'opportunities', deal: 'deals' };

export function crmNov3bPart(x, h) {
  const { save, now, fail, str, clone, nameOf, nid, prof, localDate, dealsFor, C, fullName } = x;
  const { db: db0, cfgFor, crmUser, crmEditor, entityOf, seen, contactSeen, leadSeen, accountSeen, oppSeen, inCrm, leadOut, contactOut, accountOut, oppOut, actOut, salesOf } = h;
  const db = () => ensureNov3b(db0(), { seed: false });
  const isClientRole = (r) => r === 'Client-Buyer' || r === 'Client-Seller';
  const today = () => localDate();
  const L = (cfg, key, v) => optLabel(cfg, key, v, { mark: false });
  const lookupName = (target, id) => { const d = db(); const p = (r) => (r ? `${r.firstName || ''} ${r.lastName || ''}`.trim() : '');
    if (target === 'contacts') return p(d.contacts.find((c) => c.id === id)) || id; if (target === 'leads') return p(d.crmLeads.find((l) => l.id === id)) || id;
    if (target === 'accounts') return (d.crmAccounts.find((a) => a.id === id) || {}).name || id; if (target === 'opportunities') return (d.crmOpportunities.find((o) => o.id === id) || {}).name || id;
    const q = d.deals.find((z) => z.id === id); return q ? `${q.fileNumber} ${q.street}` : id; };
  const fmt = { nameOf, lookupName, fileName: (fid) => (db().crmAttachments.find((f) => f.id === fid) || {}).name || '(file)' };
  const flat = (cfg, entity, row) => flattenCustom(cfg, entity, row, fmt);
  // ---------- CRM DEALS SCOPE (John, Nov 3; migration 32 private.crm_deal_visible) ----------
  // 'all'  = Admin, Super admin, Processor (read-only) and Sales Team (whose CRM scope is the whole sales team's records; every deal owner is a salesperson):
  //          every order they can open in the portal, with Deal Owner / Client / Source filters.
  // 'own'  = Sales Person: ONLY the deals they are a salesperson on (deal_sales_people). A deal they merely appear on as a contact is not "theirs" in the
  //          CRM. Enforced here (list, record page, search, reports, dashboards all read this) and in SQL, not only on the screen.
  const dealScope = (u) => (u.isAdmin || C.runsOrders(u) || u.role === 'Sales Team' ? 'all' : 'own');
  const crmDealsFor = (u) => { const list = dealsFor(u); return dealScope(u) === 'all' ? list : list.filter((q) => salesOf(q.id).some((z) => z.salesId === u.id)); };

  // ---------- module rows (what the viewer may see), flat, for search / reports / dashboards ----------
  const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k]]));
  function dealRow(u, q, cfg) {
    const d = db(); const ps = d.participants.filter((p) => p.dealId === q.id); const cOf = (id) => d.contacts.find((c) => c.id === id);
    const clients = ps.filter((p) => isClientRole(p.role)).map((p) => cOf(p.contactId)).filter(Boolean); const agents = ps.filter((p) => C.isAgent(p.role)).map((p) => cOf(p.contactId)).filter(Boolean);
    const firstClient = clients[0]; const sales = salesOf(q.id); const people = ps.map((p) => cOf(p.contactId)).filter(Boolean);
    return { id: q.id, name: `${q.fileNumber} ${q.street}`, fileNumber: q.fileNumber, propertyAddress: `${q.street}, ${q.city}, ${q.state} ${q.zip}`, amount: q.purchasePrice == null ? null : q.purchasePrice,
      loanAmount: q.loanAmount == null ? null : q.loanAmount, stage: dealStageOf(q.status), status: q.status, closingDate: q.closingDate || null, openDate: q.openDate || null,
      clientName: [...new Set(clients.map(fullName))].join(', '), _clientLink: firstClient && contactSeen(u, firstClient) ? `#/crm/contacts/${firstClient.id}` : '',
      contactName: [...new Set(agents.map(fullName))].join(', '), ownerId: sales[0] ? sales[0].salesId : null, ownerName: sales[0] ? nameOf(sales[0].salesId) : '', salesReps: sales.map((s) => nameOf(s.salesId)).join(', '),
      county: q.county || '', city: q.city, transactionType: q.transactionType || '', lenderName: q.lenderName || '', createdAt: q.createdAt, _link: `#/crm/deals/${q.id}`, _portalLink: `#/deals/${q.id}`,
      // John, Nov 3: SOURCE = the order's Source of business (the CRM Settings Lead Source list, staff only; Matt Nov 3 b) = who / what sent us the deal
      source: q.sourceOfBusiness || '', sourceText: q.sourceOfBusiness ? L(cfg, 'leadSource', q.sourceOfBusiness) : '', salesIds: sales.map((z) => z.salesId),
      clientIds: [...new Set(ps.filter((p) => isClientRole(p.role)).map((p) => p.contactId))],
      _contactIds: [...new Set(ps.map((p) => p.contactId))], _people: people.flatMap((c) => [fullName(c), c.email || '']), _phones: people.map((c) => c.phone || '').filter(Boolean),
      amountText: q.purchasePrice == null ? '' : display({ type: 'currency', key: 'a' }, { a: q.purchasePrice }), closingDateText: display({ type: 'date', key: 'a' }, { a: q.closingDate }) };
  }
  const personOf = (entity, id) => { const d = db(); return entity === 'contact' ? d.contacts.find((c) => c.id === id) : entity === 'lead' ? d.crmLeads.find((l) => l.id === id) : null; };
  function actRow(a, cfg) {
    const p = personOf(a.entity, a.entityId) || (a.entity === 'opportunity' ? personOf('contact', (db().crmOpportunities.find((o) => o.id === a.entityId) || {}).contactId) : null);
    const base = { id: a.id, subject: a.subject, relatedTo: a.relatedTo || '', _relatedLink: a.relatedLink || '', contactName: a.contactName || '', _contactLink: a.contactLink || '', createdAt: a.createdAt, createdBy: a.createdBy, createdByName: a.createdByName,
      modifiedAt: a.modifiedAt || null, _entity: a.entity, _entityId: a.entityId, _people: p ? [`${p.firstName || ''} ${p.lastName || ''}`.trim(), p.email || ''] : [], _phones: p ? [p.phone, p.mobile].filter(Boolean) : [] };
    if (a.kind === 'task') return { ...base, dueDate: a.dueDate, status: a.status, priority: a.priority, ownerId: a.ownerId, ownerName: a.ownerName, closedAt: a.closedAt || null, _link: `#/crm/tasks/${a.id}`,
      dueDateText: display({ type: 'date', key: 'a' }, { a: a.dueDate }), statusText: L(cfg, 'taskStatus', a.status), priorityText: L(cfg, 'taskPriority', a.priority) };
    if (a.kind === 'meeting') return { ...base, startsAt: a.startsAt, endsAt: a.endsAt, meetingType: a.meetingType || '', location: a.location || '', hostId: a.hostId, hostName: a.hostName, _link: `#/crm/meetings/${a.id}`,
      startsAtText: display({ type: a.allDay ? 'date' : 'datetime', key: 'a' }, { a: a.startsAt }), endsAtText: display({ type: a.allDay ? 'date' : 'datetime', key: 'a' }, { a: a.endsAt }) };
    const start = a.callStart || (a.occurredOn ? a.occurredOn : null);
    // video 11: Call Owner = the owner picked on the form (older logs: whoever logged it); duration shown mm:ss
    return { ...base, callType: a.callType || '', callStart: start, callDuration: a.callDuration == null ? null : a.callDuration, callStatus: a.callStatus || 'Completed', ownerId: a.ownerId || a.createdBy, ownerName: a.ownerName || a.createdByName, _link: `#/crm/calls/${a.id}`,
      callTypeText: a.callType || '', callStartText: display({ type: a.callStart ? 'datetime' : 'date', key: 'a' }, { a: start }), callDurationText: a.callDurationText || (a.callDuration == null ? '' : `${a.callDuration} min`) };
  }
  function rowsOf(u, module, cfg = cfgFor(u)) {
    const d = db();
    switch (module) {
      case 'contacts': return d.contacts.filter((c) => contactSeen(u, c)).map((c) => { const r = flat(cfg, 'contact', contactOut(u, c));
        return { ...r, createdBy: c.createdBy || null, createdByName: c.createdBy ? nameOf(c.createdBy) : '', createdAt: c.createdAt || null, modifiedAt: c.modifiedAt || null, tags: (c.tags || []).join(', '), _link: `#/crm/contacts/${c.id}`, _companyLink: c.accountId ? `#/crm/accounts/${c.accountId}` : '' }; });
      case 'leads': return d.crmLeads.filter((l) => leadSeen(u, l)).map((l) => { const r = flat(cfg, 'lead', leadOut(u, l)); return { ...r, createdByName: l.createdBy ? nameOf(l.createdBy) : '', leadSourceText: L(cfg, 'leadSource', r.leadSource), _link: `#/crm/leads/${l.id}` }; });
      case 'accounts': return d.crmAccounts.filter((a) => accountSeen(u, a)).map((a) => ({ ...flat(cfg, 'account', accountOut(u, a)), createdByName: a.createdBy ? nameOf(a.createdBy) : '', _link: `#/crm/accounts/${a.id}` }));
      case 'opportunities': return d.crmOpportunities.filter((o) => oppSeen(u, o)).map((o) => ({ ...flat(cfg, 'opportunity', oppOut(u, o)), _link: '#/crm/pipeline', _contactLink: o.contactId ? `#/crm/contacts/${o.contactId}` : '', _accountLink: o.accountId ? `#/crm/accounts/${o.accountId}` : '' }));
      case 'deals': return crmDealsFor(u).map((q) => dealRow(u, q, cfg));
      case 'tasks': case 'meetings': case 'calls': { const kind = { tasks: 'task', meetings: 'meeting', calls: 'call' }[module];
        return d.crmActivities.filter((a) => a.kind === kind && seen(u, a.entity, a.entityId)).map((a) => actRow(actOut(a), cfg)); }
      default: return fail('Unknown CRM module.');
    }
  }
  // child rows per parent id (reports' related modules, rollup summaries)
  function relMap(u, parent, parentRows, child, cfg) {
    const kids = rowsOf(u, child, cfg); const m = {}; const add = (pid, k) => { (m[pid] ||= []).push(k); };
    const d = db();
    parentRows.forEach((p) => {
      if (['tasks', 'meetings', 'calls'].includes(child)) { const ent = { contacts: 'contact', leads: 'lead', accounts: 'account', opportunities: 'opportunity' }[parent]; kids.filter((k) => k._entity === ent && k._entityId === p.id).forEach((k) => add(p.id, k)); return; }
      if (parent === 'contacts' && child === 'deals') kids.filter((k) => (k._contactIds || []).includes(p.id)).forEach((k) => add(p.id, k));
      else if (parent === 'contacts' && child === 'opportunities') kids.filter((k) => k.contactId === p.id).forEach((k) => add(p.id, k));
      else if (parent === 'accounts' && child === 'contacts') kids.filter((k) => k.accountId === p.id).forEach((k) => add(p.id, k));
      else if (parent === 'accounts' && child === 'opportunities') kids.filter((k) => k.accountId === p.id).forEach((k) => add(p.id, k));
      else if (parent === 'accounts' && child === 'deals') { const cids = new Set(d.contacts.filter((c) => c.accountId === p.id).map((c) => c.id)); kids.filter((k) => (k._contactIds || []).some((id) => cids.has(id))).forEach((k) => add(p.id, k)); }
      else if (parent === 'deals' && child === 'contacts') kids.filter((k) => (p._contactIds || []).includes(k.id)).forEach((k) => add(p.id, k));
    });
    return m;
  }

  // ---------- recent items / searches ----------
  const recents = (u) => (db().crmRecent[u.id] ||= []);
  const searches = (u) => (db().crmRecentSearches[u.id] ||= []);
  const rememberSearch = (u, q) => { const list = searches(u); const e = list.find((z) => z.q.toLowerCase() === q.toLowerCase()); if (e) { e.at = now(); e.q = q; } else list.push({ q, at: now() }); save(); };   // updated, never removed
  const recordName = (u, module, id) => { const r = rowsOf(u, module).find((z) => z.id === id); return r ? { name: r.name || r.subject || '', link: r._link } : null; };

  // ---------- emails ----------
  const emailList = (v, label) => { const list = (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\s]+/)).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
    list.forEach((e) => { if (e.length > 200 || !EMAIL_RE.test(e)) fail(`${label}: "${e.slice(0, 60)}" is not a valid email address.`); }); if (list.length > 50) fail(`${label}: at most 50 addresses.`); return [...new Set(list)]; };
  const aliasesOf = (u) => (db().crmEmailAliases[u.id] || []).filter((a) => !a.retiredAt).map((a) => a.email);
  const fromOptions = (u) => { const p = prof(u.id) || {}; return [...new Set([String(p.email || '').toLowerCase(), ...aliasesOf(u)].filter(Boolean))]; };
  // the record an email is about (only records the viewer may see). Deals = orders the viewer can see in the portal.
  function recordFor(u, entity, id) {
    const e = str(entity, 20); const rid = str(id, 60);
    if (e === 'deal') { const q = dealsFor(u).find((z) => z.id === rid); if (!q) fail('Deal not found.'); return { entity: e, id: q.id, name: `${q.fileNumber} ${q.street}`, email: '', row: dealRow(u, q, cfgFor(u)) }; }
    if (e === 'report') { const r = reportOf(u, rid); return { entity: e, id: r.id, name: r.name, email: '' }; }
    if (!['contact', 'lead', 'account', 'opportunity'].includes(e)) fail('Unknown CRM record type.');
    const r = entityOf(u, e, rid); const out = e === 'lead' ? leadOut(u, r) : e === 'contact' ? contactOut(u, r) : e === 'account' ? accountOut(u, r) : oppOut(u, r);
    let email = out.email || ''; if (e === 'opportunity' && r.contactId) { const c = db().contacts.find((z) => z.id === r.contactId); email = c ? c.email || '' : ''; }
    return { entity: e, id: r.id, name: out.name, email };
  }
  const emailOut = (m) => ({ ...clone(m), statusLabel: m.status === 'scheduled' ? 'Scheduled (not sent)' : 'Drafted (not sent)', createdByName: nameOf(m.createdBy),
    attachments: (m.attachments || []).map((fid) => { const f = db().crmAttachments.find((z) => z.id === fid) || {}; return { id: fid, name: f.name || '(missing file)', size: f.size || 0 }; }), notice: SEND_NOTE });

  // ---------- dashboards ----------
  const dashOf = (u, id) => { const d = db().crmDashboards.find((z) => z.id === str(id, 60)); if (!d || !dashboardVisible(u, d)) fail('Dashboard not found.'); return d; };
  const dashEditable = (u, id) => { const d = dashOf(u, id); if (!dashboardEditable(u, d, crmReadOnly(u))) fail(crmReadOnly(u) ? 'The Processor has read-only access to the CRM.' : d.builtin ? 'Only an Admin or Super admin can change a built-in dashboard; clone it to make your own.' : d.locked ? 'This dashboard is locked for shared users; clone it to make your own.' : 'Only the owner can change this dashboard.'); return d; };
  const compOf = (u, id) => { const c = db().crmDashComponents.find((z) => z.id === str(id, 60)); if (!c) fail('Component not found.'); dashOf(u, c.dashboardId); return c; };
  const roleOk = (r) => SHARE_ROLES.includes(r);
  function shareIn(input, cur = {}) {
    const vis = input.visibility !== undefined ? str(input.visibility, 10) : cur.visibility || 'me'; if (!VISIBILITY.some(([k]) => k === vis)) fail('Visibility must be Only me, All Users or Custom.');
    const users = vis === 'custom' ? [...new Set((input.shareUsers !== undefined ? input.shareUsers : cur.shareUsers || []).map((id) => str(id, 60)).filter(Boolean))] : [];
    users.forEach((id) => { const p = prof(id); if (!p || p.status !== 'active' || C.isOutside(p.role) || p.role === 'Transaction Coordinator') fail('Share only with CLA users who have the CRM.'); });
    const roles = vis === 'custom' ? [...new Set((input.shareRoles !== undefined ? input.shareRoles : cur.shareRoles || []).map(String))] : []; roles.forEach((r) => { if (!roleOk(r)) fail('Pick roles from the list.'); });
    const depts = vis === 'custom' ? [...new Set((input.shareDepts !== undefined ? input.shareDepts : cur.shareDepts || []).map(String))] : []; depts.forEach((k) => { if (!DEPARTMENTS.some(([c]) => c === k)) fail('Pick departments from the list.'); });
    if (vis === 'custom' && !users.length && !roles.length && !depts.length) fail('Pick at least one user, role or department (Custom).');
    const yes = (v) => v === true || v === '1' || v === 'on' || v === 'true';
    const locked = vis === 'me' ? false : input.locked !== undefined ? yes(input.locked) : !!cur.locked;
    return { visibility: vis, shareUsers: users, shareRoles: roles, shareDepts: depts, locked };
  }
  function cleanComponent(input, cfg) {
    const type = str(input.type, 20); if (!COMPONENT_CODES.includes(type)) fail('That component type is coming soon. Available now: Chart, KPI, Target Meter, Funnel.');
    const name = str(input.name, 120) || fail('Component Name is required.'); const c = input.config || {}; const module = str(c.module, 20); if (!DASH_MODULES.includes(module)) fail('Pick a module.');
    const fields = moduleFields(module, cfg); const fk = (k) => fields.find((f) => f.key === k);
    const fn = str((c.measure || {}).fn, 10) || 'count'; if (!['count', 'sum', 'avg'].includes(fn)) fail('Measure must be Record Count, Sum or Average.');
    let measure = { fn: 'count' }; if (fn !== 'count') { const f = fk(str((c.measure || {}).field, 80)); if (!f || !NUMERIC.includes(f.type)) fail('Pick a number or currency field to sum or average.'); measure = { fn, field: f.key }; }
    const grp = (g, need) => { if (!g || !g.field) { if (need) fail('Pick a Grouping field.'); return null; } const f = fk(str(g.field, 80)); if (!f) fail('The grouping field is not in this module.');
      const bucket = isDateType(f.type) ? (BUCKETS.some(([b]) => b === g.bucket) ? g.bucket : 'day') : undefined; return bucket ? { field: f.key, bucket } : { field: f.key }; };
    const config = { module, measure, criteria: cleanCriteria(c.criteria, fields) };
    if (type === 'chart' || type === 'funnel') config.grouping = grp(c.grouping, true);
    if (type === 'chart') { config.chartType = CHART_CODES.includes(c.chartType) ? c.chartType : 'column'; config.grouping2 = config.chartType === 'stacked' ? grp(c.grouping2, false) : null; }
    if (type === 'target') { const t = Number(c.target); if (!isFinite(t) || t <= 0) fail('Enter the target (a number above 0).'); config.target = Math.round(t * 100) / 100; }
    return { name, type, config };
  }
  function componentData(u, comp, dash, cfg) {
    const cf = comp.config; const fields = moduleFields(cf.module, cfg); let rows = rowsOf(u, cf.module, cfg);
    rows = applyCriteria(rows, cf.criteria, fields, { logic: 'and', today: today() });
    const df = (dash && dash.filters) || {};   // dashboard filters: an owner (user fields) and a period on Created Time
    if (df.ownerId) { const f = fields.find((z) => z.type === 'user' && /Owner|Host/.test(z.label)); if (f) rows = rows.filter((r) => r[f.key] === df.ownerId); }
    if (df.period) rows = applyCriteria(rows, [{ field: 'createdAt', op: 'is', value: df.period }], fields, { today: today() });
    const base = { measureLabel: measureLabel(cf.measure, fields), criteriaText: criteriaText(cf.criteria, fields, cfg, 'and', userNames()), currency: cf.measure.fn !== 'count' && (fields.find((f) => f.key === cf.measure.field) || {}).type === 'currency' };
    if (comp.type === 'kpi') return { ...base, value: measureOf(rows, cf.measure, fields), count: rows.length, ids: rows.map((r) => r.id) };
    if (comp.type === 'target') { const v = measureOf(rows, cf.measure, fields) || 0; return { ...base, value: v, target: cf.target, pct: Math.round((v / cf.target) * 1000) / 10, count: rows.length, ids: rows.map((r) => r.id) }; }
    return { ...base, ...chartData(rows, cf, fields, cfg) };
  }
  const compOut = (u, c, dash, cfg) => { let data = null, error = ''; try { data = componentData(u, c, dash, cfg); } catch (e) { error = e.message; } return { ...clone(c), data, error }; };
  const dashOut = (u, d) => ({ ...clone(d), ownerName: d.ownerId ? nameOf(d.ownerId) : 'CLA (built-in)', canEdit: dashboardEditable(u, d, crmReadOnly(u)), mine: d.ownerId === u.id, retired: !!d.retiredAt,
    components: db().crmDashComponents.filter((c) => c.dashboardId === d.id && !c.retiredAt).length });

  // ---------- reports ----------
  const reportOf = (u, id) => { const r = db().crmReports.find((z) => z.id === str(id, 60)); if (!r || !reportVisible(u, r)) fail('Report not found.'); return r; };
  const userNames = () => db().profiles.map((p) => ({ id: p.id, name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.id }));   // user values in filter text show names
  const reportEditable = (u, r) => !crmReadOnly(u) && (u.isAdmin || r.createdBy === u.id);
  const folderName = (id) => { if (isPersonalFolder(id)) { const p = prof(id.slice(9)); return p ? `${p.firstName} ${p.lastName}`.trim() : 'Personal'; } return (db().crmReportFolders.find((f) => f.id === id) || {}).name || ''; };
  const folderFor = (u, v) => { const id = str(v, 80) || personalFolderId(u.id); if (isPersonalFolder(id)) { if (id !== personalFolderId(u.id)) fail('You can only save into shared folders or your own folder.'); return id; }
    if (!db().crmReportFolders.some((f) => f.id === id)) fail('Pick a folder from the list.'); return id; };
  function cleanReport(u, input, cur, cfg) {
    const has = (k) => !cur || input[k] !== undefined; const r = cur ? { ...cur } : {};
    if (!cur) { const m = str(input.module, 20); if (!REPORT_MODULES.includes(m)) fail('Select the primary module (Clients, Leads, Companies, Deals, Tasks, Meetings or Calls).'); r.module = m; }
    else if (input.module !== undefined && input.module !== cur.module) fail('A report keeps its primary module; create a new report for another module.');
    if (has('name')) { r.name = str(input.name, 200).replace(/[\u0000-\u001f]/g, ''); if (!r.name) fail('Report Name is required.'); if (r.name.length > 120) fail('Report Name can be at most 120 characters.'); }
    if (has('description')) r.description = str(input.description, 500);
    if (has('folderId')) r.folderId = folderFor(u, input.folderId);
    if (has('related')) { const rel = [...new Set((Array.isArray(input.related) ? input.related : []).map(String))]; rel.forEach((m) => { if (!(RELATED[r.module] || []).includes(m)) fail(`${moduleName(m)} is not a related module of ${moduleName(r.module)}.`); }); if (rel.length > 2) fail('Pick at most 2 related modules.'); r.related = rel; }
    const fields = reportFields(r.module, r.related || [], cfg); const fk = (k) => fields.find((f) => f.key === k);
    if (has('columns')) { const cols = [...new Set((Array.isArray(input.columns) ? input.columns : []).map(String))]; if (!cols.length) fail('Pick at least one column.'); if (cols.length > 60) fail('At most 60 columns.'); cols.forEach((k) => { if (!fk(k)) fail('A column is not in this report\'s modules.'); }); r.columns = cols; }
    if (has('rowGroups')) { const g = [...new Set((Array.isArray(input.rowGroups) ? input.rowGroups : []).map(String).filter(Boolean))]; if (g.length > 3) fail('At most 3 row groups.'); g.forEach((k) => { if (!fk(k)) fail('A row group is not in this report\'s modules.'); }); r.rowGroups = g; }
    if (has('aggregates')) { r.aggregates = (Array.isArray(input.aggregates) ? input.aggregates : []).filter((a) => a && a.field).slice(0, 20).map((a) => { const f = fk(String(a.field)); if (!f) fail('An aggregate column is not in this report.');
      if (!AGG_FNS.some(([k]) => k === a.fn)) fail('Aggregate must be Sum, Average, Minimum, Maximum or Count.'); if (a.fn !== 'count' && !NUMERIC.includes(f.type)) fail(`${f.label} is not a number; only Count works on it.`); return { field: f.key, fn: a.fn }; }); }
    if (has('filters')) r.filters = cleanCriteria(input.filters, fields);
    if (has('logic')) { const l = str(input.logic, 3).toLowerCase() || 'and'; if (!['and', 'or'].includes(l)) fail('Combine filters with AND or OR.'); r.logic = l; }
    if (has('sort')) { const s = input.sort && input.sort.field ? { field: String(input.sort.field), dir: input.sort.dir === 'desc' ? 'desc' : 'asc' } : null; if (s && !fk(s.field)) fail('The sort field is not in this report.'); r.sort = s; }
    if (has('bucket')) r.bucket = BUCKETS.some(([b]) => b === input.bucket) ? input.bucket : 'day';
    if (has('share')) { const s = input.share || {}; const mode = s.mode === 'custom' ? 'custom' : 'all'; const users = mode === 'custom' ? [...new Set((s.users || []).map((v) => str(v, 60)).filter(Boolean))] : []; const roles = mode === 'custom' ? [...new Set((s.roles || []).map(String))] : [];
      users.forEach((id) => { const p = prof(id); if (!p || p.status !== 'active' || C.isOutside(p.role)) fail('Share only with CLA users.'); }); roles.forEach((x2) => { if (!roleOk(x2)) fail('Pick roles from the list.'); });
      if (mode === 'custom' && !users.length && !roles.length) fail('Pick at least one user or role to share with (or share with everyone).'); r.share = { mode, users, roles }; }
    r.columns ||= DEFAULT_COLUMNS[r.module]; r.rowGroups ||= []; r.aggregates ||= []; r.filters ||= []; r.logic ||= 'and'; r.related ||= []; r.share ||= { mode: 'all', users: [], roles: [] };
    return r;
  }
  function execReport(u, def, cfg) {
    const fields = reportFields(def.module, def.related, cfg); let rows = rowsOf(u, def.module, cfg);
    if ((def.related || []).length) { const rm = {}; def.related.forEach((m) => { rm[m] = relMap(u, def.module, rows, m, cfg); }); rows = joinRows(rows, def.related, rm); }
    const out = runReport(rows, def, fields, cfg, { today: today() });
    return { ...out, groupFields: (def.rowGroups || []).map((k) => (fields.find((f) => f.key === k) || {}).label || k), filterText: criteriaText(def.filters, fields, cfg, def.logic, userNames()) };
  }
  const reportOut = (u, r) => ({ ...clone(r), moduleLabel: moduleName(r.module), folderName: folderName(r.folderId), personal: isPersonalFolder(r.folderId), createdByName: nameOf(r.createdBy), modifiedByName: r.modifiedBy ? nameOf(r.modifiedBy) : '',
    canEdit: reportEditable(u, r), canExport: !!u.isAdmin, retired: !!r.retiredAt });
  const asDef = (u, input, cfg) => (typeof input === 'string' ? reportOf(u, input) : cleanReport(u, { name: 'Unsaved report', ...input }, null, cfg));

  const api = {
    // ---------- search ----------
    async searchCrm(q, { module = 'all', limit = 0, remember = false } = {}) {
      const u = crmUser(); const pq = parseQuery(q); const cfg = cfgFor(u); if (!pq.q) return { q: '', groups: [] };
      if (module !== 'all' && !SEARCH_MODULES.includes(module)) fail('Pick a module to search.');
      const groups = (module === 'all' ? SEARCH_MODULES : [module]).map((m) => { const hits = rowsOf(u, m, cfg).filter((r) => searchMatch(r, pq, SEARCH_KEYS[m]));
        const list = hits.slice(0, limit > 0 ? limit : SEARCH_MAX).map((r) => ({ id: r.id, link: r._link, title: r.name || r.subject || '', archived: !!r.archived, cells: Object.fromEntries(SEARCH_COLUMNS[m].map(([k]) => [k, r[k] == null ? '' : String(r[k])])),
          links: { name: r._link, subject: r._link, clientName: r._clientLink || '', contactName: r._contactLink || '', relatedTo: r._relatedLink || '' } }));
        return { module: m, label: moduleName(m), columns: SEARCH_COLUMNS[m], rows: list, total: hits.length }; }).filter((g) => module !== 'all' || g.total);
      if (remember) rememberSearch(u, pq.q);
      return { q: pq.q, phone: !!pq.digits, groups };
    },
    async noteCrmRecent(entity, id) {
      const u = crmUser(); const module = ENTITY_MODULE[str(entity, 20)] || (['task', 'meeting'].includes(entity) ? entity + 's' : null); if (!module) fail('Unknown CRM record type.');
      if (!rowsOf(u, module).some((r) => r.id === str(id, 60))) fail('Record not found.');
      const list = recents(u); const e = list.find((z) => z.module === module && z.id === id); if (e) e.at = now(); else list.push({ module, id, at: now() }); save(); return { ok: true };   // updated, never removed
    },
    async listCrmRecent() {
      const u = crmUser(); const items = recents(u).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).map((z) => { const n = recordName(u, z.module, z.id); return n ? { ...z, moduleLabel: moduleName(z.module), ...n } : null; }).filter(Boolean).slice(0, 10);
      return { items, searches: searches(u).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10).map((z) => z.q) };
    },
    async saveCrmRecentSearch(q) { const u = crmUser(); const s0 = parseQuery(q).q; if (s0) rememberSearch(u, s0); return { ok: true }; },
    // ---------- deals (the portal's orders, read-only in the CRM) ----------
    // John, Nov 3: filters. status 'Open' (default on the screen) | 'All' | a portal status; ownerId = any salesperson on the file ('none' = no salesperson);
    // clientId = a buyer / seller (borrower) contact; source = a Lead Source value ('none' = not set). A Sales Person may not ask for another owner's deals.
    async listCrmDeals(f = {}) { const u = crmUser(); f = f || {}; const scope = dealScope(u);
      const owner = str(f.ownerId, 60); if (owner && scope === 'own' && owner !== u.id) fail('A Sales Person sees only their own deals.');
      const status = str(f.status, 20); if (status && status !== 'All' && !C.DEAL_STATUSES.includes(status)) fail('Unknown status.');
      const client = str(f.clientId, 60); const src = str(f.source, 60);
      return rowsOf(u, 'deals').filter((r) => (!status || status === 'All' || r.status === status) && (!owner || (owner === 'none' ? !r.salesIds.length : r.salesIds.includes(owner)))
        && (!client || r.clientIds.includes(client)) && (!src || (src === 'none' ? !r.source : r.source === src))); },
    // the filter choices for the viewer: Deal Owner and Client only for the 'all' scope (a Sales Person filters by Source); Source = the Lead Source list
    // (active options, plus a retired one still on a visible deal)
    async listCrmDealFilters() { const u = crmUser(); const scope = dealScope(u); const rows = rowsOf(u, 'deals'); const d = db(); const cfg = cfgFor(u);
      const owners = scope === 'all' ? d.profiles.filter((p) => CRM_OWNER_ROLES.includes(p.role) && (p.status === 'active' || rows.some((r) => r.salesIds.includes(p.id))))
        .map((p) => ({ id: p.id, name: nameOf(p.id), role: p.role })).sort((a, b) => a.name.localeCompare(b.name)) : [];
      const clients = scope === 'all' ? [...new Set(rows.flatMap((r) => r.clientIds))].map((id) => d.contacts.find((c) => c.id === id)).filter(Boolean)
        .map((c) => ({ id: c.id, name: fullName(c) })).sort((a, b) => a.name.localeCompare(b.name)) : [];
      const used = new Set(rows.map((r) => r.source).filter(Boolean));
      const sources = optionsOf(cfg, 'leadSource').filter((o) => !o.retired || used.has(o.value)).map((o) => ({ value: o.value, label: o.label + (o.retired ? ' (retired)' : '') }));
      return { scope, role: u.role, me: { id: u.id, name: nameOf(u.id) }, owners, clients, sources, statuses: ['Open', ...C.DEAL_STATUSES.filter((z) => z !== 'Open'), 'All'] }; },
    async getCrmDeal(id) { const u = crmUser(); const q = crmDealsFor(u).find((z) => z.id === str(id, 60)) || fail('Deal not found.'); const row = dealRow(u, q, cfgFor(u)); const d = db();
      const people = d.participants.filter((p) => p.dealId === q.id).map((p) => { const c = d.contacts.find((z) => z.id === p.contactId) || {}; return { role: p.role, name: fullName(c), email: c.email || '', link: c.id && contactSeen(u, c) ? `#/crm/contacts/${c.id}` : '' }; });
      return { ...row, people, notes: q.notes || '', emails: d.crmEmails.filter((m) => m.entity === 'deal' && m.entityId === q.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(emailOut), canEdit: !crmReadOnly(u) }; },
    // ---------- email (NOTHING IS SENT) ----------
    async getCrmEmailSettings() { const u = crmUser(); const p = prof(u.id) || {}; return { primary: String(p.email || '').toLowerCase(), aliases: aliasesOf(u), from: fromOptions(u), sendNote: GMAIL_NOTE }; },
    // the From aliases (video 7 "aliases from settings"): a removed alias is retired (kept, no longer offered), never deleted
    async saveCrmEmailAliases(list) { const u = crmUser(); const mine = String((prof(u.id) || {}).email || '').toLowerCase(); const a = emailList(list, 'From aliases').filter((e) => e !== mine); if (a.length > 5) fail('At most 5 aliases.');
      const all = (db().crmEmailAliases[u.id] ||= []); all.forEach((z) => { if (!a.includes(z.email) && !z.retiredAt) z.retiredAt = now(); if (a.includes(z.email)) z.retiredAt = null; });
      a.forEach((e) => { if (!all.some((z) => z.email === e)) all.push({ email: e, addedAt: now(), retiredAt: null }); }); save(); return { aliases: aliasesOf(u), from: fromOptions(u) }; },
    async getCrmComposeContext(entity, id) { const u = crmUser(); const r = recordFor(u, entity, id); const sig = ((db().crmSignatures || {})[u.id] || {}).html || '';
      return { entity: r.entity, id: r.id, recordName: r.name, to: r.email ? [r.email] : [], from: fromOptions(u), signature: sig, canSend: !crmReadOnly(u), sendNote: SEND_NOTE, canAttachReport: r.entity === 'report' && !!u.isAdmin }; },
    async listCrmEmails(entity, id) { const u = crmUser(); const r = recordFor(u, entity, id); return db().crmEmails.filter((m) => m.entity === r.entity && m.entityId === r.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(emailOut); },
    // mode 'send' -> status drafted (not sent); 'schedule' -> status scheduled (not sent) at scheduledAt (future, 'YYYY-MM-DDTHH:MM')
    async saveCrmEmail(input = {}) {
      const u = crmEditor(); const r = recordFor(u, input.entity, input.entityId); const mode = input.mode === 'schedule' ? 'schedule' : 'send';
      const from = str(input.from, 200).toLowerCase() || fromOptions(u)[0]; if (!fromOptions(u).includes(from)) fail('Pick a From address from your list (your login email or an alias in My email settings).');
      const to = emailList(input.to, 'To'); if (!to.length) fail('Add at least one To address.'); const cc = emailList(input.cc, 'Cc'); const bcc = emailList(input.bcc, 'Bcc');
      const subject = str(input.subject, 1000).replace(/[\r\n\u0000-\u001f]/g, ' '); if (!subject) fail('Subject is required.'); if (subject.length > 250) fail('Subject can be at most 250 characters.');
      const html = sanitizeHtml(String(input.html == null ? '' : input.html)); if (html.length > 600000) fail('The email is too large for this demo.');
      let scheduledAt = null; if (mode === 'schedule') { const s = str(input.scheduledAt, 20); const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(s); if (!m || !x.dateOrNull(m[1], 'Schedule')) fail('Pick the date and time to schedule.');
        const t = new Date(+m[1].slice(0, 4), +m[1].slice(5, 7) - 1, +m[1].slice(8, 10), +m[2], +m[3]); if (!(t > new Date())) fail('The scheduled time must be in the future.'); scheduledAt = s; }
      const files = Array.isArray(input.attachments) ? input.attachments : []; if (files.length > 10) fail('At most 10 attachments.');
      const m = { id: nid('em'), entity: r.entity, entityId: r.id, from, to, cc, bcc, subject, html, text: htmlToText(html).slice(0, 20000), status: mode === 'schedule' ? 'scheduled' : 'drafted', scheduledAt,
        templateId: str(input.templateId, 60) || null, attachments: [], createdBy: u.id, createdAt: now() };
      const stored = [];
      for (const f of files) { const full = str(f.name, 400).replace(/[\\/]/g, '_') || fail('A file name is required.'); const dot = full.lastIndexOf('.'); const ext = dot > 0 ? full.slice(dot + 1).toLowerCase() : '';
        if (!C.ALLOWED_UPLOAD_EXT.includes(ext)) fail(`${ext ? '.' + ext + ' files are' : 'Files without an extension are'} not allowed. Allowed: ${C.ALLOWED_UPLOAD_EXT.join(', ')}.`);
        if (!(Number(f.size) >= 0) || Number(f.size) > C.MAX_UPLOAD_BYTES) fail(`File is too large (demo limit ${Math.round(C.MAX_UPLOAD_BYTES / 1e5) / 10} MB).`);
        stored.push({ id: nid('cfile'), entity: 'email', entityId: m.id, name: full.slice(0, 200), mimeType: str(f.mimeType, 100) || 'application/octet-stream', size: Number(f.size) || 0, dataUrl: f.dataUrl || null, uploadedBy: u.id, createdAt: now() }); }
      if (input.attachReport) { if (r.entity !== 'report') fail('Only a report can be attached as CSV.'); if (!u.isAdmin) fail('Only an Admin or Super admin can export a report (CSV), so only they can attach it.');
        const def = reportOf(u, r.id); const out = execReport(u, def, cfgFor(u)); const csv = reportCsv(out, out.groupFields);
        stored.push({ id: nid('cfile'), entity: 'email', entityId: m.id, name: `${def.name.replace(/[^\w .-]+/g, '_').slice(0, 80)}.csv`, mimeType: 'text/csv', size: csv.length, dataUrl: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv), uploadedBy: u.id, createdAt: now() }); }
      for (const f of stored) { await x.keepFile(f); db().crmAttachments.push(f); m.attachments.push(f.id); }
      db().crmEmails.push(m); save(); return emailOut(m);
    },
    async getCrmEmailAttachment(emailId, fileId) { const u = crmUser(); const m = db().crmEmails.find((z) => z.id === str(emailId, 60)) || fail('Email not found.'); recordFor(u, m.entity, m.entityId);
      if (!(m.attachments || []).includes(fileId)) fail('Attachment not found.'); const f = db().crmAttachments.find((z) => z.id === fileId); const content = await x.fileContent(f);
      return { name: f.name, mimeType: f.mimeType, dataUrl: content || 'data:text/plain;charset=utf-8,' + encodeURIComponent('FAKE DEMO FILE\n' + f.name) }; },

    // ---------- module rows / fields (screens and the Supabase twin use the same shapes) ----------
    async listCrmModuleRows(module) { const u = crmUser(); if (!MODULE_CODES.includes(module)) fail('Unknown CRM module.'); return rowsOf(u, module); },
    async crmModuleFields(module, related = []) { const u = crmUser(); return REPORT_MODULES.includes(module) && related.length ? reportFields(module, related, cfgFor(u)) : moduleFields(module, cfgFor(u)); },
    async listCrmShareTargets() { crmUser(); const users = db().profiles.filter((p) => p.status === 'active' && !C.isOutside(p.role) && p.role !== 'Transaction Coordinator').map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), role: p.role })).sort((a, b) => a.name.localeCompare(b.name));
      return { users, roles: SHARE_ROLES, departments: DEPARTMENTS.map(([id, name, roles]) => ({ id, name, roles })) }; },

    // ---------- dashboards ----------
    async listCrmDashboards({ includeRetired = false } = {}) { const u = crmUser(); return db().crmDashboards.filter((d) => dashboardVisible(u, d) && (includeRetired ? (!d.retiredAt || dashboardEditable(u, d, crmReadOnly(u))) : !d.retiredAt))
      .sort((a, b) => (!!b.builtin - !!a.builtin) || a.name.localeCompare(b.name)).map((d) => dashOut(u, d)); },
    async getCrmDashboard(id) { const u = crmUser(); const d = dashOf(u, id); const cfg = cfgFor(u);
      return { ...dashOut(u, d), list: db().crmDashComponents.filter((c) => c.dashboardId === d.id && !c.retiredAt).sort((a, b) => a.position - b.position).map((c) => compOut(u, c, d, cfg)),
        retiredComponents: dashboardEditable(u, d, crmReadOnly(u)) ? db().crmDashComponents.filter((c) => c.dashboardId === d.id && c.retiredAt).map((c) => ({ id: c.id, name: c.name, retiredAt: c.retiredAt })) : [] }; },
    async createCrmDashboard(input = {}) { const u = crmEditor(); const name = str(input.name, 200); if (!name) fail('Dashboard Name is required.'); if (name.length > 120) fail('Dashboard Name can be at most 120 characters.');
      const d = { id: nid('dash'), builtin: null, name, description: str(input.description, 500), ...shareIn(input), ownerId: u.id, filters: {}, retiredAt: null, createdBy: u.id, createdAt: now(), modifiedAt: now() };
      db().crmDashboards.push(d); save(); return dashOut(u, d); },
    async updateCrmDashboard(id, patch = {}) { const u = crmEditor(); const d = dashEditable(u, id);
      if (patch.name !== undefined) { const n = str(patch.name, 200); if (!n) fail('Dashboard Name is required.'); d.name = n.slice(0, 120); }
      if (patch.description !== undefined) d.description = str(patch.description, 500);
      if (['visibility', 'shareUsers', 'shareRoles', 'shareDepts', 'locked'].some((k) => patch[k] !== undefined)) { if (d.builtin) fail('A built-in dashboard is shared with everyone.'); if (d.ownerId !== u.id) fail('Only the owner changes who sees a dashboard.'); Object.assign(d, shareIn(patch, d)); }
      if (patch.filters !== undefined) { const f = patch.filters || {}; const owner = str(f.ownerId, 60); if (owner) { const p = prof(owner); if (!p || C.isOutside(p.role)) fail('Pick a CLA user.'); }
        const period = str(f.period, 20); if (period && !['today', 'yesterday', 'prev_fy', 'cur_fy', 'next_fy', 'prev_month', 'cur_month', 'next_month', 'this_year', 'prev_year', 'next_year'].includes(period)) fail('Pick a period from the list.');
        d.filters = { ...(owner ? { ownerId: owner } : {}), ...(period ? { period } : {}) }; }
      d.modifiedAt = now(); save(); return dashOut(u, d); },
    async cloneCrmDashboard(id, { name } = {}) { const u = crmEditor(); const src = dashOf(u, id); const d = { ...clone(src), id: nid('dash'), builtin: null, name: (str(name, 120) || `Copy of ${src.name}`).slice(0, 120), visibility: 'me', shareUsers: [], shareRoles: [], shareDepts: [], locked: false,
        ownerId: u.id, retiredAt: null, createdBy: u.id, createdAt: now(), modifiedAt: now(), clonedFrom: src.id };
      db().crmDashboards.push(d); db().crmDashComponents.filter((c) => c.dashboardId === src.id && !c.retiredAt).forEach((c) => db().crmDashComponents.push({ ...clone(c), id: nid('dc'), dashboardId: d.id, createdBy: u.id, createdAt: now(), modifiedAt: now() }));
      save(); return dashOut(u, d); },
    // Retire = hidden (Zoho "Delete"); Restore brings it back. Built-in dashboards cannot be retired.
    async retireCrmDashboard(id, retired = true) { const u = crmEditor(); const d = db().crmDashboards.find((z) => z.id === str(id, 60)); if (!d || !dashboardVisible(u, d)) fail('Dashboard not found.');
      if (d.builtin) fail('A built-in dashboard cannot be retired.'); if (d.ownerId !== u.id && !(u.isAdmin && d.visibility === 'all')) fail('Only the owner can retire this dashboard.');
      d.retiredAt = retired ? d.retiredAt || now() : null; d.retiredBy = retired ? u.id : null; d.modifiedAt = now(); save(); return dashOut(u, d); },
    // Reorder: [{ id, width (1-3), height ('s' | 'm' | 'l') }] in the new order
    async reorderCrmDashboard(id, layout = []) { const u = crmEditor(); const d = dashEditable(u, id); const comps = db().crmDashComponents.filter((c) => c.dashboardId === d.id && !c.retiredAt);
      (Array.isArray(layout) ? layout : []).forEach((l, i) => { const c = comps.find((z) => z.id === l.id); if (!c) fail('A component is not on this dashboard.'); c.position = i + 1;
        if (l.width !== undefined) { const w = Number(l.width); if (![1, 2, 3].includes(w)) fail('Width must be 1, 2 or 3 columns.'); c.width = w; } if (l.height !== undefined) { if (!['s', 'm', 'l'].includes(l.height)) fail('Height must be short, medium or tall.'); c.height = l.height; } });
      d.modifiedAt = now(); save(); return api.getCrmDashboard(d.id); },
    async previewCrmComponent(input = {}) { const u = crmUser(); const cfg = cfgFor(u); const c = cleanComponent(input, cfg); return { ...c, data: componentData(u, c, null, cfg) }; },
    async addCrmComponent(dashId, input = {}) { const u = crmEditor(); const d = dashEditable(u, dashId); const cfg = cfgFor(u); const c = cleanComponent(input, cfg);
      const comps = db().crmDashComponents.filter((z) => z.dashboardId === d.id); const row = { id: nid('dc'), dashboardId: d.id, ...c, position: Math.max(0, ...comps.map((z) => z.position)) + 1, width: [1, 2, 3].includes(Number(input.width)) ? Number(input.width) : 1, height: 'm', retiredAt: null, createdBy: u.id, createdAt: now(), modifiedAt: now() };
      db().crmDashComponents.push(row); d.modifiedAt = now(); save(); return compOut(u, row, d, cfg); },
    async updateCrmComponent(id, input = {}) { const u = crmEditor(); const c = compOf(u, id); const d = dashEditable(u, c.dashboardId); const cfg = cfgFor(u);
      const v = cleanComponent({ name: input.name !== undefined ? input.name : c.name, type: input.type !== undefined ? input.type : c.type, config: input.config !== undefined ? input.config : c.config }, cfg);
      Object.assign(c, v, { modifiedAt: now() }); d.modifiedAt = now(); save(); return compOut(u, c, d, cfg); },
    async cloneCrmComponent(id) { const u = crmEditor(); const c = compOf(u, id); const d = dashEditable(u, c.dashboardId); const n = { ...clone(c), id: nid('dc'), name: `Copy of ${c.name}`.slice(0, 120), position: c.position + 0.5, retiredAt: null, createdBy: u.id, createdAt: now(), modifiedAt: now() };
      db().crmDashComponents.push(n); db().crmDashComponents.filter((z) => z.dashboardId === d.id).sort((a, b) => a.position - b.position).forEach((z, i) => { z.position = i + 1; }); save(); return compOut(u, n, d, cfgFor(u)); },
    async retireCrmComponent(id, retired = true) { const u = crmEditor(); const c = compOf(u, id); dashEditable(u, c.dashboardId); c.retiredAt = retired ? c.retiredAt || now() : null; c.retiredBy = retired ? u.id : null; c.modifiedAt = now(); save(); return { id: c.id, retired: !!c.retiredAt }; },
    async moveCrmComponent(id, toDashId) { const u = crmEditor(); const c = compOf(u, id); dashEditable(u, c.dashboardId); const to = dashEditable(u, toDashId); if (to.id === c.dashboardId) fail('It is already on that dashboard.');
      c.dashboardId = to.id; c.position = Math.max(0, ...db().crmDashComponents.filter((z) => z.dashboardId === to.id && z.id !== c.id).map((z) => z.position)) + 1; c.modifiedAt = now(); save(); return { id: c.id, dashboardId: to.id }; },
    // click a bar / slice: the records behind it (title, the filter, Total Records, links)
    async crmDrillDown(componentId, key = null, key2 = null) {
      const u = crmUser(); const c = compOf(u, componentId); const d = dashOf(u, c.dashboardId); const cfg = cfgFor(u); const data = componentData(u, c, d, cfg); const fields = moduleFields(c.config.module, cfg);
      let ids = data.ids || []; let filter = data.criteriaText || '';
      if (data.groups) { const g = data.groups.find((z) => String(z.key) === String(key == null ? '' : key)) || fail('That bar has no records.'); ids = g.ids;
        const gf = fields.find((f) => f.key === c.config.grouping.field); filter = `${gf ? gf.label : ''}: ${g.label}`;
        if (key2 != null && g.parts) { const p = g.parts.find((z) => String(z.key) === String(key2)); if (p) { ids = p.ids; const g2 = fields.find((f) => f.key === (c.config.grouping2 || {}).field); filter += `; ${g2 ? g2.label : ''}: ${p.label}`; } } }
      const rows = rowsOf(u, c.config.module, cfg).filter((r) => ids.includes(r.id)); const show = fields.filter((f) => f.key !== 'name' && f.key !== 'subject').slice(0, 3);
      return { title: c.name, filter, criteria: data.criteriaText || '', total: rows.length, columns: [fields[0].label, ...show.map((f) => f.label)],
        records: rows.map((r) => ({ id: r.id, link: r._link, name: r.name || r.subject || '', cells: show.map((f) => display(f, r, cfg)) })) };
    },

    // ---------- reports ----------
    async listCrmReportFolders() { const u = crmUser(); const d = db(); const vis = d.crmReports.filter((r) => reportVisible(u, r) && !r.retiredAt && (!isPersonalFolder(r.folderId) || r.folderId === personalFolderId(u.id)));
      const pid = personalFolderId(u.id); return { canCreate: !!u.isAdmin, folders: [...d.crmReportFolders.map((f) => ({ id: f.id, name: f.name, kind: 'shared', count: vis.filter((r) => r.folderId === f.id).length })), { id: pid, name: folderName(pid), kind: 'personal', count: vis.filter((r) => r.folderId === pid).length }] }; },
    async createCrmReportFolder(name) { const u = crmUser(); if (!u.isAdmin) fail('Only an Admin or Super admin can create report folders (everyone has their own folder).');
      const n = str(name, 200).replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' '); if (!n) fail('Folder name is required.'); if (n.length > 60) fail('Folder name can be at most 60 characters.');
      if (db().crmReportFolders.some((f) => f.name.toLowerCase() === n.toLowerCase())) fail(`A folder called "${n}" already exists.`);
      const f = { id: nid('rf'), name: n, createdBy: u.id, createdAt: now(), modifiedAt: now() }; db().crmReportFolders.push(f); save(); return clone(f); },
    async listCrmReports({ includeRetired = false } = {}) { const u = crmUser(); return db().crmReports.filter((r) => reportVisible(u, r) && (!isPersonalFolder(r.folderId) || r.folderId === personalFolderId(u.id)) && (includeRetired || !r.retiredAt))
      .map((r) => reportOut(u, r)).sort((a, b) => a.name.localeCompare(b.name)); },
    async getCrmReport(id) { const u = crmUser(); const r = reportOf(u, id); if (isPersonalFolder(r.folderId) && r.folderId !== personalFolderId(u.id)) fail('Report not found.'); return { ...reportOut(u, r), fields: reportFields(r.module, r.related, cfgFor(u)) }; },
    async createCrmReport(input = {}) { const u = crmEditor(); const cfg = cfgFor(u); const r = cleanReport(u, input, null, cfg);
      const row = { id: nid('rep'), ...r, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now(), lastAccessedAt: null, retiredAt: null }; db().crmReports.push(row); save(); return reportOut(u, row); },
    async updateCrmReport(id, patch = {}) { const u = crmEditor(); const r = reportOf(u, id); if (!reportEditable(u, r)) fail('Only the person who made this report (or an Admin) can change it; use Clone to make your own.');
      const v = cleanReport(u, patch, r, cfgFor(u)); Object.assign(r, v, { modifiedBy: u.id, modifiedAt: now() }); save(); return reportOut(u, r); },
    async cloneCrmReport(id, { name, folderId } = {}) { const u = crmEditor(); const src = reportOf(u, id);
      const row = { ...clone(src), id: nid('rep'), name: (str(name, 120) || `Copy of ${src.name}`).slice(0, 120), folderId: folderFor(u, folderId || personalFolderId(u.id)), share: { mode: 'all', users: [], roles: [] },
        createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now(), lastAccessedAt: null, retiredAt: null, clonedFrom: src.id }; db().crmReports.push(row); save(); return reportOut(u, row); },
    async retireCrmReport(id, retired = true) { const u = crmEditor(); const r = reportOf(u, id); if (!reportEditable(u, r)) fail('Only the person who made this report (or an Admin) can retire it.');
      r.retiredAt = retired ? r.retiredAt || now() : null; r.retiredBy = retired ? u.id : null; r.modifiedAt = now(); save(); return reportOut(u, r); },
    // run a saved report (id) or an unsaved definition; a saved one gets its Last Accessed Date
    async runCrmReport(input) { const u = crmUser(); const cfg = cfgFor(u); const def = asDef(u, input, cfg); const out = execReport(u, def, cfg);
      if (typeof input === 'string') { def.lastAccessedAt = now(); save(); } return { ...out, report: { id: def.id || null, name: def.name, module: def.module, moduleLabel: moduleName(def.module) } }; },
    // Export (CSV): Admin and Super admin only (Janine, video 10)
    async exportCrmReport(input) { const u = crmUser(); if (!u.isAdmin) fail('Only an Admin or Super admin can export reports.'); const cfg = cfgFor(u); const def = asDef(u, input, cfg); const out = execReport(u, def, cfg);
      return { name: `${String(def.name || 'report').replace(/[^\w .-]+/g, '_').slice(0, 80)}.csv`, csv: reportCsv(out, out.groupFields) }; },
  };
  return { api, rowsOf, relMap };
}
