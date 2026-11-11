/* Francis agent-portal reports. Fake rows only. No mail is sent and no hosted database is used. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fetchHostedTaskList, pendingMine, shapeListedTask } from '../js/data/task-actions.js';
import { agentInviteDraft, INVITE_DELIVERY } from '../js/data/agent-invite-mail.js';
import { planDocumentBatch, uploadDocumentBatch } from '../js/data/document-batch.js';
import { assertRecipients, messageText } from '../js/data/portal-message.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { buildOrderOverview } from '../js/data/order-overview.js';
import { visibilityChoices } from '../js/data/constants.js';
import { addToQueue, removeFromQueue, uploadFailureText } from '../js/data/document-queue.js';
import { explainRecipients } from '../js/data/message-recipients.js';
import { agentMayInsertDocument } from '../js/data/document-insert-access.js';

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
await api.signInDev('u-lagent');
const staffDoc = await api.addDocument('deal-1', { name: 'listing-note.pdf', description: '', mimeType: 'application/pdf', size: 20, dataUrl: 'data:application/pdf;base64,QQ==', visibility: 'staff', docType: '' });
ok(staffDoc.visibility === 'staff', 'a listing agent can save a file for CLA staff only');
let buyerSide = '';
try { await api.addDocument('deal-1', { name: 'nope.pdf', mimeType: 'application/pdf', size: 20, dataUrl: 'data:application/pdf;base64,QQ==', visibility: 'buyer' }); } catch (e) { buyerSide = e.message; }
ok(/seller side|everyone|only/i.test(buyerSide), 'a listing agent cannot file a document for the buyer side');
const recipients = await api.listMessageRecipients('deal-1');
ok(recipients.some((p) => p.role === 'Processor') && !recipients.some((p) => p.role === 'Buyer Agent'), 'a listing agent is offered the processor and not the buyer agent');

const sql = readFileSync(new URL('../supabase/held/20261107023000_task_owner_backfill.sql', import.meta.url));
const hash = createHash('sha256').update(sql).digest('hex');
ok(/deal_participants/.test(sql.toString()) && /owner_profile_id is null/.test(sql.toString()) && !/enable row level security/i.test(sql.toString()), 'the owner backfill uses the file-party table and does not change row security');
console.log('owner-backfill-sha256', hash);
const insertSql = readFileSync(new URL('../supabase/held/20261107024500_agent_document_insert.sql', import.meta.url));
const insertHash = createHash('sha256').update(insertSql).digest('hex');
ok(/create policy documents_assigned_agent_insert/.test(insertSql.toString()) && !/drop policy/i.test(insertSql.toString()) && !/disable row level security/i.test(insertSql.toString()), 'the agent upload policy is added and no existing policy is dropped');
console.log('agent-insert-sha256', insertHash);

const overview = buildOrderOverview({
  deal: { id: 'deal-1', myRole: 'Listing Agent', myRoles: ['Listing Agent'], street: '1 Oak', city: 'Rockville', state: 'MD', zip: '20850', fileNumber: 'MD-1', transactionType: 'Purchase', participants: [] },
  me: { id: 'u-list', role: 'Outside user' },
  tasks: [
    { id: 'c', dealId: 'deal-1', status: 'todo', mine: true, assignedRole: 'Listing Agent', title: 'Commission information', description: 'Confirm your commission for the settlement statement.', participantId: 'p-list', ownerProfileId: null },
    { id: 's', dealId: 'deal-1', status: 'todo', mine: false, assignedRole: 'Client-Seller', title: 'How you want your proceeds' },
  ],
});
ok(overview.outstanding === 1 && overview.counts.tasks === 1, 'the Tasks count is the unfinished commission and not the seller form');
const sellerForm = shapeListedTask({ id: 's', dealId: 'deal-1', participantId: 'p-seller', assignedRole: 'Client-Seller', ownerProfileId: 'u-seller', kind: 'form', status: 'todo', templateId: 'tpl' }, outside, { myParticipantIds: ['p-agent'] });
ok(!sellerForm.mine && !sellerForm.canFill && sellerForm.notYours, 'a listing agent does not inherit the seller form');

const choices = visibilityChoices('Listing Agent');
ok(choices[0] === 'staff' && choices.includes('seller') && !choices.includes('buyer'), 'a listing agent can choose CLA staff only and not the buyer side');
const docsPage = readFileSync(new URL('../js/pages/dealdocs.js', import.meta.url), 'utf8');
ok(docsPage.includes('not limited to the processor') && !docsPage.includes('keeps the file with the processor and CLA Title'), 'staff sharing is labeled as all CLA staff, not the processor alone');
ok(agentMayInsertDocument({ role: 'Listing Agent', onThisFile: true, visibility: 'staff' }) && agentMayInsertDocument({ role: 'Listing Agent', onThisFile: true, visibility: 'seller' }) && agentMayInsertDocument({ role: 'Listing Agent', onThisFile: true, visibility: 'all' }) && agentMayInsertDocument({ role: 'Buyer Agent', onThisFile: true, visibility: 'all' }) && agentMayInsertDocument({ role: 'Buyer Agent', onThisFile: true, visibility: 'buyer' }), 'an assigned agent may save staff-only, their own side, or everyone on the file');
ok(!agentMayInsertDocument({ role: 'Listing Agent', onThisFile: true, visibility: 'buyer' }) && !agentMayInsertDocument({ role: 'Listing Agent', onThisFile: false, visibility: 'staff' }) && !agentMayInsertDocument({ role: 'Listing Agent', onThisFile: true, visibility: 'staff', wire: true }), 'the other side, another file, and a wire file stay refused');

let queued = addToQueue([], [{ name: 'deed.pdf', size: 10 }]);
queued = addToQueue(queued.queue, [{ name: 'hoa.pdf', size: 12 }, { name: 'deed.pdf', size: 10 }]);
ok(queued.queue.map((f) => f.name).join() === 'deed.pdf,hoa.pdf' && queued.skipped.length === 1, 'choosing another file keeps the first');
ok(removeFromQueue(queued.queue, 0).map((f) => f.name).join() === 'hoa.pdf', 'one selected file can be removed');
ok(/still here/.test(uploadFailureText('new row violates row-level security policy for table documents')), 'a refused upload says the selection is still there');

const explained = explainRecipients({
  myRole: 'Listing Agent',
  participants: [
    { role: 'Client-Seller', contact: { firstName: 'Sam', lastName: 'Seller', profileId: 'u-seller' } },
    { role: 'Client-Seller', contact: { firstName: 'Pat', lastName: 'NoLogin', profileId: null } },
    { role: 'Buyer Agent', contact: { firstName: 'Bea', lastName: 'Buyer', profileId: 'u-buyer-agent' } },
  ],
  allowed: [{ id: 'u-proc', firstName: 'Paula', lastName: 'Processor', role: 'Processor' }, { id: 'u-seller', firstName: 'Sam', lastName: 'Seller', role: 'Client-Seller' }],
});
ok(explained.selectable.map((p) => p.id).join() === 'u-proc,u-seller' && explained.unavailable.length === 1 && explained.unavailable[0].name === 'Pat NoLogin' && !JSON.stringify(explained).includes('Bea'), 'the other side stays off the list and a same-side person without a login is shown as unavailable');
const fileTc = explainRecipients({
  myRole: 'Client-Buyer',
  participants: [
    { role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Agent', profileId: 'u-bagent', email: 'bianca@example.test' } },
    { role: 'Transaction Coordinator', contact: { firstName: 'Terry', lastName: 'Coordinator', profileId: 'u-tc', email: 'terry@example.test' } },
    { role: 'Listing Agent', contact: { firstName: 'Larry', lastName: 'Agent', profileId: 'u-lagent', email: 'larry@example.test' } },
  ],
  allowed: [{ id: 'u-proc', firstName: 'Paula', lastName: 'Processor', email: 'paula@example.test', role: 'Processor' }, { id: 'u-bagent', firstName: 'Bianca', lastName: 'Agent', email: 'bianca@example.test', role: 'Buyer Agent' }],
});
ok(!fileTc.selectable.some((p) => p.id === 'u-tc') && !fileTc.selectable.some((p) => p.id === 'u-lagent'), 'a coordinator on the file is not offered unless the recipient list already includes that side');
const already = explainRecipients({
  myRole: 'Client-Buyer',
  participants: [{ role: 'Transaction Coordinator', contact: { firstName: 'Morgan', lastName: 'Other', profileId: 'u-tc2', email: 'morgan@example.test' } }],
  allowed: [{ id: 'u-tc', firstName: 'Terry', lastName: 'Coordinator', email: 'terry@example.test', role: 'Transaction Coordinator' }],
});
ok(already.selectable.length === 1 && already.selectable[0].id === 'u-tc', 'a coordinator the team lookup already returned is not joined by the other side');

const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(adapter.includes('a.sendMessage = async') && adapter.includes('assertRecipients') && adapter.includes('emailed: false') && adapter.includes("status: 'in_portal'"), 'a portal message is delivered in the portal and is not marked emailed');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all passed');
