// AF-2 agent fees (John, Nov 12 2026): the shared rules in js/data/agent-fees.js and the mock adapter part.
// node test/test-agent-fees.js
import assert from 'node:assert/strict';
import { syncCommission, readAgentFees, groupAgentFees, sideStatus, agentFeeError, defaultPayer, feeNumber } from '../js/data/agent-fees.js';
import { agentFeesPart } from '../js/data/mock-part-agent-fees.js';
import { altaStatement, closingDisclosure } from '../js/data/accounting.js';

let n = 0; const ok = (name, fn) => { fn(); n += 1; console.log(`ok ${name}`); };
const throwsMsg = (fn, msg) => assert.throws(fn, (e) => e.message === msg, msg);

ok('3% of $300,000 is $9,000; $7,777.77 works out a % that gives back the same cents', () => {
  assert.deepEqual(syncCommission(300000, 'percent', '3'), { basis: 'percent', percent: 3, amount: 9000 });
  const r = syncCommission(312345, 'amount', '7,777.77');
  assert.equal(r.amount, 7777.77); assert.equal(Math.round(312345 * r.percent) / 100, 7777.77);
});
ok('plain messages for a missing price and bad numbers', () => {
  throwsMsg(() => syncCommission(null, 'percent', '3'), 'Add the sales price before entering a commission, so the % and $ stay in step.');
  throwsMsg(() => syncCommission(300000, 'percent', 'abc'), 'Commission % must be a number.');
  throwsMsg(() => syncCommission(300000, 'percent', '101'), 'Commission % must be a number from 0 to 100.');
  throwsMsg(() => syncCommission(300000, 'amount', '400000'), "The commission $ can't be more than the sales price.");
  assert.equal(feeNumber('$1,250.50', 'x'), 1250.5);
});
ok('admin fee defaults: buyer pays on the buyer\'s agent side, seller on the listing side', () => {
  assert.equal(defaultPayer('buyer'), 'buyer'); assert.equal(defaultPayer('listing'), 'seller');
  assert.equal(readAgentFees({ adminAmount: '395' }, { side: 'buyer', price: 1 }).admin.payer, 'buyer');
  assert.equal(readAgentFees({ adminAmount: '395' }, { side: 'listing', price: 1 }).admin.payer, 'seller');
  assert.equal(readAgentFees({ adminAmount: '395', adminPayer: 'seller' }, { side: 'buyer', price: 1 }).admin.payer, 'seller');
});
ok('other fees: blank rows skipped, up to 5, description and paid to required', () => {
  const blank = { description: '', amount: '', paidTo: '' };
  assert.equal(readAgentFees({ other: [blank, { description: 'Referral', amount: '500', paidTo: 'ABC' }] }, { side: 'buyer', price: 1 }).other.length, 1);
  const six = Array.from({ length: 6 }, () => ({ description: 'a', amount: '1', paidTo: 'b' }));
  throwsMsg(() => readAgentFees({ other: six }, { side: 'buyer', price: 1 }), 'Up to 5 other fees per agent.');
  throwsMsg(() => readAgentFees({ other: [{ description: 'a', amount: '1' }] }, { side: 'buyer', price: 1 }), 'Other fee 1: enter who it is paid to.');
  throwsMsg(() => readAgentFees({ other: [{ amount: '1', paidTo: 'b' }] }, { side: 'buyer', price: 1 }), 'Other fee 1: enter a description.');
});
ok('status labels', () => {
  assert.equal(sideStatus(null).text, 'Not entered yet');
  const g = groupAgentFees([{ side: 'buyer', kind: 'admin', slot: 0, amount: 1, source: 'staff' }]);
  assert.equal(sideStatus(g.buyer).text, 'Not confirmed by the agent yet');
  const c = groupAgentFees([{ side: 'buyer', kind: 'admin', slot: 0, amount: 1, source: 'tc', confirmedRole: 'tc', confirmedAt: '2026-11-12T20:00:00Z', confirmedByName: 'Tia' }]);
  assert.equal(sideStatus(c.buyer).text, 'Confirmed by TC');
});
ok('database errors become plain messages (rule 12)', () => {
  assert.equal(agentFeeError(new Error('permission denied for function save_agent_fees')), "You can't change agent fees on this file.");
  assert.equal(agentFeeError(new Error('Could not find the function public.agent_fees(p_deal) in the schema cache')), 'Agent fees are not switched on for this portal yet. Nothing was saved.');
  assert.equal(agentFeeError(new Error('null value in column "amount" violates not-null constraint')), 'Agent fees could not be saved. Try again, or ask CLA Title for help.');
  assert.equal(agentFeeError(new Error('The agent confirmed these fees. Enter a reason for the change.')), 'The agent confirmed these fees. Enter a reason for the change.');
});

// mock adapter: who sees and changes what
const data = { deals: [{ id: 'd1', purchasePrice: 300000, transactionType: 'Purchase', tcUserId: null }], participants: [
  { dealId: 'd1', contactId: 'c-ba', role: 'Buyer Agent' }, { dealId: 'd1', contactId: 'c-la', role: 'Listing Agent' }, { dealId: 'd1', contactId: 'c-b', role: 'Client-Buyer' }],
  contacts: [{ id: 'c-ba', profileId: 'ba', company: 'Example Realty' }, { id: 'c-la', profileId: 'la' }, { id: 'c-b', profileId: 'b' }] };
const people = { pro: { id: 'pro', role: 'Processor' }, ba: { id: 'ba', role: 'Outside user' }, la: { id: 'la', role: 'Outside user' }, b: { id: 'b', role: 'Outside user' },
  tc: { id: 'tc', role: 'Transaction Coordinator' }, sales: { id: 'sales', role: 'Sales Person' } };
let who = 'pro';
const roles = { ba: ['Buyer Agent'], la: ['Listing Agent'], b: ['Client-Buyer'] };
let seq = 0;
const part = agentFeesPart({ load: () => data, save() {}, nid: (p) => `${p}-${seq += 1}`, needUser: () => people[who], dealOr404: (u, id) => data.deals.find((d) => d.id === id),
  fileRoles: (pid) => roles[pid] || [people[pid].role], teamAgentIds: (u) => new Set(u.id === 'tc' ? ['la'] : []),
  isStaffView: (u) => u.role !== 'Outside user', nameOf: (id) => id.toUpperCase(), now: () => '2026-11-12T21:00:00Z', fail: (m) => { throw new Error(m); }, clone: (x) => JSON.parse(JSON.stringify(x)) });
const run = async () => {
  const fees = { commission: { basis: 'percent', percent: 3, amount: 9000 }, admin: { amount: 395 }, other: [] };
  let v = await part.saveAgentFees('d1', 'buyer', fees); assert.equal(v.fees.buyer.commission.amount, 9000); assert.deepEqual(v.sides, { listing: 'edit', buyer: 'edit' });
  who = 'ba'; v = await part.getAgentFees('d1'); assert.deepEqual(Object.keys(v.sides), ['buyer']); assert.equal(v.fees.listing, undefined);
  await assert.rejects(part.saveAgentFees('d1', 'listing', fees), /You can't change agent fees on this file\./);
  v = await part.saveAgentFees('d1', 'buyer', { ...fees, commission: { basis: 'percent', percent: 2.5 } });
  assert.equal(v.fees.buyer.commission.amount, 7500); assert.equal(v.fees.buyer.confirmed.role, 'agent');
  who = 'b'; v = await part.getAgentFees('d1'); assert.deepEqual(v.sides, {}); assert.deepEqual(await part.getAgentFeeHistory('d1'), []);
  who = 'pro'; await assert.rejects(part.saveAgentFees('d1', 'buyer', { ...fees, commission: { basis: 'percent', percent: 2.75 } }), /Enter a reason for the change/);
  v = await part.saveAgentFees('d1', 'buyer', { ...fees, commission: { basis: 'percent', percent: 2.75 } }, 'Per the agreement');
  assert.equal(v.fees.buyer.commission.amount, 8250); assert.equal(sideStatus(v.fees.buyer).text, 'Agent confirmed, then changed by CLA staff');
  const h = await part.getAgentFeeHistory('d1'); assert.equal(h[0].reason, 'Per the agreement'); assert.equal(h[0].source, 'staff');
  who = 'tc'; v = await part.getAgentFees('d1'); assert.deepEqual(v.sides, { listing: 'edit' });
  who = 'sales'; v = await part.getAgentFees('d1'); assert.deepEqual(v.sides, { listing: 'read', buyer: 'read' });
  await assert.rejects(part.saveAgentFees('d1', 'buyer', fees), /You can't change agent fees on this file\./);
  n += 1; console.log('ok mock adapter: staff both sides, agent own side, buyer nothing, reason rule, TC on the agent\'s team, sales read only');
  // AF-5: fees post to the fee ledger
  const live = () => data.accountingFees.filter((f) => !f.retired && String(f.presetKey).startsWith('agent_fee:'));
  assert.equal(live().length, 2);
  const com = live().find((f) => f.presetKey === 'agent_fee:buyer:commission:0');
  assert.equal(com.amount, 8250); assert.equal(com.altaSection, 'commission'); assert.equal(com.cdSection, 'H'); assert.equal(com.paidBy, 'buyer'); assert.equal(com.split.buyer, 8250);
  assert.equal(com.payee, 'Example Realty'); assert.equal(com.description, "Real estate commission - buyer's agent (2.75%)");
  who = 'pro'; await part.saveAgentFees('d1', 'buyer', { ...fees, commission: { basis: 'percent', percent: 2.75 }, admin: null, other: [{ description: 'Referral fee', amount: 100, paidTo: 'Example Referral Co.', payer: 'seller' }] }, 'Admin fee waived');
  assert.ok(data.accountingFees.find((f) => f.presetKey === 'agent_fee:buyer:admin:0').retired, 'a removed fee retires its line');
  const oth = live().find((f) => f.presetKey === 'agent_fee:buyer:other:1'); assert.equal(oth.payee, 'Example Referral Co.'); assert.equal(oth.paidBy, 'seller');
  com.amount = 1234; com.split = { buyer: 1234, seller: 0, lender: 0, other: 0 };   // a processor changes the line by hand
  await part.saveAgentFees('d1', 'buyer', { ...fees, commission: { basis: 'percent', percent: 3 }, admin: null, other: [] }, 'Back to 3%');
  assert.equal(com.amount, 1234, 'a line changed by hand is never overwritten');
  n += 1; console.log('ok AF-5 mock: every fee posts to the ledger (ALTA Commission, CD H), removed fees retire, hand changes are kept');
  // AF-6: the posted fees show on the ALTA statement (Commission) and the CD (section H) that "Generate ALTA" / "Generate CD" print
  const deal = data.deals[0]; const ledger = data.accountingFees.filter((f) => f.dealId === 'd1');
  const alta = altaStatement(deal, ledger); const comm = alta.sections.find((x) => x.key === 'commission');
  assert.ok(comm.rows.some((r) => /Real estate commission - buyer's agent/.test(r.description)), 'ALTA Commission section lists the agent commission');
  const cd = closingDisclosure(deal, ledger); const H = cd.sections ? cd.sections.find((x) => x.key === 'H') : cd.H;
  assert.ok(H && H.rows.some((r) => /Real estate commission - buyer's agent/.test(r.description)), 'CD section H lists the agent commission');
  n += 1; console.log('ok AF-6: agent fees appear in the ALTA Commission section and CD section H');
};
run().then(() => console.log(`\n${n} agent fee checks passed`)).catch((e) => { console.error('FAIL', e.message); process.exit(1); });
