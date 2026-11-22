/* The Loan page (John, Nov 19 2026). On TEST the Closing Disclosure's page 1 showed dashes for loan term, product, loan type and interest rate:
 * the only place to type them was the long "CD details & escrow" form under CLA tools, and the menu's "Loan" opened Title's loan check instead.
 * General > Loan now shows the loan boxes. They are the same saved values the Closing Disclosure reads, and saving them keeps everything else
 * already saved on CD details. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { LOAN_PAGE_GROUPS, LOAN_PAGE_KEYS, loanPageInput, CD_DETAIL_GROUPS } from '../js/data/cd-pages.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- the page's boxes are real Closing Disclosure fields, each one once ----
const all = new Set(CD_DETAIL_GROUPS.flatMap(([, , fields]) => fields.map((f) => f[0])));
ok(LOAN_PAGE_KEYS.every((k) => all.has(k)) && new Set(LOAN_PAGE_KEYS).size === LOAN_PAGE_KEYS.length && LOAN_PAGE_GROUPS.length === 3, 'every box on the Loan page is a Closing Disclosure field, listed once');
ok(['loan.term', 'loan.product', 'loan.type', 'loan.id', 'loan.rate', 'loan.monthlyPI'].every((k) => LOAN_PAGE_KEYS.includes(k)), 'loan term, product, loan type, loan ID, interest rate and monthly payment are on the page');

// ---- saving the page keeps what CD details already holds ----
const merged = loanPageInput({ 'pp1.pi': 1500, 'loan.term': '15 years', 'esc.cushion': '2' }, { 'loan.term': '30 years', 'loan.rate': '6.5', 'pp1.pi': '9', junk: 'x' });
ok(merged['loan.term'] === '30 years' && merged['loan.rate'] === '6.5' && merged['pp1.pi'] === 1500 && merged['esc.cushion'] === '2' && !('junk' in merged), 'a Loan page save changes only the loan boxes; projected payments and escrow entries stay');
ok(loanPageInput(null, { 'loan.term': '' })['loan.term'] === '' && Object.keys(loanPageInput(undefined, {})).length === 0, 'an emptied box clears that one value; nothing saved yet is fine');

// ---- through the portal: Loan page -> Closing Disclosure page 1 ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '12 Loan Page Test Way', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-06-01', closingDate: '2026-07-01', purchasePrice: '400,000', loanAmount: '320,000', lenderName: 'Test Lender Bank' });
let X = await api.getAccountingCd(deal.id);
ok(X.pages.page1.loanTerm === '' && X.pages.page1.product === '' && X.pages.page1.loanType === '', 'a new file has no loan details: the Closing Disclosure shows dashes');
await api.saveAccountingCd(deal.id, { 'pp1.years': '1-30', 'pp1.pi': '2022.62', 'esc.cushion': '2' });   // someone filled Projected Payments on CD details first
X = await api.getAccountingCd(deal.id);
await api.saveAccountingCd(deal.id, loanPageInput(X.details, { 'loan.id': 'TEST-320-01', 'loan.type': 'Conventional', 'loan.purpose': 'Purchase', 'loan.product': 'Fixed Rate', 'loan.term': '30 years', 'loan.mic': '',
  'loan.rate': '6.5', 'loan.monthlyPI': '2,022.62', 'loan.amountCanIncrease': 'no', 'loan.rateCanIncrease': 'no', 'loan.piCanIncrease': 'no', 'loan.prepaymentPenalty': 'no', 'loan.prepaymentMax': '', 'loan.balloon': 'no', 'loan.balloonAmount': '' }));
X = await api.getAccountingCd(deal.id); const p1 = X.pages.page1;
ok(p1.loanTerm === '30 years' && p1.product === 'Fixed Rate' && p1.loanType === 'Conventional' && p1.loanId === 'TEST-320-01' && p1.purpose === 'Purchase', 'Closing Disclosure page 1 prints the loan term, product, loan type, loan ID and purpose from the Loan page');
ok(JSON.stringify(p1).includes('6.5') && JSON.stringify(p1).includes('2022.62'), 'the interest rate and the monthly payment reach page 1 too');
ok(X.details['pp1.years'] === '1-30' && X.details['pp1.pi'] === 2022.62 && X.details['esc.cushion'] === '2', 'the Projected Payments and escrow entries typed on CD details are still there');
let msg = ''; try { await api.saveAccountingCd(deal.id, loanPageInput(X.details, { 'loan.rate': 'six' })); } catch (e) { msg = e.message; }
ok(/Interest rate/.test(msg) && (await api.getAccountingCd(deal.id)).details['loan.rate'] === 6.5, 'a rate that is not a number is refused in plain words and the saved rate stays');
await api.saveAccountingCd(deal.id, loanPageInput((await api.getAccountingCd(deal.id)).details, { 'loan.product': '' }));
ok((await api.getAccountingCd(deal.id)).pages.page1.product === '' && (await api.getAccountingCd(deal.id)).pages.page1.loanTerm === '30 years', 'clearing one box clears only that one');

// ---- the page and the menu ----
const page = read('../js/pages/dealaccounting-cd.js'); const acct = read('../js/pages/dealaccounting.js'); const side = read('../js/file-sidebar.js');
ok(page.includes('export async function loanView(') && page.includes('loanPageInput(now.details, typed)') && page.includes('data-loan-amount') && page.includes('data-loan-lender'), 'the Loan page shows the order loan amount and lender, and saves through the same CD details record after reading it again');
ok(acct.includes("['loan', 'Loan']") && acct.includes("else if (view === 'loan') v = await loanView(api, deal);"), 'Accounting opens the Loan page at v=loan');
ok(side.includes("go(`${acct}?v=loan`, 'Loan', onView('loan'), ' data-nav-loan'") && !side.includes('/title?v=loan'), 'General > Loan in the file menu opens the Loan page, not the Title loan check');
ok(read('../js/data/title.js').includes("['loan', 'Loan check']"), 'the Title tab still has its Loan check step');
ok(page.includes('data-goto-loan'), 'the Closing Disclosure tells staff the loan details are entered on Loan');

console.log(fail ? fail + ' failed' : 'loan page passed');
process.exit(fail ? 1 : 0);
