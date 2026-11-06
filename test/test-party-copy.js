/* Parties copy icons. Fake values only. A failed clipboard never counts as copied. */
import { copyPlainText, partyCopyButton } from '../js/pages/deal.js';
import { toText } from '../js/ui.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const phone = toText(partyCopyButton('phone', '301-555-0148'));
const email = toText(partyCopyButton('email', 'riley.longmail.closing.coordinator.fake@example.test'));
ok(phone.includes('Copy phone number') && phone.includes('title="Copy phone number"') && !phone.includes('>Copy<'), 'the phone control is an icon with that accessible name');
ok(email.includes('Copy email address') && email.includes('data-copy-kind="email"') && !email.includes('>Copy<'), 'the email control is an icon with that accessible name');
ok(!phone.includes('contact details') && !email.includes('data-copy="'), 'these buttons are not the old whole-row Copy');
const fakeDoc = (command) => ({ body: { appendChild() {} }, createElement() { return { value: '', setAttribute() {}, style: {}, select() {}, remove() {} }; }, execCommand: command });
ok(await copyPlainText('301-555-0148', { navigator: { clipboard: { writeText: async (v) => { if (v !== '301-555-0148') throw new Error('wrong value'); } } }, document: { createElement() { throw new Error('fallback must not run after success'); } } }) === true, 'a successful clipboard write is success');
ok(await copyPlainText('riley.longmail.closing.coordinator.fake@example.test', { navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } }, document: fakeDoc(() => false) }) === false, 'a denied clipboard is a failure');
ok(await copyPlainText('301-555-0148', { navigator: {}, document: fakeDoc(() => true) }) === true, 'the older copy command can succeed when clipboard is missing');
ok(await copyPlainText('301-555-0148', { navigator: {}, document: { createElement() { throw new Error('no document copy'); }, execCommand() { return false; } } }) === false, 'a broken fallback is still a failure');
console.log(fail ? fail + ' failed' : 'party copy passed');
if (fail) process.exit(1);
