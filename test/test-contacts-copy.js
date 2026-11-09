/* Order Contacts copy feedback. Fake values only. A failed clipboard never counts as copied. */
import { contactCopyMessage, contactCopyOutcome } from '../js/pages/dealcontacts.js';
import { copyPlainText, partyCopyButton } from '../js/pages/deal.js';
import { toText } from '../js/ui.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const PHONE = '301-555-0148';
const EMAIL = 'riley.longmail.closing.coordinator.fake@example.test';
const fakeDoc = (command) => ({ body: { appendChild() {} }, createElement() { return { value: '', setAttribute() {}, style: {}, select() {}, remove() {} }; }, execCommand: command });

const success = contactCopyMessage(true, 'phone');
ok(success.ok === true && success.message === 'Copied' && !success.level, 'a successful Contacts copy still says Copied');
const denied = contactCopyMessage(false, 'phone');
ok(denied.ok === false && denied.level === 'err' && denied.message === 'Could not copy the phone number.' && !/Copied/.test(denied.message), 'a failed phone copy is not reported as Copied');
const emailFail = contactCopyMessage(false, 'email');
ok(emailFail.message === 'Could not copy the email address.' && emailFail.level === 'err', 'a failed email copy names the email address');

const wrote = [];
const copied = await contactCopyOutcome(PHONE, 'phone', { navigator: { clipboard: { writeText: async (v) => { wrote.push(v); } } }, document: { createElement() { throw new Error('fallback must not run after success'); } } });
ok(copied.message === 'Copied' && wrote[0] === PHONE, 'a successful clipboard write reports success for the phone');
const refused = await contactCopyOutcome(EMAIL, 'email', { navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } }, document: fakeDoc(() => false) });
ok(refused.ok === false && refused.message === 'Could not copy the email address.', 'a denied clipboard plus a failed fallback is a failure');
const older = await contactCopyOutcome(PHONE, 'phone', { navigator: {}, document: fakeDoc(() => true) });
ok(older.ok === true && older.message === 'Copied', 'a successful older copy command reports success');

const parties = toText(partyCopyButton('phone', PHONE));
ok(parties.includes('Copy phone number') && await copyPlainText(PHONE, { navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } }, document: fakeDoc(() => false) }) === false, 'the Parties copy still treats a denied clipboard as a failure');

console.log(fail ? fail + ' failed' : 'contacts copy passed');
if (fail) process.exit(1);
