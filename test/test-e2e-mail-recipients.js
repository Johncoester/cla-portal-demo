/* Walkthrough sends. No network and no mail. Proves a file's party addresses are never recipients. */
import { readFileSync } from 'node:fs';
import { e2eMailRecipients } from '../tests/e2e-roles/helpers/allowlist.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const parties = [
  'buyer.real@example.com',
  'Seller.Agent@SomeFirm.com',
  'clatestportal+e2e-buyer@gmail.com',
  'not an email',
  '',
  null,
];
const inbox = 'clatestportal@gmail.com';

const sent = e2eMailRecipients(parties, inbox);
ok(sent.ok && sent.to.length === 1 && sent.to[0] === inbox, 'a set inbox is the only recipient');
for (const raw of parties) {
  const addr = String(raw || '').trim().toLowerCase();
  if (!addr || addr === inbox) continue;
  ok(!sent.to.includes(addr), 'party address is not a recipient: ' + addr);
}
ok(!sent.to.includes('seller.agent@somefirm.com') && !sent.blocked.includes(inbox), 'the inbox is not treated as a blocked party, and the party list is not copied into To');

const alsoOnFile = e2eMailRecipients([inbox, 'buyer.real@example.com'], '  ' + inbox.toUpperCase() + '  ');
ok(alsoOnFile.ok && alsoOnFile.to.length === 1 && alsoOnFile.to[0] === inbox && !alsoOnFile.to.includes('buyer.real@example.com'), 'the inbox is kept once even when the file shows the same address');

for (const blank of ['', '   ', null, undefined, 'not-an-address', 'missing-at.example.com']) {
  const closed = e2eMailRecipients(parties, blank);
  ok(!closed.ok && closed.to.length === 0, 'fails closed with no recipients when E2E_MAIL_TO is ' + JSON.stringify(blank));
  for (const raw of parties) {
    const addr = String(raw || '').trim().toLowerCase();
    if (addr) ok(!closed.to.includes(addr), 'unset inbox does not fall back to ' + addr);
  }
}

const spec = readFileSync(new URL('../tests/e2e-roles/specs/email.spec.js', import.meta.url), 'utf8');
ok(spec.includes('e2eMailRecipients'), 'the file-email spec asks the helper who may be emailed');
ok(!spec.includes('[...found, inbox]') && !spec.includes('[...new Set([...found, inbox])]'), 'the spec does not add party addresses to To');
ok(spec.includes("test.skip(!gated.ok"), 'an unset E2E_MAIL_TO skips the live send');
const card = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(!card.includes('sends to test addresses only') && card.includes('The email goes to the address on the file.'), 'the Email sellers and agents card no longer says Live Test sends to test addresses only');

console.log(fail ? fail + ' failed' : 'e2e mail recipients passed');
if (fail) process.exit(1);
