/* MF-011: settlement rows save in place and stay after a new read. Fake rows only. No network. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { settlementSectionHtml } from '../js/pages/settlement-section.js';
import { cleanClosingTime, saveSettlementAgent } from '../js/data/settlement-edit.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const deal = {
  id: 'deal-1', transactionType: 'Purchase', closingDate: '2026-12-01', closingTime: '14:30', closerName: 'Paula Processor', closerProfileId: 'u-proc',
  participants: [
    { id: 'dp-agent', role: 'Buyer Agent', contactId: 'c-bagent', contact: { firstName: 'Bianca', lastName: 'Buyer-Agent' } },
    { id: 'dp-buyer', role: 'Client-Buyer', contactId: 'c-buyer', contact: { firstName: 'Ben', lastName: 'Buyer' } },
  ],
};
const contacts = [{ id: 'c-bagent', firstName: 'Bianca', lastName: 'Buyer-Agent' }, { id: 'c-lena', firstName: 'Lena', lastName: 'Listing' }];
const closerStaff = [{ id: 'u-proc', firstName: 'Paula', lastName: 'Processor', role: 'Processor', status: 'active' }];
const locations = [{ participantId: 'dp-buyer', name: 'Ben Buyer', signingMethod: 'undecided', signingLabel: 'Undecided' }];
const paint = (user, extra = {}) => toText(settlementSectionHtml({ deal, user, contacts, closerStaff, locations, ...extra }));

const proc = paint({ role: 'Processor' });
ok(proc.includes('data-settlement-edit="agent"') && proc.includes('data-settlement-edit="date"') && proc.includes('data-settlement-edit="time"') && proc.includes('data-settlement-edit="closer"') && proc.includes('data-settlement-edit="signing"') && proc.includes('list="settlement-closer-staff"'), 'a processor gets in-place controls for agents, date, time, closer, and signing method');
const admin = paint({ role: 'Admin', isAdmin: true });
ok(admin.includes('data-settlement-edit="date"') && admin.includes('data-settlement-edit="closer"'), 'an admin gets the same edit controls');
for (const user of [{ role: 'Client-Buyer', accountRole: 'Outside user' }, { role: 'Client-Seller', accountRole: 'Outside user' }, { role: 'Buyer Agent', accountRole: 'Outside user' }, { role: 'Listing Agent', accountRole: 'Outside user' }]) {
  const html = paint(user);
  ok(!html.includes('data-settlement-edit') && !html.includes('<select') && !html.includes('data-closer-input'), `${user.role} does not see staff edit controls`);
  ok(html.includes('Settlement date') && html.includes('Buyer agent') && html.includes('Bianca Buyer-Agent') && !html.includes('>Closer<') && !html.includes('Signing method'), `${user.role} still sees the date and the agent, not the closer or signing method`);
}
const sales = paint({ role: 'Sales Person' });
ok(!sales.includes('data-settlement-edit') && sales.includes('data-settlement-value="closer"') && sales.includes('Paula Processor') && sales.includes('Undecided'), 'sales sees the closer and signing method and cannot edit them');
const tc = paint({ role: 'Transaction Coordinator' });
ok(tc.includes('data-settlement-edit="signing"') && !tc.includes('data-settlement-edit="date"') && !tc.includes('data-settlement-edit="time"') && !tc.includes('data-settlement-edit="closer"') && !tc.includes('data-settlement-edit="agent"'), 'a coordinator can edit only the signing method');
const locked = paint({ role: 'Processor' }, { demoLocked: true });
ok(!locked.includes('data-settlement-edit'), 'demo view has no edit controls');
const refi = toText(settlementSectionHtml({ deal: { ...deal, transactionType: 'Refinance', participants: deal.participants.filter((p) => p.role !== 'Buyer Agent') }, user: { role: 'Processor' }, contacts, closerStaff, locations: [] }));
ok(!refi.includes('data-settlement-role="Buyer Agent"') && !refi.includes('data-settlement-role="Listing Agent"'), 'a refinance with no agents does not offer agent rows');

ok(cleanClosingTime('09:05') === '09:05' && cleanClosingTime('') === '' && cleanClosingTime('  ') === '', 'a blank time clears and a clock time is kept');
let bad = '';
try { cleanClosingTime('9:5'); } catch (e) { bad = e.message; }
ok(/HH:MM/.test(bad), 'a partial time is refused');

const storage = mem();
const a = createMockAdapter({ storage, sessionStorage: mem() });
await a.signInDev('u-proc');
await a.updateDeal('deal-1', { closingDate: '2026-12-15', closingTime: '14:30', closerName: 'Paula Processor (Processor)' });
const locs = await a.listClosingLocations('deal-1');
const buyer = locs.find((r) => r.partyRole === 'Client-Buyer');
ok(!!buyer, 'the file has a buyer to sign');
await a.setSigningMethod('deal-1', buyer.participantId, 'ron');
const before = await a.getDeal('deal-1');
const agent = before.participants.find((p) => p.role === 'Buyer Agent');
const swapped = await saveSettlementAgent(a, before, { role: 'Buyer Agent', participantId: agent.id, contactId: 'c-lena' });
ok(swapped.changed === true, 'changing the buyer agent is a save');
const again = createMockAdapter({ storage, sessionStorage: mem() });
await again.signInDev('u-proc');
const reloaded = await again.getDeal('deal-1');
ok(reloaded.closingDate === '2026-12-15' && reloaded.closingTime === '14:30', 'date and time are still there after a new read');
ok(reloaded.closerName === 'Paula Processor' && reloaded.closerProfileId === 'u-proc', 'the closer is the same staff row Edit order details stores');
ok(reloaded.participants.some((p) => p.role === 'Buyer Agent' && p.contactId === 'c-lena') && !reloaded.participants.some((p) => p.role === 'Buyer Agent' && p.contactId === agent.contactId), 'the agent change is still the new contact');
const signs = await again.listClosingLocations('deal-1');
ok(signs.find((r) => r.participantId === buyer.participantId).signingMethod === 'ron', 'the signing method is still RON');
let refused = '';
try { await again.updateDeal('deal-1', { closingTime: '25:99' }); } catch (e) { refused = e.message; }
ok(/HH:MM/.test(refused) && (await again.getDeal('deal-1')).closingTime === '14:30', 'a bad time does not replace the saved time');
await again.signInDev('u-buyer');
const hidden = await again.getDeal('deal-1');
ok(!hidden.closerName && !hidden.closerProfileId, 'a buyer still does not receive the closer');

const page = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(page.includes('settlementSectionHtml') && page.includes('mountSettlement') && !page.includes('data-all-order-contacts'), 'the file overview mounts the settlement section and no longer repeats every party in the hidden contacts table');
const sql = readFileSync(new URL('../supabase/migrations/20261110190000_deal_closing_time.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261110190000_deal_closing_time.sql', import.meta.url), 'utf8');
ok(sql.includes("set local lock_timeout = '3s'") && sql.includes('closing_time text not null default') && sql.includes('deals_closing_time_chk') && !/insert into public\.contacts/i.test(sql) && !/contacts\.custom/.test(sql) && back.includes('drop column closing_time'), 'the time migration adds one deals column, with a rollback, and does not write contact custom fields');

console.log(fail ? `settlement edit: ${fail} failed` : 'settlement edit passed');
if (fail) process.exit(1);
