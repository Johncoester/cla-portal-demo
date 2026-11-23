/* FF-106 / FF-106b / FF-106c (Francis Santos retest Nov 23 2026, 4:17 PM ET, Gmail 1a20a453c50c3fd5).
 * Closing Team shows the CLA Preprocessor from Edit order details or from an Order Contacts
 * Preprocessor participant (the DC-26-78512 path). Agent TCs do not fill that slot.
 * Fake names. No database. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { closingTeamCards, closingTeamHtml } from '../js/pages/deal.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/deal-1', hash: '#/deals/deal-1', search: '' };
window.scrollTo = () => {};
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.sessionStorage = mem(); globalThis.localStorage = mem();

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const assigned = {
  processorName: 'Paula Processor', processorId: 'u-proc',
  preprocessorName: 'Pat Preprocessor', preprocessorUserId: 'u-preproc',
  tcName: 'Terry Coordinator', tcUserId: 'u-tc',
  salesPeople: [{ id: 'u-sp', name: 'Sam Salesperson' }],
};
const cards = closingTeamCards(assigned);
ok(cards.map((c) => c.role).join('|') === 'Processor|Preprocessor|Licensed Settlement Agent|Sales Person',
  'Closing Team lists Processor, Preprocessor, Licensed Settlement Agent, then Sales Person');
ok(cards[0].name === 'Paula Processor' && cards[0].id === 'u-proc', 'the Processor card still shows the assigned processor');
ok(cards[1].role === 'Preprocessor' && cards[1].name === 'Pat Preprocessor' && cards[1].id === 'u-preproc', 'the Preprocessor card shows the assigned CLA Preprocessor from Edit order details');
ok(!cards.some((c) => c.role === 'Transaction Coordinator') && !cards.some((c) => c.name === 'Terry Coordinator'),
  'the former Transaction Coordinator Closing Team card is gone; the CLA TC name is not shown as its own card');
ok(cards[2].role === 'Licensed Settlement Agent' && cards[2].name === '' && cards[2].blankBecause === 'no-field', 'Licensed Settlement Agent stays blank');
ok(cards[3].role === 'Sales Person' && cards[3].name === 'Sam Salesperson', 'the Sales Person card is unchanged');

// DC-26-78512 as stored on TEST: deals.preprocessor_user_id is null; Ellen is a deal_participants
// row with role Preprocessor (Order Contacts). The file also has a Buyer Agent TC.
const dc2678512 = {
  processorName: 'TEST PROCESSOR01', processorId: 'u-proc',
  preprocessorUserId: null, preprocessorName: '',
  tcUserId: null, tcName: '',
  salesPeople: [{ id: 'u-sp', name: 'Sales Person Test' }],
  participants: [
    { role: 'Buyer Agent', contact: { firstName: 'Noah', lastName: 'Fields' } },
    { role: 'Buyer Agent TC', contact: { firstName: 'TC Portal', lastName: 'Jc', email: 'tcportaljc@gmail.com', profileId: 'u-agent-tc' } },
    { role: 'Client-Buyer', contact: { firstName: 'Timothy', lastName: 'Zanger' } },
    { role: 'Listing Agent', contact: { firstName: 'Bridget', lastName: 'Rigato' } },
    { role: 'Preprocessor', contactId: 'c-ellen', contact: { id: 'c-ellen', profileId: null, firstName: 'Ellen', lastName: 'Ahern', email: '' } },
  ],
};
const dcCards = closingTeamCards(dc2678512);
ok(dcCards.map((c) => c.role).join('|') === 'Processor|Preprocessor|Licensed Settlement Agent|Sales Person',
  'a file like DC-26-78512 still has a Preprocessor card, not a Transaction Coordinator card');
ok(dcCards[1].role === 'Preprocessor' && dcCards[1].name === 'Ellen Ahern' && dcCards[1].id === '',
  'when Ellen is assigned as Preprocessor in Order Contacts, her name shows on Closing Team even if preprocessor_user_id is empty');
ok(!dcCards.some((c) => (c.name || '').includes('TC Portal') || c.name === 'Jc' || c.id === 'u-agent-tc'),
  "the Buyer's agent TC does not appear on the Closing Team Preprocessor card");

const onlyAgentTc = closingTeamCards({
  processorName: 'TEST PROCESSOR01', processorId: 'u-proc',
  participants: [
    { role: 'Buyer Agent TC', contact: { firstName: 'TC Portal', lastName: 'Jc', profileId: 'u-agent-tc' } },
    { role: 'Listing Agent TC', contact: { firstName: 'Lee', lastName: 'Listing-TC', profileId: 'u-listing-tc' } },
    { role: 'Transaction Coordinator', contact: { firstName: 'Terry', lastName: 'Coordinator', profileId: 'u-tc' } },
  ],
});
ok(onlyAgentTc[1].role === 'Preprocessor' && onlyAgentTc[1].name === '' && onlyAgentTc[1].id === '',
  "an agent's Buyer Agent TC, Listing Agent TC, or a Transaction Coordinator participant does not fill the Preprocessor slot");

const both = closingTeamCards({
  preprocessorUserId: 'u-preproc', preprocessorName: 'Pat Preprocessor',
  participants: [{ role: 'Preprocessor', contact: { firstName: 'Ellen', lastName: 'Ahern' } }],
});
ok(both[1].name === 'Pat Preprocessor' && both[1].id === 'u-preproc',
  'Edit order details still wins when preprocessorUserId is set, even if a Preprocessor contact is also on the file');

const blank = closingTeamCards({ processorName: 'Paula Processor', processorId: 'u-proc', salesPeople: [] });
const pre = blank.find((c) => c.role === 'Preprocessor');
const sales = blank.filter((c) => c.role === 'Sales Person');
ok(pre && pre.name === '' && !pre.blankBecause && pre.id === '', 'an empty Preprocessor uses the same empty pattern as Sales Person');
ok(sales.length === 1 && sales[0].name === '', 'no salesperson still shows one Sales Person card with a blank name');
ok(!blank.some((c) => c.role === 'Transaction Coordinator'), 'an unassigned file does not keep a Transaction Coordinator Closing Team card');

const html = toText(closingTeamHtml(assigned));
ok(html.includes('data-team-card="Preprocessor"') && html.includes('Pat Preprocessor') && html.includes('data-team-id="u-preproc"'), 'the Preprocessor card is in the Closing Team markup');
ok(!html.includes('data-team-card="Transaction Coordinator"') && !html.includes('Terry Coordinator'), 'the Transaction Coordinator card is not in the Closing Team markup');
ok(html.indexOf('data-team-card="Processor"') < html.indexOf('data-team-card="Preprocessor"')
  && html.indexOf('data-team-card="Preprocessor"') < html.indexOf('data-team-card="Licensed Settlement Agent"'),
  'Preprocessor sits between Processor and Licensed Settlement Agent');
const blankHtml = toText(closingTeamHtml({}));
ok(blankHtml.includes('data-team-card="Preprocessor"') && /data-team-card="Preprocessor"[^>]*>[\s\S]*?<strong data-team-name><\/strong>/.test(blankHtml), 'an empty Preprocessor card still prints the role and a blank name');
ok(blankHtml.includes('>Preprocessor<') && !blankHtml.includes('>Transaction Coordinator<'), 'the printed role title is Preprocessor, not Transaction Coordinator');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
const { render: renderDeal } = await import('../js/pages/deal.js');
async function paint(userId) {
  await api.signInDev(userId);
  const user = await api.getSession();
  const v = await renderDeal({ api, user, params: { id: 'deal-1', tab: 'overview' }, go() {}, refresh() {} });
  document.body.innerHTML = toText(v.body);
  return { user, root: document.body, text: document.body.textContent || '' };
}
function teamRoles(root) {
  return [...root.querySelectorAll('[data-team-card]')].map((el) => el.getAttribute('data-team-card'));
}
function teamName(root, role) {
  const card = root.querySelector(`[data-team-card="${role}"]`);
  return card ? (card.querySelector('[data-team-name]')?.textContent || '') : null;
}

const staffRoles = [
  ['u-proc', 'Processor'],
  ['u-preproc', 'Preprocessor'],
  ['u-sp', 'Sales Person'],
  ['u-team', 'Sales Team'],
  ['u-adam', 'Admin'],
  ['u-admin', 'Super admin'],
];
for (const [id, role] of staffRoles) {
  const { root } = await paint(id);
  const roles = teamRoles(root);
  ok(roles[0] === 'Processor' && roles.includes('Preprocessor') && !roles.includes('Transaction Coordinator') && roles.includes('Licensed Settlement Agent') && roles.includes('Sales Person'),
    `a ${role} sees the Closing Team cards, with Preprocessor in place of Transaction Coordinator`);
  ok(teamName(root, 'Preprocessor') === 'Pat Preprocessor', `a ${role} sees the assigned Preprocessor name`);
}

const tc = await paint('u-tc');
ok(tc.root.querySelector('[data-tc-overview]') && !tc.root.querySelector('[data-closing-team]'),
  'a Transaction Coordinator login still gets the existing coordination overview, not the staff Closing Team row');

const outside = [
  ['u-buyer', 'buyer'],
  ['u-seller', 'seller'],
  ['u-bagent', 'buyer agent'],
];
for (const [id, label] of outside) {
  const { root, text } = await paint(id);
  ok(!root.querySelector('[data-closing-team]') && !root.querySelector('[data-team-card="Preprocessor"]'),
    `a ${label} does not get the staff Closing Team cards`);
  ok(!text.includes('Licensed Settlement Agent'), `a ${label} does not see Licensed Settlement Agent`);
}

const agent = await paint('u-bagent');
ok((agent.text.includes('Buyer Agent') || agent.root.querySelector('[data-party="Buyer Agent"]')) && !agent.text.includes('Selling Agency'),
  "the buyer's agent's own role wording is unchanged");
ok(!agent.root.querySelector('[data-team-card="Transaction Coordinator"]') && !agent.root.querySelector('[data-team-card="Preprocessor"]'),
  "the agent's overview does not replace their TC role with a staff Preprocessor card");

console.log(fail ? fail + ' failed' : 'ff-106 closing team passed');
if (fail) process.exit(1);
