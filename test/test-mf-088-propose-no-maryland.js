/* MF-088 (Matt, Nov 27): Propose a closing time no longer asks whether the person will be in the property state. */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const src = readFileSync(new URL('../js/pages/dealclosing.js', import.meta.url), 'utf8');
ok(src.includes("whenModal('Propose a closing time'") && src.includes('askWhere: false'), 'Propose a closing time turns the in-state question off');
ok(src.includes('askWhere = true') && src.includes('Schedule the closing') && src.includes('Change the scheduled closing') && /whenModal\(sc \? 'Change the scheduled closing' : 'Schedule the closing'/.test(src) && !/Schedule the closing'[^\n]*askWhere:\s*false/.test(src), 'Schedule and Change still use the default, which keeps the question');
ok(src.includes('!staffView && askWhere') && src.includes('(!askWhere || staffView)'), 'the question is omitted only when askWhere is false, and no location answer is saved from that modal');
ok(src.includes('Will you be in ${st} at the time of closing?') && src.includes('data-loc-form'), 'the Closing tab forms still ask the question');
console.log(fail ? `mf-088: ${fail} failed` : 'mf-088: passed');
if (fail) process.exit(1);
