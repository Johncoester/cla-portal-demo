/* MF-005 / MF-006. Fake rows only. No hosted database and no mail.
 * Document type starts at Miscellaneous/Other, with a free-text label.
 * Who can see it is checkboxes of named parties plus CLA only, stored as the existing visibility. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { visibilityChoices } from '../js/data/constants.js';
import { DOC_TYPES } from '../js/data/constants.js';
import { MISC_DOC_TYPE, MISC_DOC_LABEL, orderedDocTypes, docTypeLabel, resolveDocType, docTypeEditorState, acceptDocType } from '../js/data/document-type.js';
import { AUDIENCE_CONTROL, audienceParties, audienceChoices, checkedForVisibility, visibilityFromChecked, audienceSync, staffUploadSees } from '../js/data/document-audience.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const ordered = orderedDocTypes(DOC_TYPES);
ok(ordered[0] === MISC_DOC_TYPE && docTypeLabel(MISC_DOC_TYPE) === MISC_DOC_LABEL && ordered.indexOf(MISC_DOC_TYPE) === 0 && ordered.lastIndexOf(MISC_DOC_TYPE) === 0, 'Miscellaneous/Other is the first document type once');
ok(DOC_TYPES.indexOf('Other') > 0 && ordered.slice(1).includes('Contract / addendum') && ordered.includes('Payoff statement'), 'the other listed types stay, after Miscellaneous/Other');
ok(resolveDocType('Other', '  Surveyor letter  ') === 'Surveyor letter' && resolveDocType('Other', '   ') === 'Other' && resolveDocType('Deed', 'ignored') === 'Deed' && resolveDocType('', 'x') === '', 'free text is stored only after Miscellaneous/Other');
ok(acceptDocType('  Hello\u0000 type  ') === 'Hello type' && acceptDocType('x'.repeat(90)).length === 80, 'a free-text type is cleaned and capped at 80 characters');
const edited = docTypeEditorState('Surveyor letter', ordered);
ok(edited.choice === 'Other' && edited.free === 'Surveyor letter' && docTypeEditorState('Deed', ordered).free === '' && docTypeEditorState('Other', ordered).choice === 'Other', 'a custom label reopens as Miscellaneous/Other plus the typed text');

ok(AUDIENCE_CONTROL === 'checkbox', 'Matt chose checkboxes for who can see a document');
const parties = [
  { id: 'b1', role: 'Client-Buyer', contact: { firstName: 'Ben', lastName: 'Buyer' } },
  { id: 'ba', role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Agent' } },
  { id: 's1', role: 'Client-Seller', contact: { firstName: 'Sally', lastName: 'Seller' } },
  { id: 'la', role: 'Listing Agent', contact: { firstName: 'Larry', lastName: 'Agent' } },
  { id: 'len', role: 'Lender', contact: { firstName: 'Linda', lastName: 'Lender' } },
  { id: 'gone', role: 'Client-Buyer', removed: true, contact: { firstName: 'Gone', lastName: 'Buyer' } },
];
const named = audienceParties(parties);
ok(named.map((p) => p.label).join('|') === 'Ben Buyer, Buyer|Bianca Agent, Buyer\'s agent|Sally Seller, Seller|Larry Agent, Seller\'s agent', 'each named party is shown with name and role, and a lender is not');
ok(audienceParties([{ id: 'br', role: 'Client-Buyer', contact: { firstName: 'Bo', lastName: 'Rower' } }], { refinance: true })[0].roleLabel === 'Borrower', 'a refinance buyer is labeled Borrower');

const staffAllowed = visibilityChoices('Processor', false);
const staffChoices = audienceChoices({ parties: named, allowed: staffAllowed, role: 'Processor' });
ok(staffChoices.every((c) => c.id !== 'all') && staffChoices[staffChoices.length - 1].label === 'CLA only' && staffChoices.filter((c) => c.side).length === 4, 'staff checkboxes are the named parties plus CLA only');
const allOn = checkedForVisibility('all', staffChoices);
ok(visibilityFromChecked(allOn, staffChoices, staffAllowed).visibility === 'all', 'every named party stores everyone on the file');
const buyerOn = audienceSync(checkedForVisibility('buyer', staffChoices).concat([]), 'b1', staffChoices);
ok(buyerOn.includes('b1') && buyerOn.includes('ba') && !buyerOn.includes('s1') && !buyerOn.includes('cla'), 'checking a buyer checks the whole buyer side');
ok(visibilityFromChecked(buyerOn, staffChoices, staffAllowed).visibility === 'buyer', 'the buyer side stores buyer');
ok(visibilityFromChecked(['cla'], staffChoices, staffAllowed).visibility === 'staff', 'CLA only stores staff');
ok(visibilityFromChecked(['b1', 's1'], staffChoices, staffAllowed).visibility === 'all', 'both sides store everyone on the file');
ok(staffUploadSees('all').buyer && staffUploadSees('all').sellerAgent && !staffUploadSees('staff').buyer && staffUploadSees('buyer').buyerAgent && !staffUploadSees('buyer').seller && staffUploadSees('seller').seller && !staffUploadSees('seller').buyerAgent, 'a staff upload is visible to the sides the existing visibility already names');

const agentAllowed = visibilityChoices('Listing Agent');
const agentChoices = audienceChoices({ parties: named, allowed: agentAllowed, role: 'Listing Agent' });
ok(visibilityFromChecked(['b1', 'ba'], agentChoices, agentAllowed).error && visibilityFromChecked(['s1', 'la'], agentChoices, agentAllowed).visibility === 'seller' && visibilityFromChecked(['b1', 'ba', 's1', 'la'], agentChoices, agentAllowed).visibility === 'all', 'a listing agent can save their side or everyone, not the buyer side alone');
const buyerClient = audienceChoices({ parties: named, allowed: visibilityChoices('Client-Buyer'), role: 'Client-Buyer' });
ok(buyerClient.length === 1 && buyerClient[0].label === 'Share with CLA Title' && visibilityFromChecked(['cla'], buyerClient, visibilityChoices('Client-Buyer')).visibility === 'staff', 'a buyer still shares with CLA Title only');
const sellerClient = audienceChoices({ parties: named, allowed: visibilityChoices('Client-Seller'), role: 'Client-Seller' });
ok(visibilityFromChecked(checkedForVisibility('seller', sellerClient), sellerClient, visibilityChoices('Client-Seller')).visibility === 'seller', 'a seller still shares with CLA Title as the seller side');

const radioChoices = audienceChoices({ parties: named, allowed: staffAllowed, role: 'Processor', control: 'radio' });
ok(radioChoices[0].id === 'all' && audienceSync(['all'], 'all', radioChoices, 'radio').join() === 'all' && visibilityFromChecked(['s1'], radioChoices, staffAllowed).visibility === 'seller', 'switching the one constant to radio keeps a single choice');

const page = readFileSync(new URL('../js/pages/dealdocs.js', import.meta.url), 'utf8');
ok(page.includes('type="${AUDIENCE_CONTROL}"') && page.includes('data-audience') && page.includes('data-doc-free') && !page.includes('name="visibility"'), 'the documents upload uses the audience control and a free-text type, not the old dropdown');
ok(page.includes('not limited to the processor'), 'staff sharing still says every CLA staff role');

const sql = readFileSync(new URL('../supabase/migrations/20261110033000_doc_type_free_text.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261110033000_doc_type_free_text.sql', import.meta.url), 'utf8');
ok(/char_length\(doc_type\) <= 80/.test(sql) && !/create policy/i.test(sql) && !/drop policy/i.test(sql) && !/row level security/i.test(sql), 'the migration widens the type check and does not touch row security');
ok(/private\.doc_types\('staff'\)/.test(back) && !/drop table/i.test(back) && !/create policy/i.test(back), 'the rollback restores the listed-type check');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const deal = await api.getDeal('deal-1');
const live = audienceParties(deal.participants);
ok(live.some((p) => p.label === 'Ben Buyer, Buyer') && live.some((p) => p.role === 'Buyer Agent' && p.name === 'Bianca Buyer-Agent') && live.some((p) => p.role === 'Listing Agent') && !live.some((p) => p.role === 'Lender' || p.role === 'Processor'), 'the file parties are the buyer, seller, and both agents');
const liveChoices = audienceChoices({ parties: live, allowed: staffAllowed, role: 'Processor' });
const file = { name: 'party-note.pdf', description: '', mimeType: 'application/pdf', size: 20, dataUrl: 'data:application/pdf;base64,QQ==' };
const saved = await api.addDocument('deal-1', { ...file, name: 'custom-type.pdf', visibility: 'all', docType: resolveDocType('Other', 'Surveyor letter') });
ok(saved.docType === 'Surveyor letter', 'a free-text type is stored on the document');

async function sees(userId, id) {
  await api.signInDev(userId);
  const rows = await api.listDocuments('deal-1');
  return rows.some((d) => d.id === id);
}
const cases = [
  ['all', visibilityFromChecked(checkedForVisibility('all', liveChoices), liveChoices, staffAllowed).visibility],
  ['buyer', 'buyer'],
  ['seller', 'seller'],
  ['staff', 'staff'],
];
ok(cases[0][1] === 'all', 'the default staff selection is everyone on the file');
for (const [label, vis] of [['buyer', 'buyer'], ['seller', 'seller'], ['staff', 'staff'], ['all', 'all']]) {
  await api.signInDev('u-proc');
  const doc = await api.addDocument('deal-1', { ...file, name: `see-${label}.pdf`, visibility: vis, docType: 'Other' });
  const expect = staffUploadSees(vis);
  const got = {
    staff: await sees('u-proc', doc.id),
    buyer: await sees('u-buyer', doc.id),
    buyerAgent: await sees('u-bagent', doc.id) && await sees('u-multi', doc.id),
    seller: await sees('u-seller', doc.id),
    sellerAgent: await sees('u-lagent', doc.id),
  };
  ok(got.staff === expect.staff && got.buyer === expect.buyer && got.buyerAgent === expect.buyerAgent && got.seller === expect.seller && got.sellerAgent === expect.sellerAgent, `a staff ${label} file is seen by staff ${expect.staff}, buyer ${expect.buyer}, buyer agent ${expect.buyerAgent}, seller ${expect.seller}, seller agent ${expect.sellerAgent}`);
}

await api.signInDev('u-lagent');
const fromAgent = await api.addDocument('deal-1', { ...file, name: 'agent-all.pdf', visibility: 'all', docType: '' });
ok(await sees('u-lagent', fromAgent.id) && await sees('u-bagent', fromAgent.id) && await sees('u-seller', fromAgent.id) && !(await sees('u-buyer', fromAgent.id)) && await sees('u-proc', fromAgent.id), 'an agent file set to everyone still stays off the buyer until Share with buyer');
await api.signInDev('u-proc');
await api.shareDocumentWithClient(fromAgent.id, true);
ok(await sees('u-buyer', fromAgent.id), 'Share with buyer still opens that agent file to the buyer');

await api.signInDev('u-buyer');
const fromBuyer = await api.addDocument('deal-1', { ...file, name: 'buyer-cla.pdf', visibility: 'staff', docType: 'Other' });
ok(fromBuyer.visibility === 'staff' && await sees('u-buyer', fromBuyer.id) && await sees('u-proc', fromBuyer.id) && !(await sees('u-bagent', fromBuyer.id)) && !(await sees('u-seller', fromBuyer.id)), 'a buyer share with CLA Title stays with the buyer and CLA staff');

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.location = { hash: '#/deals/deal-1/documents' };
const { render } = await import('../js/pages/dealdocs.js');
await api.signInDev('u-proc');
const session = await api.getSession();
const opened = await api.getDeal('deal-1');
const view = await render({ api, user: session, deal: opened, refresh() {} });
document.body.innerHTML = String(view.body);
view.mount(document.body);
document.querySelector('#upbtn').click();
const modal = document.querySelector('#modal');
const type = modal.querySelector('[data-doc-type]');
const free = modal.querySelector('[data-doc-free]');
const boxes = [...modal.querySelectorAll('input[name=audience]')];
ok(type.options[1].value === 'Other' && type.options[1].textContent === 'Miscellaneous/Other', 'the upload list starts with Miscellaneous/Other');
ok(free.hidden, 'the free-text type stays hidden until Miscellaneous/Other is chosen');
type.querySelector('option[value="Other"]').selected = true;
type.dispatchEvent(new window.Event('change', { bubbles: true }));
ok(!free.hidden, 'choosing Miscellaneous/Other shows the free-text type');
ok(boxes.length > 1 && boxes.every((b) => b.type === 'checkbox') && boxes.some((b) => b.nextSibling && String(b.parentElement.textContent).includes('Ben Buyer, Buyer')) && boxes.some((b) => b.value === 'cla'), 'who can see it is a checkbox per named party plus CLA only');
ok(boxes.filter((b) => b.getAttribute('data-side')).every((b) => b.hasAttribute('checked')) && !boxes.find((b) => b.value === 'cla').hasAttribute('checked'), 'a staff upload starts with every named party checked');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all passed');
