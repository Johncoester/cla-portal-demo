/* CLA representation. Fake data. No network and no hosted database. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { applyOrderDraft } from '../js/data/order-draft.js';
import {
  CLA_REPRESENTATION, claRepresentationCode, claRepresentationLabel, claRepresentationWritesEnabled,
  draftKeepsUnrecordedRepresentation, representationPayload,
} from '../js/data/cla-representation.js';

let pass = 0, fails = 0;
const ok = (c, name) => { if (c) { pass++; console.log('ok', name); } else { fails++; console.log('FAIL', name); } };
const rejects = async (fn, name, re) => { try { await fn(); ok(false, name); } catch (e) { ok(!re || re.test(e.message), name); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

ok(CLA_REPRESENTATION.map((row) => row.label).join('|') === 'Both buyer and seller|Buyer only|Seller only', 'the three labels are the words John used');
ok(claRepresentationCode(undefined) === null && claRepresentationCode('') === null && claRepresentationCode('both') === 'both', 'a missing answer stays unrecorded and both is explicit');
ok(claRepresentationLabel(null) === 'Not recorded' && claRepresentationLabel('buyer') === 'Buyer only' && claRepresentationLabel('seller') === 'Seller only', 'unrecorded is not shown as both');
try { claRepresentationCode('Buyer'); ok(false, 'a portal-role word is not a representation'); } catch (e) { ok(/Both buyer and seller/.test(e.message), 'a portal-role word is not a representation'); }
ok(draftKeepsUnrecordedRepresentation({}) === true && draftKeepsUnrecordedRepresentation({ claRepresentation: 'seller' }) === false, 'an older draft has no representation answer');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const older = await api.listDeals({});
ok(older.length > 0 && older.every((deal) => deal.claRepresentation == null && deal.claRepresentationLabel === 'Not recorded'), 'existing fake orders are not backfilled to both');
const base = { street: '9 Representation Lane', city: 'Frederick', state: 'MD', zip: '21701', openDate: '2026-11-08', processorId: 'u-proc', transactionType: 'Purchase' };
const omitted = await api.createDeal(base);
ok(omitted.claRepresentation == null && omitted.claRepresentationLabel === 'Not recorded' && !/both|buyer|seller/i.test(omitted.notes || ''), 'omitting the field stores nothing and does not hide it in notes');
const buyerOnly = await api.createDeal({ ...base, street: '10 Buyer Side', claRepresentation: 'buyer', sourceOfBusiness: '', notes: 'kept' });
ok(buyerOnly.claRepresentation === 'buyer' && buyerOnly.claRepresentationLabel === 'Buyer only' && buyerOnly.notes === 'kept' && buyerOnly.sourceOfBusiness === '', 'buyer only is stored apart from notes and referral');
const both = await api.createDeal({ ...base, street: '11 Both Sides', claRepresentation: 'both' });
ok(both.claRepresentation === 'both', 'an explicit both is stored');
await api.addParticipant(buyerOnly.id, 'c-buyer', 'Client-Buyer');
const touched = await api.updateDeal(buyerOnly.id, { city: 'Brunswick' });
ok(touched.claRepresentation === 'buyer' && touched.city === 'Brunswick', 'editing the city does not change the side');
const cleared = await api.updateDeal(buyerOnly.id, { claRepresentation: '' });
ok(cleared.claRepresentation == null && cleared.claRepresentationLabel === 'Not recorded', 'an explicit clear returns to not recorded');
await rejects(() => api.createDeal({ ...base, street: '12 Bad Side', claRepresentation: 'listing_agent' }), 'an agent role is rejected', /Both buyer and seller/);
await rejects(() => api.updateDeal(both.id, { claRepresentation: 'Client-Buyer' }), 'a party role is rejected', /Both buyer and seller/);

const seller = await api.createDeal({ ...base, street: '13 Seller Side', claRepresentation: 'seller' });
await api.addParticipant(seller.id, 'c-buyer', 'Client-Buyer');
await api.signInDev('u-buyer');
const hidden = await api.getDeal(seller.id);
ok(hidden.claRepresentation == null && hidden.claRepresentationLabel === '' && hidden.myRole === 'Client-Buyer', 'a client view keeps their party role and does not receive the CLA side');
await rejects(() => api.updateDeal(seller.id, { claRepresentation: 'both', city: 'Tampered' }), 'a client cannot write the CLA side', /Processor or Admin/);
await rejects(() => api.createDeal({ ...base, street: '14 Client Order', claRepresentation: 'buyer' }), 'a client cannot open an order with a side', /Processor or Admin/);
await api.signInDev('u-proc');
const still = await api.getDeal(seller.id);
ok(still.claRepresentation === 'seller' && still.city === 'Frederick', 'the client write did not change the saved side or the city');

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const dealPage = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
const hosted = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261109150000_cla_representation.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261109150000_cla_representation.sql', import.meta.url), 'utf8');
const choice = readFileSync(new URL('../js/data/cla-representation.js', import.meta.url), 'utf8');
ok(choice.includes('Both buyer and seller') && choice.includes('Buyer only') && choice.includes('Seller only') && page.includes("row.code === 'both'") && page.includes('name="claRepresentation"'), 'Place Order offers the three sides with Both preselected');
ok(page.includes('draftKeepsUnrecordedRepresentation') && page.includes('data-review-representation'), 'the choice is reviewed and restored from drafts');
ok(dealPage.includes('data-cla-representation') && dealPage.includes('Not recorded') && dealPage.includes('staffView') && dealPage.includes('name="claRepresentation"'), 'the order page shows and edits the saved side for staff');
ok(hosted.includes('row.cla_representation = claRepresentationCode(input.claRepresentation)') && hosted.includes('row.cla_representation = claRepresentationCode(patch.claRepresentation)'), 'hosted create and edit write the column only when the field is present');
ok(hosted.includes("role === 'Outside user') { d.claRepresentation = null"), 'hosted read hides the side from outside users');
ok(hosted.includes('a.claRepresentationReady = true'), 'hosted adapter turns the choice on once the column exists');
ok(claRepresentationWritesEnabled({ mode: 'mock' }) === true && claRepresentationWritesEnabled({ mode: 'supabase' }) === false && claRepresentationWritesEnabled({ mode: 'supabase', claRepresentationReady: true }) === true, 'hosted asks for a side only when the adapter says the column is ready');
const kept = representationPayload({ mode: 'supabase', claRepresentationReady: true }, { street: '1', claRepresentation: 'seller' });
const dropped = representationPayload({ mode: 'supabase' }, { street: '1', claRepresentation: 'both', notes: 'plain' });
ok(kept.claRepresentation === 'seller' && !Object.prototype.hasOwnProperty.call(dropped, 'claRepresentation') && dropped.notes === 'plain', 'a not-ready hosted payload leaves the side off');
ok(sql.includes('add column cla_representation text') && !/\bdefault\b/i.test(sql.replace(/--.*$/gm, '')) && !/update\s+public\.deals/i.test(sql) && back.includes('drop column cla_representation'), 'the migration adds a nullable column with no default and no backfill; rollback drops it');

const form = { elements: [{ name: 'claRepresentation', type: 'radio', value: 'both', checked: true }, { name: 'claRepresentation', type: 'radio', value: 'buyer', checked: false }] };
applyOrderDraft(form, { fields: { street: '1 Old Draft' }, checks: {} }, []);
ok(form.elements.every((el) => el.checked === false), 'restoring an older draft clears the new-order both default');
const fresh = { elements: [{ name: 'claRepresentation', type: 'radio', value: 'both', checked: true }, { name: 'claRepresentation', type: 'radio', value: 'seller', checked: false }] };
applyOrderDraft(fresh, { fields: { claRepresentation: 'seller' }, checks: {} }, []);
ok(fresh.elements[1].checked === true && fresh.elements[0].checked === false, 'a draft that chose seller only comes back as seller only');

console.log(fails ? `cla-representation: ${fails} failed` : `cla-representation: ${pass} passed`);
if (fails) process.exit(1);
