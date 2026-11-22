/* FF-094 (Francis Santos, Nov 17 2026, 1:37 PM ET, Gmail 1a1eacd7648484d9).
 * Accounting's Contract figures section is Basic Info: five order fields. The other boxes leave the screen.
 * Their columns stay. Fake orders only. */
import { readFileSync, readdirSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { contractView, basicInfoPatch } from '../js/pages/dealaccounting-contract.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const buyer = { role: 'Client-Buyer', contactId: 'c-ben', removed: false, contact: { id: 'c-ben', firstName: 'Ben', lastName: 'Buyer' } };
const purchase = {
  id: 'deal-x', transactionType: 'Purchase', purchasePrice: 485000, loanAmount: 388000,
  closingDate: '2026-12-02', disbursementDate: '', sourceOfBusiness: 'buyer:c-ben', sourceOfBusinessLabel: 'Buyer — Ben Buyer',
  emdAmount: 10000, emdDueDate: '2026-10-03', emdHolder: 'CLA Title', participants: [buyer], financial: {},
};
const fees = { sides: {}, fees: {} };
const apiFor = (deal, extra = {}) => ({
  getDeal: async () => extra.full || null,
  getContractTerms: async () => ({ canEdit: extra.canEdit !== false, saved: false, fields: {}, flags: {} }),
  getAgentFees: async () => fees,
  saveContractTerms: async () => { extra.savedTerms = true; return { saved: true }; },
  ...extra.api,
});

const page = await contractView(apiFor(purchase), purchase, { role: 'Processor', isAdmin: false });
const html = toText(page.body);
ok(html.includes('data-basic-info') && html.includes('Sales price') && html.includes('Loan amount') && html.includes('Closing date') && html.includes('Disbursement date') && html.includes('Source of business'), 'Basic Info shows the five fields');
ok(html.includes('value="485000"') || html.includes('485,000'), 'the sales price is the order price');
ok(html.includes('>Buyer — Ben Buyer<') && html.includes('buyer:c-ben'), 'source of business lists the buyer already on the file');
ok((html.match(/<h3>Earnest money<\/h3>/g) || []).length === 1, 'earnest money stays once, the card above Basic Info');
ok(html.includes('Earnest money is optional') && html.includes('data-earnest-accounting') && html.includes('data-agent-fees-summary'), 'earnest money and the agent-fees summary stay');
for (const gone of ['How it was obtained', 'Source for this figure', 'Warranty cap', 'HOA name', 'Historical tax', 'Deferred charge amount', 'name="sellerCreditAmount"', 'data-contract-group', 'Save contract figures']) {
  ok(!html.includes(gone), 'removed from the screen: ' + gone);
}
ok(!html.includes('name="salePrice"'), 'the old contract-term sale price box is not on the screen');

const shell = { ...purchase, participants: [], sourceOfBusiness: '', sourceOfBusinessLabel: '' };
const loaded = await contractView(apiFor(shell, { full: purchase }), shell, { role: 'Processor' });
const loadedHtml = toText(loaded.body);
ok(loadedHtml.includes('buyer:c-ben') && loadedHtml.includes('data-source-known="yes"'), 'a file header with no people loads the source before the form is shown');
const missed = await contractView(apiFor(shell, { full: null, api: { getDeal: async () => { throw new Error('offline'); } } }), shell, { role: 'Processor' });
const missedHtml = toText(missed.body);
ok(missedHtml.includes('data-source-missing') && !missedHtml.includes('name="sourceOfBusiness"'), 'when the source does not load, the form cannot clear it');

const refi = { ...purchase, transactionType: 'Refinance', purchasePrice: null };
const refiPage = await contractView(apiFor(refi), refi, { role: 'Processor' });
const refiHtml = toText(refiPage.body);
ok(refiHtml.includes('data-refi-basic') && !refiHtml.includes('name="purchasePrice"') && !refiHtml.includes('data-earnest-accounting'), 'a refinance has no sales price and no earnest money');

const sales = await contractView(apiFor(purchase, { canEdit: false }), purchase, { role: 'Sales Person' });
ok(toText(sales.body).includes('data-basic-edit="no"') && toText(sales.body).includes('Read only for your role'), 'sales can read Basic Info and cannot edit it');

const patch = basicInfoPatch(purchase, { purchasePrice: '500,000.00', loanAmount: '400000', closingDate: '2026-12-15', disbursementDate: '', sourceOfBusiness: 'buyer:c-ben' }, true);
ok(patch.purchasePrice === 500000 && patch.loanAmount === 400000 && patch.closingDate === '2026-12-15' && patch.disbursementDate === '' && patch.sourceOfBusiness === 'buyer:c-ben', 'a save writes the five order fields');
const refiPatch = basicInfoPatch(refi, { purchasePrice: '1', loanAmount: '', closingDate: '', disbursementDate: '2026-12-20', sourceOfBusiness: '' }, false);
ok(refiPatch.purchasePrice === undefined && refiPatch.loanAmount == null && refiPatch.sourceOfBusiness === undefined && refiPatch.disbursementDate === '2026-12-20', 'a refinance save leaves the sales price and the source alone');
let bad = '';
try { basicInfoPatch(purchase, { purchasePrice: 'nope', loanAmount: '1', closingDate: '', disbursementDate: '' }, true); } catch (e) { bad = e.message; }
ok(/digits/.test(bad), 'a sales price that is not an amount is refused before anything is saved');

const adapter = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await adapter.signInDev('u-proc');
const before = await adapter.getDeal('deal-1');
await adapter.saveContractTerms('deal-1', { warrantyCap: '1500', warrantyCapBasis: 'explicit', hoaName: 'Maple Ridge HOA (fake)', taxLevy: '3200', taxLevyBasis: 'historical', sellerCreditAmount: '2000', sellerCreditAmountBasis: 'explicit' });
const next = basicInfoPatch(before, { purchasePrice: '490000', loanAmount: String(before.loanAmount), closingDate: before.closingDate || '', disbursementDate: '2026-12-03', sourceOfBusiness: before.sourceOfBusiness || '' }, true);
const saved = await adapter.updateDeal('deal-1', next);
const kept = await adapter.getContractTerms('deal-1');
ok(saved.purchasePrice === 490000 && saved.disbursementDate === '2026-12-03' && saved.loanAmount === before.loanAmount, 'Basic Info saves the order figures');
ok(kept.fields.warrantyCap === 1500 && kept.fields.hoaName === 'Maple Ridge HOA (fake)' && kept.fields.taxLevy === 3200 && kept.fields.sellerCreditAmount === 2000, 'warranty, HOA, tax, and seller credit stay stored');
ok(!readFileSync('js/pages/dealaccounting-contract.js', 'utf8').includes('saveContractTerms'), 'Basic Info does not write the hidden contract-term columns');

const tc = readFileSync('js/pages/tc-overview.js', 'utf8');
ok(tc.includes('Contract info') && tc.includes('Sale price') && !tc.includes('Contract figures'), 'TC Contract info keeps its own name and fields');
const e2eHits = [];
function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = dir + '/' + name.name;
    if (name.isDirectory()) walk(full);
    else if (/\.(js|mjs|md)$/.test(name.name)) {
      const text = readFileSync(full, 'utf8');
      if (text.includes('Contract figures')) e2eHits.push(full);
    }
  }
}
walk('tests/e2e-roles');
ok(e2eHits.length === 0, 'the role walkthrough does not look for the old Contract figures heading' + (e2eHits.length ? ': ' + e2eHits.join(', ') : ''));

console.log(fail ? fail + ' failed' : 'basic info passed');
if (fail) process.exit(1);
