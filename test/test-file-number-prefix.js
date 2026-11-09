/* John, Nov 9: the file number prefix follows the property state (MD-26-97220 was a Miami, FL file). Fake data only. */
import { readFileSync } from 'node:fs';
import { filePrefix, buildFileNumber, retagFileNumber, sentOutside } from '../js/data/file-number.js';
import { createMockAdapter, STORAGE_KEY } from '../js/data/mock-adapter.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
ok(['MD', 'VA', 'DC', 'FL'].every((s) => filePrefix(s) === s) && filePrefix('fl ') === 'FL', 'prefix is the 2-letter property state');
ok(filePrefix('') === 'MD' && filePrefix(null) === 'MD' && filePrefix('Florida') === 'MD', 'blank / bad state falls back to MD');
ok(buildFileNumber('FL', '26', 97220) === 'FL-26-97220', 'build FL-26-97220');
ok(retagFileNumber('MD-26-97220', 'FL') === 'FL-26-97220' && retagFileNumber('FL-26-97220', 'FL') === null && retagFileNumber('DEMO-100', 'FL') === null, 'retag keeps the sequence; DEMO numbers untouched');
ok(!sentOutside({ emails: [{ direction: 'out', toEmails: ['jcoester@clatitle.com'] }, { direction: 'in', toEmails: ['x@gmail.com'] }], outbox: [{ status: 'queued', toEmail: 'x@gmail.com' }] }), 'internal mail, inbound mail and queued outbox do not count');
ok(sentOutside({ emails: [{ direction: 'out', toEmails: ['jcoester@clatitle.com'], ccEmails: ['buyer@gmail.com'] }] }) && sentOutside({ outbox: [{ status: 'sent', sentAt: '2026-11-09', toEmail: 'agent@example.test' }] }), 'an outside recipient on a sent email / outbox message counts');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const storage = mem();
const api = createMockAdapter({ storage, sessionStorage: mem() });
await api.signInDev('u-admin');
const yy = new Date().getFullYear().toString().slice(2);
const fl = await api.createDeal({ street: '3650 Southwest 13th Street', city: 'Miami', state: 'FL', zip: '33145', transactionType: 'Purchase', processorId: '' });
ok(new RegExp(`^FL-${yy}-\\d+$`).test(fl.fileNumber), `a Florida order gets FL (${fl.fileNumber})`);
const va = await api.createDeal({ street: '1 Va Way', city: 'Arlington', state: 'VA', zip: '22201', transactionType: 'Purchase', processorId: '' });
ok(va.fileNumber.startsWith('VA-') && Number(va.fileNumber.split('-')[2]) === Number(fl.fileNumber.split('-')[2]) + 1, 'the sequence is shared across states (unique)');
const md = await api.createDeal({ street: '1 Md Way', city: 'Rockville', state: 'MD', zip: '20850', transactionType: 'Purchase', processorId: '' });
const moved = await api.updateDeal(md.id, { state: 'DC' });
ok(moved.fileNumber === md.fileNumber.replace(/^MD-/, 'DC-'), 'a new file moved to DC gets the DC prefix, same number');
// mark something as sent outside, then change state: the number is kept
const d = JSON.parse(storage.getItem(STORAGE_KEY));
d.outbox = (d.outbox || []).concat([{ id: 'ob-x', dealId: va.id, channel: 'email', status: 'sent', sentAt: '2026-11-09T20:00:00Z', toEmail: 'agent@example.test', createdAt: '2026-11-09T20:00:00Z' }]);
storage.setItem(STORAGE_KEY, JSON.stringify(d));
const api2 = createMockAdapter({ storage, sessionStorage: mem() }); await api2.signInDev('u-admin');   // re-reads the stored data
const kept = await api2.updateDeal(va.id, { state: 'FL' });
ok(kept.fileNumber === va.fileNumber && kept.state === 'FL', 'after an outside send the number is kept (state still saved)');

const sql = readFileSync('supabase/migrations/20261109230000_file_number_state_prefix.sql', 'utf8');
ok(/drop default/.test(sql) && /before insert or update of state on public\.deals/.test(sql) && !/update public\.deals/i.test(sql), 'migration replaces the MD-26 default with the state trigger and renumbers nothing');
console.log(fail ? fail + ' failed' : 'file number prefix passed');
if (fail) process.exit(1);
