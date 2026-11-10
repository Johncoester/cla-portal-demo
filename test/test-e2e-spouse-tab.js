/* The file-tab walk must recognize Spouse. Without it, gotoHash treats that URL as the overview and waits until the test times out. */
import { HASH_TABS, PEOPLE, requiredTabs, tabOf } from '../tests/e2e-roles/helpers/people.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(tabOf('#/deals/file-1/spouse') === 'spouse', 'a spouse URL is the spouse tab');
ok(HASH_TABS.includes('spouse'), 'gotoHash can tell the spouse tab from the overview');
for (const key of ['buyer', 'seller', 'coordinator', 'salesPerson', 'salesTeam', 'processor']) {
  ok(requiredTabs(PEOPLE[key]).includes('spouse'), `${key} is expected to have a Spouse tab`);
}
for (const key of ['buyerAgent', 'listingAgent']) {
  ok(!requiredTabs(PEOPLE[key]).includes('spouse'), `${key} is not given a Spouse tab`);
}

console.log(fail ? fail + ' failed' : 'e2e spouse tab passed');
if (fail) process.exit(1);
