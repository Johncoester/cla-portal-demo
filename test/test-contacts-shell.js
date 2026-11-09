/* Francis Nov 9: staff Contacts tab must not use the empty file shell (participants []). */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const deal = readFileSync('js/pages/deal.js', 'utf8');
const app = readFileSync('js/app.js', 'utf8');
ok(/NEEDS_PARTIES|tabName === 'contacts'/.test(deal) && /staffShell = !NEEDS_PARTIES/.test(deal), 'deal.js keeps full deal read for contacts');
ok(/tab !== 'contacts'/.test(app) && /staffShell = tab !== 'overview' && tab !== 'contacts'/.test(app), 'app.js prefetch skips shell for contacts');
ok(!/staffShell = tabName !== 'overview' && api.readFileShell/.test(deal), 'old overview-only shell gate removed from deal.js');
console.log(fail ? fail + ' failed' : 'contacts shell passed');
if (fail) process.exit(1);
