/* mock-adapter.js : FAKE-DATA back end behind the adapter contract (see adapter.js).
 * State lives in a key/value storage (localStorage in the browser, a Map in tests).
 * Every rule here is mirrored by RLS / RPC in supabase/migrations.
 * Deliberately absent: any way to delete a document (no method, no UI, no policy).
 * Tasks are cancelled, never deleted; users are disabled, never deleted. */
import { ROLES, STAGES, DEAL_STATUSES, TASK_STATUSES, TX_TYPES, DOC_VISIBILITY, PARTICIPANT_ROLES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT,
  isProcessor, isStaff, isClient, sideOf } from './constants.js';
import { buildSeed } from './seed.js';
import { dealsAndAuth } from './mock-part-deals.js';
import { devAuth } from './mock-part-auth.js';
import { contactsTasksDocs } from './mock-part-docs.js';
import { messagesAdmin } from './mock-part-msgs.js';

const KEY = 'cla-portal-new:data:v1';
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
  const notViewOnly = (u) => { if (u.role === 'Sales Person' || u.role === 'Sales Team') fail('Sales staff accounts are view-only.'); };
  const contactOf = (profileId) => load().contacts.find((c) => c.profileId === profileId);
  function dealsFor(u) {
    const d = load();
    if (isProcessor(u.role) || u.role === 'Sales Team') return d.deals;   // Sales Team = team-wide, read-only
    const c = contactOf(u.id);
    const ids = new Set(c ? d.participants.filter((p) => p.contactId === c.id).map((p) => p.dealId) : []);
    d.deals.forEach((x) => { if (x.salesPersonId === u.id) ids.add(x.id); });
    return d.deals.filter((x) => ids.has(x.id));
  }
  const dealOr404 = (u, id) => dealsFor(u).find((x) => x.id === id) || fail('Order not found.');
  const log = (dealId, actorId, action, entity, entityId, detail) => { load().activity.push({ id: nid('a'), dealId, actorId, action, entity, entityId, detail: str(detail, 300), createdAt: now() }); };
  const nameOf = (id) => { const p = load().profiles.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown'; };
  const roleOf = (id) => (load().profiles.find((x) => x.id === id) || {}).role;
  const fullName = (c) => `${c.firstName} ${c.lastName}`.trim();
  const docVisible = (u, doc) => {
    if (isStaff(u.role) || u.role === 'Transaction Coordinator' || doc.uploadedBy === u.id) return true;
    if (doc.visibility === 'all') return true;
    if (doc.visibility === 'staff') return false;
    return doc.visibility === sideOf(u.role);
  };
  const threadVisible = (u, t) => isProcessor(u.role) || t.participantIds.includes(u.id);
  const unreadIn = (u, t) => { const d = load(); const r = d.reads.find((x) => x.threadId === t.id && x.profileId === u.id); const last = r ? r.at : ''; return d.messages.filter((m) => m.threadId === t.id && m.authorId !== u.id && m.createdAt > last).length; };
  function participantsOf(dealId, viewer) {
    const d = load();
    let rows = d.participants.filter((p) => p.dealId === dealId).map((p) => ({ ...p, contact: clone(d.contacts.find((c) => c.id === p.contactId)) }));
    if (isClient(viewer.role)) rows = rows.filter((p) => !(isClient(p.role) && p.role !== viewer.role));   // a client does not see the OTHER side's client
    return rows;
  }
  function dealView(u, x) {
    const d = load(); const tasks = d.tasks.filter((t) => t.dealId === x.id); const mine = d.threads.filter((t) => t.dealId === x.id && threadVisible(u, t));
    return { ...clone(x), address: `${x.street}, ${x.city}, ${x.state} ${x.zip}`, stageName: STAGES[x.stage],
      openTasks: tasks.filter((t) => t.status === 'todo' || t.status === 'blocked').length,
      myOpenTasks: tasks.filter((t) => t.status === 'todo' && t.assignedRole === u.role).length,
      unread: mine.reduce((n, t) => n + unreadIn(u, t), 0),
      processorName: nameOf(x.processorId), salesPersonName: x.salesPersonId ? nameOf(x.salesPersonId) : '' };
  }

  const api = { mode: 'mock' };
  const ctx = { api, store, sess, SESSION_KEY, KEY, load, save, nid, me, needUser, needProcessor, notViewOnly, contactOf, dealsFor, dealOr404, log, nameOf, roleOf, fullName,
    docVisible, threadVisible, unreadIn, participantsOf, dealView, clone, now, fail, str, emailOk, money, zipOk, reset() { store.removeItem(KEY); db = null; load(); },
    C: { ROLES, STAGES, DEAL_STATUSES, TASK_STATUSES, TX_TYPES, DOC_VISIBILITY, PARTICIPANT_ROLES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isProcessor, isStaff, isClient } };
  Object.assign(api, devAuth(ctx), dealsAndAuth(ctx), contactsTasksDocs(ctx), messagesAdmin(ctx));
  return api;
}
