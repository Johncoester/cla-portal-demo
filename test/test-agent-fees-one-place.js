/* Agent fees follow-ups (John, Nov 13 2026; assigned to Claude): one place for commissions.
 * Place Order takes each agent side's commission (% or $, in step with the purchase price) and admin fee and saves them as Agent fees;
 * the other forms point to the Agent fees box; the agent's "Confirm Your Transaction Information" task no longer asks for fees.
 * Fake data only. No hosted project. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { placeOrderFeesHtml, mountPlaceOrderFees, readPlaceOrderFees, agentFeesPointer, agentFeesSummaryHtml } from '../js/pages/agent-fees-box.js';
import { validateAgentAnswers, agentTaskDef } from '../js/data/agent-portal.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const msg = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

// ---- Place Order fields ----
document.body.innerHTML = `<form id="f"><input name="purchasePrice" value="400,000">${toText(placeOrderFeesHtml())}</form>`;
const form = document.getElementById('f');
let price = 400000;
mountPlaceOrderFees(form, () => price);
const el = (n) => form.querySelector(`[name="${n}"]`);
const type = (n, v) => { el(n).value = v; el(n).dispatchEvent(new window.Event('input', { bubbles: true })); };
const pick = (n, v) => { [...el(n).options].forEach((o) => { if (o.value === v) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); el(n).dispatchEvent(new window.Event('change', { bubbles: true })); };
ok(['listing', 'buyer'].every((k) => el(`af.${k}.percent`) && el(`af.${k}.amount`) && el(`af.${k}.admin`) && el(`af.${k}.payer`) && el(`af.${k}.splitBuyer`) && el(`af.${k}.splitSeller`)), 'each agent side has commission %, commission $, Commission Paid By, and the two split shares');
ok(el('af.listing.payer').value === 'seller' && el('af.buyer.payer').value === 'buyer', 'Listing agent starts as Seller and the buyer\'s agent (selling agent) starts as Buyer');
ok([...el('af.listing.payer').options].map((o) => o.textContent).join(',') === 'Buyer,Seller,Split', 'Commission Paid By is Buyer, Seller, or Split');
ok(el('af.listing.splitBuyer').closest('label').hidden && el('af.buyer.splitSeller').closest('label').hidden, 'the split shares stay hidden until Split is chosen');
type('af.listing.percent', '3');
ok(el('af.listing.amount').value === '12000.00', 'typing 3% fills in $12,000.00 from the purchase price');
type('af.buyer.amount', '8,000');
ok(el('af.buyer.percent').value === '2', 'typing $8,000 fills in 2%');
type('af.buyer.admin', '395');
price = 500000; type('purchasePrice', '500,000');
ok(el('af.listing.amount').value === '15000.00' && el('af.buyer.percent').value === '1.6', 'changing the purchase price keeps each side in step with what was typed');
const fees = readPlaceOrderFees(form, 500000);
ok(fees.listing.commission.basis === 'percent' && fees.listing.commission.amount === 15000 && fees.listing.commission.payer === 'seller' && fees.listing.admin == null, 'listing side: 3% of $500,000, paid by Seller');
ok(fees.buyer.commission.basis === 'amount' && fees.buyer.commission.amount === 8000 && fees.buyer.commission.payer === 'buyer' && fees.buyer.admin.amount === 395 && fees.buyer.admin.payer === 'buyer', "buyer's agent side: $8,000 paid by Buyer, and a $395 admin fee the buyer pays");
// a restored draft: only the $ box has a figure and the basis says percent
el('af.listing.percent').value = ''; el('af.listing.amount').value = '9000'; el('af.listing.basis').value = 'percent';
ok(readPlaceOrderFees(form, 500000).listing.commission.amount === 9000, 'a restored draft with only the $ filled in still saves the $');
ok(msg(() => readPlaceOrderFees(form, null)) === 'Listing agent: Add the sales price before entering a commission, so the % and $ stay in step.', 'no purchase price: a plain message names the side');
el('af.listing.amount').value = 'abc';
ok(msg(() => readPlaceOrderFees(form, 500000)) === 'Listing agent: Commission $ must be a number.', 'a bad amount is refused before the order is placed');
['listing', 'buyer'].forEach((k) => ['percent', 'amount', 'admin', 'splitBuyer', 'splitSeller'].forEach((f) => { el(`af.${k}.${f}`).value = ''; }));
pick('af.listing.payer', 'seller'); pick('af.buyer.payer', 'buyer');
const none = readPlaceOrderFees(form, 500000);
ok(none.listing === null && none.buyer === null, 'blank boxes save no agent fees');
pick('af.listing.payer', 'split');
ok(!el('af.listing.splitBuyer').closest('label').hidden && !el('af.listing.splitSeller').closest('label').hidden, 'choosing Split shows the buyer share and the seller share');
ok(msg(() => readPlaceOrderFees(form, 500000)) === 'Listing agent: Enter the commission % or the commission $ before choosing who pays it.', 'Split with no commission says to enter the commission first');
el('af.listing.percent').value = '3'; el('af.listing.basis').value = 'percent';
ok(/add up to the commission amount/.test(msg(() => readPlaceOrderFees(form, 500000))), 'Split with a blank share is refused');
ok(el('af.listing.percent').value === '3', 'a refused split leaves the commission % on the form');
el('af.listing.splitBuyer').value = '10000'; el('af.listing.splitSeller').value = '5000';
const splitFees = readPlaceOrderFees(form, 500000);
ok(splitFees.listing.commission.payer === 'split' && splitFees.listing.commission.splitBuyer === 10000 && splitFees.listing.commission.splitSeller === 5000 && splitFees.listing.commission.amount === 15000, 'Split keeps the buyer share and the seller share');
el('af.listing.splitBuyer').value = '1';
ok(/add up to the commission amount/.test(msg(() => readPlaceOrderFees(form, 500000))) && el('af.listing.splitBuyer').value === '1', 'shares that do not add up to the commission are refused and stay on the form');
el('af.listing.splitBuyer').value = 'abc';
ok(msg(() => readPlaceOrderFees(form, 500000)) === 'Listing agent: Buyer amount must be a number.', 'a share that is not a number is refused');

// ---- pointer and read-only summary ----
const pointer = toText(agentFeesPointer('link', 'deal-1'));
ok(pointer.includes('href="#/deals/deal-1/tasks"') && pointer.includes('only place') && /task sections on Tasks/.test(pointer) && !/file overview/i.test(pointer), 'the pointer links to Tasks and says Agent fees under the agent task sections is the only place');
const summary = toText(agentFeesSummaryHtml({ sides: { listing: 'edit' }, fees: { listing: { commission: { percent: 3, amount: 12000, payer: 'seller', source: 'staff' }, admin: null, other: [], rows: 1 } } }, 'deal-1'));
ok(summary.includes('$12,000') && !summary.includes('data-af-edit'), 'Accounting shows the fees read only, with no Edit button');

// ---- the agent task no longer asks for fees ----
const answers = { closingDate: '2026-12-01', purchasePrice: '400000', emdAmount: '0', holdingEmd: 'No', licenseId: '', team: [] };
const clean = validateAgentAnswers('agent_transaction_info', answers);
ok(!('commissions' in clean) && !('fees' in clean), 'Confirm Your Transaction Information saves without a commission or fees');
ok(/Agent fees box/.test(agentTaskDef('agent_transaction_info').about), 'the task tells the agent where their fees are');
const taskSrc = readFileSync(new URL('../js/pages/dealagenttask.js', import.meta.url), 'utf8');
ok(taskSrc.includes('data-agent-task-fees') && !taskSrc.includes('data-add-row="commissions"') && !taskSrc.includes('data-add-row="fees"'), 'the task form has no commission or fee rows and points to the Agent fees box');

// ---- a placed order's fees land in Agent fees and Accounting (demo adapter) ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '7 One Place Way', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', purchasePrice: '500000' });
await api.saveAgentFees(deal.id, 'buyer', fees.buyer, '');
const saved = await api.getAgentFees(deal.id);
ok(saved.fees.buyer.commission.amount === 8000 && saved.fees.buyer.admin.amount === 395, 'the Place Order figures are the Agent fees on the file');
const lines = (await api.getAccounting(deal.id)).entries.filter((f) => String(f.presetKey || '').startsWith('agent_fee:buyer:'));
ok(lines.length === 2, 'and both post to the Accounting fee ledger');
const buyerComm = lines.find((f) => f.presetKey.endsWith(':commission:0'));
ok(buyerComm && buyerComm.paidBy === 'buyer' && buyerComm.split.buyer === 8000 && buyerComm.split.seller === 0, 'a buyer-paid commission is the buyer\'s charge');
await api.saveAgentFees(deal.id, 'listing', splitFees.listing, '');
const alta = await api.getAltaStatement(deal.id);
const altaRow = alta.sections.flatMap((s) => s.rows).find((r) => /listing agent/.test(r.description));
ok(altaRow && altaRow.buyerDebit === 10000 && altaRow.sellerDebit === 5000, 'a split commission lands on the buyer and seller columns of the settlement statement');
const cd = await api.getClosingDisclosure(deal.id);
const cdRow = cd.sections.find((s) => s.key === 'H').rows.find((r) => /listing agent/.test(r.description));
ok(cdRow && cdRow.borrowerAt === 10000 && cdRow.sellerAt === 5000, 'the same split lands on the borrower-paid and seller-paid columns of CD section H');
const sellerOnly = (await api.getAccounting(deal.id)).entries.find((f) => f.presetKey === 'agent_fee:buyer:commission:0');
const sellerAlta = (await api.getAltaStatement(deal.id)).sections.flatMap((s) => s.rows).find((r) => /buyer's agent/.test(r.description));
ok(sellerOnly.paidBy === 'buyer' && sellerAlta.buyerDebit === 8000 && sellerAlta.sellerDebit === 0, 'a commission paid by the buyer stays on the buyer side only');

const orderSrc = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
ok(orderSrc.includes('await api.saveAgentFees(deal.id, side, fees') && orderSrc.indexOf('await api.saveAgentFees(deal.id, side, fees') > orderSrc.indexOf('await api.addParticipant(deal.id, contactId, role'),
  'Place Order saves the agent fees after the agents are added, so Accounting names their company');

console.log(fail ? fail + ' failed' : 'agent fees one place passed');
if (fail) process.exit(1);
