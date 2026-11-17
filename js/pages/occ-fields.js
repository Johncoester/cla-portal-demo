// John, Nov 3 call: explicit First-time buyer / Primary residence questions on the order (purchases). They feed the Accounting tab's CLA-rate
// calculation: in Maryland a first-time buyer who will live in the home pays none of the state transfer tax (the seller pays it). County taxes
// start from the rate sheet's first-time buyer payer. Staff can change who pays on Taxes & Fees.
import { html, raw } from '../ui.js?v=202611161500';
const opt = (v, cur, l) => html`<option value="${v}" ${cur === v ? raw('selected') : ''}>${l}</option>`;
export const yesNo = (v) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not asked yet');
export function occSelects(d = {}, attrs = '') {
  const pr = d.primaryResidence || '', ft = d.firstTimeBuyer || '';
  return html`<label ${raw(attrs)} data-occ="primaryResidence">Primary residence (buyer will live there)?<select name="primaryResidence" aria-label="Primary residence">${opt('', pr, 'Not asked yet')}${opt('yes', pr, 'Yes')}${opt('no', pr, 'No')}</select></label>
    <label ${raw(attrs)} data-occ="firstTimeBuyer">First-time buyer?<select name="firstTimeBuyer" aria-label="First-time buyer">${opt('', ft, 'Not asked yet')}${opt('yes', ft, 'Yes')}${opt('no', ft, 'No')}</select>
      <span class="field-hint">Maryland: a first-time buyer who will live in the home pays no state transfer tax (the seller pays it). County taxes start from the rate sheet, and staff can change who pays on Taxes &amp; Fees.</span></label>`;
}
