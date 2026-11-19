/* TC-3 (tracker row 367). John Coester, Nov 18 2026, 11:27 AM, confirmed 11:35 AM,
 * and 11:37 AM: a linked coordinator is added on the agent's side, and their login
 * can do what that agent can do. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const login = await api.adminCreateUser({ firstName: 'Riley', lastName: 'Coordinator', email: 'riley.filetc@example.test', phone: '301-555-0199', role: 'Outside user', contactType: 'realtor' });
await api.signInDev('u-proc');
const riley = (await api.listContacts()).find((c) => c.profileId === login.id);
ok(!!riley, 'the coordinator has a contact');
await api.linkAgentTc('c-bagent', riley.id);
ok((await api.getDeal('deal-1')).participants.filter((p) => p.role === 'Buyer Agent TC' && p.contactId === riley.id).length === 1, 'linking the coordinator puts them on the open file as the buyer\'s transaction coordinator');
ok((await api.getDeal('deal-5')).participants.some((p) => p.role === 'Listing Agent TC' && p.contactId === riley.id), 'the same coordinator is the listing transaction coordinator where their agent is the listing agent');
await api.linkAgentTc('c-bagent', riley.id).then(() => ok(false, 'the same link should be refused')).catch(() => ok(true, 'the same link is not added twice'));
ok((await api.getDeal('deal-1')).participants.filter((p) => p.role === 'Buyer Agent TC' && p.contactId === riley.id).length === 1, 'a coordinator already on that side is not added again');

await api.signInDev(login.id);
const asBuyer = await api.getDeal('deal-1');
ok(asBuyer.myRole === 'Buyer Agent' && (asBuyer.myRoles || []).includes('Buyer Agent'), 'on the buyer file the coordinator acts as the buyer\'s agent');
const asListing = await api.getDeal('deal-5');
ok(asListing.myRole === 'Listing Agent', 'on the other file the same coordinator acts as the listing agent');
const tasks = await api.listTasks('deal-1');
const warranty = tasks.find((t) => t.templateCode === 'agent_home_warranty' && t.ownerId === 'u-bagent');
const schedule = tasks.find((t) => t.templateCode === 'agent_schedule_settlement' && t.ownerId === 'u-bagent');
ok(!!warranty, 'the coordinator can see the agent\'s home warranty task');
const done = await api.submitAgentTask(warranty.id, { willPurchase: 'No' });
ok(done.completedBy === login.id && /Riley Coordinator/.test(done.completedByLabel) && /on behalf of Bianca Buyer-Agent/.test(done.completedByLabel) && /transaction coordinator/i.test(done.completedByLabel), 'the home warranty task records the coordinator on behalf of the agent [' + (done.completedByLabel || '') + ']');
ok(!!schedule, 'the coordinator can see Schedule the Settlement');
const booked = await api.submitAgentTask(schedule.id, { askParty: 'no', date: '2026-12-16', time: '10:00', placeKind: 'other', street: '1 Fake Settlement Lane', city: 'Rockville', state: 'MD', zip: '20850', notes: '' });
ok(booked.status === 'done' && booked.completedBy === login.id && /on behalf of Bianca Buyer-Agent/.test(booked.completedByLabel || ''), 'scheduling records the coordinator on behalf of the agent [' + (booked.completedByLabel || '') + ']');
const uploaded = await api.addDocument('deal-1', { name: 'coordinator-note.pdf', size: 20, mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,RkFLRQ==', visibility: 'buyer', docType: 'Other' });
ok(uploaded && uploaded.uploadedBy === login.id && (await api.listDocuments('deal-1')).some((d) => d.id === uploaded.id), 'the coordinator can upload on the agent\'s side and see that file');

await api.signInDev('u-proc');
const hand = await api.createContact({ firstName: 'Casey', lastName: 'Hand', email: 'casey.handtc@example.test', phone: '301-555-0188', company: 'Harbor Realty (fake)', contactType: 'realtor' });
const fresh = await api.createDeal({ street: '366 Coordinator Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-18', transactionType: 'Purchase', processorId: 'u-proc' });
await api.addParticipant(fresh.id, 'c-bagent', 'Buyer Agent');
ok((await api.getDeal(fresh.id)).participants.some((p) => p.role === 'Buyer Agent TC' && p.contactId === riley.id), 'adding the buyer\'s agent adds their linked coordinator on the buyer side');
await api.addParticipant(fresh.id, hand.id, 'Buyer Agent TC');
const agentRow = (await api.getDeal(fresh.id)).participants.find((p) => p.role === 'Buyer Agent' && p.contactId === 'c-bagent');
await api.removeParticipant(fresh.id, agentRow.id);
const after = await api.getDeal(fresh.id);
ok(!after.participants.some((p) => p.role === 'Buyer Agent' && p.contactId === 'c-bagent'), 'the agent is off the file');
ok(after.participants.some((p) => p.contactId === riley.id && p.role === 'Buyer Agent TC') && after.participants.some((p) => p.contactId === hand.id && p.role === 'Buyer Agent TC'), 'removing the agent leaves the linked coordinator and the one added by hand');

await api.linkAgentTc('c-lagent', riley.id);
const dual = await api.createDeal({ street: '367 Both Sides', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-18', transactionType: 'Purchase', processorId: 'u-proc' });
await api.addParticipant(dual.id, 'c-bagent', 'Buyer Agent');
await api.addParticipant(dual.id, 'c-lagent', 'Listing Agent');
const sides = await api.getDeal(dual.id);
ok(sides.participants.filter((p) => p.contactId === riley.id && p.role === 'Buyer Agent TC').length === 1 && sides.participants.filter((p) => p.contactId === riley.id && p.role === 'Listing Agent TC').length === 1, 'a coordinator for both agents is on both sides once');

const mig = readFileSync(new URL('../supabase/migrations/20261125250000_agent_tc_on_file.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261125250000_agent_tc_on_file.sql', import.meta.url), 'utf8');
ok(mig.includes('linked_agent_roles') && mig.includes('Buyer Agent TC') && mig.includes('on behalf of') && mig.includes('file_roles_of'), 'the database treats the coordinator as their agent and records who finished the task');
ok(mig.includes('coalesce((private.outside_roles(pid, d))[1], \'Outside user\')') && !mig.includes('coalesce(private.outside_roles(pid, d)[1]'), 'the file-role subscript is parenthesized so Postgres accepts it');
ok(rb.includes('file_roles_of'), 'rollback restores file roles');

console.log(fail ? `tc-3: ${fail} failed` : 'tc-3 passed');
if (fail) process.exit(1);
