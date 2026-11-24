/* TC-5 (tracker row 370). John Coester, Nov 18 2026, about 1:51 PM ET.
 * One choice, "Transaction coordinator". The side follows the linked agent on the file.
 * Stored roles stay Buyer Agent TC and Listing Agent TC. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { PARTICIPANT_ROLES, REFI_BLOCKED_ROLES } from '../js/data/constants.js';
import {
  AGENT_TC_LABEL, AGENT_TC_PICK, TC_CHOOSE_AGENT, TC_NEED_AGENT, TC_WHICH_AGENT,
  agentTcChoiceLabel, agentTcLabel, fileAgents, isAlreadyTcMessage, linkedAgentIdsFor,
  rolesForNewContact, sideAgentName, tcAgentChoices, tcRoleFromChoice, tcRolesFromLinks,
  tcRolesToSave, tcSideProblem, placeOrderTcChoices,
} from '../js/data/agent-tc.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(AGENT_TC_LABEL === 'Transaction coordinator' && agentTcChoiceLabel(AGENT_TC_PICK) === 'Transaction coordinator', 'the choice is exactly Transaction coordinator');
ok(agentTcLabel('Buyer Agent TC') === 'Transaction coordinator' && agentTcLabel('Listing Agent TC') === 'Transaction coordinator', 'both stored roles display as Transaction coordinator');
ok(agentTcLabel('Buyer Agent TC', 'Bianca Buyer-Agent') === 'Transaction coordinator · Bianca Buyer-Agent', 'the agent name may follow the label');
ok(!/works for/i.test(agentTcLabel('Buyer Agent TC') + agentTcChoiceLabel(AGENT_TC_PICK)), 'the label has no works-for sentence');

const purchase = rolesForNewContact(PARTICIPANT_ROLES);
ok(purchase.filter((r) => r === AGENT_TC_PICK).length === 1 && !purchase.includes('Buyer Agent TC') && !purchase.includes('Listing Agent TC') && !purchase.includes('Transaction Coordinator'), 'a purchase offers one Transaction coordinator');
const refi = rolesForNewContact(PARTICIPANT_ROLES, { refinance: true, blocked: REFI_BLOCKED_ROLES });
ok(!refi.includes(AGENT_TC_PICK) && refi.includes('Client-Buyer'), 'a refinance offers no transaction coordinator');

const agents = [
  { contactId: 'c-bagent', role: 'Buyer Agent', name: 'Bianca Buyer-Agent' },
  { contactId: 'c-lagent', role: 'Listing Agent', name: 'Larry Listing' },
];
ok(tcRolesFromLinks(agents, ['c-bagent']).join() === 'Buyer Agent TC', 'a link to the buyer agent stores the buyer side');
ok(tcRolesFromLinks(agents, ['c-lagent']).join() === 'Listing Agent TC', 'a link to the listing agent stores the listing side');
ok(tcRolesFromLinks(agents, ['c-bagent', 'c-lagent']).join() === 'Buyer Agent TC,Listing Agent TC', 'links to both agents store both sides');
ok(tcRolesFromLinks(agents, []).length === 0, 'no link on this file does not pick a side');

const choices = tcAgentChoices(agents);
ok(choices.length === 2 && choices[0].label === 'Bianca Buyer-Agent' && choices[1].label === 'Larry Listing' && !choices.some((c) => /works for/i.test(c.label)), 'the follow-up lists the agents by name');
ok(tcRoleFromChoice(choices[1].value, choices) === 'Listing Agent TC', 'choosing the listing agent stores the listing side');
ok(tcSideProblem({ hasPerson: false, linkedRoles: [], choice: '', choices }) === '', 'a blank coordinator does not ask for an agent');
ok(tcSideProblem({ hasPerson: true, linkedRoles: ['Buyer Agent TC'], choice: '', choices }) === '', 'a known side does not ask again');
ok(TC_WHICH_AGENT === 'Which agent are they linked to?' && !/works for/i.test(TC_WHICH_AGENT), 'the follow-up asks which agent they are linked to');
ok(TC_CHOOSE_AGENT === 'Choose which agent they are linked to.' && !/works for/i.test(TC_CHOOSE_AGENT), 'leaving the follow-up blank does not say works for');
ok(tcSideProblem({ hasPerson: true, linkedRoles: [], choice: '', choices }) === TC_CHOOSE_AGENT, 'an unknown side requires the follow-up');
ok(tcSideProblem({ hasPerson: true, linkedRoles: [], choice: '', choices: [] }) === TC_NEED_AGENT, 'no agent on the file tells the user to add one first');
ok(tcRolesToSave({ linkedRoles: ['Buyer Agent TC', 'Listing Agent TC'], choice: choices[0].value, choices }).join() === 'Buyer Agent TC,Listing Agent TC', 'links win over the follow-up');
ok(tcRolesToSave({ linkedRoles: [], choice: 'buyer', choices: placeOrderTcChoices({ present: true, name: 'Bianca Buyer-Agent' }, { present: false }) }).join() === 'Buyer Agent TC', 'Place Order can take the buyer agent typed on the form');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const login = await api.adminCreateUser({ firstName: 'Riley', lastName: 'Coordinator', email: 'riley.tc5@example.test', phone: '301-555-0199', role: 'Outside user', contactType: 'realtor' });
await api.signInDev('u-proc');
const riley = (await api.listContacts()).find((c) => c.profileId === login.id);
const deal = await api.createDeal({ street: '370 One Choice Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-18', transactionType: 'Purchase', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent');
await api.addParticipant(deal.id, 'c-lagent', 'Listing Agent');
const opened = await api.getDeal(deal.id);
const onFile = fileAgents(opened.participants);
const buyerOnly = await linkedAgentIdsFor(api, riley.id, onFile);
ok(buyerOnly.length === 0, 'before a link, the side is not known');
await api.linkAgentTc('c-bagent', riley.id);
const linkedBuyer = tcRolesFromLinks(onFile, await linkedAgentIdsFor(api, riley.id, onFile));
ok(linkedBuyer.join() === 'Buyer Agent TC', 'after the link, the buyer side is chosen');
await api.linkAgentTc('c-lagent', riley.id);
const both = tcRolesFromLinks(fileAgents((await api.getDeal(deal.id)).participants), await linkedAgentIdsFor(api, riley.id, onFile));
ok(both.includes('Buyer Agent TC') && both.includes('Listing Agent TC'), 'linked to both agents on the file gives both sides');
ok(sideAgentName(opened.participants, 'Buyer Agent TC').includes('Bianca'), 'the buyer side can show that agent\'s name');
ok(isAlreadyTcMessage('Riley Coordinator is already the transaction coordinator on this file.'), 'the already-on-file sentence is recognized');

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const contacts = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
const parties = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok((page.match(/\$\{agentTcCard\(\)\}/g) || []).length === 1 && page.includes('Which agent are they linked to?') && !page.includes('Which agent do they work for?'), 'Place Order has one coordinator card');
ok(contacts.includes('Assigned to') && contacts.includes("Buyer's Agent TC") && contacts.includes('tcRolesFromLinks') && !contacts.includes('Which agent are they linked to?') && !contacts.includes('Which agent do they work for?'), "Add contact uses the Assigned to dropdown (Buyer's Agent TC / Listing Agent TC)");
ok(parties.includes('Which agent are they linked to?') && parties.includes('+ Add transaction coordinator') && !parties.includes('Which agent do they work for?'), 'Parties uses the one choice');

console.log(fail ? `tc-5: ${fail} failed` : 'tc-5 passed');
if (fail) process.exit(1);
