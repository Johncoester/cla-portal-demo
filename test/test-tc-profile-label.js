/* TC-PROFILE-1 (tracker row 421). John Coester, Nov 21 2026 (video as TC Portal Jc, list confirmed 11:56 AM ET):
 * the profile menu said "not on any file yet" for a transaction coordinator. A coordinator who is on a file only
 * through the agent they work for is now labelled "Transaction Coordinator" there, in the menu and on the file.
 * Roles (what they can do) stay the agent's side. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { fileRolesLabel } from '../js/data/constants.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const login = await api.adminCreateUser({ firstName: 'Tess', lastName: 'Label', email: 'tess.tclabel@example.test', phone: '301-555-0177', role: 'Outside user', contactType: 'agent_tc' });
await api.signInDev('u-proc');
const tess = (await api.listContacts()).find((c) => c.profileId === login.id);
await api.linkAgentTc('c-bagent', tess.id);

await api.signInDev(login.id);
const me = await api.getMyProfile();
ok((me.fileLabels || []).includes('Transaction Coordinator'), 'the menu labels the coordinator as Transaction Coordinator [' + (me.fileLabels || []).join(', ') + ']');
ok(fileRolesLabel(me.fileLabels) !== 'not on any file yet' && /Transaction Coordinator/.test(fileRolesLabel(me.fileLabels)), 'the menu line no longer says "not on any file yet"');
const d1 = await api.getDeal('deal-1');
ok(d1.myRoleLabel === 'Transaction Coordinator', 'on the file the label is Transaction Coordinator [' + d1.myRoleLabel + ']');
ok(d1.myRole === 'Buyer Agent' && (d1.myRoles || []).includes('Buyer Agent'), 'access is unchanged: the coordinator still acts as the buyer\'s agent there');
const listed = (await api.listDeals({ status: 'All' })).find((d) => d.id === 'deal-1');
ok(listed && listed.myRoleLabel === 'Transaction Coordinator', 'the order list carries the same label');

// regression: the agent and a client keep their own labels
await api.signInDev('u-bagent');
const agentDeal = await api.getDeal('deal-1');
ok(agentDeal.myRoleLabel === 'Buyer Agent', 'the buyer\'s agent is still labelled Buyer Agent [' + agentDeal.myRoleLabel + ']');
ok(!((await api.getMyProfile()).fileLabels || []).includes('Transaction Coordinator'), 'the agent\'s menu does not say Transaction Coordinator');

const sql = readFileSync(new URL('../supabase/migrations/20261128990000_tc_file_role_label.sql', import.meta.url), 'utf8');
ok(/when exists \(select 1 from linked l where l\.deal_id = r\.deal_id\)\s+and not exists \(select 1 from own o where o\.deal_id = r\.deal_id\) then 'Transaction Coordinator'/.test(sql), 'the database labels a coordinator on the file only through their agent');
ok(/when g\.role is distinct from 'Outside user' then g\.role\s+when exists/.test(sql), 'staff labels are checked first and stay their role');
ok(readFileSync(new URL('../supabase/rollbacks/20261128990000_tc_file_role_label.sql', import.meta.url), 'utf8').includes('create or replace function private.rpc_my_file_roles_full()'), 'a rollback puts the old body back');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ok');
