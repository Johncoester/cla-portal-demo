/* MF-063 (Matt, Nov 25 2026): EMD held by is a dropdown; No EMD sets amount $0 and due date N/A; older typed-in values stay until edited. */
import { EMD_HOLDER_OPTIONS, emdHolderCanonical, emdHolderSelectValue, isNoEmd, emdHolderDisplay, emdDueDisplay, applyNoEmdToForm } from '../js/data/emd-holder.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(EMD_HOLDER_OPTIONS.join('|') === "CLA Title|Listing Agent|Buyer's Agent|No EMD|Other Title Company or Attorney", 'the list is CLA Title, Listing Agent, Buyer\'s Agent, No EMD, Other Title Company or Attorney');
ok(emdHolderCanonical('CLA') === 'CLA Title' && emdHolderCanonical('Listing brokerage') === 'Listing Agent' && emdHolderCanonical('Buyer brokerage') === "Buyer's Agent", 'obvious older wording maps on display');
ok(emdHolderDisplay('Listing brokerage') === 'Listing Agent' && emdHolderSelectValue('Listing brokerage') === 'Listing brokerage', 'display mapping does not rewrite the saved text; the dropdown keeps the older wording until someone picks a list option');
ok(emdHolderDisplay('First National Trust') === 'First National Trust' && emdHolderSelectValue('First National Trust') === 'First National Trust', 'an unmatched typed-in holder stays as it is');
ok(isNoEmd('No EMD') && emdDueDisplay('2026-12-01', 'No EMD') === 'N/A' && emdDueDisplay('2026-12-01', 'CLA Title') === '2026-12-01', 'No EMD shows the due date as N/A');

const f = applyNoEmdToForm({ emdHeldBy: 'No EMD', emdAmount: '10,000', emdDueDate: '2026-12-01' });
ok(f.emdAmount === 0 && f.emdDueDate === '' && f.emdHeldBy === 'No EMD', 'picking No EMD sets amount to $0 and clears the due date');
ok(!applyNoEmdToForm({ emdHeldBy: 'CLA Title', emdAmount: 5000, emdDueDate: '2026-12-01' }).emdDueDate === false
  && applyNoEmdToForm({ emdHeldBy: 'CLA Title', emdAmount: 5000, emdDueDate: '2026-12-01' }).emdAmount === 5000, 'another holder leaves amount and due date alone');

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
for (const [file, name] of [['../js/pages/ordernew.js', 'emdHeldBy'], ['../js/pages/deal.js', 'emdHeldBy'], ['../js/pages/dealaccounting-contract.js', 'emdHeldBy'], ['../js/pages/tc-overview.js', 'emdHolder']]) {
  const t = src(file);
  ok(t.includes('emdHolderSelect') && t.includes(`name: '${name}'`) && !t.includes(`<input name="${name}"`), `${file} uses the dropdown, not a free-text box`);
}

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '8 Holder Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', emdAmount: 10000, emdDueDate: '2026-12-01', emdHeldBy: 'Listing brokerage' });
let d = await api.getDeal(deal.id);
ok(d.emdHolder === 'Listing brokerage' && Number(d.emdAmount) === 10000, 'an older typed-in holder is left as it was until someone edits');
await api.updateDeal(deal.id, { emdHeldBy: 'No EMD', emdAmount: 0, emdDueDate: '' });
d = await api.getDeal(deal.id);
ok(d.emdHolder === 'No EMD' && Number(d.emdAmount) === 0 && !d.emdDueDate, 'saving No EMD stores $0 and no due date');

console.log(fail ? fail + ' failed' : 'mf-063 emd holder passed');
if (fail) process.exit(1);
