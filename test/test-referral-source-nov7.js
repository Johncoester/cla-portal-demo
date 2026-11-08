/* Referral source on eligible party rows (John, Nov 7). Fake contacts only. No network and no hosted database. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { buildOrderOverview } from '../js/data/order-overview.js';
import {
  applyReferralChange, encodeReferral, fileReferralState, referralContacts, referralFromForm, referralLabel,
  referralWriteError, sourceChoices,
} from '../js/data/place-order.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let pass = 0, fails = 0;
const ok = (c, name) => { if (c) pass++; else { fails++; console.log('FAIL', name); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(e.message), name + ' [' + e.message + ']'); } };
const store = mem();
const a = createMockAdapter({ storage: store, sessionStorage: mem() });
const as = async (id) => { await a.signInDev(id); return a; };
const ORDER = { street: '11 Referral Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', openDate: '2026-11-01', transactionType: 'Purchase' };
const INELIGIBLE = ['Processor', 'Preprocessor', 'Title Company', 'Transaction Coordinator', 'Abstractor', 'Underwriter', 'Sales Person', 'Sales Team', 'HOA', 'Title Sales Rep'];

const rows = [
  { label: 'Buyer', name: 'Ben Buyer', contactId: 'c-buyer' },
  { label: 'Buyer', name: 'Wendy Willow-Buyer', contactId: 'c-wbuyer' },
  { label: 'Buyer', name: 'Not specified', contactId: '', placeholder: true },
  { label: 'Seller', name: 'Sally Seller', contactId: 'c-seller' },
  { label: 'Seller', name: 'Cora Seller', contactId: 'c-cora' },
  { label: 'Buyer Agent', name: 'Bianca Buyer-Agent', contactId: 'c-bagent' },
  { label: 'Listing Agent', name: 'Larry Listing-Agent', contactId: 'c-lagent' },
  { label: 'Lender', name: 'Linda Lender', contactId: 'c-lender1' },
  { label: 'Processor', name: 'Paula Processor', contactId: 'c-proc' },
  { label: 'Title Company', name: 'CLA Title & Escrow', contactId: '' },
  { label: 'Transaction Coordinator', name: 'Terry Coordinator', contactId: 'c-tc' },
  { label: 'Abstractor', name: 'Not specified', contactId: '', placeholder: true },
  { label: 'Underwriter', name: 'Example Underwriter', contactId: '', placeholder: true, fromSplits: true },
];
const second = encodeReferral('buyer', 'c-wbuyer');
const state = fileReferralState({ source: second, rows, canEdit: true });
ok(state.rows.filter((r) => r.checked).map((r) => r.contactId).join() === 'c-wbuyer', 'one buyer contact is the referral when two buyers are on the file');
ok(state.rows.filter((r) => INELIGIBLE.includes(r.label)).every((r) => !r.control && !r.checked), 'processor, title company, TC, abstractor, and underwriter are not referral rows');
ok(state.rows.find((r) => r.placeholder && r.label === 'Buyer').disabled && !state.rows.find((r) => r.placeholder && r.label === 'Buyer').checked, 'an empty buyer row cannot be selected');
ok(!state.clearChecked && !state.legacy, 'a matched contact is not also Not set');

const bare = fileReferralState({ source: 'buyer_agent', sourceLabel: "Buyer's agent", rows, canEdit: true });
ok(!bare.rows.some((r) => r.checked) && bare.legacy && bare.unmatched === "Buyer's agent", 'a bare buyer-agent code is not guessed onto the agent');
const home = fileReferralState({ source: 'homeowner', sourceLabel: 'Homeowner', rows, canEdit: true });
ok(!home.rows.some((r) => r.checked) && home.unmatched === 'Homeowner' && !home.clearChecked, 'homeowner stays unmatched and is not treated as the seller or the buyer');
const ads = fileReferralState({ source: 'Google Ads', sourceLabel: 'Google Ads', rows, canEdit: false });
ok(ads.legacy && ads.unmatched === 'Google Ads' && !ads.canEdit && !ads.rows.some((r) => r.checked), 'a marketing Lead Source stays visible and checks nobody');
const empty = fileReferralState({ source: '', rows, canEdit: true });
ok(empty.clearChecked && !empty.rows.some((r) => r.checked), 'Not set is the only selection when the source is empty');

ok(referralFromForm({ value: second, picks: [{ role: 'Client-Buyer', contactId: 'c-wbuyer' }], refinance: false }) === second, 'Place Order keeps the buyer who is actually picked');
ok(referralFromForm({ value: second, picks: [{ role: 'Client-Buyer', contactId: 'c-buyer' }], refinance: false }) === '', 'Place Order does not keep a buyer who was cleared');
ok(referralFromForm({ value: encodeReferral('listing_agent', 'c-lagent'), picks: [{ role: 'Listing Agent', contactId: 'c-lagent' }], refinance: true }) === '', 'a refinance form does not keep a hidden listing agent');
ok(referralFromForm({ value: '', picks: [{ role: 'Buyer Agent', contactId: 'c-bagent' }], refinance: false }) === '', 'an assigned agent is not auto-selected');
ok(referralLabel('homeowner:c-seller', (id) => id) === 'Homeowner', 'a homeowner value does not gain a contact name');
ok(referralLabel(second, (id) => (id === 'c-wbuyer' ? 'Wendy Willow-Buyer' : '')) === 'Buyer — Wendy Willow-Buyer', 'the buyer label names that contact');

const parties = referralContacts([
  { role: 'Client-Buyer', contactId: 'c-buyer', contact: { firstName: 'Ben', lastName: 'Buyer' } },
  { role: 'Client-Buyer', contactId: 'c-wbuyer', contact: { firstName: 'Wendy', lastName: 'Willow-Buyer' } },
  { role: 'Processor', contactId: 'c-proc', contact: { firstName: 'Paula', lastName: 'Processor' } },
]);
const editOpts = sourceChoices('Google Ads', 'Google Ads', false, parties);
ok(editOpts.filter((o) => o.value.startsWith('buyer:')).length === 2 && editOpts.some((o) => o.value === 'Google Ads') && !editOpts.some((o) => /Processor/.test(o.label)), 'Edit Order lists each buyer and keeps the marketing value');
ok(sourceChoices('homeowner', 'Homeowner', false, parties).some((o) => o.value === 'homeowner' && o.label === 'Homeowner'), 'Edit Order keeps a stored homeowner value');
ok(referralWriteError({ source: 'buyer:c-demo', contacts: [{ id: 'c-demo', isDemo: true }], profiles: [], actor: { isDemo: false }, participants: [{ dealId: 'd1', role: 'Client-Buyer', contactId: 'c-demo' }], dealId: 'd1' }) !== '', 'a real session cannot use a demo contact');
ok(referralWriteError({ source: second, contacts: [{ id: 'c-wbuyer' }], profiles: [], actor: { isDemo: false }, participants: [], dealId: 'd1' }) !== '', 'a contact who is not on the order is refused');
ok(referralWriteError({ source: second, contacts: [{ id: 'c-wbuyer', profileId: 'u-gone' }], profiles: [{ id: 'u-gone', status: 'removed', isDemo: false }], actor: { isDemo: false }, participants: [{ dealId: 'd1', role: 'Client-Buyer', contactId: 'c-wbuyer' }], dealId: 'd1' }) !== '', 'a removed login cannot be newly assigned');
ok(referralWriteError({ source: second, contacts: [{ id: 'c-wbuyer' }], profiles: [], actor: { isDemo: false }, participants: [{ dealId: 'd1', role: 'Client-Buyer', contactId: 'c-buyer' }], dealId: 'd1' }) !== '', 'a buyer code cannot name someone who is not a buyer on the file');
const failed = await applyReferralChange({ previous: 'homeowner', next: second, write: async () => { throw new Error('database down'); } });
ok(!failed.ok && failed.value === 'homeowner' && failed.error === 'database down', 'a failed write keeps the previous value and reports the error');

await as('u-proc');
const made = await a.createDeal({ ...ORDER, sourceOfBusiness: '' });
ok(made.sourceOfBusiness === '', 'opening an order does not assign the signer or an agent');
await a.addParticipant(made.id, 'c-buyer', 'Client-Buyer');
await a.addParticipant(made.id, 'c-wbuyer', 'Client-Buyer');
await a.addParticipant(made.id, 'c-seller', 'Client-Seller');
await a.addParticipant(made.id, 'c-cora', 'Client-Seller');
await a.addParticipant(made.id, 'c-bagent', 'Buyer Agent');
await a.addParticipant(made.id, 'c-lagent', 'Listing Agent');
await a.addParticipant(made.id, 'c-lender1', 'Lender');
const tcs = await a.listCoordinators();
await a.addParticipant(made.id, tcs[0].contactId, 'Transaction Coordinator');
ok((await a.getDeal(made.id)).sourceOfBusiness === '', 'adding the parties does not auto-assign a referral');
const leadBefore = (await a.getCrmContact('c-wbuyer')).leadSource;
const saved = await a.updateDeal(made.id, { sourceOfBusiness: second });
ok(saved.sourceOfBusiness === second && saved.sourceOfBusinessLabel === 'Buyer — Wendy Willow-Buyer', 'the second buyer is stored as the one source');
const reopened = await a.getDeal(made.id);
ok(reopened.sourceOfBusiness === second && reopened.sourceOfBusinessLabel === 'Buyer — Wendy Willow-Buyer', 'the same source is there after reopen');
const ov = await a.getOrderOverview(made.id);
const buyerRows = ov.parties.filter((p) => p.label === 'Buyer');
ok(buyerRows.map((p) => p.contactId).sort().join() === 'c-buyer,c-wbuyer', 'overview rows carry the buyer contact ids');
const crm = await a.getCrmDeal(made.id);
ok(crm.source === second && crm.sourceText === 'Buyer — Wendy Willow-Buyer', 'CRM source text matches the order source');
ok((await a.getCrmContact('c-wbuyer')).leadSource === leadBefore, 'the contact Lead Source is not rewritten');
ok((await a.listCrmDeals({ source: 'buyer' })).some((r) => r.id === made.id), 'CRM source filter matches the buyer code');
const edit = sourceChoices(reopened.sourceOfBusiness, reopened.sourceOfBusinessLabel, false, referralContacts(reopened.participants));
ok(edit.some((o) => o.value === second) && edit.filter((o) => o.value === second).length === 1, 'Edit Order offers that same buyer once');
await rejects(() => a.updateDeal(made.id, { sourceOfBusiness: 'buyer:c-missing' }), 'NEG unknown contact', /Source of business/);
ok((await a.getDeal(made.id)).sourceOfBusiness === second, 'a rejected write leaves the saved buyer in place');
await rejects(() => a.updateDeal(made.id, { sourceOfBusiness: encodeReferral('buyer', 'c-seller') }), 'NEG seller contact as the buyer source', /on this order/);
await a.updateDeal(made.id, { sourceOfBusiness: 'homeowner' });
ok((await a.getDeal(made.id)).sourceOfBusiness === 'homeowner' && (await a.getDeal(made.id)).sourceOfBusinessLabel === 'Homeowner', 'homeowner is stored as homeowner');
await a.updateDeal(made.id, { sourceOfBusiness: 'homeowner:c-seller' });
ok((await a.getDeal(made.id)).sourceOfBusiness === 'homeowner', 'homeowner with an id is not rewritten into a seller');
await a.updateDeal(made.id, { sourceOfBusiness: 'Existing Client or Agent' });
ok((await a.getDeal(made.id)).sourceOfBusiness === 'Existing Client or Agent', 'an older Lead Source value still saves');
await a.updateDeal(made.id, { sourceOfBusiness: '' });
ok((await a.getDeal(made.id)).sourceOfBusiness === '' && (await a.getDeal(made.id)).sourceOfBusinessLabel === '', 'clearing the source stays cleared after reopen');

await as('u-buyer');
const hidden = await a.getDeal(made.id);
ok(hidden.sourceOfBusiness === '' && hidden.sourceOfBusinessLabel === '', 'a buyer does not receive the referral source');
await rejects(() => a.updateDeal(made.id, { sourceOfBusiness: second }), 'NEG buyer cannot write the source', /Processor or Admin/);
await as('u-bagent');
await rejects(() => a.updateDeal(made.id, { sourceOfBusiness: encodeReferral('buyer_agent', 'c-bagent') }), 'NEG agent cannot write the source', /Processor or Admin/);
await as('u-sp');
await rejects(() => a.updateDeal(made.id, { sourceOfBusiness: second }), 'NEG sales cannot write the source', /Processor or Admin/);
await as('u-tc');
await rejects(() => a.updateDeal(made.id, { sourceOfBusiness: second }), 'NEG transaction coordinator cannot write the source', /Processor or Admin/);
await as('u-proc');
ok((await a.getDeal(made.id)).sourceOfBusiness === '', 'failed role writes did not change the file');

const outside = buildOrderOverview({ deal: { id: 'deal-x', fileNumber: 'MD-26-1', transactionType: 'Purchase', participants: [{ role: 'Client-Buyer', contactId: 'c-buyer', contact: { firstName: 'Ben', lastName: 'Buyer', contactHidden: false } }, { role: 'Listing Agent', contactId: 'c-lagent', contact: { firstName: 'Larry', lastName: 'Listing-Agent', email: 'larry@example.test', contactHidden: true } }] }, me: { id: 'u-buyer', role: 'Outside user' }, tasks: [], documents: [], threads: [], activity: [] });
ok(outside.parties.find((p) => p.label === 'Listing Agent').contactId === '' && !JSON.stringify(outside.parties.find((p) => p.label === 'Listing Agent')).includes('c-lagent'), 'a hidden party does not expose the contact id');

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const file = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261107184500_referral_party_source.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261107184500_referral_party_source_rollback.sql', import.meta.url), 'utf8');
ok(page.includes('data-referral-clear') && page.includes('referralFromForm') && page.includes("data-referral-code=\"${meta.code}\"") && page.indexOf('api.addParticipant') < page.indexOf('sourceOfBusiness: referral') && page.includes('Referral source was not saved'), 'Place Order renders the radios and saves the referral only after the people are added');
ok(!page.includes("sob.value = 'lender'") && !page.includes('name="sourceContactId"'), 'Place Order does not auto-assign the lender or a separate contact list');
ok(file.includes('applyReferralChange') && file.includes('if (!result.ok)') && file.includes("toast(result.error, 'err')"), 'the file restores the previous radio when the write fails');
ok(sql.includes('NOT APPLIED') && sql.includes("if not private.is_processor()") && sql.includes("'buyer', 'seller', 'buyer_agent', 'listing_agent', 'lender', 'homeowner'") && sql.includes('choose a person who is on this order in that role') && sql.includes("code = 'homeowner' or who = ''") && sql.includes('enable row level security') && sql.includes('revoke insert, update, delete') && sql.includes('grant execute on function public.set_deal_source(uuid, text) to authenticated') && !sql.includes('lock_function_search_paths') && !/grant\s+execute[\s\S]{0,120}to\s+anon/i.test(sql) && !/update\s+public\.deal_business_sources[\s\S]{0,120}buyer/i.test(sql), 'the unapplied SQL keeps the staff check, party membership, and no backfill');
ok(sql.indexOf('coalesce(deal_demo, false) is distinct from private.viewer_is_demo()') > 0 && sql.indexOf('coalesce(deal_demo, false) is distinct from private.viewer_is_demo()') < sql.indexOf("if v = ''"), 'the order demo flag is checked before clear and every later branch');
ok(back.includes("code in ('buyer_agent', 'listing_agent', 'lender', 'homeowner')") && !back.includes('choose a person who is on this order') && !back.includes('lock_function_search_paths') && !/delete\s+from\s+public\.deal_business_sources/i.test(back), 'rollback returns the Nov 6 source check and does not delete stored rows');

console.log(fails ? `referral-source-nov7: ${fails} failed` : `referral-source-nov7: ${pass} passed`);
if (fails) process.exit(1);
