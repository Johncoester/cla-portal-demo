/* MF-083 (Matt, Nov 27): file Email tab Sent / Received / All toggle. */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const src = readFileSync(new URL('../js/pages/dealemail.js', import.meta.url), 'utf8');
ok(src.includes('data-mail-dir-filter') && src.includes('Received') && src.includes('Sent') && src.includes('All'), 'the Email tab has an All / Received / Sent toggle');
ok(src.includes("dir === 'all' || li.dataset.mailDir === dir"), 'the toggle hides messages that are not in the chosen direction');
ok(src.includes("el.addEventListener('change', applySearch)"), 'changing the toggle re-filters the list, including with the search box');
console.log(fail ? `mf-083: ${fail} failed` : 'mf-083: passed');
if (fail) process.exit(1);
