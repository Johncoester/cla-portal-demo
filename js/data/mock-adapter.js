/* mock-adapter.js : FAKE-DATA back end behind the adapter contract (see adapter.js).
 * State lives in a key/value storage (localStorage in the browser, a Map in tests).
 * Every rule here is mirrored by RLS / RPC in supabase/migrations.
 * Deliberately absent: any way to delete a document (no method, no UI, no policy) - Admin included.
 * Tasks are cancelled, never deleted. Users: disabled, or "removed" by an Admin (row kept so their documents, messages and history stay). */
import { ROLES, STAGES, DEAL_STATUSES, TASK_STATUSES, TX_TYPES, DOC_VISIBILITY, PARTICIPANT_ROLES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, DEAL_ROLES, ADMIN_ROLE, isViewOnly,
  isProcessor, isStaff, isClient, isAgent, sideOf } from './constants.js';
import { buildSeed, DEAL_FOLDERS } from './seed.js';
import { dealsAndAuth } from './mock-part-deals.js';
import { devAuth } from './mock-part-auth.js';
import { contactsTasksDocs } from './mock-part-docs.js';
import { tasksAndForms } from './mock-part-tasks.js';
import { messagesActivity } from './mock-part-msgs.js';
import { adminUsersTeams } from './mock-part-admin.js';
import { libraryFolders } from './mock-part-library.js';
import { closingSchedule } from './mock-part-schedule.js';
import { notificationsPart } from './mock-part-notify.js';

const KEY = 'cla-portal-new:data:v3';   // v3: 'Admin' role (old saved demo data is re-seeded)
const SESSION_KEY = 'cla-portal-new:session:v1';
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const now = () => new Date().toISOString();
const fail = (m) => { throw new Error(m); };
const str = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const money = (v, label) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,]/g, '')); if (!isFinite(n) || n < 0) fail(`${label} must be a positive number.`); return n; };
const zipOk = (z) => !z || /^\d{5}(-\d{4})?$/.test(z);

export function createMockAdapter({ storage, sessionStorage } = {}) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null) || fail('no storage');
  const sess = sessionStorage || (typeof window !== 'undefined' ? window.sessionStorage : store);
  let db = null;
  function save() { store.setItem(KEY, JSON.stringify(db)); }
  function load() { if (db) return db; const raw = store.getItem(KEY); db = raw ? JSON.parse(raw) : buildSeed(); if (!raw) save(); return db; }
  const nid = (p) => { const d = load(); d.seq += 1; return `${p}-${d.seq}`; };

  const me = () => { const id = sess.getItem(SESSION_KEY); return (id && load().profiles.find((p) => p.id === id && p.status === 'active')) || null; };
  const needUser = () => me() || fail('Please sign in.');
  const needProcessor = () => { const u = needUser(); if (!isProcessor(u.role)) fail('Only a Sales Processor can do this.'); return u; };
  const needAdmin = () => { const u = needUser(); if (!u.isAdmin) fail('Only an Admin can do this.'); return u; };
  const isManager = (u) => isProcessor(u.role) || u.role === 'Transaction Coordinator';   // runs the workflow on deals they can access
  const notViewOnly = (u) => { if (isViewOnly(u.role)) fail('This account is view-only for order work.'); };
  const contactOf = (profileId) => load().contacts.find((c) => c.profileId === profileId);
  const seesAll = (u) => u.isAdmin || isProcessor(u.role) || u.role === 'Sales Team';
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
    d.deals.forEach((x) => { if (x.salesPersonId === u.id) ids.add(x.id); });
    return d.deals.filter((x) => ids.has(x.id));
  }
  const dealOr404 = (u, id) => dealsFor(u).find((x) => x.id === id) || fail('Order not found.');
  const log = (dealId, actorId, action, entity, entityId, detail) => { load().activity.push({ id: nid('a'), dealId, actorId, action, entity, entityId, detail: str(detail, 300), createdAt: now() }); };
  const prof = (id) => load().profiles.find((x) => x.id === id);
  const nameOf = (id) => { if (typeof id === 'string' && id.startsWith('link:')) return `Scheduling link (${id.slice(5)} side)`; const p = prof(id); return p ? `${p.firstName} ${p.lastName}`.trim() + (p.status === 'removed' ? ' (removed)' : '') : 'Unknown'; };
  const roleOf = (id) => (prof(id) || {}).role;
  const fullName = (c) => `${c.firstName} ${c.lastName}`.trim();
  const folderOf = (id) => id && load().folders.find((f) => f.id === id);
  const docVisible = (u, doc) => {
    if (u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator' || doc.uploadedBy === u.id) return true;
    const f = folderOf(doc.folderId); if (f && f.staffOnly) return false;
    if (doc.visibility === 'all') return true;
    if (doc.visibility === 'staff') return false;
    return doc.visibility === sideOf(u.role);
  };
  const threadVisible = (u, t) => isProcessor(u.role) || u.isAdmin || t.participantIds.includes(u.id);
  const unreadIn = (u, t) => { const d = load(); const r = d.reads.find((x) => x.threadId === t.id && x.profileId === u.id); const last = r ? r.at : ''; return d.messages.filter((m) => m.threadId === t.id && m.authorId !== u.id && m.createdAt > last).length; };
  function participantsOf(dealId, viewer) {
    const d = load();
    let rows = d.participants.filter((p) => p.dealId === dealId).map((p) => { const c = d.contacts.find((z) => z.id === p.contactId); const pr = c && c.profileId && prof(c.profileId);
      return { ...p, contact: clone(c), removed: !!(pr && pr.status === 'removed') }; });
    if (isClient(viewer.role)) rows = rows.filter((p) => !(isClient(p.role) && p.role !== viewer.role));   // a client does not see the OTHER side's client
    return rows;
  }
  const ownerOf = (t) => { if (!t.participantId) return null; const d = load(); const p = d.participants.find((z) => z.id === t.participantId); const c = p && d.contacts.find((z) => z.id === p.contactId); return c ? c.profileId : null; };
  const taskVisible = (u, t) => {
    if (u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator') return true;
    if (t.participantId) return ownerOf(t) === u.id || (isAgent(u.role) && sideOf(t.assignedRole) === sideOf(u.role));
    return t.assignedRole === u.role || (isAgent(u.role) && sideOf(t.assignedRole) === sideOf(u.role));
  };
  const formDataVisible = (u, t) => u.isAdmin || isManager(u) || ownerOf(t) === u.id;
  function notify(profileIds, n, exceptId) {
    const d = load(); new Set(profileIds).forEach((pid) => { const p = prof(pid); if (!pid || pid === exceptId || !p || p.status !== 'active') return;
      d.notifications.push({ id: nid('n'), profileId: pid, kind: n.kind, dealId: n.dealId || null, title: str(n.title, 200), link: n.link || '', createdAt: now(), readAt: null }); });
  }
  const dealProfileIds = (dealId) => { const d = load(); const deal = d.deals.find((z) => z.id === dealId);
    const ids = d.participants.filter((p) => p.dealId === dealId).map((p) => (d.contacts.find((c) => c.id === p.contactId) || {}).profileId).filter(Boolean);
    return [...new Set([...ids, deal && deal.processorId].filter(Boolean))]; };
  function dealView(u, x) {
    const d = load(); const tasks = d.tasks.filter((t) => t.dealId === x.id && taskVisible(u, t)); const mine = d.threads.filter((t) => t.dealId === x.id && threadVisible(u, t));
    return { ...clone(x), address: `${x.street}, ${x.city}, ${x.state} ${x.zip}`, stageName: STAGES[x.stage],
      openTasks: tasks.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status)).length,
      myOpenTasks: tasks.filter((t) => ['todo', 'in_progress'].includes(t.status) && (ownerOf(t) === u.id || (!t.participantId && t.assignedRole === u.role))).length,
      unread: mine.reduce((n, t) => n + unreadIn(u, t), 0),
      processorName: nameOf(x.processorId), salesPersonName: x.salesPersonId ? nameOf(x.salesPersonId) : '' };
  }

  const api = { mode: 'mock' };
  const ctx = { api, DEAL_FOLDERS, store, sess, SESSION_KEY, KEY, load, save, nid, me, needUser, needProcessor, needAdmin, isManager, notViewOnly, contactOf, seesAll, teamAgentIds, dealsFor, dealOr404, log, prof, nameOf, roleOf, fullName,
    folderOf, docVisible, threadVisible, unreadIn, participantsOf, ownerOf, taskVisible, formDataVisible, notify, dealProfileIds, dealView, clone, now, fail, str, emailOk, money, zipOk,
    reset() { store.removeItem(KEY); db = null; load(); },
    C: { ROLES, DEAL_ROLES, ADMIN_ROLE, isViewOnly, STAGES, DEAL_STATUSES, TASK_STATUSES, TX_TYPES, DOC_VISIBILITY, PARTICIPANT_ROLES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isProcessor, isStaff, isClient, isAgent, sideOf } };
  Object.assign(api, devAuth(ctx), dealsAndAuth(ctx), contactsTasksDocs(ctx), tasksAndForms(ctx), messagesActivity(ctx), adminUsersTeams(ctx), libraryFolders(ctx), closingSchedule(ctx), notificationsPart(ctx));
  return api;
}
