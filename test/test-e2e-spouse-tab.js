/* Spouse information is a section of Personal information. The file walk must not open /spouse. */
import { readFileSync } from 'node:fs';
import { HASH_TABS, PEOPLE, requiredTabs, tabOf } from '../tests/e2e-roles/helpers/people.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(tabOf('#/deals/file-1/tasks') === 'tasks', 'a tasks URL is the tasks tab');
ok(!HASH_TABS.includes('spouse'), 'gotoHash does not treat a spouse URL as a file tab');
for (const key of Object.keys(PEOPLE)) {
  ok(!requiredTabs(PEOPLE[key]).includes('spouse'), `${key} is not given a Spouse tab`);
}
const form = readFileSync('js/pages/dealtaskform.js', 'utf8');
const section = readFileSync('js/pages/spouse.js', 'utf8');
ok(form.includes('spouseSectionHtml') && section.includes('Spouse information') && section.includes('save_party') === false, 'Personal information includes the spouse section');
ok(section.includes("subject === 'spouse'") === false && section.includes('data-spouse-ssn-input'), 'the spouse Social Security number stays on its own input');
ok(!readFileSync('js/app.js', 'utf8').includes("link('spouse'"), 'the file sidebar has no Spouse tab');
ok(!readFileSync('js/pages/deal-buyer-legacy.js', 'utf8').includes('spouse:'), 'the older file page does not keep a Spouse tab');
ok(readFileSync('js/pages/deal.js', 'utf8').includes("tab === 'spouse'"), 'opening /spouse is refused');
ok(!readFileSync('js/pages/client-overview.js', 'utf8').includes('Spouse'), 'the client pills do not include Spouse');

console.log(fail ? fail + ' failed' : 'e2e spouse tab passed');
if (fail) process.exit(1);
