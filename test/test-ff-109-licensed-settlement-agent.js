/* FF-109 (Francis Santos, confirmed Nov 23 2026, 5:21 PM ET, Gmail 1a20a7ff3dfc931d).
 * Licensed Settlement Agent is a CLA Team / Add Contact role, and the existing File Overview
 * Closing Team slot shows the assigned person (or stays blank). Fake names. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { PARTICIPANT_ROLES, CLA_TEAM_ROLES, REFI_BLOCKED_ROLES, contactTypeForRole } from '../js/data/constants.js';
import { rolesForNewContact } from '../js/data/agent-tc.js';
import { assignedLicensedSettlementAgent, closingTeamCards, closingTeamHtml } from '../js/pages/deal.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="modal"></div><div id="toast"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/deal-1/contacts', hash: '#/deals/deal-1/contacts', search: '', pathname: '/' };
window.scrollTo = () => {};
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.sessionStorage = mem(); globalThis.localStorage = mem();

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const read = (p) => readFileSync(p, 'utf8');

ok(CLA_TEAM_ROLES.join('|') === 'Processor|Preprocessor|Sales Person|Sales Team|Transaction Coordinator|Licensed Settlement Agent',
  'CLA Team roles are the existing staff file roles plus Licensed Settlement Agent');
ok(PARTICIPANT_ROLES.includes('Licensed Settlement Agent') && PARTICIPANT_ROLES.indexOf('Sales Team') < PARTICIPANT_ROLES.indexOf('Licensed Settlement Agent')
  && PARTICIPANT_ROLES.indexOf('Licensed Settlement Agent') < PARTICIPANT_ROLES.indexOf('Buyer Agent'),
  'Add Contact lists Licensed Settlement Agent with the other CLA Team roles, before the outside roles');
ok(contactTypeForRole('Licensed Settlement Agent') === '' && contactTypeForRole('Processor') === '',
  'Licensed Settlement Agent has no contact type, like other CLA staff roles');

const purchaseRoles = rolesForNewContact(PARTICIPANT_ROLES);
const refiRoles = rolesForNewContact(PARTICIPANT_ROLES, { refinance: true, blocked: REFI_BLOCKED_ROLES });
ok(purchaseRoles.includes('Licensed Settlement Agent') && purchaseRoles.includes('Processor') && purchaseRoles.includes('Preprocessor')
  && !purchaseRoles.includes('Transaction Coordinator'),
  'the Add Contact role list on a purchase includes Licensed Settlement Agent with the other CLA Team choices');
ok(refiRoles.includes('Licensed Settlement Agent') && refiRoles.includes('Processor') && !refiRoles.includes('Client-Seller') && !refiRoles.includes('Buyer Agent'),
  'a refinance still offers Licensed Settlement Agent (it is CLA staff, not a seller or realtor role)');

const contactsSrc = read('js/pages/dealcontacts.js');
ok(contactsSrc.includes('CLA_TEAM_ROLES') && /\[.CLA TEAM., CLA_TEAM_ROLES\]/.test(contactsSrc.replace(/\s+/g, ' ')),
  'Order Contacts > CLA Team uses the shared CLA Team role list');
ok(contactsSrc.includes('rolesForNewContact(PARTICIPANT_ROLES') && contactsSrc.includes("id=\"addp\""),
  'Add Contact offers the participant role list that includes Licensed Settlement Agent');

const assigned = {
  processorName: 'Paula Processor', processorId: 'u-proc',
  preprocessorName: 'Pat Preprocessor', preprocessorUserId: 'u-preproc',
  closerName: 'Chris Closer', closerProfileId: 'u-closer',
  settlementAgentName: 'Notary Ned',
  salesPeople: [{ id: 'u-sp', name: 'Sam Salesperson' }],
  participants: [
    { role: 'Licensed Settlement Agent', contactId: 'c-lsa', contact: { id: 'c-lsa', firstName: 'Lynn', lastName: 'License', profileId: 'u-lsa' } },
    { role: 'Buyer Agent TC', contact: { firstName: 'TC Portal', lastName: 'Jc', profileId: 'u-agent-tc' } },
    { role: 'Listing Agent TC', contact: { firstName: 'Lee', lastName: 'Listing-TC', profileId: 'u-listing-tc' } },
    { role: 'Transaction Coordinator', contact: { firstName: 'Terry', lastName: 'Coordinator', profileId: 'u-tc' } },
  ],
};
const cards = closingTeamCards(assigned);
const lsa = assignedLicensedSettlementAgent(assigned);
ok(cards.map((c) => c.role).join('|') === 'Processor|Preprocessor|Licensed Settlement Agent|Sales Person',
  'Closing Team keeps one Licensed Settlement Agent slot between Preprocessor and Sales Person');
ok(lsa.name === 'Lynn License' && lsa.id === 'u-lsa' && cards[2].name === 'Lynn License' && cards[2].id === 'u-lsa' && !cards[2].blankBecause,
  'when a Licensed Settlement Agent is on Order Contacts, their name fills the existing Closing Team slot');
ok(!cards.some((c) => c.name === 'Chris Closer' || c.name === 'Notary Ned' || (c.name || '').includes('TC Portal') || c.name === 'Terry Coordinator'),
  'Closer, the scheduling settlement agent/notary, an agent TC, and the CLA Transaction Coordinator do not fill that slot');

const blankDeal = { processorName: 'Paula Processor', processorId: 'u-proc', salesPeople: [], participants: [] };
const blank = closingTeamCards(blankDeal);
ok(blank[2].role === 'Licensed Settlement Agent' && blank[2].name === '' && blank[2].id === '' && !blank[2].blankBecause,
  'with no Licensed Settlement Agent assigned, the existing card stays blank (same empty pattern as Preprocessor)');
ok(assignedLicensedSettlementAgent(blankDeal).name === '' && assignedLicensedSettlementAgent({}).name === '',
  'an unassigned file and a deal with no participants list both stay blank');
ok(assignedLicensedSettlementAgent({
  participants: [{ role: 'Licensed Settlement Agent', removed: true, contact: { firstName: 'Gone', lastName: 'Person' } }],
}).name === '', 'a removed Licensed Settlement Agent does not fill the card');

const html = toText(closingTeamHtml(assigned));
ok(html.includes('data-team-card="Licensed Settlement Agent"') && html.includes('Lynn License') && html.includes('data-team-id="u-lsa"'),
  'the Closing Team markup shows the assigned Licensed Settlement Agent on the existing card');
ok((html.match(/data-team-card="Licensed Settlement Agent"/g) || []).length === 1,
  'Closing Team does not add a second Licensed Settlement Agent card');
const blankHtml = toText(closingTeamHtml(blankDeal));
ok(blankHtml.includes('data-team-card="Licensed Settlement Agent"') && /data-team-card="Licensed Settlement Agent"[^>]*>[\s\S]*?<strong data-team-name><\/strong>/.test(blankHtml)
  && !blankHtml.includes('data-team-blank'),
  'an unassigned Licensed Settlement Agent card still prints the role and a blank name');

const { render: renderContacts } = await import('../js/pages/dealcontacts.js');
const { render: renderDeal } = await import('../js/pages/deal.js');
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const user = await api.getSession();
const sampleDeal = {
  id: 'deal-lsa', fileNumber: 'DC-26-10901', transactionType: 'Purchase',
  processorName: 'Paula Processor', processorId: 'u-proc',
  preprocessorName: 'Pat Preprocessor', preprocessorUserId: 'u-preproc',
  salesPeople: [{ id: 'u-sp', name: 'Sam Salesperson' }],
  participants: [
    { id: 'p-proc', role: 'Processor', contactId: 'c-proc', contact: { id: 'c-proc', firstName: 'Paula', lastName: 'Processor', profileId: 'u-proc' } },
    { id: 'p-lsa', role: 'Licensed Settlement Agent', contactId: 'c-lsa', contact: { id: 'c-lsa', firstName: 'Lynn', lastName: 'License', profileId: 'u-lsa', email: 'lynn.license@example.test' } },
    { id: 'p-buyer', role: 'Client-Buyer', contactId: 'c-buyer', contact: { id: 'c-buyer', firstName: 'Ben', lastName: 'Buyer', email: 'ben@example.test' } },
    { id: 'p-bagent', role: 'Buyer Agent', contactId: 'c-ba', contact: { id: 'c-ba', firstName: 'Bianca', lastName: 'Buyer-Agent' } },
  ],
};

globalThis.location.hash = '#/deals/deal-lsa/contacts?g=CLA TEAM';
const contactsView = await renderContacts({ api, user, deal: sampleDeal, refresh() {} });
document.body.innerHTML = toText(contactsView.body);
const groupLinks = [...document.querySelectorAll('.nav-tabs a')].map((a) => a.textContent.trim());
ok(groupLinks.includes('CLA TEAM'), 'Order Contacts still has a CLA Team filter tab');
const teamRows = [...document.querySelectorAll('[data-participant]')].map((tr) => tr.querySelector('td:nth-child(2)')?.textContent.trim());
ok(teamRows.includes('Licensed Settlement Agent') && teamRows.includes('Processor') && !teamRows.includes('Client-Buyer') && !teamRows.includes('Buyer Agent'),
  'the CLA Team filter shows the Licensed Settlement Agent and other CLA staff, and hides outside parties');
ok((document.body.textContent || '').includes('Lynn License'), 'the CLA Team list shows the assigned Licensed Settlement Agent name');

// Overview is loaded from the mock file, so assign Lynn on deal-1 the same way Add Contact would.
const before = await api.getDeal('deal-1');
ok(!closingTeamCards(before).some((c) => c.role === 'Licensed Settlement Agent' && c.name),
  'the mock file starts with a blank Licensed Settlement Agent Closing Team card');
globalThis.location.hash = '#/deals/deal-1';
const emptyOverview = await renderDeal({ api, user, params: { id: 'deal-1', tab: 'overview' }, go() {}, refresh() {} });
document.body.innerHTML = toText(emptyOverview.body);
const emptyCard = document.querySelector('[data-team-card="Licensed Settlement Agent"]');
ok(emptyCard && (emptyCard.querySelector('[data-team-name]')?.textContent || '') === '',
  'File Overview > Closing Team keeps a blank Licensed Settlement Agent card when none is assigned');

const created = await api.createContact({ firstName: 'Lynn', lastName: 'License', email: 'lynn.license@example.test', phone: '301-555-0199', company: 'CLA Title' });
const added = await api.addParticipant('deal-1', created.id, 'Licensed Settlement Agent');
ok(added && added.ok, 'Add Contact can assign a Licensed Settlement Agent on a file');
const after = await api.getDeal('deal-1');
ok(closingTeamCards(after).find((c) => c.role === 'Licensed Settlement Agent')?.name === 'Lynn License',
  'after that assignment, Closing Team reads the Licensed Settlement Agent from the file participants');

const overview = await renderDeal({ api, user, params: { id: 'deal-1', tab: 'overview' }, go() {}, refresh() {} });
document.body.innerHTML = toText(overview.body);
const teamCard = document.querySelector('[data-team-card="Licensed Settlement Agent"]');
ok(teamCard && teamCard.querySelector('[data-team-name]')?.textContent === 'Lynn License',
  'File Overview > Closing Team shows Lynn License in the existing Licensed Settlement Agent slot');

await api.signInDev('u-buyer');
const buyerUser = await api.getSession();
const buyerOverview = await renderDeal({ api, user: buyerUser, params: { id: 'deal-1', tab: 'overview' }, go() {}, refresh() {} });
document.body.innerHTML = toText(buyerOverview.body);
ok(!document.querySelector('[data-closing-team]') && !(document.body.textContent || '').includes('Licensed Settlement Agent'),
  'a buyer does not get the staff Closing Team Licensed Settlement Agent card');

const migration = read('supabase/migrations/20261130240000_ff109_licensed_settlement_agent.sql');
const rollback = read('supabase/rollbacks/20261130240000_ff109_licensed_settlement_agent.sql');
ok(migration.includes('Licensed Settlement Agent') && migration.includes('deal_participants_role_check') && !/grant |row level|security definer/i.test(migration),
  'the database file only adds Licensed Settlement Agent to the people-role check');
ok(rollback.includes('Licensed Settlement Agent') && /rollback refused/i.test(rollback),
  'the rollback restores the previous people-role list and refuses if a file still has that role');

console.log(fail ? fail + ' failed' : 'ff-109 licensed settlement agent passed');
if (fail) process.exit(1);
