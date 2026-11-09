/* Regression: deal pages call prefetchDealTab; dropping the import hangs on "Loading this page." */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const app = readFileSync('js/app.js', 'utf8');
ok(/import \{ prefetchDealTab \} from '\.\/pages\/deal-tab\.js\?v=\d+'/.test(app), 'app.js imports prefetchDealTab');
ok(/prefetchDealTab\(fileHint\.tab/.test(app), 'render() calls prefetchDealTab for deal routes');
ok(!/ReferenceError/.test(app), 'no intentional ReferenceError');
console.log(fail ? fail + ' failed' : 'app prefetch import passed');
if (fail) process.exit(1);
