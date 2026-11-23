/* FF-106 (Francis Santos, confirmed Nov 23 2026, 11:59 AM ET, Gmail 1a209598512b3bd1).
 * File Overview Closing Team adds a Preprocessor card. Other roles and the agent's TC stay unchanged.
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
ok(cards.map((c) => c.role).join('|') === 'Processor|Preprocessor|Transaction Coordinator|Licensed Settlement Agent|Sales Person',
  'Closing Team lists Processor, Preprocessor, Transaction Coordinator, Licensed Settlement Agent, then Sales Person');
ok(cards[0].name === 'Paula Processor' && cards[0].id === 'u-proc', 'the Processor card still shows the assigned processor');
ok(cards[1].role === 'Preprocessor' && cards[1].name === 'Pat Preprocessor' && cards[1].id === 'u-preproc', 'the Preprocessor card shows the assigned CLA Preprocessor');
ok(cards[2].role === 'Transaction Coordinator' && cards[2].name === 'Terry Coordinator' && cards[2].id === 'u-tc', 'the Transaction Coordinator card is not renamed and still shows the assigned TC');
ok(cards[3].role === 'Licensed Settlement Agent' && cards[3].name === '' && cards[3].blankBecause === 'no-field', 'Licensed Settlement Agent stays blank');
ok(cards[4].role === 'Sales Person' && cards[4].name === 'Sam Salesperson', 'the Sales Person card is unchanged');

const blank = closingTeamCards({ processorName: 'Paula Processor', processorId: 'u-proc', salesPeople: [] });
const pre = blank.find((c) => c.role === 'Preprocessor');
const sales = blank.filter((c) => c.role === 'Sales Person');
ok(pre && pre.name === '' && !pre.blankBecause && pre.id === '', 'with no Preprocessor assigned, the name is blank and the role title stays (same empty pattern as Sales Person)');
ok(sales.length === 1 && sales[0].name === '', 'no salesperson still shows one Sales Person card with a blank name');
ok(blank.find((c) => c.role === 'Transaction Coordinator').name === '', 'an unassigned Transaction Coordinator stays a blank TC card, not a Preprocessor card');

const html = toText(closingTeamHtml(assigned));
ok(html.includes('data-team-card="Preprocessor"') && html.includes('Pat Preprocessor') && html.includes('data-team-id="u-preproc"'), 'the Preprocessor card is in the Closing Team markup');
ok(html.includes('data-team-card="Transaction Coordinator"') && html.includes('Terry Coordinator'), 'the Transaction Coordinator card is still in the markup');
ok(html.indexOf('data-team-card="Processor"') < html.indexOf('data-team-card="Preprocessor"')
  && html.indexOf('data-team-card="Preprocessor"') < html.indexOf('data-team-card="Transaction Coordinator"'), 'Preprocessor sits between Processor and Transaction Coordinator');
const blankHtml = toText(closingTeamHtml({}));
ok(blankHtml.includes('data-team-card="Preprocessor"') && /data-team-card="Preprocessor"[^>]*>[\s\S]*?<strong data-team-name><\/strong>/.test(blankHtml), 'an empty Preprocessor card still prints the role and a blank name');

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
  ok(roles[0] === 'Processor' && roles.includes('Preprocessor') && roles.includes('Transaction Coordinator') && roles.includes('Licensed Settlement Agent') && roles.includes('Sales Person'),
    `a ${role} sees the Closing Team cards, including Preprocessor`);
  ok(teamName(root, 'Preprocessor') === 'Pat Preprocessor', `a ${role} sees the assigned Preprocessor name`);
  ok(roles.includes('Transaction Coordinator'), `a ${role} still sees the Transaction Coordinator card`);
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
// Agent-side TC rows stay on the parties list, not as a renamed Closing Team card
ok(!agent.root.querySelector('[data-team-card="Transaction Coordinator"]') && !agent.root.querySelector('[data-team-card="Preprocessor"]'),
  "the agent's overview does not replace their TC role with a staff Preprocessor card");

console.log(fail ? fail + ' failed' : 'ff-106 closing team passed');
if (fail) process.exit(1);
