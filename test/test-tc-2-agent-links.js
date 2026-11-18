/* TC-2 (tracker row 366). John Coester, Nov 18 2026, 11:27 AM, confirmed 11:35 AM.
 * Staff and the agent can link outside transaction coordinators to a real estate agent.
 * A coordinator can be linked to more than one agent. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { newCoordinatorProblem, TC_BAD_EMAIL, TC_BAD_PHONE, TC_NEED_PERSON, TC_STAFF, alreadyLinkedMessage } from '../js/data/agent-tc-links.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(e.message), name + ' [' + e.message + ']'); } };

const typed = { firstName: 'Riley', lastName: 'Coordinator', email: 'not-an-email', phone: '301-555-0199', company: 'Harbor Realty (fake)' };
ok(newCoordinatorProblem(typed) === TC_BAD_EMAIL && typed.email === 'not-an-email' && typed.firstName === 'Riley', 'a bad email is refused and what was typed stays');
ok(newCoordinatorProblem({ ...typed, email: 'riley.tc@example.test', phone: '555' }) === TC_BAD_PHONE, 'a partial phone is refused');
ok(newCoordinatorProblem({ firstName: '', lastName: '', email: '', phone: '', company: '' }) === TC_NEED_PERSON, 'a blank coordinator is refused');
ok(newCoordinatorProblem({ firstName: 'Riley', lastName: 'Coordinator', email: 'riley.tc@example.test', phone: '301-555-0199', company: 'Harbor Realty (fake)' }) === '', 'a complete coordinator is accepted');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const riley = await api.createAndLinkAgentTc('c-bagent', { firstName: 'Riley', lastName: 'Coordinator', email: 'riley.tc@example.test', phone: '301-555-0199', company: 'Harbor Realty (fake)' });
ok(riley.contactId && riley.firstName === 'Riley' && riley.phone === '301-555-0199' && !riley.profileId, 'a processor adds an outside coordinator with no portal login');
const listed = await api.listAgentTcs('c-bagent');
ok(listed.length === 1 && listed[0].contactId === riley.contactId && listed[0].email === 'riley.tc@example.test', 'the agent profile lists the coordinator');
await api.linkAgentTc('c-lagent', riley.contactId);
const onLarry = await api.listAgentTcs('c-lagent');
ok(onLarry.length === 1 && onLarry[0].contactId === riley.contactId && (await api.listAgentTcs('c-bagent')).length === 1, 'one coordinator can be linked to more than one agent');
await rejects(() => api.linkAgentTc('c-bagent', riley.contactId), 'the same link is not added twice', new RegExp(alreadyLinkedMessage({ firstName: 'Riley', lastName: 'Coordinator' }).replace(/[.]/g, '\\.')));
await rejects(() => api.linkAgentTc('c-bagent', 'c-tc'), 'a CLA staff login cannot be the outside coordinator', new RegExp(TC_STAFF.replace(/[.]/g, '\\.')));
await rejects(() => api.linkAgentTc('c-bagent', 'c-bagent'), 'an agent cannot be their own coordinator', /cannot be their own/);
await rejects(() => api.createAndLinkAgentTc('c-buyer', { firstName: 'Pat', lastName: 'Helper', email: 'pat.helper@example.test', phone: '', company: '' }), 'a buyer is not a real estate agent', /not an agent/);
await rejects(() => api.linkAgentTc('c-missing', riley.contactId), 'a missing agent is refused', /not found/i);

await api.signInDev('u-sp');
const seen = await api.listAgentTcs('c-bagent');
ok(seen.length === 1 && seen[0].firstName === 'Riley', 'sales can see the list');
await rejects(() => api.unlinkAgentTc('c-bagent', riley.contactId), 'a view-only salesperson cannot remove a link', /cannot change/i);

await api.signInDev('u-bagent');
const own = await api.listAgentTcs('c-bagent');
ok(own.length === 1, 'the agent sees their own coordinators');
const casey = await api.createAndLinkAgentTc('c-bagent', { firstName: 'Casey', lastName: 'Helper', email: 'casey.helper@example.test', phone: '', company: 'Oak Street Realty (fake)' });
ok((await api.listAgentTcs('c-bagent')).length === 2 && casey.firstName === 'Casey', 'the agent adds a second coordinator');
await rejects(() => api.unlinkAgentTc('c-lagent', riley.contactId), 'the agent cannot change another agent\'s coordinators', /cannot change/i);
await api.unlinkAgentTc('c-bagent', casey.contactId);
ok((await api.listAgentTcs('c-bagent')).every((r) => r.contactId !== casey.contactId), 'the agent removed the link');
await api.signInDev('u-proc');
ok((await api.listContacts()).some((c) => c.id === casey.contactId && c.email === 'casey.helper@example.test'), 'removing the link keeps the person');

const page = readFileSync(new URL('../js/pages/profile.js', import.meta.url), 'utf8');
const contacts = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
const users = readFileSync(new URL('../js/pages/users.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../js/pages/agent-tc-panel.js', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../supabase/migrations/20261125240000_agent_tc_links.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261125240000_agent_tc_links.sql', import.meta.url), 'utf8');
ok(page.includes('agentTcSectionHtml') && page.includes('mountAgentTcSection'), 'the agent profile shows the coordinator list');
ok(contacts.includes('data-tc-open') && contacts.includes('Transaction coordinators'), 'Order Contacts opens the coordinator list on an agent');
ok(users.includes('agentTcSectionHtml') && users.includes('isRealEstateAgent'), 'User List edit shows the coordinator list for a realtor');
ok(panel.includes('data-tc-err') && panel.includes('newCoordinatorProblem') && !panel.includes('form.reset()') === false, 'a failed add leaves the form in place until it saves');
ok(panel.includes("showErr(problem); return;"), 'a blank or bad coordinator is pointed out before anything is saved');
ok(mig.includes('private.contact_visible(agent_contact_id)') && mig.includes('private.my_contact_id()') && mig.includes('agent_tc_links_pair'), 'the database uses contact visibility and allows one link per pair');
ok(mig.includes(TC_STAFF) && rb.includes('Remove the transaction coordinator links before undoing this change.'), 'rollback refuses while a link is still saved');

console.log(fail ? `tc-2: ${fail} failed` : 'tc-2 passed');
if (fail) process.exit(1);
