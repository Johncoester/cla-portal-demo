/* MF-079 (Matt, confirmed Nov 27 2026, Gmail 1a21df0b0dc7c8f3):
   A file email stays unread until that person opens that specific message.
   Fake / mock data only. Nothing is emailed or applied on a hosted project. */
import { readFileSync } from 'node:fs';
import { isUnreadFileEmail, countUnreadEmails } from '../js/data/file-email-unread.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const staff = 'staff-1';
const ba = 'ba-1';
const la = 'la-1';
const tc = 'tc-1';
const a = { id: 'm1', dealId: 'd1', direction: 'in', sentAt: '2026-11-27T16:00:00Z', fromEmail: 'p@x.com' };
const b = { id: 'm2', dealId: 'd1', direction: 'in', sentAt: '2026-11-27T17:00:00Z', fromEmail: 'q@x.com' };

for (const [who, label] of [[staff, 'staff'], [ba, 'Buyer Agent'], [la, 'Listing Agent'], [tc, 'Transaction Coordinator']]) {
  const ids = new Set();
  ok(countUnreadEmails([a, b], { userId: who, readAt: '', readIds: ids }) === 2, `${label}: both messages start unread`);
  ids.add(a.id);
  ok(countUnreadEmails([a, b], { userId: who, readAt: '', readIds: ids }) === 1 && isUnreadFileEmail(b, { userId: who, readAt: '', readIds: ids }), `${label}: opening one message leaves the other unread`);
}

const sql = read('supabase/migrations/20261131420000_mf079_email_message_reads.sql');
const back = read('supabase/rollbacks/20261131420000_mf079_email_message_reads.sql');
ok(/Gmail 1a21df0b0dc7c8f3/.test(sql) && /deal_email_message_reads/.test(sql) && /mark_deal_email_read/.test(sql), 'the migration names the source email, the table, and the RPC');
ok(/enable row level security/.test(sql) && /profile_id = \(select auth.uid\(\)\)/.test(sql), 'read rows are own-row only');
ok(/grant select on public\.deal_email_message_reads to authenticated/.test(sql) && !/grant select, insert, update on public\.deal_email_message_reads/.test(sql) && !/create policy deal_email_message_reads_insert/.test(sql) && !/create policy deal_email_message_reads_update/.test(sql), 'authenticated has SELECT only; insert and update policies are not created');
ok(/has_table_privilege\('authenticated', 'public\.deal_email_message_reads', 'INSERT'\)/.test(sql), 'the self-check refuses INSERT or UPDATE for signed-in users');
ok(/list_deal_emails\(p_deal\)/.test(sql) && /demo_visible_deal_ids/.test(sql) && /e\.deal_id = p_deal/.test(sql), 'the RPC requires the email to belong to the deal and the caller to be able to see it');
ok(/open_order_mail/.test(sql) && /deal_email_message_reads mr/.test(sql), 'Open Orders counts skip a message this person already opened');
ok(/list_deal_emails/.test(sql) && /is_staffish/.test(sql), 'staff and parties who can already see the email can mark it read');
ok(/begin;/.test(sql) && /lock_timeout/.test(sql) && /self-check/.test(sql), 'the migration is one transaction with a lock timeout and self-checks');
ok(/drop table if exists public.deal_email_message_reads/.test(back) && /drop function if exists public.mark_deal_email_read/.test(back) && /deal_email_reads/.test(back), 'the rollback drops the new table and RPC and keeps the older file cursor');

const page = read('js/pages/dealemail.js');
const msgs = read('js/pages/dealmsgs.js');
const css = read('css/portal.css');
ok(!/markDealEmailsRead\(deal\.id\)/.test(page) && !/markDealEmailsRead\(deal\.id\)/.test(msgs), 'opening the Email tab or a Messages thread does not mark the whole file read');
ok(/markDealEmailRead/.test(page) && /markDealEmailRead/.test(msgs) && /Show message/.test(page), 'a message is marked read when it is opened');
ok(/mail-msg\.unread/.test(css) && /navy-50/.test(css), 'unread rows have a slight color change');

console.log(fail ? fail + ' failed' : 'mf079 email message reads passed');
if (fail) process.exit(1);
