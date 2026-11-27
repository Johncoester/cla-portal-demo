/* MF-001 / MF-002 / MF-003: unread file mail (portal threads + Gmail) and Email-tab search.
   No hosted project and no SQL is applied. The migration is checked as text. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { toText } from '../js/ui.js';
import {
  countUnreadEmails, emailMatchesQuery, gmailUnreadByDeal, isUnreadFileEmail, laterIso, localCursorMap,
  mergeMailUnread, orderMailCount, portalUnreadByDeal, readLocalCursor, readLocalMessageIds, relationMissing, writeLocalCursor, writeLocalMessageRead, EMAIL_READ_PREFIX,
} from '../js/data/file-email-unread.js';
import { gmailSupabase } from '../js/data/supabase-gmail.js';
import { render as renderOrders } from '../js/pages/orders.js';
import { render as renderEmail } from '../js/pages/dealemail.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const staff = 'staff-1';
const other = 'staff-2';
const buyer = 'buyer-1';
const inbound = { id: 'e-in', dealId: 'd1', direction: 'in', sentAt: '2026-11-09T18:00:00Z', fromEmail: 'buyer@example.com', fromName: 'Pat Buyer', subject: 'Wire question', snippet: 'Please call', bodyHtml: '<p>Please call about the deed</p>' };
const mine = { id: 'e-out', dealId: 'd1', direction: 'out', sentAt: '2026-11-09T17:00:00Z', sentBy: staff, mailboxProfileId: staff, fromEmail: 'me@clatitle.com', subject: 'Introduction', bodyHtml: '<p>Hello</p>' };
const theirs = { id: 'e-other', dealId: 'd1', direction: 'out', sentAt: '2026-11-09T19:00:00Z', sentBy: other, mailboxProfileId: other, fromEmail: 'other@clatitle.com', fromName: 'Other Staff', subject: 'Update', bodyHtml: '<p>Status</p>' };

ok(isUnreadFileEmail(inbound, { userId: staff, readAt: '' }) && !isUnreadFileEmail(mine, { userId: staff, readAt: '' }), 'a reply is unread; mail this person sent is not');
ok(!isUnreadFileEmail(inbound, { userId: staff, readAt: '2026-11-09T18:00:00Z' }) && isUnreadFileEmail(theirs, { userId: staff, readAt: '2026-11-09T18:30:00Z' }), 'the cursor clears mail at or before it, and keeps a later message from someone else');
ok(isUnreadFileEmail(theirs, { userId: buyer, readAt: '' }) && !isUnreadFileEmail(theirs, { userId: other, readAt: '' }), 'the same outbound row is unread for a teammate and not for its sender');
ok(countUnreadEmails([inbound, mine, theirs], { userId: staff, readAt: '' }) === 2, 'the file count skips this person\'s own send');
ok(isUnreadFileEmail(inbound, { userId: staff, readAt: '', readIds: new Set([inbound.id]) }) === false && isUnreadFileEmail(theirs, { userId: staff, readAt: '', readIds: new Set([inbound.id]) }), 'marking one message read leaves a later message unread');
ok(isUnreadFileEmail(theirs, { userId: staff, readAt: '2026-11-09T20:00:00Z', readIds: new Set() }) === false, 'an older file-level cursor still counts as read');

const reads = [{ dealId: 'd1', readAt: '2026-11-09T18:30:00Z' }];
const byDeal = gmailUnreadByDeal([inbound, mine, theirs, { ...inbound, id: 'e2', dealId: 'd2', sentAt: '2026-11-09T20:00:00Z' }], reads, { userId: staff, localReadAt: { d2: '2026-11-09T21:00:00Z' } });
ok(byDeal.d1 === 1 && byDeal.d2 === undefined, 'Gmail unread is per file and a later browser cursor clears that file');

const parts = [{ threadId: 't1', lastReadAt: '' }, { threadId: 't2', lastReadAt: '2026-11-09T12:00:00Z' }];
const threads = [{ id: 't1', dealId: 'd1' }, { id: 't2', dealId: 'd1' }, { id: 't3', dealId: 'd9' }];
const messages = [
  { threadId: 't1', authorId: buyer, createdAt: '2026-11-09T11:00:00Z' },
  { threadId: 't1', authorId: staff, createdAt: '2026-11-09T11:05:00Z' },
  { threadId: 't2', authorId: buyer, createdAt: '2026-11-09T11:00:00Z' },
  { threadId: 't2', authorId: buyer, createdAt: '2026-11-09T13:00:00Z' },
  { threadId: 't3', authorId: buyer, createdAt: '2026-11-09T13:00:00Z' },
];
const portal = portalUnreadByDeal({ parts, threads, messages, userId: staff });
ok(portal.d1 === 2 && portal.d9 === undefined, 'portal unread counts only threads this person is on, after their read cursor, not their own posts');
ok(mergeMailUnread({ d1: 2 }, { d1: 1, d3: 4 }).d1.total === 3 && mergeMailUnread({ d1: 2 }, { d1: 1, d3: 4 }).d3.gmail === 4, 'the order icon adds portal and Gmail for that file');
ok(orderMailCount({ id: 'd1', unread: 5 }, null) === 5 && orderMailCount({ id: 'd1', unread: 5 }, { d1: { total: 3 } }) === 3 && orderMailCount({ id: 'd4', unread: 0 }, {}) === 0, 'a failed unread read keeps the portal count already on the deal');

ok(emailMatchesQuery({ subject: 'Wire question', fromName: 'Pat', fromEmail: 'p@x.com', bodyHtml: '<p>Call me</p>' }, 'wire'), 'search matches the subject');
ok(emailMatchesQuery({ subject: 'Hello', fromName: 'Pat Buyer', fromEmail: 'p@x.com', bodyHtml: '' }, 'pat buyer'), 'search matches the from name');
ok(emailMatchesQuery({ subject: 'Hello', fromEmail: 'p@x.com', bodyHtml: '<p>The deed is ready</p>', snippet: '' }, 'deed'), 'search matches the body with tags stripped');
ok(!emailMatchesQuery({ subject: 'Hello', fromEmail: 'p@x.com', bodyHtml: '<p>Hello</p>', snippet: 'short' }, 'missing-word'), 'a word that is not in subject, from, or body does not match');
ok(emailMatchesQuery({ subject: 'Hello', bodyHtml: '' }, '   '), 'a blank search keeps every message');
ok(laterIso('2026-11-09T12:00:00Z', '2026-11-09T11:00:00Z') === '2026-11-09T12:00:00Z' && relationMissing({ message: 'Could not find the table public.deal_email_reads in the schema cache' }) && !relationMissing({ message: 'permission denied' }), 'the later cursor wins, and only a missing relation is treated as not migrated');

const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), key: (i) => [...mem.keys()][i], get length() { return mem.size; } };
ok(writeLocalCursor(storage, staff, 'd1', '2026-11-09T18:00:00Z') && readLocalCursor(storage, staff, 'd1') === '2026-11-09T18:00:00Z' && !localCursorMap(storage, buyer)['d1'], 'the browser cursor is stored per user');
ok(storage.key(0).startsWith(EMAIL_READ_PREFIX + staff + ':'), 'the browser key names the person');

// Hosted adapter: missing deal_email_reads does not throw. The browser cursor still clears the icon.
const emails = [
  { id: 'e-in', deal_id: 'd1', sent_at: '2026-11-09T18:00:00Z', sent_by: null, direction: 'in', mailbox_profile_id: 'box' },
  { id: 'e-out', deal_id: 'd1', sent_at: '2026-11-09T17:00:00Z', sent_by: staff, direction: 'out', mailbox_profile_id: staff },
];
const missing = { message: 'Could not find the table public.deal_email_reads in the schema cache' };
function chain(rows, error) {
  const q = {
    select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; },
    range() { return Promise.resolve({ data: rows, error: error || null }); },
    maybeSingle() { return Promise.resolve({ data: null, error: error || null }); },
    upsert() { return Promise.resolve({ error: error || null }); },
    then(fn) { return Promise.resolve(fn({ data: rows, error: error || null })); },
  };
  return q;
}
const sb = {
  auth: { getUser: async () => ({ data: { user: { id: staff } } }) },
  from(table) {
    if (table === 'deal_emails') return chain(emails, null);
    if (table === 'deal_email_reads') return chain(null, missing);
    if (table === 'thread_participants') return chain([{ thread_id: 't1', last_read_at: '' }], null);
    if (table === 'threads') return chain([{ id: 't1', deal_id: 'd1' }], null);
    if (table === 'messages') return chain([{ thread_id: 't1', created_at: '2026-11-09T11:00:00Z', author_id: buyer }], null);
    return chain([], null);
  },
};
const camel = (o) => Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o;
mem.clear();
globalThis.localStorage = storage;
const gmail = gmailSupabase({ sb, ok: (r) => { if (r && r.error) throw new Error(r.error.message); return r && r.data; }, camel });
const before = await gmail.orderMailUnread();
ok(before.d1 && before.d1.gmail === 1 && before.d1.portal === 1 && before.d1.total === 2, 'Open Orders adds the portal thread and the Gmail reply when the read table is missing');
const stillUnread = await gmail.fileEmailUnreadCount('d1');
ok(stillUnread === 1, 'opening the Email tab no longer marks every message read (MF-079)');
const markedOne = await gmail.markDealEmailRead('d1', 'e-in');
ok(markedOne.saved === false && markedOne.local === true, 'marking one message read without the new table stays in this browser and does not throw');
const after = await gmail.fileEmailUnreadCount('d1');
ok(after === 0, 'opening that specific message clears it for this person even before the migration is applied');
ok(writeLocalMessageRead(storage, staff, 'e-in') && readLocalMessageIds(storage, staff).has('e-in'), 'the browser keeps per-message read state');
const buyerSb = { ...sb, auth: { getUser: async () => ({ data: { user: { id: buyer } } }) }, from(table) {
  if (table === 'deal_emails') return chain([], null); // existing RLS: buyers do not receive deal_emails
  if (table === 'deal_email_reads') return chain(null, missing);
  if (table === 'thread_participants') return chain([{ thread_id: 't1', last_read_at: '' }], null);
  if (table === 'threads') return chain([{ id: 't1', deal_id: 'd1' }], null);
  if (table === 'messages') return chain([{ thread_id: 't1', created_at: '2026-11-09T11:00:00Z', author_id: staff }], null);
  return chain([], null);
} };
const buyerApi = gmailSupabase({ sb: buyerSb, ok: (r) => r && r.data, camel });
const buyerMail = await buyerApi.orderMailUnread();
ok(buyerMail.d1 && buyerMail.d1.portal === 1 && buyerMail.d1.gmail === 0 && (await buyerApi.fileEmailUnreadCount('d1')) === 0, 'a buyer sees their portal thread only; Gmail stays behind the existing staff policy');

globalThis.location = { hash: '#/orders?s=Open' };
const deal = (id, extra) => ({ id, fileNumber: 'MD-' + id, street: '1 Main', city: 'Annapolis', state: 'MD', zip: '21401', openDate: '2026-11-01', closingDate: '', transactionType: 'Purchase', stageName: 'Open', status: 'Open', processorId: 'p', processorName: 'Pat', ...extra });
const ordersApi = { listDeals: async () => [deal('quiet', { unread: 0 }), deal('loud', { unread: 1 }), deal('mail', { unread: 0 })], orderMailUnread: async () => ({ mail: { portal: 0, gmail: 2, total: 2 } }) };
for (const role of ['Processor', 'Buyer Agent', 'Client-Buyer', 'Client-Seller']) {
  const view = await renderOrders({ api: ordersApi, user: { role, id: role } });
  const html = toText(view.body);
  const icons = html.match(/data-new-mail="\d+"/g) || [];
  const quiet = html.slice(html.indexOf('data-deal="quiet"'), html.indexOf('data-deal="loud"'));
  ok(icons.length === 2 && html.includes('data-new-mail="2"') && html.includes('data-new-mail="1"') && !quiet.includes('data-new-mail'), role + ' Open Orders shows the icon only on files with unread mail');
}

const searchDeal = { id: 'd1', fileNumber: 'MD-1', street: '1', city: 'C', state: 'MD' };
const searchEmails = [
  { id: 'a', mailboxEmail: 'me@clatitle.com', gmailThreadId: 't', direction: 'in', fromEmail: 'pat@example.com', fromName: 'Pat', toEmails: ['me@clatitle.com'], subject: 'Deed', sentAt: '2026-11-09T18:00:00Z', snippet: 'ready', bodyHtml: '<p>The deed is ready</p>' },
  { id: 'b', mailboxEmail: 'me@clatitle.com', gmailThreadId: 'u', direction: 'out', fromEmail: 'me@clatitle.com', fromName: 'Me', sentBy: staff, toEmails: ['x@example.com'], subject: 'Hello', sentAt: '2026-11-09T17:00:00Z', snippet: 'hi', bodyHtml: '<p>Hello</p>' },
];
const emailView = await renderEmail({ api: { getGmailStatus: async () => ({ connected: true, mailbox: 'me@clatitle.com' }), listDealEmails: async () => searchEmails, emailReadCursor: async () => ({ readAt: '' }), markDealEmailsRead: async () => ({ saved: false, local: true }) }, deal: searchDeal, user: { id: staff, role: 'Processor', firstName: 'A', lastName: 'B' } });
const emailHtml = toText(emailView.body);
ok(emailHtml.includes('data-mail-search') && emailHtml.includes('data-mail-unread-count') && emailHtml.includes('1 unread') && (emailHtml.match(/data-mail-unread="1"/g) || []).length === 1, 'the Email tab counts only mail this person has not viewed');
const emailPage = read('js/pages/dealemail.js');
ok(emailHtml.includes('mail-msg unread') && emailPage.includes('markDealEmailRead') && !/markDealEmailsRead\(deal\.id\)/.test(emailPage), 'unread rows have a color class, and opening the tab does not mark the whole file read');

const mig = read('supabase/migrations/20261110030000_deal_email_reads.sql');
const rb = read('supabase/rollbacks/20261110030000_deal_email_reads.sql');
const code = mig.replace(/^\s*--.*$/gm, '');
ok(/create table public\.deal_email_reads/.test(mig) && /primary key \(profile_id, deal_id\)/.test(mig), 'read state is one row per person per file');
ok(/enable row level security/.test(mig) && /deal_email_reads_select/.test(mig) && /profile_id = \(select auth\.uid\(\)\)/.test(mig), 'a person can read only their own cursor');
ok(/deal_email_reads_insert/.test(mig) && /deal_email_reads_update/.test(mig) && /private\.is_staffish\(\)/.test(code) && /exists \(select 1 from public\.deals d where d\.id = deal_id\)/.test(code), 'writing a cursor requires staff who can already open the file');
ok(/security invoker/.test(mig) && /deal_email_unread_counts/.test(mig) && /e\.sent_by is distinct from \(select auth\.uid\(\)\)/.test(mig), 'the count function runs as the caller and skips mail they sent');
ok(!/alter table public\.deal_emails/i.test(code) && !/policy deal_emails/i.test(code) && !/drop policy/i.test(code), 'deal_emails and its policies are not changed');
ok(!/grant .+ to anon/i.test(code) && /grant select, insert, update on public\.deal_email_reads to authenticated/.test(mig), 'anon gets nothing; authenticated can read and write their cursor');
ok(/drop function if exists public\.deal_email_unread_counts/.test(rb) && /drop table if exists public\.deal_email_reads/.test(rb) && !/drop table if exists public\.deal_emails/.test(rb), 'rollback removes only the cursor objects');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// This feature published 202611100930. A later commit on the same stack may move a module
// forward; every importer of one module must still agree, and none may be older than that.
const floor = '202611100930';
const changed = new Set(['js/data/file-email-unread.js', 'js/data/supabase-gmail.js', 'js/data/order-overview.js', 'js/data/supabase-order-overview.js', 'js/pages/orders.js', 'js/pages/dealemail.js', 'js/pages/deal.js', 'js/app.js', 'js/pages/client-overview.js', 'js/pages/tc-overview.js', 'js/data/adapter.js', 'js/data/mock-adapter.js', 'js/data/supabase-adapter.js', 'js/pages/dashboard.js', 'js/pages/deal-buyer-legacy.js', 'js/pages/deal-tab.js', 'js/pages/dealagenttask.js', 'js/pages/dealcontacts.js', 'js/pages/dealintake.js', 'js/pages/dealtaskform.js', 'js/pages/dealtasks.js', 'js/pages/taskboard.js', 'js/pages/tasks.js']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}
const specRe = /(['"])(\.{1,2}\/[^'"]+?\.js)\?v=(\d+)\1/g;
const seen = new Map();
for (const file of walk(path.join(root, 'js'))) {
  const text = readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  for (const m of text.matchAll(specRe)) {
    const target = path.normalize(path.join(path.dirname(rel), m[2])).replace(/\\/g, '/');
    if (!changed.has(target)) continue;
    if (!seen.has(target)) seen.set(target, new Set());
    seen.get(target).add(m[3]);
  }
}
let stampMiss = 0;
for (const [target, stamps] of seen) {
  const list = [...stamps];
  if (list.length !== 1 || list[0] < floor) { stampMiss++; console.log('FAIL stamp', target, list.join(',')); }
}
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const appStamp = (html.match(/js\/app\.js\?v=(\d+)/) || [])[1] || '';
ok(stampMiss === 0 && appStamp >= floor, 'every importer of a changed module uses one stamp at or after ' + floor + ' through index.html');
ok(!read('js/pages/crm.js').includes('202611100300') && !read('js/data/supabase-crm.js').includes('file-email-unread'), 'CRM modules are not part of this change');

console.log(fail ? fail + ' failed' : 'file email unread passed');
if (fail) process.exit(1);
