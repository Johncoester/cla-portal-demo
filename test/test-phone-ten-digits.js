/* FF-069 #14 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET):
   every phone field takes exactly 10 digits, including the spouse phones and the mortgage phone. */
import { readFileSync } from 'node:fs';
import { spousePhoneError, spouseSectionHtml } from '../js/pages/spouse.js';
import { validateForm } from '../js/data/templates.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const text = (h) => String(h && h.__html != null ? h.__html : h);
ok(spousePhoneError({ cellPhone: '301-555-0111', homePhone: '', workPhone: '(301) 555 0122' }) === '', 'spouse phones with 10 digits (or blank) are accepted');
ok(/Spouse cell phone must be a 10-digit phone number/.test(spousePhoneError({ cellPhone: '301-555' })), 'a short spouse cell phone is refused');
ok(/Spouse work phone/.test(spousePhoneError({ workPhone: '301-555-01112' })), 'an 11-digit spouse work phone is refused');
const sp = text(spouseSectionHtml({ participantId: 'p1', cellPhone: '3015550111' }, false));
ok((sp.match(/type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone maxlength="12"/g) || []).length === 3, 'the three spouse phones format as xxx-xxx-xxxx while typing');
const fields = [{ k: 'mortgages', label: 'Mortgages', type: 'mortgages', req: false }];
const good = validateForm(fields, { mortgages: JSON.stringify([{ lender: 'First Bank', phone: '3015550111', loan_number: '12345' }]) }, true);
ok(!good.errors.length && JSON.parse(good.data.mortgages)[0].phone === '301-555-0111', 'a 10-digit mortgage phone saves as xxx-xxx-xxxx');
const bad = validateForm(fields, { mortgages: JSON.stringify([{ lender: 'First Bank', phone: '555-0111' }]) }, false);
ok(bad.errors.some((e) => /Mortgage phone must be a 10-digit/.test(e.msg)), 'a 7-digit mortgage phone is refused');
const h = text(intakeFormHtml({ id: 't1', status: 'todo', canFill: true, fields, formData: {} }, { page: true }));
ok(h.includes('data-mphone type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone maxlength="12"'), 'the mortgage phone formats while typing');
const src = readFileSync(new URL('../js/pages/dealtaskform.js', import.meta.url), 'utf8');
ok(src.includes('<label>Phone<input data-mphone type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone maxlength="12"></label>'), '"Add another mortgage" rows format too');
ok(src.includes('if (spouseBox) { const bad = spousePhoneError(spousePayload(form)); if (bad) throw new Error(bad); }') && src.includes('throw new Error(`Mortgage phone ${PHONE_MSG}.`)'), 'the task form stops before saving a phone that is not 10 digits');
const spSrc = readFileSync(new URL('../js/pages/spouse.js', import.meta.url), 'utf8');
ok(spSrc.includes("const bad = spousePhoneError(data); if (bad) { toast(bad, 'err'); return; }"), 'the Spouse tab stops before saving a phone that is not 10 digits');
console.log(fail ? `FAIL ${fail}` : 'all ten-digit phone checks passed');
process.exit(fail ? 1 : 0);
