/* AF-8 (John, Nov 14 2026; assigned to Claude): the old "Commission information" task (template commissions) no longer bypasses
 * Agent fees. A commission an agent typed there becomes that side's Agent fees commission, the task stops asking for an amount,
 * and an old page can't put one back. Demo adapter (same rules as SQL 20261123010000). Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { TEMPLATE_DEFS, applyCommissionTaskV2, validateForm } from '../js/data/templates.js';
import { backfillCommissionTasks } from '../js/data/mock-part-agent-fees.js';
import { COMMISSION_TASK_REFUSED } from '../js/data/agent-fees.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// ---- the template ----
const v2 = TEMPLATE_DEFS.find((t) => t.code === 'commissions' && t.version === 2);
ok(v2 && !v2.fields.some((f) => ['commission_amount', 'paid_by'].includes(f.k)) && v2.fields.some((f) => f.k === 'agent_fees_note' && f.type === 'info' && /Agent fees box/.test(f.text)),
  'Commission information v2 asks no amount or Paid by, and points to the Agent fees box');
ok(['brokerage', 'license_id', 'notes'].every((k) => v2.fields.some((f) => f.k === k)), 'Brokerage, License ID and Notes stay');
ok(validateForm(v2.fields, { brokerage: 'CLA Broker', license_id: '1209183' }, true).errors.length === 0, 'the task can be completed without a commission');

// ---- backfill and move, on plain data ----
const d = {
  deals: [{ id: 'd1', purchasePrice: 950000, transactionType: 'Purchase' }, { id: 'd2', purchasePrice: null, transactionType: 'Purchase' }, { id: 'd3', purchasePrice: 300000, transactionType: 'Refinance' }],
  taskTemplates: TEMPLATE_DEFS.filter((t) => t.code === 'commissions' && t.version === 1).map((t) => ({ ...t, id: 'tt-commissions-v1', active: true })),
  tasks: [
    { id: 't1', dealId: 'd1', templateId: 'tt-commissions-v1', templateCode: 'commissions', templateVersion: 1, kind: 'form', assignedRole: 'Buyer Agent', status: 'done',
      formData: { paid_by: 'Seller', brokerage: 'CLA Broker', license_id: '1209183', commission_amount: '28,500' }, completedAt: '2026-11-13T16:14:00Z', completedBy: 'u-bagent', savedBy: 'u-bagent' },
    { id: 't2', dealId: 'd1', templateId: 'tt-commissions-v1', templateCode: 'commissions', templateVersion: 1, kind: 'form', assignedRole: 'Listing Agent', status: 'in_progress',
      formData: { commission_amount: '19,000', paid_by: 'Split', brokerage: 'Oak' }, savedAt: '2026-11-14T10:00:00Z', savedBy: 'u-lagent' },
    { id: 't3', dealId: 'd2', templateId: 'tt-commissions-v1', templateCode: 'commissions', templateVersion: 1, kind: 'form', assignedRole: 'Listing Agent', status: 'done', formData: { commission_amount: '20,000' } },
    { id: 't4', dealId: 'd3', templateId: 'tt-commissions-v1', templateCode: 'commissions', templateVersion: 1, kind: 'form', assignedRole: 'Buyer Agent', status: 'done', formData: { commission_amount: '500' } },
  ],
};
backfillCommissionTasks(d); backfillCommissionTasks(d);
const buyer = d.agentFees.find((f) => f.dealId === 'd1' && f.side === 'buyer');
ok(buyer && buyer.amount === 28500 && buyer.percent === 3 && buyer.payer === 'seller' && buyer.source === 'agent' && buyer.confirmedRole === 'agent' && buyer.confirmedBy === 'u-bagent',
  'MD-26-97260: $28,500 / 3%, paid by Seller, confirmed by the agent who submitted it');
const listing = d.agentFees.find((f) => f.dealId === 'd1' && f.side === 'listing');
ok(listing && listing.amount === 19000 && listing.payer === 'seller' && !listing.confirmedAt, 'an unfinished draft is moved but not confirmed; Split uses the side default');
ok(!d.agentFees.some((f) => f.dealId === 'd2') && d.agentFeeLog.filter((l) => l.dealId === 'd2' && /Add the sales price/.test(l.reason)).length === 1, 'no sales price: noted once in the history, not lost');
ok(!d.agentFees.some((f) => f.dealId === 'd3') && d.agentFeeLog.some((l) => l.dealId === 'd3' && /refinance/.test(l.reason)), 'a refinance gets no agent fees');
ok(d.agentFees.length === 2, 'running it twice adds nothing');
applyCommissionTaskV2(d); applyCommissionTaskV2(d);
ok(d.taskTemplates.filter((t) => t.code === 'commissions' && t.active).length === 1 && d.taskTemplates.find((t) => t.active).fields.some((f) => f.k === 'agent_fees_note'), 'the new version is the active one');
ok(d.tasks.find((t) => t.id === 't2').templateVersion === 2 && d.tasks.find((t) => t.id === 't2').formData.brokerage === 'Oak', 'an open copy moves to the new version and keeps its answers');
ok(d.tasks.filter((t) => t.status === 'done').every((t) => t.templateVersion === 1), 'finished copies keep the version they were answered on');

// ---- the demo portal ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');
const seeded = await api.getAgentFees('deal-1');
ok(seeded.fees.listing && seeded.fees.listing.commission && seeded.fees.listing.commission.amount === 14550 && seeded.fees.listing.confirmed,
  'the sample file shows the listing agent\'s $14,550 from their Commission information task, confirmed');
const tasks = await api.listTasks('deal-1');
const open = tasks.find((t) => t.templateCode === 'commissions' && t.status !== 'done');
ok(open && open.templateVersion === 2, 'an open Commission information task on the sample file is on the new version');
await api.signInDev('u-lagent');
const done = (await api.listTasks('deal-1')).find((t) => t.templateCode === 'commissions' && t.status === 'done' && t.assignedRole === 'Listing Agent');
let refused = '';
try { await api.saveTaskForm(done.id, { ...done.formData, commission_amount: '99,000' }); } catch (e) { refused = e.message; }
ok(refused === COMMISSION_TASK_REFUSED, 'an old page that sends a new commission on the task is refused with a plain message');

const sql = readFileSync(new URL('../supabase/migrations/20261123010000_commission_task_agent_fees.sql', import.meta.url), 'utf8');
ok(sql.includes("private.agent_fee_sync(r.purchase_price, 'amount'") && sql.includes("'agent'") && sql.includes('tasks_commission_task_guard') && sql.includes(COMMISSION_TASK_REFUSED),
  'the database file uses the same rules and the same message');

console.log(fail ? fail + ' failed' : 'commission task agent fees passed');
if (fail) process.exit(1);
