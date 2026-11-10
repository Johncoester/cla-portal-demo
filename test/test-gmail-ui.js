/* Gmail phase 1 (John, Nov 9): page-side rules + Email tab / Profile card markup with a fake adapter. No network. */
import { canUseGmail, isAllowedTestRecipient as pageAllow, introRecipients, introTemplate, GMAIL_RESULT, hasSignature } from '../js/data/gmail-email.js';
import { buildSellerAgentPreview } from '../js/data/automation.js';
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
// one sign-off only: with a portal signature the body stops at "Thank you," (the signature carries the name); without one the body signs itself
const tSig = introTemplate(deal, { firstName: 'Anchie', lastName: 'Santos', role: 'Processor' }, rs, { signature: true });
ok(tSig.html.endsWith('<p>Thank you,</p>') && (tSig.html.match(/Anchie Santos/g) || []).length === 1, 'introduction with a portal signature: "Thank you," then the signature, no second name block');
ok(t.html.endsWith('<p>Thank you,<br>Anchie Santos<br>CLA Title &amp; Escrow</p>'), 'introduction without a signature signs with the sender name');
ok(hasSignature('<p>Anchie</p>') && !hasSignature('<p><br></p>') && !hasSignature('') && !hasSignature('&nbsp;'), 'an empty signature does not count');
const aDeal = { id: 'd1', fileNumber: 'MD-1', address: '1 Main St', participants: [{ id: 'p1', role: 'Client-Seller', contact: { firstName: 'Sue', email: 's@x.com' } }, { id: 'p2', role: 'Listing Agent', contact: { firstName: 'Al', email: 'a@x.com' } }] };
const plainP = buildSellerAgentPreview({ deal: aDeal, sender: 'Anchie Santos' }); const sigP = buildSellerAgentPreview({ deal: aDeal, sender: 'Anchie Santos', portalSignature: true });
ok(plainP.messages.every((m) => m.body.endsWith('Anchie Santos\nCLA Title & Escrow')), 'seller / agent default body signs with the sender when no portal signature');
ok(sigP.messages.length === 2 && sigP.messages.every((m) => m.body.endsWith('Thank you,') && !m.body.includes('Anchie Santos') && !m.body.includes('CLA Title & Escrow\n')), 'seller / agent default body leaves the name to the portal signature');
ok(Object.keys(GMAIL_RESULT).join() === 'connected,denied,expired,wrong_domain,missing_scope,in_use,failed', 'every callback result has a message');
ok(dealTabSpec('email').startsWith('./dealemail.js'), 'file tab "email" is registered');
const off = toText(gmailCardHtml({ available: true, allowed: true, connected: false }, ''));
ok(off.includes('data-gmail-connect') && off.includes('Connect Gmail') && !off.includes('data-gmail-disconnect'), 'Profile: Connect Gmail when not connected');
const on = toText(gmailCardHtml({ available: true, allowed: true, connected: true, mailbox: 'me@clatitle.com', status: 'connected' }, 'connected'));
ok(on.includes('me@clatitle.com') && on.includes('data-gmail-disconnect') && on.includes('data-gmail-result="connected"') && on.includes('data-gmail-sig-save'), 'Profile: connected address, Disconnect, signature, result notice');
{ const base = { available: true, allowed: true, connected: true, mailbox: 'me@clatitle.com', status: 'connected' };
  const noScope = toText(gmailCardHtml({ ...base, signatureScope: false }, ''));
  ok(noScope.includes('data-gmail-sig-reconnect') && noScope.includes('Reconnect Gmail to import your signature') && /data-gmail-sig-refresh [^>]*disabled/.test(noScope), 'Profile: an account connected before the signature permission is asked to reconnect');
  const imported = toText(gmailCardHtml({ ...base, signatureScope: true, signatureSource: 'gmail', signatureHtml: '<p>Me | CLA</p>', signatureSyncedAt: '2026-11-09T19:10:00Z' }, ''));
  ok(!imported.includes('data-gmail-sig-reconnect') && imported.includes('data-gmail-sig-preview') && /data-gmail-sig-refresh\s*>/.test(imported) && imported.includes('Your Gmail signature') && imported.includes('data-gmail-sig-save') && !imported.includes('<p>Me | CLA</p>'), 'Profile: Gmail signature shown as a framed preview, Refresh from Gmail, override editor');
  const custom = toText(gmailCardHtml({ ...base, signatureScope: true, signatureSource: 'custom', signatureHtml: '<p>X</p>' }, ''));
  ok(custom.includes('data-gmail-sig-source="custom"') && custom.includes('override') && /data-gmail-sig-override open/.test(custom), 'Profile: a typed override is labeled and open'); }
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
const compose = readFileSync(new URL('../js/pages/dealemail.js', import.meta.url), 'utf8');
ok(compose.includes('payload.documentIds') && compose.includes('r.ok === false') && compose.includes('selected document') && compose.includes('send.disabled = false'), 'compose shows an error and does not say Sent when the selected documents are missing');
console.log(fail ? `${fail} FAILED` : 'all gmail ui checks passed');
if (fail) process.exit(1);
