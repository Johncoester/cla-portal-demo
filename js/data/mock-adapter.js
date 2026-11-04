/* mock-adapter.js : FAKE-DATA back end behind the adapter contract (see adapter.js).
 * State lives in a key/value storage (localStorage in the browser, a Map in tests).
 * Every rule here is mirrored by RLS / RPC in supabase/migrations.
 * Deliberately absent: any way to delete a document (no method, no UI, no policy) - Admin included.
 * Tasks are cancelled, never deleted. Users: disabled, or "removed" by an Admin (row kept so their documents, messages and history stay). */
import { ROLES, STAGES, DEAL_STATUSES, TASK_STATUSES, TX_TYPES, DOC_VISIBILITY, PARTICIPANT_ROLES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, DEAL_ROLES, ADMIN_ROLE, SUPER_ADMIN_ROLE, isAdminRole, isSuperAdmin, SALES_ROLES, isSalesRole, runsOrders, viewOnly, isViewOnly, localDate, localDayOf, isRealDate,
  isProcessor, isStaff, isClient, isAgent, sideOf, OUTSIDE, OUTSIDE_FILE_ROLES, isOutside, pairAllowed, fileRoleLabel, visibilityChoices,
  phoneOk, fmtPhone, PHONE_MSG, fileTitleOf, COUNTY_MAX, DOC_TYPES, docTypeChoices, CLOSING_LOCATIONS, US_STATES, CONTACT_TYPE_CODES, contactTypeLabel, isWireDocName, looksLikeWireDetails, WIRE_BUYER_ONLY } from './constants.js?v=202611031910';
import { buildSeed, DEAL_FOLDERS } from './seed.js?v=202611031910';
import { indexedDbFileStore } from './file-store.js?v=202611031910';
import { delegationLocked, applyNov3Templates, applyNov3bTemplates } from './templates.js?v=202611031910';
import { dealsAndAuth } from './mock-part-deals.js?v=202611031910';
import { devAuth } from './mock-part-auth.js?v=202611031910';
import { contactsTasksDocs } from './mock-part-docs.js?v=202611031910';
import { tasksAndForms } from './mock-part-tasks.js?v=202611031910';
import { messagesActivity } from './mock-part-msgs.js?v=202611031910';
import { adminUsersTeams } from './mock-part-admin.js?v=202611031910';
import { libraryFolders } from './mock-part-library.js?v=202611031910';
import { closingSchedule } from './mock-part-schedule.js?v=202611031910';
import { notificationsPart } from './mock-part-notify.js?v=202611031910';
import { mattP2 } from './mock-part-matt.js?v=202611031910';
import { mattNov2 } from './mock-part-nov2.js?v=202611031910';
import { crmPart } from './mock-part-crm.js?v=202611031910';
import { featureFlags } from './features.js?v=202611031910';
import { crmZohoUpgrade } from './crm.js?v=202611031910';
import { ensureEmailTemplates } from './crm-templates.js?v=202611031910';
import { ensureNov3b as ensureCrmNov3b } from './crm-nov3b.js?v=202611031910';
import { ensureAgentPortal } from './agent-portal.js?v=202611031910';
import { agentPortal } from './mock-part-agent.js?v=202611031910';
import { mattNov3b } from './mock-part-nov3b.js?v=202611031910';
import { ensureSettings, optLabel } from './crm-config.js?v=202611031910';
import { upgradeCalls } from './crm-calls.js?v=202611031910';

const KEY = 'cla-portal-new:data:v25';   // v25: CRM calls (Janine's Zoho video 11, Nov 3): Schedule a call / Log a call / Mark as Completed; calls logged with the Nov 3 (b) form (duration in minutes) become logged, Completed calls with the minutes kept and copied to seconds (upgradeToV25). Stored v24 (left to the refi / deal-filters branch), v23, v22 and v21 data are CARRIED FORWARD. v24 is reserved for feature/refi-deal-filters. v23: Matt, Nov 3 (b) (Processor notes): personal_info v4 (+ Entity Representative), orders get sourceOfBusiness, buyer / seller rows may carry an entity (Place Order). Stored v22 (Janine's CRM Nov 3 b) and v21 data are CARRIED FORWARD through the chain v21 -> v22 -> v23 (upgradeToV22 then upgradeToV23). v22: CRM Nov 3 (b), Janine's Zoho videos 7-10 (John): global search + recent items, Send Email records (NEVER SENT), the 24 Zoho custom field types with permissions and layout sections, dashboards, reports (upgradeToV22 adds the collections, the built-in dashboards and the fake sample reports). v21: WIRE INSTRUCTIONS = BUYER CLIENTS + CLA STAFF ONLY (John, Nov 3): every document carries wireInstructions (true when staff mark it, or its name says wire instructions); agents never see one. Stored v20 data is CARRIED FORWARD (upgradeToV21 flags existing wire files, so a wire PDF already sent into an agent's conversation disappears for the agent). v20: Qualia-style agent portal (Francis Santos, Nov 3): agent tasks, update requests, access invites, message attachments; stored v19 data is CARRIED FORWARD (upgradeToV20). v19: CRM email templates (John / Janine, Nov 3, Zoho video 6): folders, templates, favorites, signatures, template files; stored v18 data is CARRIED FORWARD (upgradeToV19 adds the collections and the 3 fake templates). v18: Matt, Nov 3: personal info v3 (POA follow-ups, + Add entity with entity documents, settlement type for sellers only) and title vesting v2 (vesting help); stored v17 data is CARRIED FORWARD (upgradeToV18: new template versions added, untouched open copies moved to them). v17: CRM matched to Zoho (client / lead fields, Zoho picklists, tasks, meetings, attachments; stored v16 data is CARRIED FORWARD, see upgradeToV17; John, Nov 2). v16: County on orders (seeded fake files get one; stored v15 data is CARRIED FORWARD, see upgradeData; John, Nov 2). v15: the CRM (leads, accounts, opportunities, activities, CRM fields on contacts; John, Nov 2). v14: contact type on every contact (realtor / lender / buyer_seller; John, Nov 2). v13: EMD amount + due date on orders, Place Order documents,
export const STORAGE_KEY = KEY;
// Older keys we still carry forward (newest first). v1..v14 are not upgraded (unchanged behaviour).
const PREV_KEYS = [['cla-portal-new:data:v24', 'v24'], ['cla-portal-new:data:v23', 'v23'], ['cla-portal-new:data:v22', 'v22'], ['cla-portal-new:data:v21', 'v21'], ['cla-portal-new:data:v20', 'v20'], ['cla-portal-new:data:v19', 'v19'], ['cla-portal-new:data:v18', 'v18'], ['cla-portal-new:data:v17', 'v17'], ['cla-portal-new:data:v16', 'v16'], ['cla-portal-new:data:v15', 'v15']];
// v15 -> v16: every stored order gets county '' (optional field). Nothing else changes shape; ids, documents (IndexedDB), sessions stay valid.
export function upgradeData(d) { if (!d || !Array.isArray(d.deals)) throw new Error('not portal data'); d.deals.forEach((q) => { if (q.county == null) q.county = ''; }); d.upgradedFrom = 'v15'; return d; }
// v16 -> v17: CRM values mapped to the Zoho lists (lead source, relationship status from lead status / CRM stage), follow-ups -> Zoho tasks
// (open -> Not Started, done / cancelled -> Completed), logged meetings -> all-day meetings, new client / lead fields empty. Orders, documents,
// users and everything outside the CRM are untouched; no record is dropped.
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
export function ensureMattNov3b(d) { applyNov3bTemplates(d); return d; }   // orders are not rewritten: a missing sourceOfBusiness reads as ''
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
  function save() { store.setItem(KEY, JSON.stringify(db)); }
  // Older demo-data versions (v1..v6) are never read again; drop them so they stop using up this browser's ~5 MB localStorage (part of the ID-upload bug).
  const dropStale = () => { try { for (let i = store.length - 1; i >= 0; i--) { const k = store.key(i); if (k && /^cla-portal-new:data:v\d+$/.test(k) && k !== KEY && !PREV_KEYS.some(([p]) => p === k)) store.removeItem(k); /* an unreadable v15 / v16 copy is kept, never dropped */ } } catch (e) { /* plain Map storage in tests */ } };
  // UPGRADE (John, Nov 2, v16 and v17; Matt, Nov 3, v18): a browser that holds older data (e.g. a real test order entered by hand) keeps it. The newest older copy
  // (v17, else v16, else v15) is carried forward into v18 with the new fields defaulted / mapped, saved under v18, and only then is the old copy removed.
  // (v19 since Nov 3: v18 is carried forward the same way.) "Reset demo data" removes v19 and any older copies and builds a fresh seed (old data is never resurrected). v1..v14 are not upgraded.
  function loadPrevious() { for (const [k, from] of PREV_KEYS) { const raw = store.getItem(k); if (!raw) continue; try { return [k, upgradeToV25(JSON.parse(raw), from)]; } catch (e) { /* unreadable: try the next */ } } return null; }
  function load() { if (db) return db; const raw = store.getItem(KEY); if (raw) { db = JSON.parse(raw); return db; }
    const prev = loadPrevious();
    if (prev) { const [pk, data] = prev; db = data; const old = store.getItem(pk);
      try { save(); } catch (e) { if (!isQuota(e)) throw e; store.removeItem(pk); try { save(); } catch (e2) { store.setItem(pk, old); throw e2; } }   // storage full: make room by moving, never lose the old copy
      store.removeItem(pk); return db; }
    db = upgradeCalls(ensureMattNov3b(ensureCrmNov3b(ensureWireFlags(ensureAgentPortal(buildSeed()))))); if (typeof store.key === 'function') dropStale(); save(); return db; }
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
  const seesAll = (u) => u.isAdmin || runsOrders(u) || u.role === 'Sales Team';
  // TC access = TEAMS. Agents on any team where this TC is a coordinator. Removing either person from the team removes access immediately.
  function teamAgentIds(u) {
    const d = load(); const teamIds = new Set(d.teamMembers.filter((m) => m.profileId === u.id && m.memberRole === 'coordinator').map((m) => m.teamId));
    return new Set(d.teamMembers.filter((m) => teamIds.has(m.teamId) && m.memberRole === 'agent').map((m) => m.profileId));
  }
  function dealsFor(u) {
    const d = load();
    if (seesAll(u)) return d.deals;
    if (u.role === 'Transaction Coordinator') {
      const agents = teamAgentIds(u); const agentContacts = new Set(d.contacts.filter((c) => agents.has(c.profileId)).map((c) => c.id));
      const ids = new Set(d.participants.filter((p) => agentContacts.has(p.contactId) && isAgent(p.role)).map((p) => p.dealId));
      return d.deals.filter((x) => ids.has(x.id));
    }
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
  const holds = (u, r) => (u.roles || [u.role]).includes(r);   // does the (deal-scoped) user hold role r on this order
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
  const docVisible = (u, doc) => {
    if (isWireDoc(doc) && doc.uploadedBy !== u.id && !wireAllowed(u.id, doc.dealId)) return false;   // before every other rule (folders, visibility, staff)
    if (u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator' || doc.uploadedBy === u.id) return true;
    const f = folderOf(doc.folderId); if (f && f.staffOnly) return false;
    if (doc.visibility === 'all') return true;
    if (doc.visibility === 'staff') return false;
    return doc.visibility === sideOf(u.role);
  };
  const threadVisible = (u, t) => runsOrders(u) || u.isAdmin || t.participantIds.includes(u.id);
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
  const mixedSides = (ids, dealId) => { const outside = ids.map((id) => personSide(id, dealId)).filter((sd) => sd !== 'staff');
    return outside.includes(null) ? outside.length > 1 : new Set(outside).size > 1; };
  // NO OPPOSING CONTACT INFO (Matt, Oct 31): outside users do not get the phone / email of the OTHER side's agent or client (names stay, for context).
  // Staff see everything. A client also does not see the other side's client at all (unchanged). Mirrored by public.deal_contacts() in SQL (migration 13).
  const hideContact = (c) => ({ ...c, email: '', phone: '', contactHidden: true });
  function participantsOf(dealId, viewer) {
    const d = load(); const staff = isStaffView(viewer); const mySide = sideOf(viewer.role);
    let rows = d.participants.filter((p) => p.dealId === dealId).map((p) => { const c = d.contacts.find((z) => z.id === p.contactId); const pr = c && c.profileId && prof(c.profileId);
      const opposing = !staff && !!sideOf(p.role) && sideOf(p.role) !== mySide && !(c && c.profileId === viewer.id);
      return { ...clone(p), ...(p.entity && opposing ? { entity: { ...p.entity, repPhone: '', repEmail: '' } } : {}), contact: c ? (opposing ? hideContact(clone(c)) : clone(c)) : c, removed: !!(pr && pr.status === 'removed') }; });
    if (isClient(viewer.role)) rows = rows.filter((p) => !(isClient(p.role) && p.role !== viewer.role));   // a client does not see the OTHER side's client
    return rows;
  }
  const ownerOf = (t) => { if (!t.participantId) return null; const d = load(); const p = d.participants.find((z) => z.id === t.participantId); const c = p && d.contacts.find((z) => z.id === p.contactId); return c ? c.profileId : null; };
  const taskVisible = (u, t) => {
    if (u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator') return true;
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
    return [...new Set([...ids, deal && deal.processorId].filter(Boolean))]; };
  function dealView(u, x) {
    u = scopeTo(u, x.id); const d = load(); const tasks = d.tasks.filter((t) => t.dealId === x.id && taskVisible(u, t)); const mine = d.threads.filter((t) => t.dealId === x.id && threadVisible(u, t));
    // staff see 'Agent is a party' (licensee disclosure) when someone on the order is both a client and their side's agent
    const parties = d.participants.filter((p) => p.dealId === x.id && isClient(p.role) && d.participants.some((q) => q.dealId === x.id && q.contactId === p.contactId && isAgent(q.role) && pairAllowed(p.role, q.role)))
      .map((p) => { const c = d.contacts.find((z) => z.id === p.contactId); return { contactId: p.contactId, name: c ? fullName(c) : '', label: fileRoleLabel([p.role === 'Client-Buyer' ? 'Buyer Agent' : 'Listing Agent', p.role]) }; });
    const staffView = !isOutside(u.accountRole || u.role) && !isClient(u.role) && !isAgent(u.role);
    // Matt, Nov 3 (b): source of business is CLA-internal (staff only); its label follows renames in CRM Settings -> Lead Source
    const src = staffView ? (x.sourceOfBusiness || '') : ''; const srcLabel = src ? optLabel(ensureSettings(clone(d.crmSettings || null)), 'leadSource', src) : '';
    return { ...clone(x), sourceOfBusiness: src, sourceOfBusinessLabel: srcLabel, myRole: u.role, myRoles: u.roles || [u.role], myRoleLabel: fileRoleLabel(u.roles, u.role), selfRep: !!u.selfRep, agentParties: staffView ? parties : [], county: x.county || '', address: `${x.street}, ${x.city}, ${x.state} ${x.zip}`, stageName: STAGES[x.stage],
      openTasks: tasks.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status)).length,
      myOpenTasks: tasks.filter((t) => ['todo', 'in_progress'].includes(t.status) && (ownerOf(t) === u.id || (!t.participantId && holds(u, t.assignedRole)))).length,
      unread: mine.reduce((n, t) => n + unreadIn(u, t), 0),
      // Matt, Nov 2: order-list filters. Overdue = open tasks this person can see that are past due; partyNames = the names this person may see on the file (search)
      overdueTasks: tasks.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status) && t.dueDate && t.dueDate < localDate()).length,
      // John, Nov 2: several buyers / sellers; fileTitle = 'Buyer last names / Seller last names' of the people this viewer may see
      fileTitle: fileTitleOf(participantsOf(x.id, u)),
      partyNames: [...new Set(participantsOf(x.id, u).map((p) => (p.contact ? fullName(p.contact) : '')).filter(Boolean))],
      processorName: nameOf(x.processorId),
      // John, Nov 2: several salespeople per file. salesPersonName stays as the joined names (older callers).
      salesPeople: salesOf(x.id).map((s) => ({ id: s.salesId, name: nameOf(s.salesId), role: (prof(s.salesId) || {}).role, addedAt: s.addedAt })),
      salesPersonIds: salesOf(x.id).map((s) => s.salesId), salesPersonName: salesOf(x.id).map((s) => nameOf(s.salesId)).join(', ') };
  }

  const api = { mode: 'mock', features: { ...flags } };
  const ctx = { api, DEAL_FOLDERS, store, sess, SESSION_KEY, KEY, load, save, nid, me, needUser, needProcessor, needAdmin, isManager, notViewOnly, contactOf, salesOf, seesAll, teamAgentIds, dealsFor, dealOr404, fileRole, fileRoles, fileRoleText, holds, scopeTo, onDeal, fileRolesOf, fileLabelsOf, log, prof, nameOf, roleOf, fullName,
    folderOf, docVisible, wireAllowed, isWireDoc, isWireDocName, looksLikeWireDetails, WIRE_BUYER_ONLY, threadVisible, unreadIn, participantsOf, isStaffView, personSide, canMessage, mixedSides, ownerOf, taskVisible, agentCanFill, formDataVisible, notify, dealProfileIds, dealView, clone, now, fail, str, emailOk, money, zipOk, stateCode, dateOrNull, localDate, localDayOf, phone,
    reset() { store.removeItem(KEY); PREV_KEYS.forEach(([k]) => store.removeItem(k)); db = null; if (files) files.clearAll().catch(() => {}); load(); },
    files,
    // move an upload's bytes out of the record into the file store BEFORE the record is saved (so a failed save never lists a file without content)
    async keepFile(doc) { if (!files || !doc.dataUrl) return doc; try { await files.put(doc.id, doc.dataUrl); } catch (e) { throw new Error('This browser could not store the file (private browsing or storage full). Try a smaller file or another browser.'); }
      doc.dataUrl = null; doc.hasFile = true; return doc; },
    async fileContent(z) { if (z.dataUrl) return z.dataUrl; if (z.hasFile && files) return (await files.get(z.id)) || null; return null; },
    C: { ROLES, DEAL_ROLES, ADMIN_ROLE, SUPER_ADMIN_ROLE, isAdminRole, isSuperAdmin, SALES_ROLES, isSalesRole, runsOrders, viewOnly, isViewOnly, STAGES, DEAL_STATUSES, TASK_STATUSES, TX_TYPES, DOC_VISIBILITY, PARTICIPANT_ROLES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isProcessor, isStaff, isClient, isAgent, sideOf, OUTSIDE, OUTSIDE_FILE_ROLES, isOutside, pairAllowed, fileRoleLabel, visibilityChoices, DOC_TYPES, docTypeChoices, CLOSING_LOCATIONS, US_STATES, CONTACT_TYPE_CODES, contactTypeLabel , COUNTY_MAX } };
  Object.assign(api, devAuth(ctx), dealsAndAuth(ctx), contactsTasksDocs(ctx), tasksAndForms(ctx), messagesActivity(ctx), adminUsersTeams(ctx), libraryFolders(ctx), closingSchedule(ctx), notificationsPart(ctx), mattP2(ctx), mattNov2(ctx), crmPart(ctx, flags), agentPortal(ctx));
  Object.assign(api, mattNov3b(ctx));   // Matt, Nov 3 (b): source-of-business options for Place Order
  // a new Buyer / Listing Agent on an open order gets the 3 agent tasks (Francis, Nov 3)
  { const addP = api.addParticipant; api.addParticipant = async function (...a) { const r = await addP.apply(this, a); ensureAgentPortal(load()); save(); return r; }; }
  // Every call is all-or-nothing: if it throws (validation error, or browser storage full), drop the in-memory copy so the next call
  // reloads the last SAVED state. Without this a half-applied edit (e.g. a rejected lender email) stayed in memory and broke later saves.
  for (const [k, fn] of Object.entries(api)) if (typeof fn === 'function') api[k] = async function (...a) {
    try { return await fn.apply(this, a); } catch (e) { db = null;
      if (isQuota(e)) throw new Error('Browser storage for this demo is full, so that was not saved. Use "reset demo data" or upload smaller files.'); throw e; } };
  return api;
}
