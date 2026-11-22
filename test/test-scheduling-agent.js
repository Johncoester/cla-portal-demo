/* MF-058. Settlement agent/notary on each side, autosave wording, and an email reminder to the parties on the file. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import {
  AUTOSAVE_MS, cleanSideAgent, reminderEmptyMessage, reminderMessage, reminderRecipients, sameAgent, sideAgentPatch,
} from '../js/data/scheduling-agent.js';
import { schedulingPanelHtml } from '../js/pages/scheduling-panel.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const boom = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

ok(AUTOSAVE_MS >= 500, 'autosave waits at least half a second so it does not write on every keystroke');
ok(boom(() => cleanSideAgent({ side: 'buyer', phone: '12', name: 'Pat Notary' })).includes('10-digit'), 'a short phone is refused and the message says what to type');
ok(boom(() => cleanSideAgent({ side: 'buyer', email: 'not-an-email', name: 'Pat Notary' })).includes('valid email'), 'a bad email is refused');
const clean = cleanSideAgent({ side: 'seller', name: 'Pat Notary', phone: '3015550100', email: 'Pat.Notary@example.test', confirmed: true });
ok(clean.phone === '301-555-0100' && clean.email === 'Pat.Notary@example.test' && clean.confirmed && clean.side === 'seller', 'a full seller settlement agent/notary is kept');
ok(boom(() => cleanSideAgent({ side: 'buyer', name: '   ', confirmed: true })).includes('before confirming'), 'confirmed with a blank name is refused');
ok(!Object.keys(sideAgentPatch(clean)).some((k) => k === 'closingDate'), 'saving a side does not carry the file closing date');
ok(sameAgent(clean, { ...clean }), 'an unchanged side is the same save');

const parties = [
  { role: 'Client-Buyer', contact: { firstName: 'Ben', lastName: 'Buyer', email: 'ben.buyer@example.test', profileId: 'b1' } },
  { role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Agent', email: 'bianca.agent@example.test', profileId: 'a1' } },
  { role: 'Client-Seller', contact: { firstName: 'Sally', lastName: 'Seller', email: 'sally.seller@example.test' } },
  { role: 'Listing Agent', contact: { firstName: 'Larry', lastName: 'List', email: 'larry.list@example.test' } },
  { role: 'Client-Buyer', contact: { firstName: 'No', lastName: 'Mail', email: '' } },
  { role: 'Lender', contact: { firstName: 'Linda', lastName: 'Lender', email: 'linda.lender@example.test' } },
];
const buyer = reminderRecipients(parties, 'buyer');
ok(buyer.recipients.map((r) => r.email).join() === 'ben.buyer@example.test,bianca.agent@example.test', 'the buyer reminder goes to the buyers and the buyer\'s agent');
ok(buyer.missing.some((r) => r.name === 'No Mail') && !buyer.recipients.some((r) => r.role === 'Lender'), 'a buyer with no email is skipped and the lender is not included');
const seller = reminderRecipients(parties, 'seller');
ok(seller.recipients.map((r) => r.email).join() === 'sally.seller@example.test,larry.list@example.test', 'the seller reminder goes to the sellers and the listing agent');
ok(reminderEmptyMessage('seller').includes('listing agent') && reminderEmptyMessage('buyer').includes('buyer'), 'an empty side says who needs an email on Contacts');
const mail = reminderMessage({ side: 'buyer', firstName: 'Ben', deal: { street: '10 Oak Lane', city: 'Rockville', state: 'MD', zip: '20850', fileNumber: 'MD-26-1' } });
ok(mail.subject.startsWith('Reminder: settlement for 10 Oak Lane') && mail.body.includes('Ben') && !mail.body.includes('@'), 'the reminder names the property and does not invent an address');

const html = toText(schedulingPanelHtml({
  deal: { settlementAgentName: 'Pat Notary', settlementAgentPhone: '301-555-0100', sellerSettlementAgentName: 'Sam Seller' },
  staff: true, choices: [], links: [],
}));
const buyerAt = html.indexOf('data-sched-side="buyer"');
const sellerAt = html.indexOf('data-sched-side="seller"');
ok(buyerAt >= 0 && html.indexOf('sched-agent-lower') > buyerAt && html.indexOf('sched-agent-lower') < sellerAt, 'the buyer settlement agent/notary is in the larger lower section');
ok(sellerAt >= 0 && html.indexOf('data-settlement-agent-side="seller"') > sellerAt, 'the seller settlement agent/notary is inside the seller section');
ok(html.includes('data-agent-phone') && html.includes('data-agent-email') && html.includes('data-sched-remind="buyer"') && html.includes('data-sched-remind="seller"') && html.includes('data-sched-save'), 'each side has phone, email, a saved line and a reminder');
ok(!html.includes('Save settlement agent') && !html.includes('Signed on'), 'the Save button and the signed-on date are not on this card');

const closing = readFileSync(new URL('../js/pages/dealclosing.js', import.meta.url), 'utf8');
ok(!closing.includes('Signed on') && !closing.includes('signed on') && closing.includes('allowBlankSignedOn'), 'the signing form no longer asks for the signed-on date');
const src = readFileSync(new URL('../js/data/scheduling-agent.js', import.meta.url), 'utf8');
ok(!src.includes('@clatitle.com') && !src.includes('sms') && src.includes('reminderRecipients'), 'reminder addresses are not hard-coded');
const panel = readFileSync(new URL('../js/pages/scheduling-panel.js', import.meta.url), 'utf8');
ok(panel.includes('AUTOSAVE_MS') && panel.includes('data-sched-save') && !panel.includes('Save settlement agent'), 'the screen saves on a timer and does not keep a Save button for the agent');

const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const before = await api.getDeal('deal-1');
await api.saveSettlementAgent('deal-1', { side: 'seller', name: 'Pat Notary', phone: '2405550199', email: 'pat.notary@example.test', confirmed: true });
const saved = await api.getDeal('deal-1');
ok(saved.sellerSettlementAgentName === 'Pat Notary' && saved.sellerSettlementAgentPhone === '240-555-0199' && saved.sellerSettlementAgentConfirmed === true && saved.closingDate === before.closingDate && saved.settlementAgentName === before.settlementAgentName, 'the seller side saves without touching the buyer agent or the file closing date');
let bad = '';
try { await api.saveSettlementAgent('deal-1', { side: 'buyer', name: 'Pat Notary', email: 'nope', confirmed: false }); } catch (e) { bad = e.message; }
ok(bad.includes('valid email') && (await api.getDeal('deal-1')).sellerSettlementAgentName === 'Pat Notary', 'a bad email is not saved and the other side stays');
const preview = await api.previewSchedulingReminder('deal-1', 'buyer');
ok(preview.recipients.length >= 2 && preview.recipients.every((r) => r.role === 'Client-Buyer' || r.role === 'Buyer Agent') && preview.recipients.every((r) => r.email.endsWith('@example.test')), 'the buyer preview lists only buyers and the buyer\'s agent on the file');
const sent = await api.sendSchedulingReminder('deal-1', 'buyer');
const box = (await api.listOutbox()).filter((o) => o.templateKey === 'scheduling_reminder' && o.dealId === 'deal-1');
ok(sent.emailed && sent.sent === preview.recipients.length && box.length === preview.recipients.length && box.every((o) => o.channel === 'email' && o.sentAt == null && o.status === 'queued'), 'the reminder is an email queued for those people and is not marked sent in the outbox');
ok(box.every((o) => preview.recipients.some((r) => r.email === o.toEmail)) && !box.some((o) => /seller|listing/i.test(o.toEmail)), 'the buyer reminder does not pick up a seller address');
const after = await api.getDeal('deal-1');
ok(after.closingDate === before.closingDate, 'sending the reminder does not change the file closing date');

console.log(fail ? fail + ' failed' : 'scheduling agent passed');
process.exit(fail ? 1 : 0);
