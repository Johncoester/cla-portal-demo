/* FF-018. A buyer sees assigned processors, the buyer agent, and the buyer-side coordinator.
 * A seller sees assigned processors, the listing agent, and the listing-side coordinator. Fake data only. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
await api.removeTeamMember('team-harbor', 'u-tc2');
await api.addTeamMember('team-oak', 'u-tc2', 'coordinator');
const allowed = (rows) => rows.every((r) => r.email && (r.role === 'Processor' || r.role === 'Buyer Agent' || r.role === 'Listing Agent' || r.role === 'Transaction Coordinator'));

await api.signInDev('u-buyer');
const buyer = await api.listMessageRecipients('deal-1');
ok(buyer.length > 0 && allowed(buyer), 'the buyer list is only processors, their agent, and their coordinator');
ok(buyer.some((r) => r.id === 'u-proc' && r.role === 'Processor'), 'the buyer sees the assigned processor');
ok(buyer.some((r) => r.role === 'Buyer Agent'), 'the buyer sees the buyer agent');
ok(buyer.some((r) => r.id === 'u-tc' && r.role === 'Transaction Coordinator'), 'the buyer sees the buyer-side coordinator');
ok(!buyer.some((r) => r.id === 'u-tc2' || r.role === 'Listing Agent' || r.role === 'Client-Seller' || r.role === 'Client-Buyer' || r.role === 'Preprocessor' || r.role === 'Sales Person'), 'the buyer does not see the other side, other clients, or unassigned staff');

await api.signInDev('u-admin');
await api.removeTeamMember('team-harbor', 'u-tc');
await api.signInDev('u-buyer');
const noTeam = await api.listMessageRecipients('deal-1');
ok(!noTeam.some((r) => r.role === 'Transaction Coordinator'), 'a coordinator on the file is not offered when they are not on the buyer agent team');

await api.signInDev('u-seller');
const seller = await api.listMessageRecipients('deal-1');
ok(seller.length > 0 && allowed(seller), 'the seller list is only processors, their agent, and their coordinator');
ok(seller.some((r) => r.id === 'u-proc' && r.role === 'Processor'), 'the seller sees the assigned processor');
ok(seller.some((r) => r.role === 'Listing Agent'), 'the seller sees the listing agent');
ok(seller.some((r) => r.id === 'u-tc2' && r.role === 'Transaction Coordinator'), 'the seller sees the listing-side coordinator');
ok(!seller.some((r) => r.id === 'u-tc' || r.role === 'Buyer Agent' || r.role === 'Client-Buyer' || r.role === 'Client-Seller' || r.role === 'Preprocessor' || r.role === 'Sales Person'), 'the seller does not see the other side, other clients, or unassigned staff');

await api.signInDev('u-proc');
const staff = await api.listMessageRecipients('deal-1');
ok(staff.some((r) => r.role === 'Buyer Agent' || /Agent/.test(r.role)), 'staff still see the wider list');

await api.signInDev('u-bagent');
const agent = await api.listMessageRecipients('deal-1');
ok(agent.some((r) => r.role !== 'Processor'), 'a buyer agent still sees people other than the processor');
ok(agent.some((r) => r.role === 'Client-Buyer' || r.role === 'Transaction Coordinator' || r.role === 'Sales Person' || r.role === 'Preprocessor'), 'a buyer agent still sees the client, coordinator, salesperson, or preprocessor');

const sql = readFileSync('supabase/migrations/20261112220000_client_side_people.sql', 'utf8');
ok(sql.includes('v.pure_buyer or v.pure_seller') && sql.includes("l.profile_role = 'Processor'") && sql.includes("case when v.pure_buyer then 'Buyer Agent' else 'Listing Agent' end") && sql.includes("co.member_role = 'coordinator'") && !sql.includes("or l.profile_role = 'Transaction Coordinator'") && !sql.includes('private.participant_visible') && !sql.includes('private.can_message'), 'the server list is processors plus that side\'s agent and that side\'s coordinator');
const fixture = readFileSync('supabase/migrations/20261114150100_e2e_side_tc_teams.sql', 'utf8');
ok(fixture.includes('E2E Buyer Side') && fixture.includes('E2E Listing Side') && fixture.includes("member_role = 'coordinator'") && fixture.includes("member_role = 'agent'") && !fixture.includes('rpc_message_recipients'), 'the E2E fixture links the coordinator to each side agent and does not widen the recipient rule');
ok(!readFileSync('js/data/message-recipients.js', 'utf8').includes('the coordinator already on the file'), 'the share list does not add a coordinator the recipient query left out');
ok(readFileSync('js/data/parcels.js', 'utf8').includes('no parcel lookup'), 'parcel id stays manual entry; there is no lookup');

console.log(fail ? fail + ' failed' : 'outside picker passed');
if (fail) process.exit(1);
