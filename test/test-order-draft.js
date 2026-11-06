/* Place Order draft. Fake fields only. A draft is not an order and cannot invent a Processor. */
import { orderDraftKey, readOrderDraft, writeOrderDraft, clearOrderDraft, collectOrderFields, applyOrderDraft, claimOrderDraft, releaseOrderClaim, rememberedFiles, ORDER_DRAFT_MS } from '../js/data/order-draft.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const real = { id: 'u-francis', isDemo: false };
const demo = { id: 'u-francis', isDemo: true };
ok(orderDraftKey(real) !== orderDraftKey(demo) && orderDraftKey(real).includes('real') && orderDraftKey(demo).includes('demo'), 'a real draft and a demo draft stay apart');
ok(orderDraftKey({}) === '', 'no user means no draft key');
const store = mem();
const key = orderDraftKey(real);
const form = { elements: [
  { name: 'street', type: 'text', value: '9 Draft Lane' },
  { name: 'processorId', type: 'select-one', value: '' },
  { name: 'salesIds', type: 'checkbox', value: 'u-sp', checked: true },
  { name: 'contract', type: 'file', files: [{ name: 'contract.pdf', size: 10, contents: 'SECRET-BYTES' }] },
  { name: '', type: 'submit' },
] };
const body = collectOrderFields(form);
ok(body.fields.street === '9 Draft Lane' && !('contract' in body.fields) && !JSON.stringify(body).includes('SECRET-BYTES'), 'a draft keeps the street and never the file contents');
ok(body.checks.salesIds.join() === 'u-sp', 'checked people are kept');
writeOrderDraft(store, key, { ...body, savedAt: new Date().toISOString(), step: 'team', fileNames: rememberedFiles([form.elements[3]]) });
const back = readOrderDraft(store, key);
ok(back.fields.street === '9 Draft Lane' && back.fileNames[0] === 'contract.pdf', 'the draft can be read back, with only the file name');
const target = { elements: [
  { name: 'street', type: 'text', value: '' },
  { name: 'processorId', type: 'select-one', value: '' },
  { name: 'salesIds', type: 'checkbox', value: 'u-sp', checked: false },
] };
const dropped = applyOrderDraft(target, { ...back, fields: { ...back.fields, processorId: 'gone-user' } }, [{ id: 'u-super' }]);
ok(dropped.processorDropped && target.elements[1].value === '' && target.elements[0].value === '9 Draft Lane' && target.elements[2].checked, 'an unknown Processor is not restored and the other answers are');
const kept = applyOrderDraft(target, { fields: { processorId: 'u-super', street: '1 Kept St' }, checks: {} }, [{ id: 'u-super' }]);
ok(!kept.processorDropped && target.elements[1].value === 'u-super', 'a Processor who is still eligible can be restored');
writeOrderDraft(store, key, { fields: { street: 'old' }, savedAt: new Date(Date.now() - ORDER_DRAFT_MS - 1000).toISOString() });
ok(readOrderDraft(store, key) === null, 'a draft older than 7 days is ignored');
writeOrderDraft(store, key, { fields: { street: 'now' }, savedAt: new Date().toISOString() });
const first = claimOrderDraft(store, key);
const second = claimOrderDraft(store, key);
ok(first.ok && !second.ok, 'a second tab cannot place the same draft at the same time');
releaseOrderClaim(store, key);
ok(claimOrderDraft(store, key).ok, 'a failed place releases the draft for one more try');
clearOrderDraft(store, key);
ok(readOrderDraft(store, key) === null, 'placing the order clears the draft');
console.log(fail ? fail + ' failed' : 'order draft passed');
if (fail) process.exit(1);
