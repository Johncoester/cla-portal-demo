// TC-ASSIGN-1 (John Coester, Nov 21 2026): an agent and a transaction coordinator can be linked from the admin level, the coordinator's
// contact record, or within a file. The link works both ways, and the coordinator then goes on all of that agent's files.
// Mock portal and the panel helpers only (the database side is test/test-tc-assign-agents.sh).
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { agentChoices } from '../js/pages/tc-agents-panel.js';

let failed = 0;
const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) failed += 1; };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// panel helper: agents only, never the coordinator, never a staff row
const people = [{ id: 'c1', firstName: 'Zed', contactType: 'realtor' }, { id: 'c2', firstName: 'Amy', contactType: 'realtor' }, { id: 'tc', firstName: 'Tess', contactType: 'agent_tc' },
  { id: 'staff:1', firstName: 'Pat' }, { id: 'c3', firstName: 'Bob', contactType: 'lender' }, { id: 'c4', firstName: 'Cal' }];
ok(agentChoices(people, 'tc').map((c) => c.id).join() === 'c2,c4,c1', 'the agent list leaves out the coordinator, staff and other contact types, sorted by name');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
const run = async () => {
  await api.signInDev('u-proc');
  const mk = (n) => api.createDeal({ street: `${n} Assign Lane`, city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-21', transactionType: 'Purchase', processorId: 'u-proc' });
  const f1 = await mk(99101); const f2 = await mk(99102);
  const agent = await api.createContact({ firstName: 'Avery', lastName: 'Assignagent', email: 'avery.assign@example.test', contactType: 'realtor' });
  await api.addParticipant(f1.id, agent.id, 'Buyer Agent');
  await api.addParticipant(f2.id, agent.id, 'Listing Agent');
  const tc = await api.createContact({ firstName: 'Tina', lastName: 'Assigntc', email: 'tina.assign@example.test', contactType: 'agent_tc' });
  await api.addParticipant(f1.id, tc.id, 'Buyer Agent TC');
  ok((await api.listTcAgents(tc.id)).some((r) => r.contactId === agent.id), 'within a file: the coordinator is linked to that side\u2019s agent');
  ok((await api.listAgentTcs(agent.id)).some((r) => r.contactId === tc.id), 'the link shows on the agent\u2019s side too (both ways)');
  const two = await api.getDeal(f2.id);
  ok(two.participants.some((p) => p.contactId === tc.id && p.role === 'Listing Agent TC'), 'the coordinator then goes on the agent\u2019s other file, on the agent\u2019s side there');
  // from the coordinator's record: add a second agent, who is already on a file
  const f3 = await mk(99103);
  const agent2 = await api.createContact({ firstName: 'Blake', lastName: 'Assignagent', email: 'blake.assign@example.test', contactType: 'realtor' });
  await api.addParticipant(f3.id, agent2.id, 'Buyer Agent');
  await api.linkAgentTc(agent2.id, tc.id);
  ok((await api.getDeal(f3.id)).participants.some((p) => p.contactId === tc.id && p.role === 'Buyer Agent TC'), 'an agent added on the coordinator record puts the coordinator on that agent\u2019s files');
  ok((await api.listTcAgents(tc.id)).length === 2, 'the coordinator record lists both agents');
  await api.unlinkAgentTc(agent.id, tc.id);
  ok(!(await api.listTcAgents(tc.id)).some((r) => r.contactId === agent.id), 'removing the agent from the coordinator record removes the link');
  ok((await api.getDeal(f2.id)).participants.some((p) => p.contactId === tc.id), 'removing the link takes nobody off a file');
};

// screens: the panel is on User List > Edit user for a coordinator, and on the CRM contact record
const users = read('js/pages/users.js');
ok(users.includes('tcAgentsSectionHtml') && users.includes('mountTcAgentsSection'), 'User List > Edit user shows a coordinator\u2019s agents');
const crm = read('js/pages/crm.js');
ok(crm.includes('c.contactType === AGENT_TC_TYPE ? tcAgentsSectionHtml') && crm.includes("c.contactType === 'realtor' ? agentTcSectionHtml"), 'the CRM contact record shows agents for a coordinator and coordinators for an agent');
const sql = read('supabase/migrations/20261127990000_tc_assign_agents.sql');
ok(/create trigger participants_tc_link/.test(sql) && /pg_trigger_depth\(\) > 1/.test(sql), 'the database links within a file and does not chain');

run().then(() => { console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
