/* FF-011 (Francis confirm-back Nov 12 6:14 PM ET, "automatic street address lookup"): on task forms, typing a full street line fills the
   empty city, state and ZIP boxes, reusing js/data/address-fill.js. A value already typed is kept. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { bindAddressFill } from '../js/data/address-fill.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const el = (f, n) => f.querySelector(`[name="${n}"]`);
const wait = () => new Promise((r) => setTimeout(r, 50));
const { document } = parseHTML('<html><body><form id="a"><input name="street"><input name="city"><input name="state"><input name="zip"></form><form id="b"><input name="mail_street"><input name="mail_city" value="Bethesda"><input name="mail_state"><input name="mail_zip"><input name="street"></form></body></html>');
const a = document.getElementById('a'); bindAddressFill(a);
el(a, 'street').value = '6231 Yellowstone Drive, Alexandria, VA 22312';
el(a, 'street').dispatchEvent(new document.defaultView.Event('blur'));
await wait();
ok(el(a, 'street').value === '6231 Yellowstone Drive' && el(a, 'city').value === 'Alexandria' && el(a, 'state').value === 'VA' && el(a, 'zip').value === '22312', 'forwarding address: the street line fills city, state and ZIP, and the street box keeps the street');
const b = document.getElementById('b'); bindAddressFill(b, { prefix: 'mail_' });
el(b, 'mail_street').value = '12 Main St, Rockville, MD 20850';
el(b, 'mail_street').dispatchEvent(new document.defaultView.Event('blur'));
await wait();
ok(el(b, 'mail_city').value === 'Bethesda' && el(b, 'mail_state').value === 'MD' && el(b, 'mail_zip').value === '20850', 'proceeds mailing address: empty boxes fill, a city already typed stays');
ok(el(b, 'street').value === '', 'a prefixed form does not touch other address boxes');
ok(b.dataset.addressBound_mail === '1' && b.dataset.addressBound !== '1', 'each prefix is wired once');
const src = readFileSync(new URL('../js/pages/dealtaskform.js', import.meta.url), 'utf8');
ok(src.includes('if (form.elements.street && form.elements.city) bindAddressFill(form);') && src.includes("bindAddressFill(form, { prefix: 'mail_' });"), 'task forms with street/city boxes (forwarding address, mailed proceeds check) get the lookup');
console.log(fail ? `FAIL ${fail}` : 'all task address fill checks passed');
process.exit(fail ? 1 : 0);
