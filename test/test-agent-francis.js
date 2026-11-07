/* Francis agent-portal reports. Fake rows only. No mail is sent and no hosted database is used. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fetchHostedTaskList, pendingMine, shapeListedTask } from '../js/data/task-actions.js';
import { agentInviteDraft, INVITE_DELIVERY } from '../js/data/agent-invite-mail.js';
import { planDocumentBatch, uploadDocumentBatch } from '../js/data/document-batch.js';
import { assertRecipients, messageText } from '../js/data/portal-message.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const commission = {
  id: 't-comm', deal_id: 'deal-1', title: 'Commission information', description: 'Confirm your commission for the settlement statement.',
  assigned_role: 'Buyer Agent', status: 'todo', kind: 'form', participant_id: 'p-agent', owner_profile_id: null,
  template_id: 'tpl-comm', template_code: 'commissions', template_version: 1,
};
const other = { ...commission, id: 't-other', participant_id: 'p-listing', assigned_role: 'Listing Agent', title: 'Listing commission' };
const outside = { id: 'u-agent', role: 'Outside user', roles: ['Outside user'], fileRoles: ['Buyer Agent', 'Listing Agent'] };

function sbFor(contacts) {
  const tasks = [commission, other];
  const from = (table) => {
    const q = { table, filters: [] };
    const api = {
      select() { return api; }, eq(col, val) { q.filters.push([col, val]); return api; }, order() { return api; },
      then(resolve) {
        if (q.table === 'tasks') resolve({ data: tasks.filter((t) => q.filters.every(([c, v]) => t[c] === v)), error: null });
        else if (q.table === 'task_template_switches') resolve({ data: [], error: null });
        else resolve({ data: null, error: { message: 'no ' + q.table } });
      },
    };
    return api;
  };
  return { from, rpc(name) { if (name === 'deal_contacts') return Promise.resolve({ data: contacts, error: null }); return Promise.resolve({ data: null, error: { message: name } }); } };
}

const listed = await fetchHostedTaskList(sbFor([
  { participant_id: 'p-agent', profile_id: 'u-agent', role: 'Buyer Agent' },
  { participant_id: 'p-listing', profile_id: 'u-list', role: 'Listing Agent' },
]), 'deal-1', outside);
const mine = listed.find((t) => t.id === 't-comm');
const theirs = listed.find((t) => t.id === 't-other');
ok(mine.mine && mine.canFill && mine.href === '#/deals/deal-1/tasks/t-comm' && !mine.notYours, 'the assigned agent can open their own commission form');
ok(mine.description === 'Confirm your commission for the settlement statement.' && mine.templateVersion === 1, 'the commission row is the form they reported');
ok(!theirs.mine && theirs.notYours && theirs.href === '', 'the other agent commission stays not yours');
ok(pendingMine(listed).map((t) => t.id).join() === 't-comm', 'the open-task count is that same commission and not zero');
const stranger = shapeListedTask({ id: 't-comm', participantId: 'p-agent', assignedRole: 'Buyer Agent', ownerProfileId: null, kind: 'form', status: 'todo', templateId: 'tpl' }, outside, { myParticipantIds: [] });
ok(!stranger.mine && stranger.notYours, 'a Buyer Agent role on another file does not open this copy');
const sales = shapeListedTask({ id: 't-comm', participantId: 'p-sales', assignedRole: 'Sales Person', ownerProfileId: 'u-sales', kind: 'form', status: 'todo', templateId: 'tpl' }, { id: 'u-sales', role: 'Sales Person', roles: ['Sales Person'] }, { myParticipantIds: ['p-sales'] });
ok(sales.mine && sales.canFill === false, 'a view-only login is still not given the form');

const draft = agentInviteDraft({ firstName: 'Ada', lastName: 'Agent', email: 'ada.agent@example.test', link: 'https://portal.test/#/agent-invite/abc', expiresAt: '2026-11-20' });
ok(draft.to === 'ada.agent@example.test' && draft.sent === false && draft.status === 'draft' && draft.delivery === INVITE_DELIVERY && draft.body.includes('ada.agent@example.test') === false && draft.body.includes('/agent-invite/abc'), 'the invite draft names the entered address and is not sent');

const batch = planDocumentBatch([
  { name: 'contract.pdf', size: 10 },
  { name: 'contract.pdf', size: 10 },
  { name: 'notes.exe', size: 10 },
  { name: 'photo.jpg', size: 20 },
], { existingNames: ['already.pdf'] });
ok(batch.accepted.map((f) => f.name).join() === 'contract.pdf,photo.jpg' && batch.rejected.length === 2, 'a repeated name and a blocked type are refused, and the other files stay');
const uploaded = [];
const partial = await uploadDocumentBatch([{ name: 'a.pdf', size: 1 }, { name: 'b.pdf', size: 1 }], async (f) => { if (f.name === 'b.pdf') throw new Error('storage refused'); uploaded.push(f.name); return { id: f.name }; }, []);
ok(uploaded.join() === 'a.pdf' && partial.saved.length === 1 && partial.failed[0].name === 'b.pdf', 'one file can save while the other is reported for retry');

let refused = '';
try { assertRecipients(['u-other'], ['u-staff']); } catch (e) { refused = e.message; }
ok(/own side/.test(refused), 'a recipient who is not allowed is refused');
ok(!messageText('<script>alert(1)</script><p>Hello</p>').clean.includes('script') && messageText('<p>Hello</p>').text === 'Hello', 'a message keeps the text and drops a script');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const invite = await api.createAgentInvite({ firstName: 'Ada', lastName: 'Agent', email: 'ada.agent@example.test' });
ok(invite.link && invite.link.startsWith('#/agent-invite/') && invite.email === 'ada.agent@example.test' && invite.sent === false, 'creating an invite returns the link and does not send it');
const review = agentInviteDraft(invite);
ok(review.to === 'ada.agent@example.test' && review.sent === false, 'the review draft uses the email that was entered');

await api.signInDev('u-bagent');
const tasks = await api.listTasks('deal-1');
const comm = tasks.find((t) => t.templateCode === 'commissions' && t.assignedRole === 'Buyer Agent');
ok(!!comm && comm.mine && comm.status === 'todo', 'the mock buyer agent already counts their unfinished commission');

const sql = readFileSync(new URL('../supabase/migrations/20261107023000_task_owner_backfill.sql', import.meta.url));
const hash = createHash('sha256').update(sql).digest('hex');
ok(/owner_profile_id is null/.test(sql.toString()) && !/enable row level security/i.test(sql.toString()), 'the owner backfill does not change row security');
console.log('migration-sha256', hash);

const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(adapter.includes('a.sendMessage = async') && adapter.includes('assertRecipients') && adapter.includes('sent: false'), 'the hosted adapter has an in-portal sendMessage and does not mark it sent');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all passed');
