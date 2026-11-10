/* MF-021: copy confirmation, tighter contact rows, and the repeated order-contacts table. Fake values only. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { partyCopyButton } from '../js/pages/deal.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const phone = toText(partyCopyButton('phone', '301-555-0148'));
const email = toText(partyCopyButton('email', 'riley@example.test'));
ok(phone.includes('data-copy-confirm') && phone.includes('>Copied<') && email.includes('>Copied<'), 'each Parties phone and email has a Copied confirmation');
ok(phone.includes('Copy phone number') && email.includes('Copy email address'), 'the buttons still name the phone and the email');

const contacts = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
ok(contacts.includes('data-copy-kind="phone"') && contacts.includes('data-copy-kind="email"') && contacts.includes('data-copy-confirm') && contacts.includes('>Copied<'), 'each Contacts phone and email has a copy button and a Copied confirmation');
ok(contacts.includes('data-contacts-table'), 'the contacts table can use the tighter row spacing');

const deal = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(!deal.includes('data-all-order-contacts'), 'the participant table that repeated Parties is gone');
ok(deal.includes('data-order-contacts') && deal.includes('Closing location') && deal.includes('>HOA<') && deal.includes("staffView ? '' : html`<div class=\"box-title\"><h2><span class=\"h-ico\"></span>Order Contacts"), 'agents still see HOA and closing location; staff overview does not render Order Contacts');

const css = readFileSync(new URL('../css/portal.css', import.meta.url), 'utf8');
ok(/\.op-prow \{[^}]*padding: 1px 8px/.test(css) && /\[data-contacts-table\] th, \[data-contacts-table\] td \{ padding: 3px 8px/.test(css), 'party rows and contact rows use the tighter padding');

console.log(fail ? fail + ' failed' : 'contacts parties passed');
if (fail) process.exit(1);
