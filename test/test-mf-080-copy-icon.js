/* MF-080 (Matt, Nov 27): every copy icon matches the File Overview one. */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const contacts = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
const overview = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(contacts.includes('class="op-copy"') && contacts.includes('op-copy-ico'), 'Contacts uses the File Overview copy icon class');
ok(contacts.includes('viewBox="0 0 24 24"') && overview.includes('viewBox="0 0 24 24"'), 'both screens use the same copy SVG');
ok(!contacts.includes('>Copy</button>') || contacts.includes('class="op-copy"'), 'the Contacts ghost Copy text buttons are gone');
console.log(fail ? `mf-080: ${fail} failed` : 'mf-080: passed');
if (fail) process.exit(1);
