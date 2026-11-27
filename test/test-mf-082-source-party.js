/* MF-082 (Matt, Nov 27): Source of business is an identifying party in Parties, replacing the right-column radio. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { partiesList } from '../js/pages/deal.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const src = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(src.includes('data-source-party') && src.includes('data-referral-source-select'), 'Parties has an identifying Source of business row with a select');
ok(!src.includes('data-referral-source="${value}"') && !src.includes('data-referral-clear'), 'the right-column radios and the Not set radio are gone');
ok(src.includes('Identifying only') && src.includes('applyReferralChange'), 'the row is identifying only and still saves through the existing source field');

const deal = { id: 'd1', participants: [
  { id: 'p1', role: 'Client-Buyer', contactId: 'c-buyer', contact: { id: 'c-buyer', firstName: 'Ben', lastName: 'Buyer', email: 'b@x.test', phone: '2025550100' } },
  { id: 'p2', role: 'Buyer Agent', contactId: 'c-agent', contact: { id: 'c-agent', firstName: 'Ann', lastName: 'Agent', email: 'a@x.test', phone: '' } },
], sourceOfBusiness: 'buyer_agent:c-agent', sourceOfBusinessLabel: "Buyer's agent — Ann Agent" };
const ov = { parties: [{ label: 'Buyer', name: 'Ben Buyer', email: 'b@x.test', phone: '2025550100', contactId: 'c-buyer' }, { label: 'Buyer Agent', name: 'Ann Agent', email: 'a@x.test', phone: '', contactId: 'c-agent' }] };
const html = toText(partiesList(deal, ov, true, { edit: true, source: deal.sourceOfBusiness, sourceLabel: deal.sourceOfBusinessLabel }));
ok(html.includes('data-source-party') && html.includes('data-source-of-business') && html.includes('Ann Agent') && html.includes('buyer_agent:c-agent'), 'the identifying row shows the stored MF-017 source person');
ok(html.includes('data-referral-source-select') && !html.includes('type="radio"'), 'staff change the source with a select, not radios');
const client = toText(partiesList(deal, ov, false, { edit: false, source: '', sourceLabel: '' }));
ok(!client.includes('data-source-party'), 'a buyer or seller does not get the staff source editor');
console.log(fail ? `mf-082: ${fail} failed` : 'mf-082: passed');
if (fail) process.exit(1);
