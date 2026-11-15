/* The Qualia scenario (John, Nov 15 2026: "make sure the numbers are flowing to each module").
 * Claude entered one purchase on Qualia's test file and wrote down where every figure landed (project note
 * claude/qualia-walkthrough-notes.md, "Data flow test"). The same purchase is entered here the way a processor
 * enters it in the portal: Place Order, Agent fees, Payoffs, Charges, Taxes & Prorations. Every figure has to
 * land where Qualia put it: the fee ledger, the CD summaries K / L / M / N, cash to close, the ALTA and the balance check.
 *
 *   price $100,000 · loan $50,000 · deposit $5,000 · listing commission 1% ($1,000, seller)
 *   payoff $40,000 · buyer fees $2,375 · seller fees $700 · county tax $3,650 a year, settlement July 1 2026
 *   Qualia: cash to close $45,550.00 · others due $44,075.00 · balanced $0.00
 *
 * One known difference, left as it is until it is built: on Qualia's file the deposit was held by the selling agent and
 * sent to the seller, so Qualia also took it off the seller ("Excess Deposit", CD N.01) and showed seller due $51,475.00.
 * The portal has no excess deposit yet, so its seller proceeds are $5,000.00 higher: $56,475.00. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { readAgentFees } from '../js/data/agent-fees.js';
import { computeProration } from '../js/data/prorations.js';
import { partyNames, brokerOf, withStatementParties } from '../js/data/statement-parties.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const row = (S, re) => (S.rows || []).find((r) => re.test(r.label || r.description || ''));

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');

// ---- Place Order ----
const deal = await api.createDeal({ street: '100 Qualia Match Test Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-06-01', closingDate: '2026-07-01',
  purchasePrice: '100,000', loanAmount: '50,000', emdAmount: '5,000', emdHeldBy: 'Selling agent brokerage', lenderName: 'Test Lender Bank' });
ok(deal.purchasePrice === 100000 && deal.loanAmount === 50000 && deal.emdAmount === 5000 && deal.closingDate === '2026-07-01', 'Place Order keeps the price, loan, deposit and settlement date');

// ---- Agent fees: 1% of the price to the listing agent, paid by the seller ----
const listing = readAgentFees({ commissionBasis: 'percent', commissionPercent: '1' }, { side: 'listing', price: deal.purchasePrice });
ok(listing.commission.amount === 1000 && listing.commission.payer === 'seller', 'a 1% listing commission is $1,000.00 from the sale price, paid by the seller');
await api.saveAgentFees(deal.id, 'listing', listing, '');

// ---- Payoffs ----
await api.savePayoff(deal.id, { position: 1, lender: { name: 'Wells Fargo Bank, N.A (TEST)' }, principal: '40000' });

// ---- Charges ----
await api.addAccountingFee(deal.id, { kind: 'charge', description: 'Title - Settlement Fee', altaSection: 'title', cdSection: 'C', cdLine: '01', amount: '2375', paidBy: 'buyer' });
await api.addAccountingFee(deal.id, { kind: 'charge', description: 'State transfer tax', altaSection: 'government', cdSection: 'E', cdLine: '02', amount: '700', paidBy: 'seller' });

// ---- before the proration (this is what TEST showed on Nov 15 2026, file MD-26-97379) ----
let acc = await api.getAccounting(deal.id);
ok(acc.closingDate === '2026-07-01', 'Accounting carries the settlement date, so Taxes & Prorations can calculate');
ok(acc.totals.dueFromBuyer === 47375 && acc.totals.dueToSeller === 58300 && acc.totals.balanced === true, 'before the proration: buyer due $47,375.00, seller proceeds $58,300.00, balanced');

// ---- Taxes & Prorations: county tax, 360-day year, the seller owes the buyer January 1 to the settlement date ----
const proration = { item: 'countyTaxes', cycle: 'annual', cycleAmount: '3650', periodStart: '2026-01-01', basis: '360', status: 'unpaid', debitedTo: 'buyer', perDiemDp: 4, tab: 'county', prorateUsing: 'perDiem', daysPerYear: '360', name: 'County Taxes' };
const calc = computeProration(proration, acc.closingDate);
ok(calc.amount === 1825 && calc.from === 'seller' && calc.to === 'buyer', 'six months of a $3,650.00 tax bill is $1,825.00, seller owes buyer (Qualia: $1,825.00)');
await api.addAccountingFee(deal.id, { kind: 'credit', altaSection: 'prorations', cdSection: '', description: 'County Taxes', proration, presetKey: 'qtab:county', note: '' });

// ---- the ledger and the balance check ----
acc = await api.getAccounting(deal.id);
const T = acc.totals;
ok(T.dueFromBuyer === 45550, 'buyer / borrower due at closing is $45,550.00 (Qualia "borrower owes": $45,550.00)');
ok(T.dueToSeller === 56475, 'seller proceeds are $56,475.00 (Qualia $51,475.00 plus the $5,000.00 excess deposit the portal does not have yet)');
ok(T.balanced === true && T.receipts === T.disbursements && T.issues.length === 0, 'the file balances: funds in equal funds out (Qualia "balanced": $0.00)');

// ---- the Closing Disclosure summaries ----
const X = await api.getAccountingCd(deal.id); const cd = X.cd; const S = cd.summaries;
ok(cd.J.borrower === 2375 && cd.J.sellerAt === 1700, 'closing costs (J) are $2,375.00 borrower and $1,700.00 seller, the commission included');
ok(row(S.K, /^Sale Price of Property/).amount === 100000 && row(S.K, /Closing Costs Paid at Closing/).amount === 2375, 'K: sale price $100,000.00 and closing costs $2,375.00');
ok(row(S.L, /^Deposit/).amount === 5000 && row(S.L, /^Loan Amount/).amount === 50000 && row(S.L, /County Taxes/).amount === 1825, 'L: deposit $5,000.00, loan $50,000.00 and the county tax adjustment $1,825.00');
ok(row(S.M, /^Sale Price of Property/).amount === 100000, 'M: sale price $100,000.00');
ok(row(S.N, /Closing Costs Paid at Closing/).amount === 1700 && row(S.N, /Payoff/).amount === 40000 && row(S.N, /County Taxes/).amount === 1825, 'N: closing costs $1,700.00, payoff $40,000.00 and the county tax adjustment $1,825.00');
ok(cd.cashToClose === 45550, 'cash to close is $45,550.00 (Qualia: $45,550.00)');

// ---- what goes out to everyone but the buyer and seller (Qualia "others due": $44,075.00) ----
const others = acc.entries.filter((e) => e.kind === 'charge' && !e.retired).reduce((n, e) => n + Math.round(e.amount * 100), 0) / 100;
ok(others === 44075, 'the charges paid out to others add up to $44,075.00: commission, payoff, settlement fee and transfer tax');

// ---- the ALTA statement carries the same figures ----
const alta = await api.getAltaStatement(deal.id, 'combined'); const flat = JSON.stringify(alta);
ok(flat.includes('Wells Fargo Bank, N.A (TEST)') || /Payoff/.test(flat), 'the payoff is on the ALTA statement');

// ---- names on the statements ----
const people = [
  { role: 'Client-Buyer', contact: { firstName: 'Testy', lastName: 'Buyerman' } },
  { role: 'Client-Seller', contact: { firstName: 'Sally', lastName: 'Sellerton' } },
  { role: 'Client-Seller', contact: { firstName: '', lastName: '' }, entity: { name: 'Sellerton Family Trust' } },
  { role: 'Listing Agent', contact: { firstName: 'Lisa', lastName: 'Listing', company: 'Test Listing Realty' } },
  { role: 'Buyer Agent', contact: { firstName: 'Bo', lastName: 'Buyeragent', company: '' } },
];
ok(partyNames(people, 'Client-Buyer') === 'Testy Buyerman' && partyNames(people, 'Client-Seller') === 'Sally Sellerton, Sellerton Family Trust', 'a typed buyer or seller and an entity seller are named on the statements');
ok(partyNames([], 'Client-Buyer') === '' && partyNames(null, 'Client-Seller') === '', 'no people on the file is a blank, not an error');
const la = brokerOf(people, 'Listing Agent'); const ba = brokerOf(people, 'Buyer Agent');
ok(la.name === 'Test Listing Realty' && la.contact === 'Lisa Listing' && ba.name === 'Bo Buyeragent' && ba.contact === '', 'the CD names the brokerage and the agent; an agent with no brokerage is the name');
// the light file header has no people: the statements read them once, and a failed read leaves the names blank
let reads = 0;
const shell = { id: 'd1', fileNumber: 'MD-26-1', participants: [] };
const filled = await withStatementParties({ readDeal: async () => { reads++; return { id: 'd1', participants: people }; } }, shell);
ok(reads === 1 && filled.participants.length === 5 && filled.fileNumber === 'MD-26-1' && shell.participants.length === 0, 'the file header with no people gets them from one read, and the header itself is left alone');
const already = await withStatementParties({ readDeal: async () => { reads++; return {}; } }, { id: 'd1', participants: people });
ok(reads === 1 && already.participants === people, 'a file that already has its people is not read again');
const broken = await withStatementParties({ readDeal: async () => { throw new Error('offline'); } }, shell);
ok(broken === shell, 'a failed read leaves the statement names blank and the page still opens');

// ---- the hosted portal sends the settlement date too (it was missing on TEST, so no proration could be added there) ----
const hosted = readFileSync(new URL('../js/data/supabase-accounting.js', import.meta.url), 'utf8');
const getAcc = hosted.slice(hosted.indexOf('async getAccounting('), hosted.indexOf('async listAccountingPresets('));
ok(/closingDate: d\.closingDate/.test(getAcc), 'the hosted Accounting read returns the settlement date, the same as the demo portal');
const page = readFileSync(new URL('../js/pages/dealaccounting.js', import.meta.url), 'utf8');
ok(page.includes("if (view === 'alta' || view === 'cd') deal = await withStatementParties(api, deal);"), 'the ALTA and CD tabs load the people on the file before they print names');

console.log(fail ? fail + ' failed' : 'qualia scenario passed');
process.exit(fail ? 1 : 0);
