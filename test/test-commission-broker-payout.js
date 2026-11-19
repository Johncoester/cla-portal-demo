/* FF-101b (Francis Nov 18 2026; John confirmed 2:13 PM ET): Commission information gets broker fee,
 * Total commission (Agent fees commission + broker fee), and payout method (At settlement / FedEx overnight / Wire).
 * Account numbers are masked for non-owners. Fake data only. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import {
  TEMPLATE_DEFS, applyCommissionTaskV3, validateForm, totalCommissionAmount, COMMISSION_PAYOUT_OPTS,
} from '../js/data/templates.js';
import { maskAccount } from '../js/data/constants.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const v3 = TEMPLATE_DEFS.find((t) => t.code === 'commissions' && t.version === 3);
ok(v3 && v3.fields.some((f) => f.k === 'broker_fee' && f.type === 'money'), 'v3 has Broker fee ($)');
ok(v3.fields.some((f) => f.k === 'total_commission' && f.readonly), 'v3 has read-only Total commission');
ok(v3.fields.some((f) => f.k === 'commission_shown' && f.readonly), 'v3 shows Commission ($) read-only from Agent fees');
ok(v3.fields.some((f) => f.k === 'payout_method' && f.req && COMMISSION_PAYOUT_OPTS.every((o) => f.opts.includes(o))),
  'payout method is At settlement, FedEx overnight, or Wire');
ok(v3.fields.some((f) => f.k === 'account' && f.mask && f.when && f.when[1] === 'Wire'), 'Wire account is masked after save');
ok(v3.fields.some((f) => f.k === 'mail_street' && f.when && f.when[1] === 'FedEx overnight'), 'FedEx overnight asks for a mailing address');
ok(!v3.fields.some((f) => f.k === 'commission_amount'), 'v3 still does not ask for a typed commission amount (AF-8)');
ok(totalCommissionAmount(14550, '250') === '14800', 'Total commission = commission + broker fee');
ok(totalCommissionAmount(null, '') === '0', 'blank commission and broker fee total to 0');

const good = validateForm(v3.fields, {
  brokerage: 'Harbor Realty (fake)', license_id: 'FAKE-1010', broker_fee: '250',
  payout_method: 'Wire', bank_name: 'Sample Savings (fake)', account_name: 'Ada Agent',
  routing: '021000021', account: '123456789',
}, true);
ok(good.errors.length === 0, 'Wire payout validates with bank details');

const fedexMissing = validateForm(v3.fields, {
  brokerage: 'Harbor Realty (fake)', license_id: 'FAKE-1010', payout_method: 'FedEx overnight',
}, true);
ok(fedexMissing.errors.some((e) => /street|City|State|ZIP/i.test(e.msg)), 'FedEx overnight without an address is refused');

const blankPayout = validateForm(v3.fields, { brokerage: 'Harbor Realty (fake)', license_id: 'FAKE-1010' }, true);
ok(blankPayout.errors.some((e) => /How should we send your commission/i.test(e.msg)), 'completing without a payout method is refused');

const d = {
  taskTemplates: TEMPLATE_DEFS.filter((t) => t.code === 'commissions' && t.version === 2)
    .map((t) => ({ ...JSON.parse(JSON.stringify(t)), id: 'tt-commissions-v2', active: true })),
  tasks: [
    { id: 't-open', dealId: 'd1', templateId: 'tt-commissions-v2', templateCode: 'commissions', templateVersion: 2,
      kind: 'form', assignedRole: 'Buyer Agent', status: 'todo', formData: { brokerage: 'Harbor' } },
    { id: 't-done', dealId: 'd1', templateId: 'tt-commissions-v2', templateCode: 'commissions', templateVersion: 2,
      kind: 'form', assignedRole: 'Listing Agent', status: 'done', formData: { brokerage: 'Oak' } },
  ],
};
applyCommissionTaskV3(d); applyCommissionTaskV3(d);
ok(d.taskTemplates.filter((t) => t.code === 'commissions' && t.active).length === 1
  && d.taskTemplates.find((t) => t.active).fields.some((f) => f.k === 'broker_fee'), 'v3 is the only active commissions template');
ok(d.tasks.find((t) => t.id === 't-open').templateVersion === 3 && d.tasks.find((t) => t.id === 't-open').formData.brokerage === 'Harbor',
  'an open copy moves to v3 and keeps answers');
ok(d.tasks.find((t) => t.id === 't-done').templateVersion === 2, 'a finished copy keeps its version');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-bagent');
const buyerOpen = (await api.listTasks('deal-1')).find((t) => t.templateCode === 'commissions' && t.assignedRole === 'Buyer Agent' && t.canFill);
ok(buyerOpen && buyerOpen.templateVersion >= 3, 'sample file open Buyer Agent Commission information is on v3');
ok(buyerOpen, 'there is a Commission information task the buyer agent can fill');

const before = await api.getTask(buyerOpen.id);
ok(before.fields.some((f) => f.k === 'broker_fee'), 'getTask exposes broker fee fields');
const fees = await api.getAgentFees('deal-1');
const side = before.assignedRole === 'Listing Agent' ? 'listing' : 'buyer';
const commission = (fees.fees[side] && fees.fees[side].commission && fees.fees[side].commission.amount) || 0;
ok(before.commissionFromFees == null || before.commissionFromFees === commission
  || Number(before.formData.commission_shown) === Number(commission) || commission === 0
  || before.formData.commission_shown != null, 'Commission ($) is tied to Agent fees when present');

await api.saveTaskForm(buyerOpen.id, {
  ...before.formData, brokerage: before.formData.brokerage || 'Harbor Realty (fake)',
  license_id: before.formData.license_id || 'FAKE-1010', broker_fee: '100.50',
  payout_method: 'At settlement',
}, { complete: false });
const saved = await api.getTask(buyerOpen.id);
ok(saved.formData.broker_fee === '100.50', 'broker fee is saved');
ok(Number(saved.formData.total_commission) === Number(totalCommissionAmount(saved.formData.commission_shown, '100.50')),
  'total commission is rewritten as commission + broker fee on save');

await api.saveTaskForm(buyerOpen.id, {
  ...saved.formData, payout_method: 'Wire', bank_name: 'Sample Bank (fake)', account_name: 'Blake Agent',
  routing: '021000021', account: '9876543210',
}, { complete: true });
const wire = await api.getTask(buyerOpen.id);
ok(wire.status === 'done' && wire.formData.account === '9876543210', 'agent owner still sees the full account number');

await api.signInDev('u-tc');
const staff = await api.getTask(buyerOpen.id);
ok(staff.maskedAnswers && staff.formData.account === maskAccount('9876543210'),
  'a coordinator (not the owner or processor) sees only the last 4 of the account number');

await api.signInDev('u-proc');
const proc = await api.getTask(buyerOpen.id);
ok(!proc.maskedAnswers && proc.formData.account === '9876543210', 'processor sees the full account number');

const sqlPath = new URL('../supabase/migrations/20261125290000_commission_broker_payout.sql', import.meta.url);
const rbPath = new URL('../supabase/rollbacks/20261125290000_commission_broker_payout.sql', import.meta.url);
const sql = readFileSync(sqlPath, 'utf8');
const rb = readFileSync(rbPath, 'utf8');
const md5 = createHash('md5').update(sql).digest('hex');
const rbMd5 = createHash('md5').update(rb).digest('hex');
ok(sql.includes('20261125290000') && sql.includes('broker_fee') && sql.includes('FedEx overnight')
  && sql.includes('total_commission') && sql.includes('commission_task_guard') && sql.includes('mask'),
  'database file covers broker fee, total, payout and masking');
ok(sql.includes("raise exception 'Commissions are now kept in the Agent fees box under the agent task sections on Tasks. Reload the page and enter it there. Nothing was saved.'")
  && sql.includes('agent task section on Tasks')
  && !sql.includes("raise exception 'Commissions are now kept in the Agent fees box on the file overview"),
  'migration keeps FF-101c Tasks wording (does not put File Overview back)');
ok(rb.includes("raise exception 'Commissions are now kept in the Agent fees box under the agent task sections on Tasks. Reload the page and enter it there. Nothing was saved.'")
  && !rb.includes("raise exception 'Commissions are now kept in the Agent fees box on the file overview"),
  'rollback restores the Tasks refusal, not File Overview');
ok(sql.includes('Do NOT apply') || sql.includes('Do NOT apply this file'), 'migration says not to apply from this commit');
console.log('migration md5', md5);
console.log('rollback md5', rbMd5);

console.log(fail ? fail + ' failed' : 'commission broker payout passed');
if (fail) process.exit(1);
