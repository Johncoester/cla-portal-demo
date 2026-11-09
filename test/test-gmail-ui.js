/* Gmail phase 1 (John, Nov 9): page-side rules + Email tab / Profile card markup with a fake adapter. No network. */
import { canUseGmail, isAllowedTestRecipient as pageAllow, introRecipients, introTemplate, GMAIL_RESULT } from '../js/data/gmail-email.js';
import { isAllowedTestRecipient as serverAllow, hasWireDetails, GMAIL_ROLES as SERVER_ROLES } from '../supabase/functions/_shared/gmail-core.mjs';
import { GMAIL_ROLES } from '../js/data/gmail-email.js';
import { toText } from '../js/ui.js';
import { gmailCardHtml } from '../js/pages/gmail-card.js';
import { render as renderEmail } from '../js/pages/dealemail.js';
import { dealTabSpec } from '../js/pages/deal-tab.js';
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
ok(JSON.stringify(GMAIL_ROLES) === JSON.stringify(SERVER_ROLES), 'page and server agree on who can connect Gmail');
for (const a of ['clatestportal@gmail.com', 'clatestportal+x@gmail.com', 'a@clatitle.com', 'jcoester-6jkr3p@mail.grokbot.com', 'b@gmail.com', 'x@clatitle.com.evil.com', 'clatestportal+@gmail.com', 'A..b@clatitle.com']) ok(pageAllow(a) === serverAllow(a), `page mirrors the server allowlist: ${a}`);
for (const r of ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin']) ok(canUseGmail({ role: r }), `${r} can use Gmail`);
for (const u of [{ role: 'Employee' }, { role: 'Outside user' }, { role: 'Processor', accountRole: 'buyer' }, null]) ok(!canUseGmail(u), `no Gmail for ${JSON.stringify(u)}`);
const deal = { id: 'd1', fileNumber: 'MD-26-97207', street: '1 Main St', city: 'Annapolis', state: 'MD', closingDate: '2026-12-15', participants: [
  { role: 'Client-Buyer', contact: { firstName: 'Pat', lastName: 'Buyer', email: 'clatestportal+buyer@gmail.com' } },
  { role: 'Listing Agent', contact: { firstName: 'Lee', lastName: 'Agent', email: 'CLATESTPORTAL+la@gmail.com' } },
  { role: 'Client-Seller', removed: true, contact: { firstName: 'Old', lastName: 'Seller', email: 'old@example.com' } },
  { role: 'Lender', contact: { firstName: 'Len', lastName: 'Der', email: 'lender@example.com' } },
  { role: 'Buyer Agent', contact: { firstName: 'Hid', lastName: 'Den', email: 'h@example.com', contactHidden: true } }] };
const rs = introRecipients(deal);
ok(rs.map((r) => r.email).join() === 'clatestportal+buyer@gmail.com,clatestportal+la@gmail.com', 'introduction goes to buyers / sellers / agents with an email (not removed, not hidden, not the lender)');
const t = introTemplate(deal, { firstName: 'Anchie', lastName: 'Santos', role: 'Processor' }, rs);
ok(t.key === 'intro' && /Introduction: 1 Main St, Annapolis, MD/.test(t.subject) && t.html.includes('Anchie Santos') && t.html.includes('your processor') && t.html.includes('point of contact') && t.html.includes('Hi Pat and Lee,'), 'introduction email: who I am, my role, point of contact');
ok(!hasWireDetails(t.html) && /never email you wire instructions/.test(t.html), 'introduction carries the wire-fraud warning and no wire details');
ok(Object.keys(GMAIL_RESULT).join() === 'connected,denied,expired,wrong_domain,missing_scope,in_use,failed', 'every callback result has a message');
ok(dealTabSpec('email').startsWith('./dealemail.js'), 'file tab "email" is registered');
const off = toText(gmailCardHtml({ available: true, allowed: true, connected: false }, ''));
ok(off.includes('data-gmail-connect') && off.includes('Connect Gmail') && !off.includes('data-gmail-disconnect'), 'Profile: Connect Gmail when not connected');
const on = toText(gmailCardHtml({ available: true, allowed: true, connected: true, mailbox: 'me@clatitle.com', status: 'connected' }, 'connected'));
ok(on.includes('me@clatitle.com') && on.includes('data-gmail-disconnect') && on.includes('data-gmail-result="connected"') && on.includes('data-gmail-sig-save'), 'Profile: connected address, Disconnect, signature, result notice');
ok(toText(gmailCardHtml({ available: true, allowed: false }, '')) === '' && toText(gmailCardHtml({ available: false }, '')) === '', 'Profile: no Gmail card for non-staff or in mock mode');
const emails = [{ id: 'e1', mailboxEmail: 'me@clatitle.com', gmailThreadId: 't1', direction: 'out', fromEmail: 'me@clatitle.com', fromName: 'Me', toEmails: ['clatestportal+buyer@gmail.com'], subject: 'Introduction [CLA #MD-26-97207]', sentAt: '2026-11-09T18:00:00Z', templateKey: 'intro', snippet: 'Hi', bodyHtml: '<p>Hi</p>' },
  { id: 'e2', mailboxEmail: 'me@clatitle.com', gmailThreadId: 't1', direction: 'in', fromEmail: 'clatestportal+buyer@gmail.com', toEmails: ['me@clatitle.com'], subject: 'Re: Introduction [CLA #MD-26-97207]', sentAt: '2026-11-09T18:05:00Z', snippet: 'Thanks', attachmentNames: ['id.pdf'], bodyHtml: '<p>Thanks</p>' }];
const api = { getGmailStatus: async () => ({ available: true, allowed: true, connected: true, mailbox: 'me@clatitle.com', status: 'connected' }), listDealEmails: async () => emails };
const v = await renderEmail({ api, deal, user: { role: 'Processor', firstName: 'A', lastName: 'B' } });
const b = toText(v.body);
ok(b.includes('Sending from <strong>me@clatitle.com</strong>') && (b.match(/data-mail-thread=/g) || []).length === 1 && (b.match(/data-mail-msg=/g) || []).length === 2 && b.includes('data-mail-dir="in"') && b.includes('id.pdf'), 'Email tab: one thread, sent + received, attachment listed');
ok(b.includes('data-mail-intro') && b.includes('data-mail-sync') && b.includes('[CLA #MD-26-97207]') && b.includes('test addresses'), 'Email tab: Introduction email, Check for replies, tag + Live Test note');
ok(!b.includes('<p>Thanks</p>'), 'Email tab: message bodies are not put into the page (they open in a sandboxed frame)');
let refused = false; try { await renderEmail({ api, deal, user: { role: 'Outside user' } }); } catch (e) { refused = true; }
ok(refused, 'Email tab: outside users are refused');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(/canUseGmail\(u\) && api\.listDealEmails && api\.mode === 'supabase' \? link\('email', 'Email', 'inbox'\)/.test(app), 'file menu shows Email for Gmail roles on Live Test only');
const dealSrc = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(dealSrc.includes('data-send-sellers-agents') && dealSrc.includes('api.sendDealEmail') && !dealSrc.includes('data-send-disabled'), '"Email sellers and agents" sends through Gmail when connected');
console.log(fail ? `${fail} FAILED` : 'all gmail ui checks passed');
if (fail) process.exit(1);
