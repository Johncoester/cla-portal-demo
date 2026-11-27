/* MF-084 (Matt, Nov 27): sticky file card shows Processor, Sales Person, then Source, right of File Status. */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/portal.css', import.meta.url), 'utf8');
ok(app.includes('data-oh-processor') && app.includes('data-oh-sales') && app.includes('data-oh-source'), 'the file card lists Processor, Sales Person, and Source');
ok(app.includes('data-file-status') && app.includes('fileCardPeople') && app.indexOf('data-file-status') < app.indexOf('data-oh-people'), 'the three names sit to the right of File Status');
ok(css.includes('position: sticky') && css.includes('.order-header') && css.includes('.oh-people'), 'the names are on the existing sticky file card');
console.log(fail ? `mf-084: ${fail} failed` : 'mf-084: passed');
if (fail) process.exit(1);
