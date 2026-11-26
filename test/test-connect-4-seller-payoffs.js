/* CONNECT-4 (John, Nov 25 2026; Connect Live Test row 7.2): the seller's Outstanding Mortgage answers land on the order's Payoffs
 * page and the processor adds each one as a payoff tab with one click. Fake data only. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { mortgagesFromAnswers, sellerMortgages, matchingPayoff, freePositions, payoffRows, payoffInputFor } from '../js/data/seller-payoffs.js';
import { cleanPayoff } from '../js/data/payoffs.js';
import { loadSellerMortgages, sellerMortgagesCard } from '../js/pages/dealpayoffs.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const v2 = { mortgages: JSON.stringify([{ lender: 'Bank of Example', phone: '301-555-0110', loan_number: '987456123', loan_type: 'HELOC' }, { lender: '', phone: '', loan_number: '', loan_type: '' }]) };
const v1 = { lender_name: 'Old Lender', lender_phone: '301-555-0111', loan_last4: '4321', loan_type: 'First mortgage' };
ok(mortgagesFromAnswers(v2).length === 1 && mortgagesFromAnswers(v2)[0].loanNumber === '987456123', 'v2 list answers are read and blank rows dropped');
ok(mortgagesFromAnswers(v1)[0].lender === 'Old Lender' && mortgagesFromAnswers(v1)[0].loanNumber === '4321', 'v1 single-mortgage answers are read');
ok(mortgagesFromAnswers({ none: true, ...v2 }).length === 0, '"No mortgage on this property" lists nothing');
ok(mortgagesFromAnswers({ mortgages: 'not json' }).length === 0, 'unreadable answers list nothing');
ok(mortgagesFromAnswers({ mortgages: [{ lender: 'X', last4: '9999' }] })[0].loanNumber === '9999', 'older last4 answers are kept as the loan number');

const both = sellerMortgages([{ task: { id: 't1' }, answers: v2, sellerName: 'Sam Seller' }, { task: { id: 't2' }, answers: { mortgages: JSON.stringify([{ lender: 'Bank Of Example', loan_number: '987-456-123' }]) }, sellerName: 'Pat Seller' }]);
ok(both.length === 1 && both[0].sellerName === 'Sam Seller', 'the same loan entered by two sellers is listed once');

const payoffs = [{ position: 1, lender: { name: 'Other Bank' }, loanNumber: '111' }, { position: 2, lender: { name: 'Bank of Example' }, loanNumber: '987456123' }, { position: 3, lender: { name: 'Gone' }, loanNumber: '', retired: true }];
ok(matchingPayoff(both[0], payoffs).position === 2, 'a mortgage already on a payoff tab is matched by loan number');
ok(matchingPayoff({ lender: 'Other Bank', loanNumber: '222' }, payoffs) === null, 'the same lender with a different loan number is a separate payoff');
ok(matchingPayoff({ lender: 'other bank', loanNumber: '' }, payoffs).position === 1, 'with no loan number from the seller, the same lender name counts as already on Payoffs');
ok(matchingPayoff({ lender: 'gone', loanNumber: '' }, payoffs) === null, 'a retired payoff is not a match');
ok(freePositions(payoffs).join(',') === '3,4', 'retired tabs are free again');
ok(payoffRows(both, payoffs)[0].onTab === 'Second Payoff', 'the row says which tab it is on');

const input = payoffInputFor({ lender: 'Bank of Example', phone: '301-555-0110', loanNumber: '987456123', loanType: 'HELOC', sellerName: 'Sam Seller' }, 3);
const clean = cleanPayoff(input);
ok(clean.position === 3 && clean.lender.name === 'Bank of Example' && clean.lender.phone === '301-555-0110' && clean.loanNumber === '987456123' && clean.isMortgage === true, 'the payoff input passes the existing payoff rules with lender, phone and loan number');
ok(clean.principal == null && clean.interest == null, 'amounts are left for the payoff statement');
ok(/Outstanding Mortgage Information task \(HELOC, entered by Sam Seller\)/.test(clean.note), 'the note says where it came from');
let threw = ''; try { payoffInputFor({ lender: 'X' }, 5); } catch (e) { threw = e.message; }
ok(threw.includes('Retire one'), 'a fifth payoff is refused in plain words');

// page
let reads = 0;
const api = {
  listTasks: async () => [{ id: 't1', participantId: 'pS', templateCode: 'mortgage_info', status: 'done', savedAt: '2026-11-25T20:00:00Z' }, { id: 't9', participantId: 'pS', templateCode: 'mortgage_info', status: 'cancelled', savedAt: 'x' }, { id: 't3', participantId: 'pB', templateCode: 'personal_info', status: 'done', savedAt: 'x' }],
  getTask: async (id) => { reads++; return { id, formData: v2 }; },
};
const deal = { id: 'd1', participants: [{ id: 'pS', role: 'Client-Seller', contact: { firstName: 'Sam', lastName: 'Seller' } }] };
const list = await loadSellerMortgages(api, deal);
ok(list.length === 1 && reads === 1 && list[0].sellerName === 'Sam Seller', 'only the saved Outstanding Mortgage copy is read');
ok((await loadSellerMortgages({ ...api, listTasks: async () => { throw new Error('x'); } }, deal)).length === 0, 'a failed task read shows nothing and the worksheet still works');
ok((await loadSellerMortgages({ ...api, getTask: async () => ({ formHidden: true }) }, deal)).length === 0, 'answers the viewer may not see are not shown');
const html1 = toText(sellerMortgagesCard(list, { payoffs: [] }, true));
ok(html1.includes("From the seller's Outstanding Mortgage task") && html1.includes('Bank of Example') && html1.includes('data-po-seller-add=') && html1.includes('Add as First Payoff'), 'a processor sees the mortgage and Add as First Payoff');
const html2 = toText(sellerMortgagesCard(list, { payoffs: [{ position: 2, lender: { name: 'Bank of Example' }, loanNumber: '987456123' }] }, true));
ok(html2.includes('On Second Payoff') && !html2.includes('data-po-seller-add='), 'a mortgage already on Payoffs links to its tab, with no add button');
const html3 = toText(sellerMortgagesCard(list, { payoffs: [] }, false));
ok(html3.includes('Not on Payoffs yet') && !html3.includes('data-po-seller-add='), 'read-only roles see it without buttons');
ok(sellerMortgagesCard([], { payoffs: [] }, true) === '', 'no seller mortgages: no card');

const src = readFileSync('js/pages/dealpayoffs.js', 'utf8');
ok(src.includes('api.savePayoff(deal.id, payoffInputFor('), 'adding uses the existing payoff save (same rules, same log)');

console.log(fail ? fail + ' failed' : 'connect-4 seller payoffs passed');
if (fail) process.exit(1);
