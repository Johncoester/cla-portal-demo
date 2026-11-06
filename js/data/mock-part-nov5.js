/* mock-part-nov5.js : Nov 5 admin controls (task lifecycle, alert groups, entity attorneys, CPL prices, file coverage).
 * FAKE DATA ONLY. Outbox stays queued. No guessed email addresses. */
import { DEMO_ALERT_GROUPS, DEMO_ENTITY_ATTORNEYS, TASK_LANES, OPEN_TASK, OPEN_TASK_HANDLING, cleanAudiences, templateGenerates, resolveCplPrice, cleanCplAmount, postclosingAlertPlan, attorneyAuthorized, ordinaryCoverageDoc, propertyAddressOf, COVERAGE_NOTE, configuredEmail } from './nov5-rules.js?v=202611060013';
import { looksLikeWireDetails } from './constants.js?v=202611060013';
import { taskEnabled } from './task-switches.js?v=202611060013';

const cloneGroups = () => JSON.parse(JSON.stringify(DEMO_ALERT_GROUPS));
const cloneAttorneys = () => JSON.parse(JSON.stringify(DEMO_ENTITY_ATTORNEYS));

export function ensureNov5(d) {
  if (!d || !Array.isArray(d.deals)) return d;
  if (!Array.isArray(d.alertGroups) || !d.alertGroups.length) d.alertGroups = cloneGroups();
  if (!Array.isArray(d.entityAttorneys) || !d.entityAttorneys.length) d.entityAttorneys = cloneAttorneys();
  if (!Array.isArray(d.cplPrices)) d.cplPrices = [];
  if (!Array.isArray(d.coverageLog)) d.coverageLog = [];
  if (!Array.isArray(d.taskAdminLog)) d.taskAdminLog = [];
  return d;
}

export function nov5Part(x) {
  const { load, save, nid, needUser, needAdmin, dealsFor, log, prof, nameOf, clone, now, fail, str, isStaffView } = x;
  const internalStaff = (u) => !!u && isStaffView(u) && u.role !== 'Employee';
  const codeOk = (c) => /^[a-z_]{2,40}$/.test(c);
  const logAdmin = (u, action, code, detail) => { const d = load(); d.taskAdminLog.push({ id: nid('talog'), action, code, detail: str(detail, 500), at: now(), byId: u.id, byName: nameOf(u.id) }); log(null, u.id, action, 'task_template', code, detail); };

  function templateView(t, d) {
    const copies = d.tasks.filter((z) => z.templateCode === t.code);
    const open = copies.filter((z) => OPEN_TASK.includes(z.status));
    return { ...clone(t), audiences: t.audiences || null, lane: t.lane || null, retired: !!t.retiredAt, enabled: taskEnabled(d, t.code) && !t.retiredAt,
      copies: copies.length, openCount: open.length, handling: OPEN_TASK_HANDLING };
  }

  return {
    async listTaskAdmin() {
      const u = needAdmin(); const d = ensureNov5(load());
      const latest = new Map();
      d.taskTemplates.forEach((t) => { const cur = latest.get(t.code); if (!cur || t.version >= cur.version) latest.set(t.code, t); });
      return { tasks: [...latest.values()].map((t) => templateView(t, d)).sort((a, b) => a.title.localeCompare(b.title)),
        lanes: TASK_LANES, audiences: ['buyer', 'seller', 'listing_agent', 'buyer_agent', 'sales_team', 'transaction_coordinator', 'internal'],
        handling: OPEN_TASK_HANDLING, log: clone(d.taskAdminLog).reverse(), me: u.id };
    },
    async saveTaskTemplate(input = {}) {
      const u = needAdmin(); const d = ensureNov5(load());
      const code = str(input.code, 40); if (!codeOk(code)) fail('Task code must be 2 to 40 lowercase letters or underscores.');
      const title = str(input.title, 160); if (title.length < 2) fail('A task needs a title.');
      const lane = input.lane === 'production' ? 'production' : input.lane === 'portal' ? 'portal' : fail('Classify the task as Title Portal or Title Production.');
      const audiences = cleanAudiences(input.audiences, lane);
      const roles = Array.isArray(input.roles) ? input.roles.filter(Boolean) : [];
      const due = Number(input.dueDays || 7); if (!Number.isInteger(due) || due < 1 || due > 90) fail('Due days must be from 1 to 90.');
      const prev = d.taskTemplates.filter((t) => t.code === code).sort((a, b) => b.version - a.version)[0];
      const version = prev ? prev.version + 1 : 1;
      d.taskTemplates.forEach((t) => { if (t.code === code) t.active = false; });
      const row = { id: nid('tpl'), code, version, title, description: str(input.description, 500), roles, dueDays: due, fields: prev ? prev.fields : [], active: true, retiredAt: null, retiredBy: null,
        lane, audiences, clientOnly: !!input.clientOnly, agentRoles: Array.isArray(input.agentRoles) ? input.agentRoles : (prev && prev.agentRoles) || [], publishedBy: u.id, publishedAt: now() };
      d.taskTemplates.push(row);
      if (!d.taskSwitches) d.taskSwitches = [];
      if (!d.taskSwitches.some((s) => s.code === code)) d.taskSwitches.push({ code, enabled: true, updatedAt: now(), updatedBy: u.id, reason: '' });
      logAdmin(u, 'task_template.saved', code, `${lane}; audiences ${audiences.join(', ')}; v${version}`);
      save(); return templateView(row, d);
    },
    async retireTaskTemplate(code, reason) {
      const u = needAdmin(); const d = load(); const why = str(reason, 500); if (why.length < 3) fail('Say why this task is being retired (3 to 500 characters).');
      const rows = d.taskTemplates.filter((t) => t.code === code); if (!rows.length) fail('Template not found.');
      rows.forEach((t) => { t.retiredAt = now(); t.retiredBy = u.id; t.retireReason = why; });
      const open = d.tasks.filter((t) => t.templateCode === code && OPEN_TASK.includes(t.status)).length;
      logAdmin(u, 'task_template.retired', code, `${why}. ${open} open task(s) kept (not cancelled).`);
      save(); return { code, retired: true, openKept: open, handling: OPEN_TASK_HANDLING };
    },
    async listAlertGroups() { needAdmin(); return clone(ensureNov5(load()).alertGroups); },
    async saveAlertGroupMember(groupId, input = {}) {
      const u = needAdmin(); const d = ensureNov5(load()); const g = d.alertGroups.find((z) => z.id === groupId && !z.retiredAt) || fail('Alert group not found.');
      const id = str(input.id, 80) || nid('agm');
      let m = (g.members || []).find((z) => z.id === id);
      const displayName = str(input.displayName, 80); if (displayName.length < 2) fail('A person needs a display name.');
      const email = configuredEmail(input.email);
      if (String(input.email || '').trim() && !email) fail('That address is not a configured contact. Leave email blank until one is provided. Do not invent one.');
      const profileId = str(input.profileId, 80);
      if (profileId && !(prof(profileId) && prof(profileId).status === 'active' && isStaffView(prof(profileId)))) fail('Link an active CLA staff profile id, or leave it blank.');
      const assignmentRole = ['postcloser', 'disbursement', 'processor', 'assigned'].includes(input.assignmentRole) ? input.assignmentRole : g.purpose === 'disbursement' ? 'disbursement' : 'postcloser';
      if (!m) { m = { id }; g.members.push(m); }
      Object.assign(m, { displayName, assignmentRole, profileId: profileId || null, email, retiredAt: null });
      log(null, u.id, 'alert_group.member', 'alert_group', groupId, `${displayName} (${assignmentRole})`);
      save(); return clone(g);
    },
    async retireAlertGroupMember(groupId, memberId) {
      const u = needAdmin(); const d = load(); const g = (d.alertGroups || []).find((z) => z.id === groupId) || fail('Alert group not found.');
      const m = (g.members || []).find((z) => z.id === memberId) || fail('Person not found.');
      m.retiredAt = now(); log(null, u.id, 'alert_group.retired_member', 'alert_group', groupId, m.displayName); save(); return true;
    },
    async listEntityAttorneys() { needAdmin(); return clone(ensureNov5(load()).entityAttorneys); },
    async saveEntityAttorney(input = {}) {
      const u = needAdmin(); const d = ensureNov5(load());
      const id = str(input.id, 80) || nid('atty');
      let row = d.entityAttorneys.find((z) => z.id === id);
      const displayName = str(input.displayName, 80); if (displayName.length < 2) fail('An attorney needs a display name.');
      const assignmentRole = input.assignmentRole === 'backup' ? 'backup' : 'attorney';
      const profileId = str(input.profileId, 80);
      if (profileId && !(prof(profileId) && prof(profileId).status === 'active' && isStaffView(prof(profileId)))) fail('Authorize an active CLA staff profile id. Names are not authorization.');
      if (!row) { row = { id }; d.entityAttorneys.push(row); }
      Object.assign(row, { displayName, assignmentRole, profileId: profileId || null, active: input.active !== false, retiredAt: null });
      log(null, u.id, 'entity_attorney.saved', 'entity_attorney', id, `${displayName} via ${profileId || 'unlinked id'} (${assignmentRole})`);
      save(); return clone(row);
    },
    async listCplPrices() { needAdmin(); return clone(ensureNov5(load()).cplPrices); },
    async saveCplPrice(input = {}) {
      const u = needAdmin(); const d = ensureNov5(load());
      const state = str(input.state, 2).toUpperCase(); const underwriter = str(input.underwriter, 80);
      if (!/^[A-Z]{2}$/.test(state) || underwriter.length < 2) fail('A CPL price needs a state and an underwriter.');
      const amount = cleanCplAmount(input.amount);
      let row = d.cplPrices.find((p) => !p.retiredAt && p.state === state && p.underwriter.toLowerCase() === underwriter.toLowerCase());
      if (amount == null) { if (row) { row.retiredAt = now(); row.updatedBy = u.id; } save(); return { state, underwriter, amount: null, unresolved: true }; }
      if (!row) { row = { id: nid('cplp'), state, underwriter }; d.cplPrices.push(row); }
      Object.assign(row, { amount, retiredAt: null, updatedAt: now(), updatedBy: u.id });
      save(); return clone(row);
    },
    quoteCpl(deal) { const d = ensureNov5(load()); const review = (d.titleReviews || []).find((r) => r.dealId === deal.id && !r.deletedAt); return resolveCplPrice(d.cplPrices, { state: deal.state, underwriter: (review && review.underwriter) || deal.underwriter || '' }); },
    planPostclosingAlerts(deal) { return postclosingAlertPlan(ensureNov5(load()), deal); },
    attorneyCanApprove(profileId) { return attorneyAuthorized(ensureNov5(load()).entityAttorneys, profileId); },
    async listFileCoverage(dealKey) {
      const u = needUser(); if (!internalStaff(u)) fail('File coverage is for CLA staff. Agents and clients stay on their own files.');
      if (u.role === 'Employee') fail('HR-only logins do not get file coverage.');
      const d = ensureNov5(load()); const key = str(dealKey, 80);
      const deal = d.deals.find((z) => z.id === key || z.fileNumber === key) || fail('Order not found.');
      const assigned = dealsFor(u).some((z) => z.id === deal.id);
      const threads = d.threads.filter((t) => t.dealId === deal.id).map((t) => ({ id: t.id, subject: t.subject, messages: d.messages.filter((m) => m.threadId === t.id && !looksLikeWireDetails(m.body)).map((m) => ({ id: m.id, body: m.body, authorId: m.authorId })) }));
      const documents = d.documents.filter((doc) => doc.dealId === deal.id && ordinaryCoverageDoc(doc)).map((doc) => ({ id: doc.id, name: doc.name, visibility: doc.visibility, titleDocKind: doc.titleDocKind || '' }));
      const sentReceived = (d.outbox || []).filter((o) => o.dealId === deal.id && !/wire|payoff|cash to close/i.test(`${o.subject} ${o.body}`)).map((o) => ({ id: o.id, subject: o.subject, toEmail: o.toEmail || '', status: o.status }));
      if (!assigned || u.role === 'Sales Person' || u.role === 'Sales Team') d.coverageLog.push({ id: nid('cov'), dealId: deal.id, actorId: u.id, kind: 'coverage', at: now(), assigned });
      save();
      return { note: COVERAGE_NOTE, displayName: propertyAddressOf(deal), fileNumber: deal.fileNumber, dealId: deal.id, assigned, audited: true, financialIncluded: false, hrIncluded: false, threads, documents, sentReceived };
    },
    async listCoverageLog() { const u = needAdmin(); return clone((ensureNov5(load()).coverageLog || []).filter((r) => r.actorId === u.id || u.isAdmin)); },
  };
}

export { templateGenerates, ordinaryCoverageDoc, attorneyAuthorized, postclosingAlertPlan, resolveCplPrice };
