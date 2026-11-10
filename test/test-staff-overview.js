/* FF-019: staff file overview. Client and agent markup stays. No database change. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { fileIdentityHtml } from '../js/pages/deal.js';
import { closingDateSectionHtml, settlementSectionHtml } from '../js/pages/settlement-section.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const file = {
  street: '16 Oak Lane', city: 'Rockville', state: 'MD', zip: '20850', fileNumber: 'MD-26-97216', closingDate: '2026-12-01', closingTime: '14:30',
  participants: [
    { role: 'Client-Buyer', contact: { firstName: 'Ada', lastName: 'Buyer' } },
    { role: 'Client-Buyer', contact: { firstName: 'Ben', lastName: 'Buyer' } },
    { role: 'Client-Seller', removed: true, contact: { firstName: 'Gone', lastName: 'Seller' } },
  ],
};
const id = toText(fileIdentityHtml(file));
ok(id.includes('data-file-identity') && id.includes('data-file-buyers') && id.includes('Ben Buyer') && !id.includes('data-file-address') && !id.includes('data-file-order'), 'the box lists the parties and leaves the address and order number to the sticky header');
ok(id.includes('data-file-buyers') && id.includes('Ada Buyer, Ben Buyer') && id.includes('data-file-sellers') && id.includes('>None<'), 'the box shows every buyer and still shows Seller when there is none');

const empty = toText(fileIdentityHtml({ participants: [] }));
ok(empty.includes('>None<') && (empty.match(/>None</g) || []).length >= 2 && !empty.includes('data-file-address'), 'an empty file still shows the buyer and seller lines');

const staff = { role: 'Processor', isAdmin: false };
const closing = toText(closingDateSectionHtml({
  deal: file, user: staff, locations: [{ participantId: 'p1', name: 'Ada Buyer', signingMethod: 'in_person', signingLabel: 'In person' }],
}));
ok(closing.includes('data-closing-date') && closing.includes('data-settlement-row="date"') && closing.includes('2026-12-01') && closing.includes('data-settlement-row="time"') && closing.includes('14:30'), 'the closing date section keeps the date and the time');
ok(closing.includes('data-settlement-row="signing"') && closing.includes('Ada Buyer') && closing.includes('data-closing-location') && closing.includes('CLA Title office (to be confirmed)'), 'signing method and closing location move into the closing date section');
ok(!closing.includes('Buyer agent') && !closing.includes('data-settlement-row="closer"') && !closing.includes('Wire'), 'agents and the closer are not repeated, and wire instructions are not in this section');

const agentCard = toText(settlementSectionHtml({ deal: file, user: { role: 'Outside user', accountRole: 'agent' } }));
ok(agentCard.includes('data-settlement-section') && agentCard.includes('Buyer agent') && agentCard.includes('Listing agent'), 'the agent settlement card is unchanged');

const deal = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(deal.includes('staffView ? fileIdentityHtml(d) : \'\'') && deal.includes('canWire: staffView ? false : canWire') && deal.includes('staffView ? closingDateSectionHtml(') && deal.includes(': settlementSectionHtml('), 'staff overview uses the identity box and the closing date section, and does not show wire instructions or the settlement card');
const client = readFileSync(new URL('../js/pages/client-overview.js', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('../js/pages/deal-buyer-legacy.js', import.meta.url), 'utf8');
ok(client.includes('id="wirebtn"') && client.includes('Wire instructions') && !client.includes('data-file-identity'), 'the client overview still has wire instructions and no staff identity box');
ok(legacy.includes('Order Contacts') && legacy.includes('Wire instructions') && !legacy.includes('data-file-identity'), 'the agent legacy overview still has Order Contacts and wire instructions');

console.log(fail ? fail + ' failed' : 'staff overview passed');
if (fail) process.exit(1);
