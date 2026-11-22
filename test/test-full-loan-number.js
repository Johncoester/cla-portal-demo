/* FF-067 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET, #7):
   Outstanding Mortgage takes the full loan number, not just the last 4. Older answers saved as last4 still show and save. */
import { readFileSync } from 'node:fs';
import { validateForm } from '../js/data/templates.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const text = (h) => String(h && h.__html != null ? h.__html : h);
const fields = [{ k: 'mortgages', label: 'Mortgages', type: 'mortgages', req: false }];
const full = validateForm(fields, { mortgages: JSON.stringify([{ lender: 'First Bank', phone: '3015550111', loan_number: '0012345678-9', loan_type: 'First' }]) }, true);
const saved = JSON.parse(full.data.mortgages);
ok(saved.length === 1 && saved[0].loan_number === '0012345678-9' && !('last4' in saved[0]), 'the full loan number is kept, dashes and leading zeros included');
const old = JSON.parse(validateForm(fields, { mortgages: JSON.stringify([{ lender: 'Old Bank', last4: '4321' }]) }, false).data.mortgages);
ok(old[0].loan_number === '4321', 'an older answer saved as last 4 is kept as the loan number');
const long = JSON.parse(validateForm(fields, { mortgages: JSON.stringify([{ lender: 'X', loan_number: '1'.repeat(50) }]) }, false).data.mortgages);
ok(long[0].loan_number.length === 30, 'the loan number is capped at 30 characters');
const task = { id: 't1', status: 'todo', canFill: true, fields, formData: { mortgages: JSON.stringify([{ lender: 'Old Bank', last4: '4321' }]) } };
const h = text(intakeFormHtml(task, { page: true }));
ok(h.includes('Loan number<input data-mloan maxlength="30"') && h.includes('value="4321"') && !h.includes('Last 4<input'), 'the form asks for the loan number (no 4-digit limit) and shows the older value');
const src = readFileSync(new URL('../js/pages/dealtaskform.js', import.meta.url), 'utf8');
ok(!src.includes('data-mlast4') && (src.match(/data-mloan maxlength="30"/g) || []).length === 2, 'both the first row and "Add another mortgage" rows take the full number');
console.log(fail ? `FAIL ${fail}` : 'all full loan number checks passed');
process.exit(fail ? 1 : 0);
