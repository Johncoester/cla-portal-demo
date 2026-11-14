/* MF-049 (Francis via Matt's ticket, Nov 11 2026, confirmed Nov 11 2:38 PM ET).
 * An HR-created Processor has the same portal rights as a Processor.
 * Start conversation lists only people on that file, and a typed name and email uses the existing invite-and-hold path. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { acctCanRead } from '../js/data/accounting.js';
import { canUseCrm } from '../js/data/crm.js';
import { canUseGmail } from '../js/data/gmail-email.js';
import { fwpCanRead } from '../js/data/funding-wire-policy.js';
import { titleCanRead } from '../js/data/title.js';
import { canReachPayoffs } from '../js/data/locked-links.js';
import { moduleAccess } from '../js/data/modules.js';
import { hrOnly, currentWs } from '../js/workspace.js';
import { cleanTypedRecipient, personByEmail, plainMessageHtml, addTypedRecipient } from '../js/data/typed-recipient.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const plain = { id: 'p', role: 'Processor', isAdmin: false, status: 'active' };
const hr = { ...plain, hrRole: 'employee', hrEmployeeId: 'hre-x', hrHasReports: false };
const features = { accounting: true, crm: true, funding: true, wires: true, policy: true, title: true };
const settings = [{ module: 'accounting', live: true, updatedBy: 'u-admin' }, { module: 'hr', live: true, updatedBy: 'u-admin' }];
const rights = (u) => ({
  acct: acctCanRead(u), crm: canUseCrm(u), gmail: canUseGmail(u), fund: fwpCanRead(u), title: titleCanRead(u), payoffs: canReachPayoffs(u),
  accounting: moduleAccess('accounting', u, features, settings), hrOnly: hrOnly(u), ws: currentWs(u),
});
ok(JSON.stringify(rights(plain)) === JSON.stringify(rights(hr)), 'HR flags do not change a Processor\'s sections');
ok(rights(plain).acct && rights(plain).accounting === 'live' && rights(plain).ws === 'everything' && !rights(plain).hrOnly, 'a Processor still gets Accounting and the full menu');
ok(!acctCanRead({ role: 'Employee', isAdmin: false, status: 'active' }) && hrOnly({ role: 'Employee' }), 'an HR-only Employee login is not a Processor');

const app = read('js/app.js');
const dealNav = app.slice(app.indexOf('const dealNav'), app.indexOf('const fileNav'));
ok(dealNav.includes('acctCanRead(u)') && !dealNav.includes('hrRole') && !dealNav.includes('hrEmployeeId'), 'the file sidebar follows the portal role, not an HR flag');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-ph1');
const pia = await api.getSession();
await api.signInDev('u-proc');
const paula = await api.getSession();
ok(pia.role === 'Processor' && paula.role === 'Processor' && JSON.stringify(rights(pia)) === JSON.stringify(rights(paula)), 'Pia, an HR-created Processor, has the same rights as Paula');

await api.signInDev('u-admin');
const stranger = await api.createContact({ firstName: 'Nora', lastName: 'Nowhere', email: 'nora.nowhere@example.test', phone: '301-555-0198' });
const other = await api.createDeal({ street: '9 Other Street', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(other.id, stranger.id, 'Client-Buyer');
const deal = await api.createDeal({ street: '16 File Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent');
await api.addParticipant(deal.id, 'c-lender1', 'Lender');
await api.updateDeal(deal.id, { tcUserId: 'u-tc' });
const emails = async (who) => { await api.signInDev(who); return new Set((await api.listMessageRecipients(deal.id)).map((p) => String(p.email || '').toLowerCase())); };
const asProc = await emails('u-proc');
ok(asProc.has('linda.lender@example.test') && asProc.has('terry.coordinator@example.test'), 'the list includes the lender and the transaction coordinator on this file');
ok(!asProc.has('nora.nowhere@example.test'), 'a contact who is only on another file is not offered');
const asAdmin = await emails('u-admin');
ok(asAdmin.has('paula.processor@example.test') && asAdmin.has('linda.lender@example.test') && !asAdmin.has('nora.nowhere@example.test'), 'staff assigned to the file are listed, and the other file\'s buyer is not');

ok(cleanTypedRecipient({}).empty === true, 'leaving the typed boxes blank adds nobody');
const bad = cleanTypedRecipient({ firstName: 'Ned', lastName: 'New', email: 'not-an-email' });
ok(bad.error === 'Enter an email like name@example.com.', 'a bad email says what to type');
ok(cleanTypedRecipient({ firstName: 'Ned', email: 'ned.new@example.test' }).error === 'Enter a first and last name for this recipient.', 'a missing last name is kept on the form by refusing to send');
ok(plainMessageHtml('Hello <there>') === '<p>Hello &lt;there&gt;</p>', 'the typed message is stored as text');

await api.signInDev('u-proc');
const full = await api.getDeal(deal.id);
const added = await addTypedRecipient(api, full, { firstName: 'Ned', lastName: 'Newbuyer', email: 'ned.newbuyer@example.test' }, 'Client-Buyer');
ok(added.inviteContactId && added.person && added.person.email === 'ned.newbuyer@example.test', 'a typed person who is not on the file is added and has no portal login');
const sent = await api.sendMessage({ dealId: deal.id, to: [added.person.id], subject: 'Welcome', bodyHtml: plainMessageHtml('Hello Ned'), files: [], inviteContactId: added.inviteContactId });
ok(!!sent.id && sent.invited && sent.invited.contactId === added.inviteContactId, 'the typed person is sent on the existing held-message path');
const again = await api.listMessageRecipients(deal.id);
ok(personByEmail(again, 'ned.newbuyer@example.test') && !personByEmail(again, 'nora.nowhere@example.test'), 'after sending, the new buyer is on this file and the other file\'s contact still is not');

const page = read('js/pages/dealmsgs.js');
ok(page.includes('data-typed-recipient') && page.includes('cleanTypedRecipient(') && page.includes('addTypedRecipient(') && page.includes('inviteContactId'), 'Start conversation can type a name and email and uses the held-message send');
ok(page.includes("noLogin(p) ? raw('disabled data-no-login') : ''") && page.includes('No portal login yet. Use Share Files to invite them.'), 'people already on the file with no login stay listed and pointed to Share Files');
ok(page.includes('autocomplete="off"'), 'the typed email box does not offer addresses the browser saved from other files');

console.log(fail ? `FAIL ${fail}` : 'mf-049 checks passed');
process.exit(fail ? 1 : 0);
