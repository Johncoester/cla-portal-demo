/* The global fake-data banner is gone. Demo view-as warning and reset behavior stay. */
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
ok(!app.includes('no real clients, no real messages'), 'the orders banner no longer says fake data only');
ok((app.match(/data-test-environment/g) || []).length === 1, 'the signed-in shells no longer include the test-environment banner');
ok(app.includes('data-view-as-banner') && app.includes('Changes are turned off') && app.includes('data-view-as-stop'), 'the demo view-as warning stays');
ok(app.includes('demoBanner()'), 'both shells still include the demo banner');
ok(app.includes('resetDemoData'), 'resetting demo data is still available to the adapter');
console.log(fail ? fail + ' failed' : 'banner removal passed');
if (fail) process.exit(1);
