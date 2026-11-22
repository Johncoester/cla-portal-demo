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
 * PRORATE-1 (Caroline Kim, Nov 16 2026): a new Maryland file also gets a $400 seller water escrow.
 * That line was not on Qualia's comparison file. Buyer cash to close stays $45,550.00.
 * Seller proceeds and "paid out to others" each move by $400. The county-tax line is still Qualia's $1,825.00.
 *
 *
 * Excess deposit (built Nov 15 2026): on Qualia's file the deposit was held by the selling agent and sent to the seller, so Qualia
 * took it off the seller ("Excess Deposit", CD N.01) and showed seller due $51,475.00. The last part of this test enters the same
 * thing on Contract figures, Earnest money ("Deposit already paid to the seller"). With the $400 water escrow the portal shows $51,075.00. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { readAgentFees } from '../js/data/agent-fees.js';
import { computeProration } from '../js/data/prorations.js';
import { partyNames, brokerOf, withStatementParties } from '../js/data/statement-parties.js';
import { readEarnest, excessDepositOf, earnestDealPatch, EXCESS_OVER_DEPOSIT } from '../js/data/earnest-commission.js';
import { summaryScreens } from '../js/data/qualia-charges.js';

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
ok(acc.entries.some((e) => e.presetKey === 'waterEscrow' && e.amount === 400 && e.paidBy === 'seller'), 'a new Maryland file starts with a $400.00 seller water escrow');
ok(acc.totals.dueFromBuyer === 47375 && acc.totals.dueToSeller === 57900 && acc.totals.balanced === true, 'before the proration: buyer due $47,375.00, seller proceeds $57,900.00 ($58,300.00 minus the $400.00 water escrow), balanced');

// ---- Taxes & Prorations: county tax, 360-day year, the seller owes the buyer January 1 to the settlement date ----
const proration = { item: 'countyTaxes', cycle: 'annual', cycleAmount: '3650', periodStart: '2026-01-01', basis: '360', status: 'unpaid', debitedTo: 'buyer', perDiemDp: 4, tab: 'county', prorateUsing: 'perDiem', daysPerYear: '360', name: 'County Taxes' };
const calc = computeProration(proration, acc.closingDate);
ok(calc.amount === 1825 && calc.from === 'seller' && calc.to === 'buyer', 'six months of a $3,650.00 tax bill is $1,825.00, seller owes buyer (Qualia: $1,825.00)');
await api.addAccountingFee(deal.id, { kind: 'credit', altaSection: 'prorations', cdSection: '', description: 'County Taxes', proration, presetKey: 'qtab:county', note: '' });

// ---- the ledger and the balance check ----
acc = await api.getAccounting(deal.id);
const T = acc.totals;
ok(T.dueFromBuyer === 45550, 'buyer / borrower due at closing is $45,550.00 (Qualia "borrower owes": $45,550.00)');
ok(T.dueToSeller === 56075, 'seller proceeds are $56,075.00 while CLA holds the deposit (Qualia $56,475.00, minus the $400.00 water escrow)');
ok(T.balanced === true && T.receipts === T.disbursements && T.issues.length === 0, 'the file balances: funds in equal funds out (Qualia "balanced": $0.00)');

// ---- the Closing Disclosure summaries ----
const X = await api.getAccountingCd(deal.id); const cd = X.cd; const S = cd.summaries;
ok(cd.J.borrower === 2375 && cd.J.sellerAt === 2100, 'closing costs (J) are $2,375.00 borrower and $2,100.00 seller (Qualia $1,700.00 plus the $400.00 water escrow)');
ok(row(S.K, /^Sale Price of Property/).amount === 100000 && row(S.K, /Closing Costs Paid at Closing/).amount === 2375, 'K: sale price $100,000.00 and closing costs $2,375.00');
ok(row(S.L, /^Deposit/).amount === 5000 && row(S.L, /^Loan Amount/).amount === 50000 && row(S.L, /County Taxes/).amount === 1825, 'L: deposit $5,000.00, loan $50,000.00 and the county tax adjustment $1,825.00');
ok(row(S.M, /^Sale Price of Property/).amount === 100000, 'M: sale price $100,000.00');
ok(row(S.N, /Closing Costs Paid at Closing/).amount === 2100 && row(S.N, /Payoff/).amount === 40000 && row(S.N, /County Taxes/).amount === 1825, 'N: closing costs $2,100.00, payoff $40,000.00 and the county tax adjustment $1,825.00');
ok(cd.cashToClose === 45550, 'cash to close is $45,550.00 (Qualia: $45,550.00)');

// ---- what goes out to everyone but the buyer and seller (Qualia "others due": $44,075.00) ----
const others = acc.entries.filter((e) => e.kind === 'charge' && !e.retired).reduce((n, e) => n + Math.round(e.amount * 100), 0) / 100;
ok(others === 44475, 'the charges paid out to others add up to $44,475.00: Qualia\'s $44,075.00 plus the $400.00 water escrow');

// ---- the ALTA statement carries the same figures ----
const alta = await api.getAltaStatement(deal.id, 'combined'); const flat = JSON.stringify(alta);
ok(flat.includes('Wells Fargo Bank, N.A (TEST)') || /Payoff/.test(flat), 'the payoff is on the ALTA statement');

// ---- Excess deposit: the selling agent held the $5,000.00 deposit and already paid it to the seller (Qualia: Earnest & Commissions, "excess earnest") ----
const throws = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
ok(readEarnest({ emdToSeller: '5,000.00' }).emdToSeller === 5000 && readEarnest({ emdToSeller: '' }).emdToSeller === null && readEarnest({}).emdToSeller === null, 'the deposit paid to the seller is read as dollars; empty means none');
ok(throws(() => readEarnest({ emdToSeller: '6000' }, { emdAmount: 5000 })) === EXCESS_OVER_DEPOSIT && /dollar amount/.test(throws(() => readEarnest({ emdToSeller: 'abc' }))) && /refinance/i.test(throws(() => readEarnest({ emdToSeller: '100' }, { refinance: true }))), 'more than the deposit, a non-number, and a refinance are all refused with a plain message');
ok(JSON.stringify(earnestDealPatch({ emdHeldBy: 'Agent', emdToSeller: '250' }).financial) === '{"emdHeldBy":"Agent","emdToSeller":250}' && excessDepositOf({ financial: { emdToSeller: 250 } }) === 250 && excessDepositOf({ transactionType: 'Refinance', financial: { emdToSeller: 250 } }) === null && excessDepositOf({}) === null, 'it is kept with EMD held by on the order; a refinance or an empty order has none');
let refused = ''; try { await api.updateDeal(deal.id, { emdToSeller: '5000.01' }); } catch (e) { refused = e.message; }
ok(refused === EXCESS_OVER_DEPOSIT && excessDepositOf(await api.getDeal(deal.id)) === null, 'the portal refuses a deposit paid to the seller that is more than the deposit, and saves nothing');
await api.updateDeal(deal.id, { emdAmount: '5000', emdDueDate: '', emdHeldBy: 'Selling agent brokerage', emdToSeller: '5000' });   // what the Earnest money card sends
await api.updateDeal(deal.id, { emdHeldBy: 'Selling agent brokerage' });   // Edit order details sends EMD held by alone: the excess deposit stays
ok(excessDepositOf(await api.getDeal(deal.id)) === 5000, 'the deposit paid to the seller is saved on the order and survives an Edit order details save');
acc = await api.getAccounting(deal.id); const TX = acc.totals;
const ex = acc.entries.find((e) => e.autoKey === 'excessDeposit');
ok(ex && ex.auto === true && ex.amount === 5000 && ex.description === 'Excess Deposit', 'the fee ledger shows an Excess Deposit line read from the order, not typed');
ok(TX.dueFromBuyer === 45550, 'the buyer still owes $45,550.00: the whole deposit is still credited to the buyer');
ok(TX.dueToSeller === 51075, 'seller proceeds are $51,075.00 (Qualia "seller due" $51,475.00, minus the $400.00 water escrow)');
ok(TX.balanced === true && TX.issues.length === 0 && TX.receipts === 95550 && TX.disbursements === 95550, 'the file still balances: CLA takes in and pays out $95,550.00, because the $5,000.00 deposit never reaches CLA');
const XX = await api.getAccountingCd(deal.id); const SN = XX.cd.summaries.N; const SLx = XX.cd.summaries.L;
ok(SN.rows[0].label === 'Excess Deposit' && SN.rows[0].amount === 5000 && /Closing Costs Paid at Closing/.test(SN.rows[1].label), 'CD section N starts with Excess Deposit $5,000.00, then the closing costs (Qualia N.01 and N.02)');
ok(row(SLx, /^Deposit/).amount === 5000 && XX.cd.cashToClose === 45550 && XX.cd.cashToSeller === 51075, 'CD: L.01 Deposit stays $5,000.00, cash to close $45,550.00, cash to seller $51,075.00');
const scr = summaryScreens(deal, XX.cd, acc.entries); const n01 = scr.N.find((r) => r.line === '01'); const n02 = scr.N.find((r) => r.line === '02');
ok(n01.amount === 5000 && n01.auto === true && n02.amount === 2100 && scr.totals.N === 48925, 'the Charges page shows N.01 Excess Deposit $5,000.00 and N.02 closing costs $2,100.00; section N totals $48,925.00');
const altaX = await api.getAltaStatement(deal.id, 'combined'); const exRow = altaX.sections.flatMap((x) => x.rows).find((r) => r.description === 'Excess Deposit');
ok(exRow && exRow.sellerDebit === 5000 && !exRow.buyerDebit && !exRow.buyerCredit && !exRow.sellerCredit && /already paid to the seller/.test(exRow.memo) && altaX.due.toSeller === 51075, 'the ALTA statement charges the seller $5,000.00 for the Excess Deposit and shows $51,075.00 due to the seller');
await api.updateDeal(deal.id, { emdAmount: '4000' });   // the deposit is lowered somewhere else: the file says so instead of balancing on a wrong number
ok((await api.getAccounting(deal.id)).totals.issues.some((m) => /more than the deposit/.test(m)), 'a deposit lowered below the part paid to the seller is flagged on the balance check');
await api.updateDeal(deal.id, { emdAmount: '5000', emdToSeller: '' });
const cleared = await api.getAccounting(deal.id);
ok(excessDepositOf(await api.getDeal(deal.id)) === null && cleared.totals.dueToSeller === 56075 && !cleared.entries.some((e) => e.autoKey === 'excessDeposit'), 'clearing it puts the seller proceeds back to $56,075.00');
await api.updateDeal(deal.id, { emdToSeller: '5000' });

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
ok(/zip,financial'\)/.test(hosted) && /financial: d\.financial/.test(hosted), 'the hosted Accounting read carries the order earnest data, so the Excess Deposit reaches the ledger, ALTA and CD on TEST');
const hostedDeals = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(hostedDeals.includes("earnestDealPatch({ emdToSeller: kept.emdToSeller, ...patch }"), 'a hosted order save keeps the deposit paid to the seller unless that save changes it');
const page = readFileSync(new URL('../js/pages/dealaccounting.js', import.meta.url), 'utf8');
ok(page.includes("if (view === 'alta' || view === 'cd') deal = await withStatementParties(api, deal);"), 'the ALTA and CD tabs load the people on the file before they print names');

console.log(fail ? fail + ' failed' : 'qualia scenario passed');
process.exit(fail ? 1 : 0);
