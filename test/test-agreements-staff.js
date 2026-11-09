/* Francis Nov 9: listAgreements staff = account role, not absence of file roles. */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const src = readFileSync('js/data/supabase-adapter.js', 'utf8');
const block = src.slice(src.indexOf('async listAgreements'), src.indexOf('async acknowledgeAgreement'));
ok(/const staff = u\.role !== 'Outside user' && !u\.accountRole/.test(block), 'staff from account role');
ok(!/staff = !\(roles && roles\.roles/.test(block), 'old fileRoles-length staff gate removed');
ok(/await me\(\)/.test(block), 'uses me() for the signed-in profile');
ok(/needed: !staff/.test(block), 'outside users still need to acknowledge');
console.log(fail ? fail + ' failed' : 'agreements staff passed');
if (fail) process.exit(1);
