/* CONNECT-6 (checklist 9.3): Gmail sent from the portal, and replies in the same
 * Gmail thread, show on the order's Messages / Inbox tab. No live send. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { render as renderMsgs } from '../js/pages/dealmsgs.js';
import {
  gmailThreadId, parseGmailThreadParam, shapeGmailThreads, mergeConversationLists, isGmailThread,
} from '../js/data/gmail-in-messages.js';
import { buildOrderOverview } from '../js/data/order-overview.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const sent = {
  id: 'e-out', mailboxEmail: 'fsantos@clatitle.com', gmailThreadId: 'thr-1', direction: 'out',
  fromEmail: 'fsantos@clatitle.com', fromName: 'Francis Santos',
  toEmails: ['clatestportal+e2e-buyer@gmail.com'], ccEmails: [], bccEmails: ['hidden@example.com'],
  subject: 'Introduction [CLA #MD-26-97207]', sentAt: '2026-11-25T15:00:00Z', sentBy: 'staff-1',
  mailboxProfileId: 'staff-1', snippet: 'Hello, we opened your order.', bodyHtml: '<p>Hello, we opened your order.</p>',
};
const reply = {
  id: 'e-in', mailboxEmail: 'fsantos@clatitle.com', gmailThreadId: 'thr-1', direction: 'in',
  fromEmail: 'clatestportal+e2e-buyer@gmail.com', fromName: 'Pat Buyer',
  toEmails: ['fsantos@clatitle.com'], ccEmails: [],
  subject: 'Re: Introduction [CLA #MD-26-97207]', sentAt: '2026-11-25T15:10:00Z',
  snippet: 'Thank you, I got this.', bodyHtml: '<p>Thank you, I got this.</p>', attachmentNames: ['id.pdf'],
};
const other = {
  id: 'e-seller', mailboxEmail: 'fsantos@clatitle.com', gmailThreadId: 'thr-2', direction: 'out',
  fromEmail: 'fsantos@clatitle.com', fromName: 'Francis Santos',
  toEmails: ['clatestportal+e2e-seller@gmail.com'], subject: 'Seller only [CLA #MD-26-97207]',
  sentAt: '2026-11-25T16:00:00Z', sentBy: 'staff-1', mailboxProfileId: 'staff-1', snippet: 'For the seller only.',
};

const key = gmailThreadId(sent);
ok(key.startsWith('gmail:') && parseGmailThreadParam(key).mailboxEmail === 'fsantos@clatitle.com' && parseGmailThreadParam(key).gmailThreadId === 'thr-1', 'gmail thread id round-trips through the Messages URL');

const staffThreads = shapeGmailThreads([reply, sent, other], { userId: 'staff-1', readAt: '' });
ok(staffThreads.length === 2, 'emails group into one thread per Gmail thread id');
const intro = staffThreads.find((t) => t.gmailThreadId === 'thr-1');
ok(intro && intro.count === 2 && intro.unread === 1 && intro.lastFrom === 'Pat Buyer' && /Thank you/.test(intro.lastBody), 'the reply is in the same conversation, unread for the staff sender, and is the last message');
ok(intro.messages[0].id === 'e-out' && intro.messages[1].id === 'e-in', 'messages stay in sent-time order');
ok(isGmailThread(intro) && intro.hasFiles, 'the thread is marked as Gmail and shows the reply attachment');

const portal = [{ id: 'th-portal', subject: 'Portal hello', lastAt: '2026-11-25T15:05:00Z', lastFrom: 'Pat', lastBody: 'Hi', unread: 0, count: 1, participants: [{ name: 'Pat', role: 'Buyer' }], messages: [] }];
const merged = mergeConversationLists(portal, staffThreads);
ok(merged[0].gmailThreadId === 'thr-2' && merged[1].gmailThreadId === 'thr-1' && merged[2].id === 'th-portal', 'Messages list is newest-first across portal conversations and Gmail');

const deal = { id: 'd1', fileNumber: 'MD-26-97207', street: '1 Main St', city: 'Annapolis', state: 'MD', transactionType: 'Purchase', myRole: 'Processor', participants: [] };
const staffUser = { id: 'staff-1', role: 'Processor', firstName: 'Francis', lastName: 'Santos' };
const staffApi = {
  listThreads: async () => portal,
  listDealEmails: async () => [sent, reply, other],
  emailReadCursor: async () => ({ readAt: '' }),
  getGmailStatus: async () => ({ available: true, allowed: true, connected: true, mailbox: 'fsantos@clatitle.com', status: 'connected' }),
};
const staffPage = await renderMsgs({ api: staffApi, deal, user: staffUser, params: {}, refresh() {} });
const staffHtml = toText(staffPage.body);
ok(staffPage.title === 'Inbox', 'staff still see the Inbox title');
ok(staffHtml.includes('data-gmail-thread="1"') && staffHtml.includes('>Email</span>') && staffHtml.includes('Introduction') && staffHtml.includes('Seller only') && staffHtml.includes('Portal hello'), 'staff Messages lists the Gmail threads and the portal conversation');
ok(staffHtml.includes('data-mail-sync') && staffHtml.includes('Check for replies'), 'staff with connected Gmail can check for replies from Messages');
ok(staffHtml.includes(`href="#/deals/d1/inbox/${key}"`), 'the Gmail row links to the Messages thread URL');

const detail = await renderMsgs({ api: staffApi, deal, user: staffUser, params: { sub: key }, refresh() {} });
const detailHtml = toText(detail.body);
ok(detailHtml.includes('data-gmail-thread="thr-1"') && detailHtml.includes('data-mail-dir="out"') && detailHtml.includes('data-mail-dir="in"') && detailHtml.includes('Pat Buyer') && detailHtml.includes('id.pdf'), 'opening the conversation shows the sent email and the reply');
ok(detailHtml.includes('data-mail-reply=') && detailHtml.includes('data-mail-show=') && !detailHtml.includes('<p>Thank you, I got this.</p>'), 'staff can reply from Messages; the HTML body stays behind Show message');
ok(detailHtml.includes('Bcc: hidden@example.com'), 'staff still see bcc on a message they sent');

const buyerUser = { id: 'buyer-1', role: 'Outside user', firstName: 'Pat', lastName: 'Buyer' };
const buyerDeal = { ...deal, myRole: 'Client-Buyer' };
const buyerApi = {
  listThreads: async () => portal,
  listDealEmails: async () => [sent, reply], // RPC would already have dropped the seller-only email and bcc
  emailReadCursor: async () => ({ readAt: '' }),
  getGmailStatus: async () => ({ available: false, allowed: false, connected: false }),
};
const buyerPage = await renderMsgs({ api: buyerApi, deal: buyerDeal, user: buyerUser, params: {}, refresh() {} });
const buyerHtml = toText(buyerPage.body);
ok(buyerPage.title === 'Messages', 'a buyer sees the Messages title');
ok(buyerHtml.includes('Introduction') && buyerHtml.includes('Portal hello') && !buyerHtml.includes('Seller only'), 'a buyer sees Gmail they are on, plus portal messages, and not a seller-only email');
ok(!buyerHtml.includes('data-mail-sync') && !buyerHtml.includes('Check for replies'), 'a buyer does not get Check for replies');
ok(!buyerHtml.includes('hidden@example.com'), 'a buyer is not shown a bcc address');

const buyerDetail = await renderMsgs({ api: buyerApi, deal: buyerDeal, user: buyerUser, params: { sub: key }, refresh() {} });
const buyerDetailHtml = toText(buyerDetail.body);
ok(buyerDetailHtml.includes('data-mail-reply-hint') && !buyerDetailHtml.includes('data-mail-reply=') && buyerDetailHtml.includes('use the email you received'), 'a buyer can read the thread and is told to reply from their email');

const missing = await renderMsgs({
  api: { ...buyerApi, listDealEmails: async () => [] },
  deal: buyerDeal, user: buyerUser, params: { sub: key }, refresh() {},
});
ok(toText(missing.body).includes('not on this file') || toText(missing.body).includes('do not have access'), 'opening a Gmail thread the viewer cannot see explains that in plain words');

const ov = buildOrderOverview({
  deal: { id: 'd1', fileNumber: 'MD-26-97207', street: '1 Main St', city: 'Annapolis', state: 'MD', transactionType: 'Purchase' },
  me: staffUser,
  threads: mergeConversationLists(portal, staffThreads),
  tasks: [], documents: [], activity: [],
});
ok(ov.conversations.some((c) => c.id === key) && ov.conversations.some((c) => c.id === 'th-portal') && ov.counts.inbox >= 1, 'file overview conversations and the Messages badge include the Gmail thread');

const mig = readFileSync(new URL('../supabase/migrations/20261131270000_connect_6_gmail_messages.sql', import.meta.url), 'utf8');
ok(/create function public\.list_deal_emails\(p_deal uuid\)/.test(mig) && /security definer/i.test(mig) && /private\.can_access_deal\(p_deal\)/.test(mig) && /private\.is_staffish\(\)/.test(mig) && /private\.effective_uid\(\)/.test(mig), 'the database file adds list_deal_emails, gated by can_access_deal');
ok(/grant execute on function public\.list_deal_emails\(uuid\) to authenticated/.test(mig) && /revoke all on function public\.list_deal_emails\(uuid\) from public, anon/.test(mig), 'execute is granted only to signed-in users');
ok(/case when private\.is_staffish\(\) then e\.bcc_emails else '\{\}'::text\[\] end/.test(mig), 'non-staff never receive bcc_emails from the function');
ok(!/create (or replace )?function[^;]*validate_form/i.test(mig) && !/alter policy/i.test(mig) && !/create policy/i.test(mig), 'the file does not change validate_form, table policies, or other guards');
ok(readFileSync(new URL('../supabase/rollbacks/20261131270000_connect_6_gmail_messages.sql', import.meta.url), 'utf8').includes('drop function if exists public.list_deal_emails(uuid)'), 'rollback only drops the new function');
ok(readFileSync(new URL('../js/data/supabase-gmail.js', import.meta.url), 'utf8').includes("sb.rpc('list_deal_emails'"), 'the adapter reads Messages mail through the new function');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('connect-6 gmail messages passed');
