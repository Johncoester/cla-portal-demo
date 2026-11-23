/* MF-060 (Matt Landsberg, "Portal Feedback Nov 22"; confirm-back reply Nov 22 2026, 1:54 PM ET, Gmail 1a2049c9ec631d7b).
 * Processor screen: on a PURCHASE, when the settlement date changes the disbursement date changes to match. Not for refinances.
 * It can still be changed by hand; a hand-set date lasts until the next settlement date change. Mock data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { disbursementFor } from '../js/data/disbursement.js';
import { fileDatesHtml } from '../js/pages/file-dates.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const shown = async (id) => disbursementFor(await api.getDeal(id)).date;

// purchase, automatic
await api.updateDeal('deal-2', { closingDate: '2026-12-04' });
ok(await shown('deal-2') === '2026-12-04', 'purchase: a new settlement date moves the disbursement date with it');
// purchase, hand-set then settlement change
await api.updateDeal('deal-2', { disbursementDate: '2026-12-07' });
ok(await shown('deal-2') === '2026-12-07', 'purchase: the disbursement date can still be changed by hand');
await api.updateDeal('deal-2', { notes: 'unrelated save' });
ok(await shown('deal-2') === '2026-12-07', 'purchase: an unrelated save keeps the hand-set date');
await api.updateDeal('deal-2', { closingDate: '2026-12-04', disbursementDate: '2026-12-07' });
ok(await shown('deal-2') === '2026-12-07', 'purchase: saving Basic Info with the same settlement date keeps the hand-set date');
await api.updateDeal('deal-2', { closingDate: '2026-12-09', disbursementDate: '2026-12-07' });
ok(await shown('deal-2') === '2026-12-09' && !(await api.getDeal('deal-2')).disbursementDate, 'purchase: the next settlement date change resets a hand-set date to the settlement date (Basic Info form)');
await api.updateDeal('deal-2', { disbursementDate: '2026-12-10' });
await api.updateDeal('deal-2', { closingDate: '2026-12-11' });
ok(await shown('deal-2') === '2026-12-11', 'purchase: the next settlement date change resets a hand-set date (header field)');
await api.updateDeal('deal-2', { closingDate: '2026-12-14', disbursementDate: '2026-12-15' });
ok(await shown('deal-2') === '2026-12-15', 'purchase: changing both dates in one save keeps the disbursement date given');

// refinance: untouched (4th business day, or the processor's date)
const refiDeal = { transactionType: 'Refinance', closingDate: '2026-11-12', disbursementDate: '2026-11-12' };
ok(disbursementFor(refiDeal).date === '2026-11-12', 'refinance: a processor-set date still wins');
const mock = readFileSync(new URL('../js/data/mock-part-deals.js', import.meta.url), 'utf8');
ok(/MF-060[\s\S]{0,400}!isRefi\(q\)/.test(mock), 'demo data: refinances are left out of the rule');

// header and hints
const head = toText(fileDatesHtml({ transactionType: 'Purchase', closingDate: '2026-12-04' }, { canEdit: true }));
ok(head.includes('value="2026-12-04"') && head.includes('Follows the settlement date'), 'processor header: disbursement shows the settlement date and says it follows it');
const refiHead = toText(fileDatesHtml({ transactionType: 'Refinance', closingDate: '2026-11-12' }, { canEdit: true }));
ok(refiHead.includes('value="2026-11-17"') && !refiHead.includes('Follows the settlement date'), 'refinance header: 4th business day, no follow note');
ok(!head.includes('data-oh-edit="disbursement" disabled'), 'the disbursement date stays editable');
const ro = toText(fileDatesHtml({ transactionType: 'Purchase', closingDate: '2026-12-04' }, { canEdit: false }));
ok(!ro.includes('<input') && ro.includes('data-oh-disbursement-date'), 'read-only roles see the date and cannot edit it');

// the database rule
const mig = readFileSync(new URL('../supabase/migrations/20261129040000_disbursement_follows_settlement.sql', import.meta.url), 'utf8');
ok(/before update of closing_date on public\.deals/.test(mig) && /<> 'Refinance'/.test(mig) && !/create policy|grant /i.test(mig) && !/security definer/i.test(mig), 'TEST database: one trigger on closing_date changes, purchases only, no policy or grant changes');
ok(!/sched_|closing_proposal|buyer_closing/i.test(mig), 'the buyer closing-date lock is not touched');
console.log(fail ? `FAIL ${fail}` : 'all disbursement-follows checks passed');
process.exit(fail ? 1 : 0);
