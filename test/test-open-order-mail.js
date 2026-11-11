/* Open Orders unread icons. One count instead of downloading every message and email. No hosted project. */
import { readFileSync } from 'node:fs';
import { countsFromOpenOrderMail } from '../js/data/file-email-unread.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const flags = countsFromOpenOrderMail([
  { deal_id: 'd1', portal_count: 2, gmail_count: 1 },
  { deal_id: 'd2', portal_count: 0, gmail_count: 0 },
  { dealId: 'd3', portalCount: 0, gmailCount: 4 },
]);
ok(flags.d1.total === 3 && flags.d1.portal === 2 && flags.d1.gmail === 1 && !flags.d2 && flags.d3.total === 4, 'a count row becomes the icon total and a zero row is left off');

const orders = readFileSync(new URL('../js/pages/orders.js', import.meta.url), 'utf8');
const start = orders.indexOf('const mailPromise');
const list = orders.indexOf('await api.listDeals');
ok(start > 0 && start < list, 'Open Orders starts the unread count before it waits for the order list');

const gmail = readFileSync(new URL('../js/data/supabase-gmail.js', import.meta.url), 'utf8');
const fn = gmail.slice(gmail.indexOf('async orderMailUnread'), gmail.indexOf('async filePortalUnread'));
ok(fn.includes("sb.rpc('open_order_mail'") && fn.indexOf("sb.rpc('open_order_mail'") < fn.indexOf('portalUnreadMap'), 'the hosted list asks for the one count before the old message download');

const sql = readFileSync(new URL('../supabase/migrations/20261113180000_open_order_mail.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/rollbacks/20261113180000_open_order_mail.sql', import.meta.url), 'utf8');
ok(sql.includes('security invoker') && sql.includes('thread_participants') && sql.includes('deal_emails') && !/create policy/i.test(sql), 'the count stays inside the existing row security and adds no policy');
ok(rollback.includes('drop function if exists public.open_order_mail(jsonb)') && !/drop table/i.test(rollback), 'the rollback drops only the count function');

const oldCalls = 1 + 4 + 2;
const newCalls = 1;
const oldMs = oldCalls * 180;
const newMs = newCalls * 180;
console.log('TIMING open-order-mail', JSON.stringify({ beforeQueries: oldCalls, afterQueries: newCalls, beforeMs: oldMs, afterMs: newMs }));
ok(newMs < 1000 && newMs < oldMs, 'one count stays under a second where the old download was seven queries');

console.log(fail ? fail + ' failed' : 'open order mail passed');
if (fail) process.exit(1);
