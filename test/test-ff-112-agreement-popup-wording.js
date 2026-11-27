/* FF-112: agreement acknowledgement titles and pills use proper capitals and periods. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { AGREEMENTS } from '../js/data/agreements.js';
import { render } from '../js/pages/dealagreements.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const wantTitles = {
  wire_fraud: 'Wire Fraud Warning',
  privacy: 'Privacy Notice',
  e_consent: 'Consent to Electronic Records and Signatures',
};

ok(AGREEMENTS.length === 3, 'there are three agreement cards');
for (const a of AGREEMENTS) {
  ok(a.version === 1, `${a.code} stays at version 1 so existing acknowledgements still count`);
  ok(a.title === wantTitles[a.code], `${a.code} title is ${wantTitles[a.code]}`);
  ok(/[.!?](\s|$)/.test(a.body.trim()), `${a.code} body already ends a sentence with punctuation`);
}

const agreements = AGREEMENTS.map((a) => ({ ...a, myAck: null }));
const people = [
  { name: 'Jordan Buyer', roleLabel: 'Buyer', acks: {} },
];

async function pageFor(role, { needed, staffTable } = {}) {
  const api = {
    listAgreements: async () => ({
      agreements,
      needed: needed ?? (role !== 'staff'),
      people: staffTable ? people : undefined,
    }),
  };
  const view = await render({ api, deal: { id: 'D1' }, refresh() {} });
  return String(view.body);
}

for (const role of ['Buyer Agent', 'Listing Agent', 'Transaction Coordinator']) {
  const html = await pageFor(role, { needed: true });
  ok(html.includes('Privacy Notice') && html.includes('Consent to Electronic Records and Signatures') && html.includes('Wire Fraud Warning'), `${role} sees the corrected titles`);
  ok(html.includes('Please read and acknowledge.') && !html.includes('please read and acknowledge'), `${role} sees the pending pill with a capital and a period`);
  ok(!html.includes(">acknowledged<") && !html.includes("'acknowledged'"), `${role} pending view does not use the old lowercase acknowledged pill`);
}

const acked = AGREEMENTS.map((a) => ({ ...a, myAck: { at: '2026-11-27T16:40:00Z', roleLabel: 'Buyer agent' } }));
const ackedHtml = await (async () => {
  const api = { listAgreements: async () => ({ agreements: acked, needed: true }) };
  return String((await render({ api, deal: { id: 'D1' }, refresh() {} })).body);
})();
ok(ackedHtml.includes('Acknowledged.') && !ackedHtml.includes('>acknowledged<'), 'a finished acknowledgement pill uses a capital and a period');

const staffHtml = await pageFor('staff', { needed: false, staffTable: true });
ok(staffHtml.includes('Privacy Notice') && staffHtml.includes('Wire Fraud Warning') && staffHtml.includes('Consent to Electronic Records and Signatures'), 'staff see the same corrected titles');
ok(staffHtml.includes('Not yet.') && !staffHtml.includes('>not yet<'), 'staff empty cells say Not yet.');
ok(!staffHtml.includes('Please read and acknowledge.') && !staffHtml.includes('form class="ackf"'), 'staff do not get an acknowledgement form');

const mig = readFileSync('supabase/migrations/20261131410000_ff112_agreement_wording.sql', 'utf8');
const rollback = readFileSync('supabase/rollbacks/20261131410000_ff112_agreement_wording.sql', 'utf8');
ok(mig.includes("title = 'Privacy Notice'") && mig.includes("title = 'Consent to Electronic Records and Signatures'"), 'the TEST database file updates the two titles that needed capitals');
ok(mig.includes('version = 1') && !/version\s*=\s*2/.test(mig), 'the database file keeps version 1');
ok(!/alter policy|create policy|security definer|grant /i.test(mig), 'the database file does not change permissions');
ok(rollback.includes("title = 'Privacy notice'") && rollback.includes("title = 'Consent to electronic records and signatures'"), 'the rollback restores the previous titles');

const app = readFileSync('js/app.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const tab = readFileSync('js/pages/deal-tab.js', 'utf8');
ok(tab.includes('dealagreements.js?v=202611314100') && app.includes('deal-tab.js?v=202611314400') && html.includes('js/app.js?v=202611314400'), 'the Agreements tab stays at stamp 202611314100 and the shell is 202611314400');

console.log(fail ? fail + ' failed' : 'ff-112 agreement wording passed');
if (fail) process.exit(1);
