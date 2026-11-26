/* MF-066 (Matt, Nov 25 2026): Introduction Email To is a multi-select of file parties, with role, and still allows a typed address. */
import { introRecipients } from '../js/data/gmail-email.js';
import { partyRecipientLabel, fileEmailParties } from '../js/data/mail-to-parties.js';
import { readFileSync } from 'node:fs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const deal = {
  participants: [
    { role: 'Client-Buyer', contact: { firstName: 'Pat', lastName: 'Buyer', email: 'pat@example.test' } },
    { role: 'Client-Seller', contact: { firstName: 'Lee', lastName: 'Seller', email: 'lee@example.test' } },
    { role: 'Buyer Agent', contact: { firstName: 'Ada', lastName: 'Agent', email: 'ada@example.test' } },
    { role: 'Listing Agent', contact: { firstName: 'Lou', lastName: 'List', email: 'lou@example.test' } },
    { role: 'Transaction Coordinator', contact: { firstName: 'Ty', lastName: 'Coord', email: 'ty@example.test' } },
    { role: 'Lender', contact: { firstName: 'Len', lastName: 'Der', email: 'len@example.test' } },
    { role: 'Client-Buyer', removed: true, contact: { firstName: 'Old', lastName: 'Buyer', email: 'old@example.test' } },
    { role: 'Client-Seller', contact: { firstName: 'Hidden', lastName: 'Seller', email: 'hide@example.test', contactHidden: true } },
  ],
};

const intro = introRecipients(deal);
ok(intro.map((r) => r.email).join() === 'pat@example.test,lee@example.test,ada@example.test,lou@example.test,ty@example.test', 'intro still defaults to buyers, sellers, both agents, and a TC with email');
const parties = fileEmailParties(deal);
ok(parties.some((p) => p.email === 'len@example.test' && p.role === 'Lender'), 'other people on the file are also in the To list');
ok(!parties.some((p) => p.email === 'old@example.test' || p.email === 'hide@example.test'), 'removed or hidden contacts are left out');
ok(partyRecipientLabel({ name: 'Pat Buyer', role: 'Client-Buyer', email: 'pat@example.test' }, 'Buyer') === 'Pat Buyer (Buyer) — pat@example.test', 'each option is Name (Role) — email');

const src = readFileSync(new URL('../js/pages/dealemail.js', import.meta.url), 'utf8');
ok(src.includes('data-mail-to-party') && src.includes('data-mail-to-extra') && src.includes('partyRecipientLabel') && src.includes('data-mail-to-picker'), 'the compose To box is a party picker plus a typed address');
ok(src.includes('(pre.to || []).some(') && src.includes('data-mail-to-extra'), 'Introduction Email pre-selects the intro recipients and still has a typed To');
ok(src.includes("name=\"to\"") && src.includes('data-mail-to') && src.includes('list($(\'[data-mail-to]\'') , 'Send still reads the combined To list');
ok(!src.includes('<label class="span2">To<input name="to"'), 'To is no longer only a free-text box');

console.log(fail ? fail + ' failed' : 'mf-066 intro to passed');
if (fail) process.exit(1);
