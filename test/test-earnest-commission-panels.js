/* MF-051 / FF-051 / FF-075 (Francis, option 1, Nov 13 2026): Listing Agent and Selling Agent
 * panels on the Agent fees box. Commission amount = base × % + additional. Fake data only. */
import { readAgentFees, syncCommission, PANEL_TITLE } from '../js/data/agent-fees.js';
import { formHtml, sideHtml, boxHtml } from '../js/pages/agent-fees-box.js';
import { toText } from '../js/ui.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const throws = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

const plain = readAgentFees({ commissionBasis: 'percent', commissionPercent: '3', commissionPayer: 'seller' }, { side: 'buyer', price: 950000 });
ok(plain.commission.percent === 3 && plain.commission.amount === 28500 && plain.commission.payer === 'seller' && plain.commission.base == null && plain.commission.additional == null,
  'MD-26-97260 shape: 3% of the sales price is $28,500, paid by Seller, with no extra base or additional amount');

const added = syncCommission(950000, 'percent', '3', { additional: '1000' });
ok(added.percent === 3 && added.amount === 29500 && added.additional === 1000 && added.base == null, 'an additional amount is added on top of base × %');
const back = syncCommission(950000, 'amount', '29500', { additional: '1000' });
ok(back.percent === 3 && back.amount === 29500, 'typing the commission amount fills the % back in, after the additional amount');

const custom = syncCommission(950000, 'percent', '3', { base: '100000' });
ok(custom.base === 100000 && custom.percent === 3 && custom.amount === 3000, 'a typed commission base is used instead of the sales price');
ok(throws(() => syncCommission(950000, 'percent', '3', { base: '0' })) === 'Commission base must be more than 0.', 'a commission base of 0 is refused');
ok(throws(() => syncCommission(950000, 'percent', 'abc')) === 'Commission % must be a number.', 'a commission % that is not a number is refused');
ok(throws(() => readAgentFees({ additionalAmount: '500' }, { side: 'listing', price: 950000 })) === 'Enter the commission % or the commission amount. The additional amount is added on top.',
  'an additional amount with no commission stays unsaved and says what to enter');

const split = readAgentFees({
  commissionBasis: 'percent', commissionPercent: '3', commissionPayer: 'split', splitBuyer: '15000', splitSeller: '13500',
}, { side: 'listing', price: 950000 });
ok(split.commission.payer === 'split' && split.commission.splitBuyer === 15000 && split.commission.splitSeller === 13500 && split.commission.amount === 28500,
  'Split stores a dollar amount from the buyer and from the seller');
ok(/add up to the commission amount/.test(throws(() => readAgentFees({
  commissionBasis: 'percent', commissionPercent: '3', commissionPayer: 'split', splitBuyer: '1', splitSeller: '1',
}, { side: 'listing', price: 950000 }))), 'a split that does not add up to the commission amount is refused');
ok(throws(() => readAgentFees({ adminAmount: '10', adminPayer: 'split' }, { side: 'listing', price: 1 })) === 'Paid by must be Buyer or Seller.',
  'an admin fee is still paid by the buyer or the seller');

const listing = { commission: { percent: 3, amount: 28500, payer: 'seller' }, admin: null, other: [] };
const selling = { commission: { percent: 2, amount: 19000, base: 100000, additional: 1000, payer: 'split', splitBuyer: 9000, splitSeller: 10000 }, admin: null, other: [] };
const html = toText(boxHtml({ sides: { listing: 'edit', buyer: 'edit' }, fees: { listing, buyer: selling } }, { kind: 'staff' }));
ok(html.indexOf('Listing Agent Commission') >= 0 && html.indexOf('Selling Agent Commission') > html.indexOf('Listing Agent Commission'),
  'the Agent fees box shows Listing Agent Commission and Selling Agent Commission side by side');
ok(html.includes('data-agent-fee-side="listing"') && html.includes('data-agent-fee-side="buyer"'), 'the selling agent panel is the buyer-agent side');
ok(html.includes('$28,500') && html.includes('paid by Seller') && html.includes('split: buyer $9,000, seller $10,000'), 'each panel shows its commission amount and who pays it');
const form = toText(formHtml('listing', listing, { price: 950000 }));
ok(form.includes('Commission base') && form.includes('Commission %') && form.includes('Additional amount') && form.includes('Commission amount') && form.includes('Commission Paid By') && form.includes('>Split<'),
  'the edit form has the commission base, the percent, the additional amount, the commission amount, Commission Paid By, and Split');
ok(form.includes('name="commissionPercent"') && form.includes('value="3"') && form.includes('value="28500.00"'), 'a saved 3% / $28,500 stays in the form');
ok(PANEL_TITLE.listing === 'Listing Agent Commission' && PANEL_TITLE.buyer === 'Selling Agent Commission', 'the panel names are the ones Francis confirmed');
ok(toText(sideHtml('buyer', selling, 'read')).includes('Selling Agent Commission') && !toText(sideHtml('buyer', selling, 'read')).includes('>Edit<'),
  'someone who cannot edit the file sees the panel and no Edit button');

console.log(fail ? fail + ' failed' : 'earnest commission panels passed');
process.exit(fail ? 1 : 0);
