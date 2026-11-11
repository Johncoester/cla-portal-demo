/* FF-012 title, FF-034 template recipients. Fake data only. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileTitleOf } from '../js/data/party-name.js';
import { recipientsAfterTemplate } from '../js/pages/dealemail.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const title = fileTitleOf([
  { role: 'Client-Buyer', contact: { firstName: '', lastName: '', company: 'JTM 2 LLC' }, entity: { name: 'JTM 2 LLC' } },
  { role: 'Client-Seller', contact: { firstName: '', lastName: 'Salcedo' } },
]);
ok(title === 'JTM 2 LLC / Salcedo', 'an entity with no first or last name is the order title');

const filled = recipientsAfterTemplate('', ['buyer@clatitle.com', 'agent@clatitle.com'], { fillIfEmpty: true });
ok(filled.join(', ') === 'buyer@clatitle.com, agent@clatitle.com', 'an empty To box takes the template addresses');
const edited = recipientsAfterTemplate('buyer@clatitle.com, extra@clatitle.com', ['buyer@clatitle.com'], { fillIfEmpty: false });
ok(edited.join(', ') === 'buyer@clatitle.com, extra@clatitle.com', 'an address added to To is kept');
const cc = readFileSync('js/pages/dealemail.js', 'utf8');
ok(cc.includes('data-mail-cc') && !cc.includes("addEventListener('blur'") && cc.includes('cc: list($(\'[data-mail-cc]\', m).value)'), 'Cc is a field on the send and is not rewritten when To changes');
ok(readFileSync('js/pages/gmail-card.js', 'utf8').includes('Connect Gmail') && readFileSync('js/pages/profile.js', 'utf8').includes('gmailCardHtml') && cc.includes('Connect Gmail on Profile Setting first'), 'a disconnected Gmail account says to connect it on Profile Setting');

for (const file of ['supabase/migrations/20261112060100_entity_file_titles.sql', 'supabase/rollbacks/20261112060100_entity_file_titles.sql']) {
  console.log(file.split('/').pop(), createHash('sha256').update(readFileSync(file)).digest('hex'));
}
console.log(fail ? fail + ' failed' : 'ff followup passed');
if (fail) process.exit(1);
