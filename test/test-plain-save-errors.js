/* John, t1500u: save errors in plain English (not-null, unique, RLS), technical detail kept out of the main
 * sentence, and the message stays on screen until the user dismisses it. No hosted project. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
const { plainError, toast } = await import('../js/ui.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const tech = /null value|constraint|relation|row-level|policy|23502|23505|42501|PGRST|violates/i;

const nn = plainError({ code: '23502', message: 'null value in column "parcel_id" of relation "deals" violates not-null constraint' });
ok(nn.text === 'This was not saved: Parcel ID is required. Fill it in and try again.', 'not-null names the field: ' + nn.text);
ok(nn.detail.includes('parcel_id') && !tech.test(nn.text), 'the database wording is only in the detail');
ok(plainError(new Error('null value in column "first_name" violates not-null constraint')).text.includes('First name is required'), 'a plain Error message is mapped too');

const uq = plainError({ code: '23505', message: 'duplicate key value violates unique constraint "contacts_email_uq"', details: 'Key (email)=(a@b.c) already exists.' });
ok(uq.text === 'This was not saved: another record already uses this email. Use the existing one or change it.', 'unique names the field from the constraint: ' + uq.text);
ok(plainError('duplicate key value violates unique constraint "x_pkey" Key (file_number)=(MD-1) already exists.').text.includes('this file number'), 'unique names the field from the key');
ok(!tech.test(uq.text), 'no constraint name in the sentence');

for (const raw of ['new row violates row-level security policy for table "deals"', 'permission denied for table deals', { code: '42501', message: 'insufficient privilege' }]) {
  const r = plainError(raw);
  ok(/not saved/.test(r.text) && /not allowed/.test(r.text) && !tech.test(r.text), 'RLS / permission is readable: ' + (raw.message || raw));
}
const own = 'You already asked for this update; CLA Title will answer it soon.';
ok(plainError(own).text === own && plainError(own).detail === '', 'our own plain messages pass through unchanged');
ok(plainError(new Error('Failed to fetch')).text.startsWith('Could not reach the server'), 'a network failure is readable');

// The toast: stays until dismissed, plain text first, detail folded away, no duplicate stacks.
const realSet = globalThis.setTimeout; const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push(ms); return 0; };
const t = toast('null value in column "parcel_id" of relation "deals" violates not-null constraint', 'err');
ok(!timers.length, 'an error toast has no timer, so it does not disappear');
ok(t.querySelector('.toast-text').textContent === 'This was not saved: Parcel ID is required. Fill it in and try again.', 'the toast leads with the plain sentence');
ok(t.querySelector('details.toast-detail') && t.querySelector('details.toast-detail').textContent.includes('parcel_id'), 'the technical detail is in a folded section');
ok(t.getAttribute('role') === 'alert', 'screen readers announce it');
toast('null value in column "parcel_id" of relation "deals" violates not-null constraint', 'err');
ok(document.querySelectorAll('#toasts .toast.err').length === 1, 'the same error does not stack');
document.querySelector('#toasts .toast.err .toast-x').dispatchEvent(new window.Event('click'));
ok(document.querySelectorAll('#toasts .toast.err').length === 0, 'the X dismisses it');
toast('Saved', 'ok');
ok(timers.length === 1 && timers[0] === 3000, 'a success note still goes away by itself');
const plain = toast(own, 'err');
ok(!plain.querySelector('details') && plain.textContent.includes(own), 'a plain message has no detail section');
globalThis.setTimeout = realSet;

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('all ok');
