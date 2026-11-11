/* nov5-rules.js : approved Nov 5 rules (John). Pure helpers shared by the mock adapter, the screens and the tests.
 * FAKE DATA ONLY. No real staff emails. Nothing here sends mail or talks to a hosted project.
 * Mirrored in supabase/migrations/20261105000096_nov5_feedback_task_admin.sql. */
import { findOption, activeOptions } from './crm-config.js?v=202611130900';
import { statusListOf } from './crm-janine.js?v=202611101015';

export const OPEN_TASK = ['todo', 'in_progress', 'blocked'];
export const TASK_LANES = ['portal', 'production'];
export const TASK_AUDIENCES = ['buyer', 'seller', 'listing_agent', 'buyer_agent', 'sales_team', 'transaction_coordinator', 'internal'];
export const ROLE_AUDIENCE = {
  'Client-Buyer': 'buyer', 'Client-Seller': 'seller', 'Listing Agent': 'listing_agent', 'Buyer Agent': 'buyer_agent',
  'Sales Person': 'sales_team', 'Sales Team': 'sales_team', 'Transaction Coordinator': 'transaction_coordinator',
};
export const BA_BLOCKED_KINDS = ['curative_lien', 'entity_document', 'prelim_cd', 'title_package', 'cpl', 'lien_certificate'];
export const BA_BLOCKED_NAME = /payoff|cash[\s-]*to[\s-]*close|wire[\s_.-]*(instruction|info|details)|curative|entity document/i;

export function propertyAddressOf(deal) {
  if (!deal) return '';
  const street = String(deal.street || '').trim();
  const city = String(deal.city || '').trim();
  const state = String(deal.state || '').trim();
  const zip = String(deal.zip || '').trim();
  const line2 = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, line2].filter(Boolean).join(', ') || String(deal.propertyAddress || '').trim();
}
export const dealDisplayName = propertyAddressOf;

/* Client import: the chooser shows active relationship statuses only. A file value that is an exact retired
 * option is kept (historical). An unknown value is refused. Nothing is rewritten to a new label. */
export function importStatusChoices(cfg, module) { return activeOptions(cfg, statusListOf(module)).map((o) => [o.value, o.label]); }
export function resolveImportedStatus(cfg, module, raw) {
  const key = statusListOf(module);
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { value: '', historical: false };
  const o = findOption(cfg, key, s);
  if (!o) return { error: `Relationship Status "${s}" is not a current or historical choice. Pick a current status, or keep the exact retired value already on file.` };
  return { value: o.value, historical: !!o.retired };
}

export function buyerAgentMaterialBlocked(doc) {
  if (!doc) return false;
  if (doc.wireInstructions) return true;
  if (BA_BLOCKED_KINDS.includes(doc.titleDocKind)) return true;
  if (BA_BLOCKED_NAME.test(`${doc.name || ''} ${doc.docType || ''} ${doc.description || ''}`)) return true;
  return false;
}
/* 'allow' = title commitment only (even if the file is staff-visibility). 'deny' = payoff / wire / cash-to-close /
 * internal curative / entity material. null = leave the existing buyer / seller / listing-agent rules alone. */
export function buyerAgentDocDecision(user, doc, { holds, staff }) {
  if (!user || staff || !holds('Buyer Agent') || !doc) return null;
  // A person who is also the buyer keeps the buyer's own access (including wires). The narrow block is for a buyer agent who is not the buyer.
  if (!holds('Client-Buyer') && buyerAgentMaterialBlocked(doc)) return 'deny';
  if (doc.titleDocKind === 'title_commitment') return 'allow';
  return null;
}

export const CPL_UNRESOLVED = 'No CPL price is configured for this state and underwriter. The cost is blank. Issuing is blocked and the processor is notified. A price is never invented and never stored as zero.';
export function resolveCplPrice(prices, { state, underwriter }) {
  const st = String(state || '').toUpperCase();
  const uw = String(underwriter || '').trim().toLowerCase();
  const row = (prices || []).find((p) => !p.retiredAt && String(p.state || '').toUpperCase() === st && String(p.underwriter || '').trim().toLowerCase() === uw && p.amount != null && Number(p.amount) > 0);
  return row ? { amount: Math.round(Number(row.amount) * 100) / 100, priceId: row.id, unresolved: false } : { amount: null, priceId: null, unresolved: true };
}
export function cleanCplAmount(amount) {
  if (amount === '' || amount == null) return null;
  const n = Number(String(amount).replace(/[$,]/g, ''));
  if (!isFinite(n) || n <= 0) throw new Error('A CPL price must be a configured amount greater than zero, or left blank (unresolved). Zero is not a price.');
  return Math.round(n * 100) / 100;
}

export const DEMO_ALERT_GROUPS = [
  { id: 'in-office-postclosers', label: 'In-office postclosers', purpose: 'postclosing', active: true, retiredAt: null, members: [
    { id: 'demo-melissa-g', displayName: 'Melissa G', assignmentRole: 'postcloser', profileId: null, email: '' },
    { id: 'demo-aliyah', displayName: 'Aliyah', assignmentRole: 'postcloser', profileId: null, email: '' }] },
  { id: 'in-office-disbursement', label: 'In-office disbursement', purpose: 'disbursement', active: true, retiredAt: null, members: [
    { id: 'demo-marina', displayName: 'Marina', assignmentRole: 'disbursement', profileId: null, email: '' }] },
];
export const DEMO_ENTITY_ATTORNEYS = [
  { id: 'demo-joel', displayName: 'Joel', assignmentRole: 'attorney', profileId: null, active: true, retiredAt: null },
  { id: 'demo-caroline', displayName: 'Caroline', assignmentRole: 'attorney', profileId: null, active: true, retiredAt: null },
  { id: 'demo-victoria', displayName: 'Victoria', assignmentRole: 'attorney', profileId: null, active: true, retiredAt: null },
  { id: 'demo-eve', displayName: 'Eve', assignmentRole: 'attorney', profileId: null, active: true, retiredAt: null },
  { id: 'demo-christian', displayName: 'Christian', assignmentRole: 'backup', profileId: null, active: true, retiredAt: null },
];
export const configuredEmail = (email) => {
  const e = String(email || '').trim();
  if (!e || /@invalid\.example$/i.test(e) || e.endsWith('@example.invalid')) return '';
  return e;
};

/* In-app ids: the file processor, assigned salespeople / TC, and any group member whose profile id is set.
 * Outbox rows never receive a guessed address. A blank email stays blank and is marked blocked. */
export function postclosingAlertPlan(db, deal, { groups = db.alertGroups } = {}) {
  const ids = new Set();
  if (deal && deal.processorId) ids.add(deal.processorId);
  (db.dealSalesPeople || []).filter((s) => s.dealId === deal.id).forEach((s) => ids.add(s.salesId));
  const tcContacts = new Set((db.participants || []).filter((p) => p.dealId === deal.id && p.role === 'Transaction Coordinator').map((p) => p.contactId));
  (db.contacts || []).forEach((c) => { if (tcContacts.has(c.id) && c.profileId) ids.add(c.profileId); });
  const outbox = [];
  (groups || []).filter((g) => g.active && !g.retiredAt).forEach((g) => (g.members || []).filter((m) => !m.retiredAt).forEach((m) => {
    if (m.profileId) ids.add(m.profileId);
    const email = configuredEmail(m.email);
    outbox.push({ groupId: g.id, memberId: m.id, toName: m.displayName, toProfileId: m.profileId || null, toEmail: email, sendBlocked: email ? '' : 'No email is configured for this person.', assignmentRole: m.assignmentRole });
  }));
  if (deal && deal.processorId) {
    const p = (db.profiles || []).find((z) => z.id === deal.processorId);
    outbox.push({ groupId: 'processor', memberId: deal.processorId, toName: p ? `${p.firstName} ${p.lastName}`.trim() : 'Processor', toProfileId: deal.processorId, toEmail: configuredEmail(p && p.email), sendBlocked: '', assignmentRole: 'processor' });
  }
  return { inAppProfileIds: [...ids], outbox };
}

export function attorneyAuthorized(rows, profileId) {
  if (!profileId) return false;
  return (rows || []).some((a) => a.active && !a.retiredAt && a.profileId === profileId && (a.assignmentRole === 'attorney' || a.assignmentRole === 'backup'));
}

export function cleanAudiences(list, lane) {
  const raw = Array.isArray(list) ? list : String(list || '').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = raw.filter((a) => !TASK_AUDIENCES.includes(a));
  if (bad.length) throw new Error(`Unknown task audience: ${bad.join(', ')}.`);
  const uniq = [...new Set(raw)];
  if (lane === 'production' && !uniq.length) return ['internal'];
  if (!uniq.length) throw new Error('Pick who this task is for, or Internal only.');
  return uniq;
}
export function templateGenerates(row, enabled = true) {
  return !!(row && row.active && !row.retiredAt && enabled);
}
export function audienceAllowsRole(row, role) {
  if (!row || !row.audiences) return true;
  if (row.audiences.length === 1 && row.audiences[0] === 'internal') return false;
  const key = ROLE_AUDIENCE[role];
  return !!key && row.audiences.includes(key);
}
/* Audience limits outside parties. Staff still see the task. A buyer audience does not include the buyer agent.
 * Clients only receive a task they own, and only when their own side was selected. Production tasks default to internal.
 * Open tasks on a retired template stay open for the owner and for staff; they are not cancelled. */
export function taskReadable({ user, task, staff, admin, pureClient, holds, ownerId }) {
  if (!task) return false;
  if (admin || staff) return true;
  if (task.retiredTemplate && OPEN_TASK.includes(task.status) && ownerId && user && ownerId === user.id) return true;
  if (task.retiredTemplate) return false;
  if (!task.audiences) return true;
  if (pureClient) {
    if (!task.audiences.includes(pureClient === 'buyer' ? 'buyer' : 'seller')) return false;
    if (task.audiences.length === 1 && task.audiences[0] === 'internal') return false;
    return task.participantId ? ownerId === user.id : holds(task.assignedRole);
  }
  const key = ROLE_AUDIENCE[user && user.role];
  if (!key || !task.audiences.includes(key)) return false;
  return true;
}
export const OPEN_TASK_HANDLING = 'Disabled or retired templates are not used for new files or for people added later. Tasks already on a file, including open ones, keep their status and their answers. They are not cancelled and not deleted. The assigned owner and CLA staff can still see an open one so the work can finish. Other parties do not. Turning the template back on, or publishing a new version, does not rewrite those copies.';

// Title Production lane (Matt, Nov 5). These stay in the data. The portal Tasks tab shows Portal-lane work only.
export const PRODUCTION_LANE_RE = /title commitment|closing protection|wire instruction|preliminary alta|record deed|disburse funds|issue final policy/i;
export function taskLaneOf(task) {
  if (!task) return 'portal';
  if (task.lane === 'production' || task.lane === 'portal') return task.lane;
  if (PRODUCTION_LANE_RE.test(task.title || '')) return 'production';
  return 'portal';
}
export const isPortalTask = (task) => taskLaneOf(task) !== 'production';

export function ordinaryCoverageDoc(doc) {
  if (!doc || doc.wireInstructions) return false;
  if (BA_BLOCKED_KINDS.includes(doc.titleDocKind)) return false;
  if (/payoff|cash[\s-]*to[\s-]*close|wire instruction/i.test(`${doc.name || ''} ${doc.docType || ''}`)) return false;
  if (doc.hrDocument || doc.personnel) return false;
  return true;
}
export const COVERAGE_NOTE = 'Coverage is read-only access to ordinary file conversations and sent, received and file documents. It does not open HR, personnel, wires, payoffs, cash-to-close, or the accounting modules.';
