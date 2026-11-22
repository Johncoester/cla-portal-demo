/* FF-103: rearrange the file sidebar. No new pages. The second accounting column is not drawn. */
import { readFileSync } from 'node:fs';
import { staffDealNav } from '../js/file-sidebar.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const text = (v) => String(v);
const lbl = (id, label) => label;
const tip = () => '';
const betaTag = () => '';
const link = (tab, label) => `<li class="nav-item"><a class="nav-link" href="#/deals/deal-1/${tab}">${label}</a></li>`;

const processor = staffDealNav({
  dealId: 'deal-1', tab: 'overview', view: '', section: '', focus: '',
  link, lbl, tip, betaTag,
  titleOn: true, policyOn: true, wiresOn: true, fundingOn: true,
  payoffsReach: true, payoffsOn: true, postClosingOn: true, recordingOn: true,
  acctBeta: false, titleBeta: false, payoffsBeta: false, fundingBeta: false, wiresBeta: false, policyBeta: false,
});
const menu = text(processor);
const orderAt = menu.indexOf('data-nav-section="order"');
const closingAt = menu.indexOf('data-nav-section="closing"');
const acctAt = menu.indexOf('data-nav-accounting');
const previewAt = menu.indexOf('data-nav-section="preview"');
ok(orderAt > 0 && closingAt > orderAt && acctAt > closingAt && previewAt > acctAt, 'Order, Closing, Accounting, then Preview');
ok(menu.indexOf('>General<') > orderAt && menu.indexOf('>General<') < closingAt, 'General is inside Order');
ok(menu.indexOf('>Title<') > menu.indexOf('>General<') && menu.indexOf('>Title<') < closingAt, 'Title follows General');
ok(menu.indexOf('>Charges<') > closingAt && menu.indexOf('>Charges<') < acctAt, 'Charges is inside Closing');
ok(menu.includes('data-nav-fold="general"') && menu.includes('data-nav-fold="title"') && menu.includes('data-nav-fold="charges"') && menu.includes('<summary>'), 'General, Title and Charges fold');
ok(!menu.includes('href="#/deals/deal-1/accounting" data-nav-section') && (menu.match(/data-nav-accounting/g) || []).length === 1, 'Accounting is one sidebar item');
ok(!menu.includes('>Ledger<') && !menu.includes('>Receipts<') && !menu.includes('>Disbursements<'), 'Ledger, Receipts and Disbursements are not sidebar rows');
['Basic Info', 'Contacts', 'Loan', 'Earnest &amp; Commissions', 'Taxes &amp; Prorations', 'Payoffs', 'Other Contacts'].forEach((label) => {
  ok(menu.indexOf(label) > menu.indexOf('>General<') && menu.indexOf(label) < menu.indexOf('>Title<'), label + ' sits under General');
});
ok(menu.indexOf('Basic Info') < menu.indexOf('Contacts') && menu.indexOf('Contacts') < menu.indexOf('>Loan<') && menu.indexOf('>Loan<') < menu.indexOf('Earnest') && menu.indexOf('Earnest') < menu.indexOf('Taxes') && menu.indexOf('Taxes') < menu.indexOf('>Payoffs<') && menu.indexOf('>Payoffs<') < menu.indexOf('Other Contacts'), 'General runs in the confirmed order, then the existing Other Contacts page');
['CPL', 'Policy Info &amp; Rates', 'Commitment', 'Final Policy'].forEach((label) => ok(menu.includes(label), label + ' is a Title link'));
ok(menu.indexOf('>CPL<') < menu.indexOf('Policy Info') && menu.indexOf('Policy Info') < menu.indexOf('>Commitment<') && menu.indexOf('>Commitment<') < menu.indexOf('Final Policy'), 'Title runs CPL, Policy Info & Rates, Commitment, Final Policy');
ok(menu.includes('href="#/deals/deal-1/title?v=cpl"') && menu.includes('href="#/deals/deal-1/title?v=policies"') && menu.includes('href="#/deals/deal-1/title?v=schedulea"') && menu.includes('href="#/deals/deal-1/policy"'), 'Title links open the pages that already exist');
ok(menu.includes('A Origination Charges') && menu.includes('B Did Not Shop For') && menu.includes('C Did Shop For') && menu.includes('E Taxes &amp; Fees') && menu.includes('F Prepaids') && menu.includes('G Escrow') && menu.includes('H Other Charges') && menu.includes('J Lender Credits') && menu.includes('K/M Debits/Credits') && menu.includes('L/N Debits/Credits'), 'the existing charge sections stay, in order');
ok(menu.includes('Closing Disclosure') && menu.includes('Settlement Statement') && menu.indexOf('Closing Disclosure') > previewAt, 'Preview lists Closing Disclosure and Settlement Statement');
ok(menu.includes('Scheduling Details') && menu.includes('Agreements') && menu.includes('Activity') && menu.includes('Loan Funding') && menu.includes('Prorations') && menu.includes('CD details'), 'pages that used to sit in the second column or the old file menu are still in the sidebar');
ok(!menu.includes('>Properties<'), 'there is no Properties page, so the menu does not invent one');

const limited = text(staffDealNav({
  dealId: 'deal-1', tab: 'overview', view: '', section: '', focus: '',
  link, lbl, tip, betaTag,
  titleOn: true, policyOn: false, wiresOn: false, fundingOn: false,
  payoffsReach: false, payoffsOn: true, postClosingOn: false, recordingOn: false,
  acctBeta: false, titleBeta: false, payoffsBeta: false, fundingBeta: false, wiresBeta: false, policyBeta: false,
}));
ok(!limited.includes('Payoffs') && !limited.includes('Taxes &amp; Prorations') && !limited.includes('Other Contacts') && !limited.includes('Final Policy') && !limited.includes('Loan Funding'), 'a role that cannot open Payoffs, Final Policy or Loan Funding does not see those links');
ok(limited.includes('Basic Info') && limited.includes('CPL') && limited.includes('A Origination Charges'), 'that role still sees the pages it could already open');

const buyer = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const buyerNav = buyer.slice(buyer.indexOf('const dealNav'), buyer.indexOf(': deal ?'));
ok(buyerNav.includes("link('closing', 'Closing appointment', 'task')") && !buyerNav.includes('data-nav-accounting') && !buyerNav.includes('staffDealNav'), 'a buyer or seller keeps Closing appointment and does not get the file sections');

const page = readFileSync(new URL('../js/pages/dealaccounting.js', import.meta.url), 'utf8');
ok(!page.includes('qcNav(') && page.includes('qc-shell-open') && page.includes('data-acct-books') && page.includes("['ledger', 'Ledger']") && page.includes('data-due-buyer'), 'the accounting page drops the second column and keeps Ledger tabs plus the balance summary');
ok(page.includes("throw new Error('That section is not available for your account.')"), 'a payoff address still refuses a role that cannot open it');

console.log(fail ? fail + ' failed' : 'ff-103 passed');
if (fail) process.exit(1);
