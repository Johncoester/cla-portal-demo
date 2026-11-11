/* mock-adapter.js : FAKE-DATA back end behind the adapter contract (see adapter.js).
 * State lives in a key/value storage (localStorage in the browser, a Map in tests).
 * Every rule here is mirrored by RLS / RPC in supabase/migrations.
 * Deliberately absent: any way to delete a document (no method, no UI, no policy) - Admin included.
 * Tasks are cancelled, never deleted. Users: disabled, or "removed" by an Admin (row kept so their documents, messages and history stay). */
import { ROLES, STAGES, DEAL_STATUSES, TASK_STATUSES, TX_TYPES, DOC_VISIBILITY, PARTICIPANT_ROLES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, DEAL_ROLES, ADMIN_ROLE, SUPER_ADMIN_ROLE, isAdminRole, isSuperAdmin, SALES_ROLES, isSalesRole, runsOrders, viewOnly, isViewOnly, localDate, localDayOf, isRealDate,
  isProcessor, isStaff, isClient, isAgent, sideOf, OUTSIDE, OUTSIDE_FILE_ROLES, isOutside, pairAllowed, fileRoleLabel, visibilityChoices,
  phoneOk, fmtPhone, PHONE_MSG, COUNTY_MAX, DOC_TYPES, docTypeChoices, CLOSING_LOCATIONS, US_STATES, CONTACT_TYPE_CODES, contactTypeLabel, isWireDocName, looksLikeWireDetails, WIRE_BUYER_ONLY } from './constants.js?v=202611101015';
import { fileTitleOf, partyDisplayName } from './party-name.js?v=202611102000';
import { buildSeed, DEAL_FOLDERS } from './seed.js?v=202611120200';
import { indexedDbFileStore } from './file-store.js?v=202611070139';
import { delegationLocked, applyNov3Templates, applyNov3bTemplates, applyBuyerPersonal, applySellerTasks } from './templates.js?v=202611120200';
import { dealsAndAuth } from './mock-part-deals.js?v=202611120500';
import { devAuth } from './mock-part-auth.js?v=202611110800';
import { contactsTasksDocs } from './mock-part-docs.js?v=202611120100';
import { tasksAndForms } from './mock-part-tasks.js?v=202611120200';
import { messagesActivity } from './mock-part-msgs.js?v=202611120500';
import { adminUsersTeams } from './mock-part-admin.js?v=202611070139';
import { libraryFolders } from './mock-part-library.js?v=202611070139';
import { closingSchedule } from './mock-part-schedule.js?v=202611101015';
import { notificationsPart } from './mock-part-notify.js?v=202611070139';
import { mattP2 } from './mock-part-matt.js?v=202611120500';
import { mattNov2 } from './mock-part-nov2.js?v=202611101015';
import { crmPart } from './mock-part-crm.js?v=202611121700';
import { featureFlags } from './features.js?v=202611070139';
import { crmZohoUpgrade } from './crm.js?v=202611121100';
import { ensureEmailTemplates } from './crm-templates.js?v=202611090905';
import { ensureNov3b as ensureCrmNov3b } from './crm-nov3b.js?v=202611070139';
import { ensureAgentPortal } from './agent-portal.js?v=202611101015';
import { agentPortal } from './mock-part-agent.js?v=202611101015';
import { mattNov3b } from './mock-part-nov3b.js?v=202611120200';
import { ensureSettings, optLabel } from './crm-config.js?v=202611070139';
import { referralLabel } from './place-order.js?v=202611092320';
import { upgradeCalls } from './crm-calls.js?v=202611070139';
import { accountingPart, ensureAccounting } from './mock-part-accounting.js?v=202611091140';
import { payoffsPart, ensurePayoffs } from './mock-part-payoffs.js?v=202611070139';
import { modulesPart, ensureModules } from './mock-part-modules.js?v=202611101015';
import { roleAccessPart } from './mock-part-role-access.js?v=202611100100';   // John, Nov 9: Admin > Role access (Super admin)
import { taskShownTo } from './task-switches.js?v=202611120200';
import { taskSwitchesPart } from './mock-part-task-switches.js?v=202611120100';
import { MODULES, moduleAccess, moduleAvailable, betaRefusal } from './modules.js?v=202611101015';
import { underwriterPart } from './mock-part-underwriter.js?v=202611070139';
import { agentInfoPart } from './mock-part-agentinfo.js?v=202611101015';
import { agentInvitePart } from './mock-part-agent-invite.js?v=202611110800';
import { automationPart } from './automation.js?v=202611101015';
import { gmailMock } from './supabase-gmail.js?v=202611110300';
import { hrPart, ensureHr } from './mock-part-hr.js?v=202611110800';
import { titlePart, ensureTitle } from './mock-part-title.js?v=202611120100';
import { tcPortal, ensureTc, tcMessageViews } from './mock-part-tc.js?v=202611070139';
import { emailSendersPart, ensureEmailSenders } from './email-senders.js?v=202611101015';   // John, Nov 4: the Title review module (staff only; in place, no storage bump)
import { officesPart, officeById } from './mock-part-offices.js?v=202611101015';
import { closingLocationPart } from './mock-part-closing-location.js?v=202611120500';
import { recordingPart, ensureRecording } from './mock-part-recording.js?v=202611120100';
import { fwpCanRead, FWP_STAFF_ONLY } from './funding-wire-policy.js?v=202611070139';
import { buyerAgentDocDecision, taskReadable, propertyAddressOf } from './nov5-rules.js?v=202611101015';
import { nov5Part, ensureNov5 } from './mock-part-nov5.js?v=202611120100';
import { staffFeedbackPart } from './mock-part-staff-feedback.js?v=202611080400';
import { fwpPart, ensureFwp } from './mock-part-fwp.js?v=202611070139';
import { seedFwp as FSEED } from './fwp-seed.js?v=202611070139';   // John, Nov 4: where each buyer / seller will be at closing (migration 58)   // Admin > Offices (John, Nov 4; migration 57)
import { claRepresentationLabel } from './cla-representation.js?v=202611090950';

const KEY = 'cla-portal-new:data:v30';   // v29: HR WORKSPACE PHASE 1 (John + Francis, Nov 4; feature/hr-workspace): the hr* collections (departments, designations, employees, HR manager assignments, invite links, change history) + the two fake HR-only logins (Hana HR-Manager, Pia Processor-PH, account role 'Employee') and the 'hr' module switch (off = Super admins only). upgradeToV29 runs from v28 (or anything older through upgradeToV28); nothing existing is changed or removed. v28: RELEASE live28 (John, Nov 4): payoffs / HOA / FFB / ground rent collections (ensurePayoffs) + the Nov 4 seed (ensureSeedBenTc) are guaranteed on every carried-forward copy; upgradeToV28 runs from v27 (seed already there) or v26 (the live27 demo: adds Morgan Coordinator + deal-5 Willow Drive). Nothing existing is changed or removed. v27: SEED (John, Nov 4): Ben's file MD-26-97183 gets Morgan Coordinator (a TC login, Harbor team) as its Transaction Coordinator; upgradeToV27 adds her to stored v26 data if missing, nothing else changes. v26: ACCOUNTING (John, Nov 3; feature/accounting-fees): every order can carry a fee ledger (accountingFees) and its edit log (accountingLog); upgradeToV26 adds the two empty collections, nothing else changes. Stored v25..v21 data is CARRIED FORWARD (v21..v24 go through upgradeToV25 first). v25: CRM calls (Janine's Zoho video 11, Nov 3): Schedule a call / Log a call / Mark as Completed; calls logged with the Nov 3 (b) form (duration in minutes) become logged, Completed calls with the minutes kept and copied to seconds (upgradeToV25). Stored v24 (left to the refi / deal-filters branch), v23, v22 and v21 data are CARRIED FORWARD. v24 is reserved for feature/refi-deal-filters. v23: Matt, Nov 3 (b) (Processor notes): personal_info v4 (+ Entity Representative), orders get sourceOfBusiness, buyer / seller rows may carry an entity (Place Order). Stored v22 (Janine's CRM Nov 3 b) and v21 data are CARRIED FORWARD through the chain v21 -> v22 -> v23 (upgradeToV22 then upgradeToV23). v22: CRM Nov 3 (b), Janine's Zoho videos 7-10 (John): global search + recent items, Send Email records (NEVER SENT), the 24 Zoho custom field types with permissions and layout sections, dashboards, reports (upgradeToV22 adds the collections, the built-in dashboards and the fake sample reports). v21: WIRE INSTRUCTIONS = BUYER CLIENTS + CLA STAFF ONLY (John, Nov 3): every document carries wireInstructions (true when staff mark it, or its name says wire instructions); agents never see one. Stored v20 data is CARRIED FORWARD (upgradeToV21 flags existing wire files, so a wire PDF already sent into an agent's conversation disappears for the agent). v20: Qualia-style agent portal (Francis Santos, Nov 3): agent tasks, update requests, access invites, message attachments; stored v19 data is CARRIED FORWARD (upgradeToV20). v19: CRM email templates (John / Janine, Nov 3, Zoho video 6): folders, templates, favorites, signatures, template files; stored v18 data is CARRIED FORWARD (upgradeToV19 adds the collections and the 3 fake templates). v18: Matt, Nov 3: personal info v3 (POA follow-ups, + Add entity with entity documents, settlement type for sellers only) and title vesting v2 (vesting help); stored v17 data is CARRIED FORWARD (upgradeToV18: new template versions added, untouched open copies moved to them). v17: CRM matched to Zoho (client / lead fields, Zoho picklists, tasks, meetings, attachments; stored v16 data is CARRIED FORWARD, see upgradeToV17; John, Nov 2). v16: County on orders (seeded fake files get one; stored v15 data is CARRIED FORWARD, see upgradeData; John, Nov 2). v15: the CRM (leads, accounts, opportunities, activities, CRM fields on contacts; John, Nov 2). v14: contact type on every contact (realtor / lender / buyer_seller; John, Nov 2). v13: EMD amount + due date on orders, Place Order documents,
export const STORAGE_KEY = KEY;
// Older keys we still carry forward (newest first). v1..v14 are not upgraded (unchanged behaviour).
const PREV_KEYS = [['cla-portal-new:data:v29', 'v29'], ['cla-portal-new:data:v28', 'v28'], ['cla-portal-new:data:v27', 'v27'], ['cla-portal-new:data:v26', 'v26'], ['cla-portal-new:data:v25', 'v25'], ['cla-portal-new:data:v24', 'v24'], ['cla-portal-new:data:v23', 'v23'], ['cla-portal-new:data:v22', 'v22'], ['cla-portal-new:data:v21', 'v21'], ['cla-portal-new:data:v20', 'v20'], ['cla-portal-new:data:v19', 'v19'], ['cla-portal-new:data:v18', 'v18'], ['cla-portal-new:data:v17', 'v17'], ['cla-portal-new:data:v16', 'v16'], ['cla-portal-new:data:v15', 'v15']];
// v15 -> v16: every stored order gets county '' (optional field). Nothing else changes shape; ids, documents (IndexedDB), sessions stay valid.
export function upgradeData(d) { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); d.deals.forEach((q) => { if (q.county == null) q.county = ''; }); d.upgradedFrom = 'v15'; return d; }
// v16 -> v17: CRM values mapped to the Zoho lists (lead source, relationship status from lead status / CRM stage), follow-ups -> Zoho tasks
// (open -> Not Started, done / cancelled -> Completed), logged meetings -> all-day meetings, new client / lead fields empty. Orders, documents,
// users and everything outside the CRM are untouched; no record is dropped.
// live40 (John, Nov 5): Morgan's fake last name 'Multi-Role' -> 'Realtor' on browsers that already hold demo data. Idempotent (only the exact old name on u-multi / its contact); id, email, roles unchanged.
export function ensureRealtorName(d) { if (!d) return d;
  (d.profiles || []).forEach((p) => { if (p.id === 'u-multi' && p.lastName === 'Multi-Role') p.lastName = 'Realtor'; });
  (d.contacts || []).forEach((c) => { if (c.profileId === 'u-multi' && c.lastName === 'Multi-Role') c.lastName = 'Realtor'; });
  return d; }
export function upgradeToV17(d, from = 'v16') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from === 'v15') upgradeData(d); crmZohoUpgrade(d); d.upgradedFrom = from; return d; }
// v17 -> v18 (Matt, Nov 3): the new built-in template versions are added (personal_info v3, title_vesting v2; numbered after any version an Admin published)
// and UNTOUCHED copies (todo, no answers saved) move onto them. Copies with answers, orders, documents, users and the CRM are untouched. v15 / v16 go through v17 first.
export function upgradeToV18(d, from = 'v17') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v17') upgradeToV17(d, from);
  applyNov3Templates(d); d.upgradedFrom = from; return d; }
// v18 -> v19 (John / Janine, Nov 3): CRM email templates. The template collections (folders, templates, favorites, signatures) and the 3 fake seed
// templates + their fake PDF are added; nothing that exists is changed. v15..v17 go through v18 first.
export function upgradeToV19(d, from = 'v18') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v18') upgradeToV18(d, from);
  ensureEmailTemplates(d); d.upgradedFrom = from; return d; }
// v19 -> v20 (Francis Santos, Nov 3): agent-portal collections (updateRequests, accessInvites, agentTaskRevisions), the 3 agent tasks for every agent on an
// open order. Nothing that exists is changed or removed. v15..v18 go through v19 first.
export function upgradeToV20(d, from = 'v19') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v19') upgradeToV19(d, from);
  ensureAgentPortal(d); d.upgradedFrom = from; return d; }
// v20 -> v21 (John, Nov 3): every document gets wireInstructions (true when its name says wire instructions, e.g. a "Wire Instructions.pdf" a processor
// already sent into a conversation with an agent). Nothing is removed or renamed; documents stay permanent. v15..v19 go through v20 first.
export function ensureWireFlags(d) { (d.documents || []).forEach((z) => { if (typeof z.wireInstructions !== 'boolean') z.wireInstructions = isWireDocName(z.name); else if (isWireDocName(z.name)) z.wireInstructions = true; }); return d; }
export function upgradeToV21(d, from = 'v20') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v20') upgradeToV20(d, from);
  ensureWireFlags(d); d.upgradedFrom = from; return d; }
// v22 (CRM Nov 3 b, Janine): new collections, built-in dashboards, report folders and sample reports; nothing existing changes
export function upgradeToV22(d, from = 'v21') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v21') upgradeToV21(d, from);
  ensureCrmNov3b(d); d.upgradedFrom = from; return d; }
// v21 / v22 -> v23 (Matt, Nov 3 (b)): personal_info v4 (+ Entity Representative) added, untouched copies moved onto it. Orders, participants, documents unchanged.
// Chain: v15..v21 go through upgradeToV22 first (Janine's CRM collections), then Matt's steps; v22 data only needs Matt's steps. Final key: v23.
export function upgradeToV23(d, from = 'v21') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v22') upgradeToV22(d, from);
  ensureMattNov3b(d); d.upgradedFrom = from; return d; }
// v21..v24 -> v25 (Janine's CRM video 11, Nov 3): calls get the video 11 shape (upgradeCalls: logged + Completed, minutes kept, seconds = minutes x 60),
// the list-export log is added. v24 = feature/refi-deal-filters' key: its data already went through v23, so it only needs the calls step here
// (when that branch merges, its own v24 step runs first: see docs/CRM-CALLS.md). Nothing is removed.
export function upgradeToV25(d, from = 'v23') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v23' && from !== 'v24') upgradeToV23(d, from);
  upgradeCalls(d); d.upgradedFrom = from; return d; }
// v21..v25 -> v26 (John, Nov 3: the Accounting tab): the empty accountingFees / accountingLog collections are added. Nothing existing changes or is removed.
export function upgradeToV26(d, from = 'v25') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v25') upgradeToV25(d, from);
  ensureAccounting(d); d.upgradedFrom = from; return d; }
// v26 -> v27 (John, Nov 4, FAKE seed): new file deal-5 MD-26-97262 (18 Willow Drive: Larry buyer's agent, Bianca listing agent); Morgan Coordinator (Transaction Coordinator login) on the Harbor team and as the TC on deal-1 (Ben's file).
// Idempotent; nothing existing is changed or removed (Bianca stays Buyer Agent, Terry stays TC, Morgan (u-multi) keeps her roles).
export function ensureSeedBenTc(d) {
  if (!d.profiles.some((p) => p.id === 'u-tc2')) d.profiles.push({ id: 'u-tc2', email: 'morgan.coordinator@example.test', firstName: 'Morgan', lastName: 'Coordinator', phone: '301-555-0114', role: 'Transaction Coordinator', isAdmin: false, status: 'active', createdAt: '2026-09-01T12:00:00Z' });
  if (!d.contacts.some((c) => c.id === 'c-tc2')) d.contacts.push({ id: 'c-tc2', profileId: 'u-tc2', firstName: 'Morgan', lastName: 'Coordinator', email: 'morgan.coordinator@example.test', phone: '301-555-0114', company: 'CLA Title & Escrow', createdBy: 'u-proc', createdAt: '2026-09-01T12:00:00Z', contactType: null });
  if ((d.teams || []).some((t) => t.id === 'team-harbor') && !d.teamMembers.some((m) => m.teamId === 'team-harbor' && m.profileId === 'u-tc2')) d.teamMembers.push({ teamId: 'team-harbor', profileId: 'u-tc2', memberRole: 'coordinator', addedAt: '2026-11-04T12:00:00Z' });
  if (!d.deals.some((x) => x.id === 'deal-5') && !d.deals.some((x) => x.fileNumber === 'MD-26-97262')) {
    const s0 = buildSeed(); d.deals.push(s0.deals.find((x) => x.id === 'deal-5'));
    s0.contacts.filter((c) => c.id === 'c-wbuyer' || c.id === 'c-wseller').forEach((c) => { if (!d.contacts.some((z) => z.id === c.id)) d.contacts.push(c); });
    s0.participants.filter((z) => z.dealId === 'deal-5' && d.contacts.some((c) => c.id === z.contactId) || z.dealId === 'deal-5' && z.contactId === 'c-tc2').forEach((z) => { if (!d.participants.some((y) => y.id === z.id)) d.participants.push(z); });
    if (d.dealSalesPeople && !d.dealSalesPeople.some((x) => x.dealId === 'deal-5')) d.dealSalesPeople.push({ dealId: 'deal-5', salesId: 'u-sp', addedBy: 'u-proc', addedAt: '2026-10-20T14:00:00Z' }); }
  if (d.deals.some((x) => x.id === 'deal-1') && !d.participants.some((z) => z.dealId === 'deal-1' && z.contactId === 'c-tc2')) d.participants.push({ id: 'dp-1-tc2', dealId: 'deal-1', contactId: 'c-tc2', role: 'Transaction Coordinator', createdAt: '2026-09-28T14:00:00Z' });
  return d; }
export function upgradeToV27(d, from = 'v26') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v26') upgradeToV26(d, from);
  ensureSeedBenTc(d); d.upgradedFrom = from; return d; }
// v27 -> v28 (release live28): payoffs collections + the Nov 4 seed again (both idempotent), so a v26 (live27) or v27 browser lands on the same data
export function upgradeToV28(d, from = 'v27') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v27') upgradeToV27(d, from);
  ensureSeedBenTc(d); ensurePayoffs(d); d.upgradedFrom = from; return d; }
// v28 -> v29 (HR workspace, Phase 1): ensureHr adds the HR collections + fake HR seed (idempotent) and ensureModules adds the 'hr' switch (off). Nothing else changes.
export function upgradeToV29(d, from = 'v28') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v28') upgradeToV28(d, from);
  ensureModules(d); ensureHr(d); d.upgradedFrom = from; return d; }
export function ensurePreprocessorSeed(d) {
  if (!d.profiles.some((p) => p.id === 'u-preproc')) d.profiles.push({ id: 'u-preproc', email: 'pat.preprocessor@example.test', firstName: 'Pat', lastName: 'Preprocessor', phone: '301-555-0115', role: 'Preprocessor', isAdmin: false, status: 'active', createdAt: '2026-11-05T12:00:00Z' });
  if (!d.contacts.some((c) => c.id === 'c-preproc')) d.contacts.push({ id: 'c-preproc', profileId: 'u-preproc', firstName: 'Pat', lastName: 'Preprocessor', email: 'pat.preprocessor@example.test', phone: '301-555-0115', company: 'CLA Title & Escrow', createdBy: 'u-proc', createdAt: '2026-11-05T12:00:00Z', contactType: null });
  for (const n of [1, 2]) { const id = `deal-${n}`; if (d.deals.some((q) => q.id === id)) { const deal = d.deals.find((q) => q.id === id); deal.preprocessorUserId ||= 'u-preproc'; if (!d.participants.some((p) => p.dealId === id && p.contactId === 'c-preproc' && p.role === 'Preprocessor')) d.participants.push({ id: `dp-${n}-preproc`, dealId: id, contactId: 'c-preproc', role: 'Preprocessor', createdAt: deal.createdAt }); } }
  return d;
}
export function upgradeToV30(d, from = 'v29') { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); if (from !== 'v29') upgradeToV29(d, from); ensurePreprocessorSeed(d); d.upgradedFrom = from; return d; }
export function ensureMattNov3b(d) { applyNov3bTemplates(d); return d; }   // orders are not rewritten: a missing sourceOfBusiness reads as ''
export function ensureBuyerPersonal(d) { applyBuyerPersonal(d); return d; }
export function ensureSellerTasks(d) { applySellerTasks(d); return d; }
const SESSION_KEY = 'cla-portal-new:session:v1';
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const now = () => new Date().toISOString();
const fail = (m) => { throw new Error(m); };
const str = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const money = (v, label) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,]/g, '')); if (!isFinite(n) || n < 0) fail(`${label} must be a positive number.`); return n; };
const zipOk = (z) => !z || /^\d{5}(-\d{4})?$/.test(z);
const stateCode = (v) => { const s = str(v, 50).toUpperCase(); if (!s) fail('State is required.'); if (!/^[A-Z]{2}$/.test(s)) fail('State must be a 2-letter code (e.g. MD).'); return s; };
const dateOrNull = (v, label) => { const s = str(v, 20); if (!s) return null; if (!isRealDate(s)) fail(`${label} must be a real date (YYYY-MM-DD).`); return s; };
// xxx-xxx-xxxx (Matt, Oct 31). Empty stays empty; anything else must be 10 digits.
const phone = (v, label = 'Phone') => { const s = str(v, 40); if (!s) return ''; if (!phoneOk(s)) fail(`${label} ${PHONE_MSG}.`); return fmtPhone(s); };
const isQuota = (e) => e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));

export function createMockAdapter({ storage, sessionStorage, fileStore, features } = {}) {
  // FEATURE FLAGS (features.js): tests pass { crm: false } to check the CRM is hidden and refused; the browser reads CLA_PORTAL_CONFIG.features
  const flags = featureFlags(features ? { mode: 'mock', features } : undefined);
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null) || fail('no storage');
  // File CONTENTS live in IndexedDB in the browser (see file-store.js: the ID-upload bug). Tests pass a memory store, or none (= old inline behaviour).
  const files = fileStore !== undefined ? fileStore : (!storage && typeof indexedDB !== 'undefined' ? indexedDbFileStore() : null);
  const sess = sessionStorage || (typeof window !== 'undefined' ? window.sessionStorage : store);
  let db = null;
  const TSEED = { seed: !!flags.title };   // the 3 FAKE Title sample orders, only where the title flag is on: added once to fresh AND existing demo data (additive, marker d.titleSampleSeeded; never overwrites or removes)
  function save() { store.setItem(KEY, JSON.stringify(db)); }
  // Older demo-data versions (v1..v6) are never read again; drop them so they stop using up this browser's ~5 MB localStorage (part of the ID-upload bug).
  const dropStale = () => { try { for (let i = store.length - 1; i >= 0; i--) { const k = store.key(i); if (k && /^cla-portal-new:data:v\d+$/.test(k) && k !== KEY && !PREV_KEYS.some(([p]) => p === k)) store.removeItem(k); /* an unreadable v15 / v16 copy is kept, never dropped */ } } catch (e) { /* plain Map storage in tests */ } };
  // UPGRADE (John, Nov 2, v16 and v17; Matt, Nov 3, v18): a browser that holds older data (e.g. a real test order entered by hand) keeps it. The newest older copy
  // (v17, else v16, else v15) is carried forward into v18 with the new fields defaulted / mapped, saved under v18, and only then is the old copy removed.
  // (v19 since Nov 3: v18 is carried forward the same way.) "Reset demo data" removes v19 and any older copies and builds a fresh seed (old data is never resurrected). v1..v14 are not upgraded.
  function loadPrevious() { for (const [k, from] of PREV_KEYS) { const raw = store.getItem(k); if (!raw) continue; try { return [k, upgradeToV29(JSON.parse(raw), from)]; } catch (e) { /* unreadable: try the next */ } } return null; }
  const ensureAll = (data, { fresh = false } = {}) => {
    let d = fresh ? ensureTitle(ensureTc(ensureHr(ensurePayoffs(ensureModules(ensureAccounting(upgradeCalls(ensureMattNov3b(ensureCrmNov3b(ensureWireFlags(ensureAgentPortal(data)))))))))), { seed: !!flags.title }) : ensureTitle(ensureTc(data), { seed: !!flags.title });
    d = ensurePreprocessorSeed(d); d = ensureEmailSenders(d); d = ensureRealtorName(d); d = ensureRecording(d, { seed: !!flags.accounting }); d = ensureFwp(d, { seed: !!flags.policy || !!flags.funding || !!flags.wires }); d = ensureBuyerPersonal(d); d = ensureSellerTasks(d); return ensureNov5(d);
  };
  function load() { if (db) return db; const raw = store.getItem(KEY); if (raw) { db = JSON.parse(raw); const renamed = (db.profiles || []).some((p) => p.id === 'u-multi' && p.lastName === 'Multi-Role'); db = ensureAll(db); const seeded = db.titleSeedAddedNow || db.fwpSampleAddedNow; delete db.titleSeedAddedNow; delete db.fwpSampleAddedNow; if (seeded || renamed) save(); return db; }
    const prev = loadPrevious();
    if (prev) { const [pk, data] = prev; db = ensureAll(data); delete db.titleSeedAddedNow; delete db.fwpSampleAddedNow; const old = store.getItem(pk);
      try { save(); } catch (e) { if (!isQuota(e)) throw e; store.removeItem(pk); try { save(); } catch (e2) { store.setItem(pk, old); throw e2; } }
      store.removeItem(pk); return db; }
    db = ensureAll(buildSeed(), { fresh: true }); if (typeof store.key === 'function') dropStale(); save(); return db; }
  const nid = (p) => { const d = load(); d.seq += 1; return `${p}-${d.seq}`; };

  const me = () => { const id = sess.getItem(SESSION_KEY); return (id && load().profiles.find((p) => p.id === id && p.status === 'active')) || null; };
  const needUser = () => me() || fail('Please sign in.');
  const needProcessor = () => { const u = needUser(); if (!runsOrders(u)) fail('Only a Processor or Admin can do this.'); return u; };
  const needAdmin = () => { const u = needUser(); if (!u.isAdmin) fail('Only an Admin can do this.'); return u; };
  const isManager = (u) => runsOrders(u) || u.role === 'Transaction Coordinator';   // runs the workflow on deals they can access
  const notViewOnly = (u) => { if (viewOnly(u)) fail('This account is view-only for order work.'); };
  const C_SALES = ['Sales Person', 'Sales Team'];
  const salesOf = (dealId) => (load().dealSalesPeople || []).filter((s) => s.dealId === dealId);
  const contactOf = (profileId) => load().contacts.find((c) => c.profileId === profileId);
  const seesAll = (u) => u.isAdmin || (runsOrders(u) && u.role !== 'Preprocessor') || u.role === 'Sales Team';
  // TC access = TEAMS. Agents on any team where this TC is a coordinator. Removing either person from the team removes access immediately.
  function teamAgentIds(u) {
    const d = load(); const teamIds = new Set(d.teamMembers.filter((m) => m.profileId === u.id && m.memberRole === 'coordinator').map((m) => m.teamId));
    return new Set(d.teamMembers.filter((m) => teamIds.has(m.teamId) && m.memberRole === 'agent').map((m) => m.profileId));
  }
  function dealsFor(u) {
    const d = load();
    if (seesAll(u)) return d.deals;
    if (u.role === 'Preprocessor') return d.deals.filter((q) => q.preprocessorUserId === u.id);
    // John / Francis, Nov 9 (option B): a Transaction Coordinator sees every file, like a Processor (migration 20261109190000)
    if (u.role === 'Transaction Coordinator') return d.deals;
    const c = contactOf(u.id);
    const ids = new Set(c ? d.participants.filter((p) => p.contactId === c.id).map((p) => p.dealId) : []);
    // every salesperson linked to the file (John, Nov 2: several per file) sees it, as the single sales person did before
    if (C_SALES.includes(u.role)) (d.dealSalesPeople || []).forEach((s) => { if (s.salesId === u.id) ids.add(s.dealId); });
    return d.deals.filter((x) => ids.has(x.id));
  }
  const dealOr404 = (u, id) => dealsFor(u).find((x) => x.id === id) || fail('Order not found.');
  // PER-FILE ROLES. Staff keep their account role everywhere. An OUTSIDE USER's role on an order is their deal_participants role there
  // (Buyer Agent / Listing Agent / Client-Buyer / Client-Seller); on a file where they hold none of those they are a plain 'Outside user'
  // (no side, no tasks). Mirrored by private.deal_role(deal) in SQL.
  // SELF-REPRESENTATION (migration 11): one person may hold a client role AND their side's agent role on one order. Then `role` is the AGENT
  // role (the wider of the two: an agent already sees everything on its side) and `roles` lists both, so their own client copies,
  // client-assigned tasks and the union of both roles apply. Mirrored by private.deal_roles(deal) / private.file_roles_of in SQL.
  function fileRoles(profileId, dealId) {
    const p = load().profiles.find((x) => x.id === profileId); if (!p) return [];
    if (!isOutside(p.role)) return [p.role];
    const c = contactOf(p.id); if (!c || !dealId) return [OUTSIDE];
    const mine = load().participants.filter((z) => z.dealId === dealId && z.contactId === c.id).map((z) => z.role);
    const held = OUTSIDE_FILE_ROLES.filter((r) => mine.includes(r)); return held.length ? held : [OUTSIDE];   // agent roles sort first
  }
  const fileRole = (profileId, dealId) => fileRoles(profileId, dealId)[0];
  const fileRoleText = (profileId, dealId) => { const rs = fileRoles(profileId, dealId); return rs.length ? fileRoleLabel(rs) : undefined; };   // display: 'Buyer + Buyer\'s Agent' or the one role
  const holds = (u, r) => (u.roles || [u.role]).includes(r);
  // BUYER-ONLY RULES (Matt / John, Nov 4 call): a buyer on this file who is not also an agent on it
  const pureBuyer = (u) => !!u && !isStaffView(u) && holds(u, 'Client-Buyer') && !(u.roles || [u.role]).some((r) => isAgent(r));
  const EMD_RECEIPT = /earnest money deposit receipt/i;   // CLA sends this receipt to the buyer; the buyer no longer gets the task (data kept), only reminders while it is open (Nov 4, John)
  // LISTING AGENT NEVER SHOWN TO THE BUYER (John, Nov 4: "no listing agent contact will ever be shared to the buyer"): true when `pid` holds the
  // Listing Agent role on this order and the viewer is a pure buyer there. Used by every buyer-facing read (parties, documents, activity, signatures, closing).
  // SELLER MIRROR (John, Nov 4 night: the seller portal gets the buyer's new interface): a seller on this file who is not also an agent on it.
  // The seller never sees the BUYER'S AGENT (the buyer never sees the listing agent). File-first: the same person can be a pure buyer on one file and a pure seller on another.
  const pureSeller = (u) => !!u && !isStaffView(u) && holds(u, 'Client-Seller') && !holds(u, 'Client-Buyer') && !(u.roles || [u.role]).some((r) => isAgent(r));
  const pureClientSide = (u) => (pureBuyer(u) ? 'buyer' : pureSeller(u) ? 'seller' : null);
  const OTHER_AGENT = { buyer: 'Listing Agent', seller: 'Buyer Agent' };
  const hiddenOtherAgent = (u) => OTHER_AGENT[pureClientSide(u)] || null;
  // true when `pid` is the OTHER side's agent on this order and the viewer is a pure buyer (listing agent) or a pure seller (buyer's agent) there
  const hiddenFromBuyer = (viewer, pid, dealId) => { const r = hiddenOtherAgent(viewer); return !!pid && !!r && pid !== viewer.id && fileRoles(pid, dealId).includes(r); };
  const hiddenFromClient = hiddenFromBuyer;
  const selfRep = (roles) => roles.length === 2 && pairAllowed(roles[0], roles[1]);
  // The signed-in user as they act on ONE order (all deal-scoped rules take this, never the bare session user).
  const scopeTo = (u, dealId) => { if (!u || !isOutside(u.role)) return u; const roles = fileRoles(u.id, dealId);
    return { ...u, role: roles[0], roles, selfRep: selfRep(roles), accountRole: u.role }; };
  const onDeal = (u, id) => { dealOr404(u, id); return scopeTo(u, id); };
  // Roles an outside user holds across their files (for the dashboard groups and the login picker)
  const fileRolesOf = (u) => [...new Set(dealsFor(u).flatMap((x) => fileRoles(u.id, x.id)).filter((r) => r && r !== OUTSIDE))].sort((a, b) => OUTSIDE_FILE_ROLES.indexOf(a) - OUTSIDE_FILE_ROLES.indexOf(b));
  // the same, as one label per kind of file ('Buyer + Buyer's Agent' for a self-represented file) for the login picker / top bar
  const LABEL_ORDER = ['Buyer Agent', 'Listing Agent', "Buyer + Buyer's Agent", 'Seller + Listing Agent', 'Client-Buyer', 'Client-Seller'];
  const fileLabelsOf = (u) => [...new Set(dealsFor(u).map((x) => fileRoleLabel(fileRoles(u.id, x.id))).filter((r) => r && r !== OUTSIDE))].sort((a, b) => LABEL_ORDER.indexOf(a) - LABEL_ORDER.indexOf(b));
  const log = (dealId, actorId, action, entity, entityId, detail) => { load().activity.push({ id: nid('a'), dealId, actorId, action, entity, entityId, detail: str(detail, 300), createdAt: now() }); };
  const prof = (id) => load().profiles.find((x) => x.id === id);
  const nameOf = (id) => { if (typeof id === 'string' && id.startsWith('link:')) return `Scheduling link (${id.slice(5)} side)`; const p = prof(id); return p ? `${p.firstName} ${p.lastName}`.trim() + (p.status === 'removed' ? ' (removed)' : '') : 'Unknown'; };
  const roleOf = (id) => (prof(id) || {}).role;
  const fullName = (c) => `${c.firstName} ${c.lastName}`.trim();
  const folderOf = (id) => id && load().folders.find((f) => f.id === id);
  // WIRE INSTRUCTIONS (John, Nov 3): CLA staff + whoever is a Client-Buyer ON THAT FILE. Never an agent (Buyer Agent / Listing Agent), never the seller side,
  // never a side-less outside user (e.g. someone an agent shared access with), never anyone on a Library file. Mirrored by private.wire_allowed (SQL).
  const wireAllowed = (profileId, dealId) => { const p = prof(profileId); if (!p || p.status !== 'active') return false; if (!isOutside(p.role)) return true;
    return !!dealId && fileRoles(p.id, dealId).includes('Client-Buyer'); };
  const isWireDoc = (doc) => !!doc && (doc.wireInstructions === true || isWireDocName(doc.name));
  // staffShare: CLA staff sending the document to this person (e.g. a signature request) counts as "the processor shared it"
  const docVisible = (u, doc, { staffShare = false } = {}) => {
    if (isWireDoc(doc) && doc.uploadedBy !== u.id && !wireAllowed(u.id, doc.dealId)) return false;   // before every other rule (folders, visibility, staff)
    const baDoc = buyerAgentDocDecision(u, doc, { holds: (role) => holds(u, role), staff: isStaffView(u) });
    if (baDoc === 'deny') return false;   // buyer agent: no payoffs, wires, cash-to-close, curative, or entity material
    if (baDoc === 'allow') return true;   // buyer agent: title commitment only (other parties keep their own rules)
    if (u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator' || doc.uploadedBy === u.id) return true;
    // the buyer sees only what they uploaded (above) or what CLA staff shared with them
    // SHARED WITH CLIENT (John, Nov 4): CLA staff may share any other party's upload (e.g. the listing agent's) with the buyer: a stored flag
    // (documents.shared_with_client + shared_with_client_by / _at, migration 60). It opens the file to the file's buyer(s) whatever side it was kept on,
    // never a staff-only file or folder, and never past the wire rule above.
    const f = folderOf(doc.folderId);
    if (pureBuyer(u) && !staffShare) { const up = prof(doc.uploadedBy);
      if (doc.sharedWithClient === true) return !(f && f.staffOnly) && doc.visibility !== 'staff';
      const asked = (load().signatureRequests || []).some((r) => r.docId === doc.id && r.signers.some((s) => s.profileId === u.id));   // sent to him for signature by CLA staff
      if (!asked && (!up || !(up.isAdmin || isStaff(up.role)))) return false; }
    // SELLER MIRROR (John, Nov 4): the buyer's side (the buyer's agent, the buyer, anyone they shared access with) never reaches the seller unless CLA
    // staff share that file WITH THE SELLER (documents.sharedWithSeller + sharedWithSellerBy / sharedWithSellerAt, migration 65; its own flag so a file
    // shared with the buyer never opens to the seller and back). The seller's own side (the listing agent, a co-seller) and CLA staff uploads are unchanged.
    if (pureSeller(u) && !staffShare) {
      if (doc.sharedWithSeller === true) return !(f && f.staffOnly) && doc.visibility !== 'staff' && (!isWireDoc(doc));
      const asked = (load().signatureRequests || []).some((r) => r.docId === doc.id && r.signers.some((s) => s.profileId === u.id));
      const upSide = doc.dealId ? personSide(doc.uploadedBy, doc.dealId) : 'staff';
      if (!asked && upSide !== 'staff' && upSide !== 'seller') return false; }
    if (f && f.staffOnly) return false;
    if (doc.visibility === 'all') return true;
    if (doc.visibility === 'staff') return false;
    return doc.visibility === sideOf(u.role);
  };
  const threadVisible = (u, t) => runsOrders(u) || u.isAdmin || (u.role === 'Transaction Coordinator' && dealsFor(u).some((q) => q.id === t.dealId)) || t.participantIds.includes(u.id);
  const unreadIn = (u, t) => { const d = load(); const r = d.reads.find((x) => x.threadId === t.id && x.profileId === u.id); const last = r ? r.at : ''; return d.messages.filter((m) => m.threadId === t.id && m.authorId !== u.id && m.createdAt > last).length; };
  // CLA staff (any staff login, incl. TC and Admin) vs an outside user acting on this order (agent / client / plain outside user)
  const isStaffView = (u) => !!u && (u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator') && !isOutside(u.accountRole || u.role);
  // Which side a person is on, ON THIS ORDER: 'staff' (CLA staff login), 'buyer' / 'seller' (their agent/client role here), or null (outside user with no side here).
  // Mirrored by private.person_side(pid, deal) in SQL (migration 13).
  const personSide = (profileId, dealId) => { const p = prof(profileId); if (!p) return null; if (!isOutside(p.role)) return 'staff';
    const sides = [...new Set(fileRoles(profileId, dealId).map(sideOf).filter(Boolean))]; return sides.length === 1 ? sides[0] : null; };
  // NO CROSS-SIDE MESSAGING (Matt, Oct 31): an outside user may message CLA staff and people on their OWN side of the order only.
  const canMessage = (u, targetId, dealId) => { if (isStaffView(u)) return true; const t = personSide(targetId, dealId); if (t === 'staff') return true;
    const mine = sideOf(u.role); return !!mine && t === mine; };
  // A conversation never mixes the two sides: its outside users are all on one side (a side-less outside user only talks to staff).
  const mixedSides = (ids, dealId) => { const outside = ids.filter((id) => !String(id).startsWith('contact:')).map((id) => personSide(id, dealId)).filter((sd) => sd !== 'staff');
    return outside.includes(null) ? outside.length > 1 : new Set(outside).size > 1; };
  // NO OPPOSING CONTACT INFO (Matt, Oct 31): outside users do not get the phone / email of the OTHER side's agent or client (names stay, for context).
  // Staff see everything. A client also does not see the other side's client at all (unchanged). Mirrored by public.deal_contacts() in SQL (migration 13).
  const hideContact = (c) => ({ ...c, email: '', phone: '', contactHidden: true });
  function participantsOf(dealId, viewer) {
    const d = load(); const staff = isStaffView(viewer); const mySide = sideOf(viewer.role);
    let rows = d.participants.filter((p) => p.dealId === dealId).map((p) => { const c = d.contacts.find((z) => z.id === p.contactId); const pr = c && c.profileId && prof(c.profileId);
      const opposing = !staff && !!sideOf(p.role) && sideOf(p.role) !== mySide && !(c && c.profileId === viewer.id);
      return { ...clone(p), ...(p.entity && opposing ? { entity: { ...p.entity, repPhone: '', repEmail: '' } } : {}), contact: c ? (opposing ? hideContact(clone(c)) : clone(c)) : c, removed: !!(pr && pr.status === 'removed') }; });
    if (pureBuyer(viewer)) rows = rows.filter((p) => p.role !== 'Listing Agent');   // the buyer never sees the listing agent (Nov 4 call)
    if (pureSeller(viewer)) rows = rows.filter((p) => p.role !== 'Buyer Agent');   // ... and the seller never sees the buyer's agent (seller mirror, Nov 4)
    if (isClient(viewer.role)) rows = rows.filter((p) => !(isClient(p.role) && p.role !== viewer.role));   // a client does not see the OTHER side's client
    return rows;
  }
  const ownerOf = (t) => { if (!t.participantId) return null; const d = load(); const p = d.participants.find((z) => z.id === t.participantId); const c = p && d.contacts.find((z) => z.id === p.contactId); return c ? c.profileId : null; };
  const taskVisible = (u, t) => {
    if (!taskShownTo(load(), u, t)) return false;   // TASK SWITCHES (John, Nov 4): a switched-off task is kept but only Admin / Super admin see it
    const dTask = load(); const tpTask = t.templateCode ? dTask.taskTemplates.filter((z) => z.code === t.templateCode).sort((a, b) => b.version - a.version)[0] : null;
    const snap = { ...t, audiences: t.audiences || (tpTask && tpTask.audiences) || null, lane: t.lane || (tpTask && tpTask.lane) || null, retiredTemplate: !!(tpTask && tpTask.retiredAt) };
    if (!taskReadable({ user: u, task: snap, staff: isStaffView(u), admin: !!u.isAdmin, pureClient: pureClientSide(u), holds: (r) => holds(u, r), ownerId: ownerOf(t) })) return false;
    if (u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator') return true;
    if (pureBuyer(u) && t.assignedRole === 'Client-Buyer' && EMD_RECEIPT.test(t.title || '')) return false;
    // CLIENT TASK PRIVACY (Matt, Nov 5, live40: "it should not show tasks belonging to other parties to buyer and seller users"): a pure Client-Buyer / Client-Seller
    // only ever gets tasks assigned to THEM: their own participant copy, or an unowned task for the client role they hold. Never another party's, never a fallback list.
    if (pureClientSide(u)) return t.participantId ? ownerOf(t) === u.id : isClient(t.assignedRole) && holds(u, t.assignedRole);
    if (t.participantId) return ownerOf(t) === u.id || (isAgent(u.role) && sideOf(t.assignedRole) === sideOf(u.role));
    return holds(u, t.assignedRole) || (isAgent(u.role) && sideOf(t.assignedRole) === sideOf(u.role));
  };
  // DELEGATION: an agent may fill a CLIENT's intake copy for them when the template allows that agent role, the template is not a
  // personal (client-only) item, the client is on the agent's own side, and the agent is on that order in that role. Mirrored by private.agent_can_fill (SQL).
  const agentCanFill = (u, t) => {
    if (!u || !isAgent(u.role) || !t || t.kind !== 'form' || t.status === 'cancelled' || !t.participantId || !isClient(t.assignedRole) || sideOf(t.assignedRole) !== sideOf(u.role)) return false;
    const d = load(); const tp = d.taskTemplates.find((z) => z.id === t.templateId);
    if (!tp || delegationLocked(tp) || !(tp.agentRoles || []).includes(u.role)) return false;
    const c = contactOf(u.id); return !!c && d.participants.some((p) => p.dealId === t.dealId && p.contactId === c.id && p.role === u.role);
  };
  const formDataVisible = (u, t) => u.isAdmin || isManager(u) || ownerOf(t) === u.id || agentCanFill(u, t);
  function notify(profileIds, n, exceptId) {
    const d = load(); new Set(profileIds).forEach((pid) => { const p = prof(pid); if (!pid || pid === exceptId || !p || p.status !== 'active') return;
      d.notifications.push({ id: nid('n'), profileId: pid, kind: n.kind, dealId: n.dealId || null, title: str(n.title, 200), link: n.link || '', createdAt: now(), readAt: null }); });
  }
  const dealProfileIds = (dealId) => { const d = load(); const deal = d.deals.find((z) => z.id === dealId);
    const ids = d.participants.filter((p) => p.dealId === dealId).map((p) => (d.contacts.find((c) => c.id === p.contactId) || {}).profileId).filter(Boolean);
    return [...new Set([...ids, deal && deal.processorId, deal && deal.preprocessorUserId].filter(Boolean))]; };
  function dealView(u, x) {
    u = scopeTo(u, x.id); const d = load(); const tasks = d.tasks.filter((t) => t.dealId === x.id && taskVisible(u, t)); const mine = d.threads.filter((t) => t.dealId === x.id && threadVisible(u, t));
    // staff see 'Agent is a party' (licensee disclosure) when someone on the order is both a client and their side's agent
    const parties = d.participants.filter((p) => p.dealId === x.id && isClient(p.role) && d.participants.some((q) => q.dealId === x.id && q.contactId === p.contactId && isAgent(q.role) && pairAllowed(p.role, q.role)))
      .map((p) => { const c = d.contacts.find((z) => z.id === p.contactId); const ent = p.entity && p.entity.name; return { contactId: p.contactId, name: ent || (c ? fullName(c) : ''), label: fileRoleLabel([p.role === 'Client-Buyer' ? 'Buyer Agent' : 'Listing Agent', p.role]) }; });
    const staffView = !isOutside(u.accountRole || u.role) && !isClient(u.role) && !isAgent(u.role);
    // Matt, Nov 3 (b): source of business is CLA-internal (staff only); its label follows renames in CRM Settings -> Lead Source
    const src = staffView ? (x.sourceOfBusiness || '') : ''; const srcLabel = src ? (referralLabel(src, (id) => { const c = d.contacts.find((z) => z.id === id); const ent = d.participants.find((p) => p.dealId === x.id && p.contactId === id && p.entity && p.entity.name); return ent ? ent.entity.name : (c ? `${c.firstName} ${c.lastName}`.trim() : ''); }) || optLabel(ensureSettings(clone(d.crmSettings || null)), 'leadSource', src)) : '';
    // the scheduled closing names its office from the stored office list (a retired office keeps its name here)
    const sc0 = x.scheduledClosing ? { ...clone(x.scheduledClosing), officeName: x.scheduledClosing.officeId ? ((officeById(d, x.scheduledClosing.officeId) || {}).name || '') : '', officeRetired: !!(x.scheduledClosing.officeId && officeById(d, x.scheduledClosing.officeId) && !officeById(d, x.scheduledClosing.officeId).active) } : x.scheduledClosing;
    // John, Nov 4: deal notes are staff/agent working notes; Client-Buyer / Client-Seller never get them (may name the other side's agent)
    const clientOnly = (u.roles || [u.role]).every((r) => isClient(r));
    return { ...clone(x), notes: clientOnly ? '' : (x.notes || ''), scheduledClosing: sc0, sourceOfBusiness: src, sourceOfBusinessLabel: srcLabel, claRepresentation: staffView ? (x.claRepresentation || null) : null, claRepresentationLabel: staffView ? claRepresentationLabel(x.claRepresentation) : '', myRole: u.role, myRoles: u.roles || [u.role], myRoleLabel: fileRoleLabel(u.roles, u.role), selfRep: !!u.selfRep, agentParties: staffView ? parties : [], county: x.county || '', address: `${x.street}, ${x.city}, ${x.state} ${x.zip}`, displayName: propertyAddressOf(x), stageName: STAGES[x.stage],
      openTasks: tasks.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status)).length,
      myOpenTasks: tasks.filter((t) => ['todo', 'in_progress'].includes(t.status) && (ownerOf(t) === u.id || (!t.participantId && holds(u, t.assignedRole)))).length,
      unread: mine.reduce((n, t) => n + unreadIn(u, t), 0),
      // Matt, Nov 2: order-list filters. Overdue = open tasks this person can see that are past due; partyNames = the names this person may see on the file (search)
      overdueTasks: tasks.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status) && t.dueDate && t.dueDate < localDate()).length,
      // John, Nov 2: several buyers / sellers; fileTitle = 'Buyer last names / Seller last names' of the people this viewer may see
      fileTitle: fileTitleOf(participantsOf(x.id, u)),
      partyNames: [...new Set(participantsOf(x.id, u).flatMap((p) => [partyDisplayName(p), p.contact ? fullName(p.contact) : '']).filter(Boolean))],
      processorName: x.processorId ? nameOf(x.processorId) : 'Unassigned', processorUnassigned: !x.processorId,
      tcUserId: x.tcUserId || null, tcName: x.tcUserId ? nameOf(x.tcUserId) : '',
      preprocessorUserId: x.preprocessorUserId || null, preprocessorName: x.preprocessorUserId ? nameOf(x.preprocessorUserId) : '',
      closerName: staffView ? (x.closerName || '') : '', closerProfileId: staffView ? (x.closerProfileId || null) : null,
      // John, Nov 2: several salespeople per file. salesPersonName stays as the joined names (older callers).
      salesPeople: salesOf(x.id).map((s) => ({ id: s.salesId, name: nameOf(s.salesId), role: (prof(s.salesId) || {}).role, addedAt: s.addedAt })),
      salesPersonIds: salesOf(x.id).map((s) => s.salesId), salesPersonName: salesOf(x.id).map((s) => nameOf(s.salesId)).join(', ') };
  }

  const api = { mode: 'mock', features: { ...flags } };
  const ctx = { api, DEAL_FOLDERS, store, sess, SESSION_KEY, KEY, load, save, nid, me, needUser, needProcessor, needAdmin, isManager, notViewOnly, contactOf, salesOf, seesAll, teamAgentIds, dealsFor, dealOr404, fileRole, fileRoles, fileRoleText, holds, scopeTo, onDeal, fileRolesOf, fileLabelsOf, log, prof, nameOf, roleOf, fullName,
    folderOf, docVisible, wireAllowed, isWireDoc, isWireDocName, looksLikeWireDetails, WIRE_BUYER_ONLY, threadVisible, unreadIn, participantsOf, isStaffView, personSide, canMessage, mixedSides, ownerOf, taskVisible, agentCanFill, pureBuyer, pureSeller, pureClientSide, hiddenFromBuyer, hiddenFromClient, EMD_RECEIPT, formDataVisible, notify, dealProfileIds, dealView, clone, now, fail, str, emailOk, money, zipOk, stateCode, dateOrNull, localDate, localDayOf, phone,
    forget() { db = null; },   // drop the in-memory copy; the next call reloads the last SAVED state (CRM import preview, Janine Nov 3)
    reset() { store.removeItem(KEY); PREV_KEYS.forEach(([k]) => store.removeItem(k)); db = null; if (files) files.clearAll().catch(() => {}); load(); },
    files,
    // move an upload's bytes out of the record into the file store BEFORE the record is saved (so a failed save never lists a file without content)
    async keepFile(doc) { if (!files || !doc.dataUrl) return doc; try { await files.put(doc.id, doc.dataUrl); } catch (e) { throw new Error('This browser could not store the file (private browsing or storage full). Try a smaller file or another browser.'); }
      doc.dataUrl = null; doc.hasFile = true; return doc; },
    async fileContent(z) { if (z.dataUrl) return z.dataUrl; if (z.hasFile && files) return (await files.get(z.id)) || null; return null; },
    C: { ROLES, DEAL_ROLES, ADMIN_ROLE, SUPER_ADMIN_ROLE, isAdminRole, isSuperAdmin, SALES_ROLES, isSalesRole, runsOrders, viewOnly, isViewOnly, STAGES, DEAL_STATUSES, TASK_STATUSES, TX_TYPES, DOC_VISIBILITY, PARTICIPANT_ROLES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isProcessor, isStaff, isClient, isAgent, sideOf, OUTSIDE, OUTSIDE_FILE_ROLES, isOutside, pairAllowed, fileRoleLabel, visibilityChoices, DOC_TYPES, docTypeChoices, CLOSING_LOCATIONS, US_STATES, CONTACT_TYPE_CODES, contactTypeLabel , COUNTY_MAX } };
  Object.assign(api, devAuth(ctx), dealsAndAuth(ctx), contactsTasksDocs(ctx), tasksAndForms(ctx), messagesActivity(ctx), adminUsersTeams(ctx), libraryFolders(ctx), closingSchedule(ctx), notificationsPart(ctx), mattP2(ctx), mattNov2(ctx), crmPart(ctx, flags), agentPortal(ctx));
  Object.assign(api, accountingPart(ctx, flags));
  Object.assign(api, gmailMock());   // Gmail phase 1 runs on CLA Portal Live Test only
  Object.assign(api, payoffsPart(ctx, flags, api));   // John, Nov 4: Qualia payoffs / HOA / FFB / ground rent (same `accounting` flag; staff only)   // John, Nov 3: the Accounting tab (behind the `accounting` flag; off = every method refuses)
  Object.assign(api, mattNov3b(ctx));   // Matt, Nov 3 (b): source-of-business options for Place Order
  Object.assign(api, taskSwitchesPart(ctx));   // John, Nov 4: Task Templates > Task switches (Admin only; off = not created on new files, existing kept)
  Object.assign(api, modulesPart(ctx, flags));
  Object.assign(api, roleAccessPart(ctx));   // John, Nov 9: which roles get CRM / all deals / Accounting / HR (Super admin switches; seed = before)
  { const gma = api.getModuleAccess; api.getModuleAccess = async function (...args) { await api.loadRoleAccess().catch(() => []); return gma.apply(this, args); }; }
  Object.assign(api, emailSendersPart(ctx));   // John, Nov 3: Admin-only Modules page, one "Live" switch per module (off = beta: Admins only)
  Object.assign(api, underwriterPart(ctx));
  Object.assign(api, closingLocationPart(ctx));   // John, Nov 4: in the property's state at closing? (RON / embassy flag, staff signing method)
  Object.assign(api, officesPart(ctx));       // John, Nov 4: Admin > Offices (add, edit, reorder, retire / reactivate; the closing office picker reads them)   // John, Nov 3 call: per-state underwriter split (Admin edits, logged)
  Object.assign(api, agentInfoPart(ctx));     // John, Nov 3 call: optional agent birthdate (agent + staff only)
  Object.assign(api, agentInvitePart(ctx));   // John, Nov 4: agent invites (link shown, nothing sent), agent profiles, the clients' "Your agent" card
  Object.assign(api, recordingPart(ctx, flags, api));
  Object.assign(api, fwpPart(ctx, flags, api));
  Object.assign(api, nov5Part(ctx));   // Nov 5: task admin, alert groups, entity attorneys, CPL prices, file coverage
  Object.assign(api, titlePart(ctx, flags, api));   // John, Nov 4: order > Title (title review; staff only; sends nothing; no SSNs)
  Object.assign(api, tcPortal(ctx, api));
  tcMessageViews(api, ctx);
  Object.assign(api, automationPart(api, { runsOrders, me: async () => me() }));   // John, Nov 3 call: Email sellers and agents (preview only)
  // HR WORKSPACE, Phase 1 (John + Francis, Nov 4): employees, profiles, departments, designations, HR managers (Super admin only), invite links, history + CSV.
  // The session user carries hrRole ('super' | 'hr_manager' | 'employee' | null), hrEmployeeId and hrHasReports (route guard + nav, data/hr.js).
  { const { hrSessionInfo, ...hrApi } = hrPart(ctx, flags); Object.assign(api, hrApi);
    const gs = api.getSession; api.getSession = async function () { const u = await gs.call(this); return u ? { ...u, ...hrSessionInfo(me()) } : u; }; }
  // MODULE GATE (data side): while a module is not Live, its adapter calls refuse everyone but Admins / Super admins (beta testers).
  // Only when the module is available (config flag on); with the flag off the methods keep their own "turned off" refusal.
  { const GATES = [[/Scanback|PostClosing|Recording/, 'post-closing'], [/Title|Pacer|ChainEntry|BeingClause|PrelimCd|Cpl$|Commitment/, 'title'], [/CrmCall/, 'calls'], [/CrmDeal/, 'crm-deals'], [/Accounting/, 'accounting'], [/Payoff|OtherCompan|OtherContact|HoaGr/, 'payoffs'], [/Crm|^crm[A-Z]/, 'crm']];
    const FWP_GATE = new Map();
    for (const k of ['listFundingQueue','getFunding','saveFunding','saveFundingFund','setFundingCheck','saveFundingDisbursement','notifyWireTeam','queueFundsDisbursedNotification','markFundingDisbursed','voidFundingDisbursement','completeFundingTasks']) FWP_GATE.set(k,'funding');
    for (const k of ['listWireQueue','getWire','saveWire','verifyWire','postWireDisbursement','saveEscrowAccount']) FWP_GATE.set(k,'wires');
    for (const k of ['listPolicyQueue','getPolicy','savePolicy','queuePolicyEscalation','resolvePolicyEscalation','refreshPolicyRates','addPolicyException','setPolicyCheck','issuePolicies','completePolicy']) FWP_GATE.set(k,'policy');
    for (const [k, fn] of Object.entries(api)) { if (typeof fn !== 'function') continue; const m = FWP_GATE.has(k) ? MODULES.find((z) => z.id === FWP_GATE.get(k)) : (() => { const g = GATES.find(([re]) => re.test(k)); return g && MODULES.find((z) => z.id === g[1]); })(); if (!m) continue;
      api[k] = async function (...a) { const u = me();
        if (FWP_GATE.has(k) || k === 'listFwpLog') { if (!fwpCanRead(u)) throw new Error(FWP_STAFF_ONLY); }
        if (u && moduleAvailable(m, flags)) { const set = ensureModules(load()).moduleSettings; let chain = m.parent ? [MODULES.find((z) => z.id === m.parent), m] : [m];
          if (['funding','wires'].includes(m.id)) chain = [...new Set([MODULES.find((z) => z.id === 'accounting'), ...chain])];
          const chain2 = k === 'transitionRecording' || k === 'setRecordingDoc' || k === 'setRecordingCheck' || k === 'saveRecording' ? [...chain, MODULES.find((z) => z.id === 'e-recording')] : chain; const shut = chain2.find((z) => moduleAccess(z.id, u, flags, set) === 'off'); if (shut) fail(betaRefusal(shut)); }
        return fn.apply(this, a); }; } }
  // a new Buyer / Listing Agent on an open order gets the 3 agent tasks (Francis, Nov 3)
  // John, Nov 4: once closing scheduling starts on an order (a proposal or a closing date request), the buyers / sellers who have not said where they
  // will be at closing get the reminder (bell + queued outbox only; once a day; none after they answer or the closing is scheduled). Staff can also run it.
  for (const k of ['proposeClosing', 'createSettlementRequest']) { const f = api[k]; api[k] = async function (dealId, ...a) { const r = await f.call(this, dealId, ...a); api._sweepClosingLocationReminders(dealId); return r; }; }
  { const addP = api.addParticipant; api.addParticipant = async function (...a) { const r = await addP.apply(this, a); ensureAgentPortal(load()); save(); return r; }; }
  Object.assign(api, staffFeedbackPart(ctx));
  // Every call is all-or-nothing: if it throws (validation error, or browser storage full), drop the in-memory copy so the next call
  // reloads the last SAVED state. Without this a half-applied edit (e.g. a rejected lender email) stayed in memory and broke later saves.
  for (const [k, fn] of Object.entries(api)) if (typeof fn === 'function') api[k] = async function (...a) {
    try { return await fn.apply(this, a); } catch (e) { db = null;
      if (isQuota(e)) throw new Error('Browser storage for this demo is full, so that was not saved. Use "reset demo data" or upload smaller files.'); throw e; } };
  return api;
}
