/* FF-108b (Francis Santos, confirmed Nov 23 2026 5:21 PM ET, Gmail 1a20a80a4cca28a6).
 * Required Assigned to dropdown (Buyer's Agent TC / Listing Agent TC) on Add Contact and Edit Contact
 * when the role or contact type is Transaction coordinator. Always visible, including when picking
 * an existing coordinator who already has an agent_tc_links row (that side is pre-selected and can be changed).
 * Demo portal, fake data only. No database file. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toast"></div></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { hash: '#/deals/deal-1/contacts', pathname: '/', search: '' };
const optionVal = (o) => (o && (o.getAttribute('value') ?? o.value)) || '';
const proto = window.HTMLSelectElement && window.HTMLSelectElement.prototype;
if (proto) Object.defineProperty(proto, 'value', {
  get() { const opts = [...this.options || []]; const o = opts.find((x) => x.hasAttribute('selected') || x.selected) || opts[0]; return optionVal(o); },
  set(v) {
    const want = String(v);
    for (const o of [...this.options || []]) {
      if (optionVal(o) === want) o.setAttribute('selected', '');
      else o.removeAttribute('selected');
    }
  },
});
class MiniFormData {
  constructor(form) {
    this.map = new Map();
    if (!form) return;
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name || el.type === 'file' || el.disabled) return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      let val = el.value;
      if (el.tagName === 'SELECT') {
        const hit = [...el.options].find((o) => o.hasAttribute('selected') || o.selected);
        val = hit ? (hit.getAttribute('value') ?? hit.value ?? '') : '';
      }
      this.map.set(el.name, val == null ? '' : String(val));
    });
  }
  entries() { return this.map.entries(); }
}
globalThis.FormData = MiniFormData;
if (window) window.FormData = MiniFormData;

const { readFileSync } = await import('node:fs');

const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { AGENT_TC_TYPE } = await import('../js/data/constants.js');
const { AGENT_TC_PICK, BUYER_AGENT_TC, LISTING_AGENT_TC, fileAgents } = await import('../js/data/agent-tc.js');
const {
  ASSIGNED_TO_LABEL, BUYER_AGENT_TC_ASSIGN_LABEL, LISTING_AGENT_TC_ASSIGN_LABEL,
  TC_CHOOSE_ASSIGNED, TC_NEED_BUYER_AGENT, TC_NEED_LISTING_AGENT, TC_ASSIGN_CHOICES,
  knownTcAssignedRole, moveAssignedTcOnFile, saveAssignedTcOnFile, tcAssignedLabel,
  tcAssignedProblem, tcAssignedRole,
} = await import('../js/data/tc-assigned.js');
const { render, tcUnderAgents } = await import('../js/pages/dealcontacts.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const toastText = () => (document.getElementById('toasts') && document.getElementById('toasts').textContent) || '';
const ev = (name) => new window.Event(name, { bubbles: true, cancelable: true });

// ---------- helpers ----------
ok(ASSIGNED_TO_LABEL === 'Assigned to' && BUYER_AGENT_TC_ASSIGN_LABEL === "Buyer's Agent TC" && LISTING_AGENT_TC_ASSIGN_LABEL === 'Listing Agent TC', 'the labels match the mockup');
ok(TC_ASSIGN_CHOICES.map((c) => c.value).join() === 'Buyer Agent TC,Listing Agent TC' && TC_ASSIGN_CHOICES.map((c) => c.label).join() === "Buyer's Agent TC,Listing Agent TC", 'the dropdown stores Buyer Agent TC / Listing Agent TC and shows the mockup labels');
ok(tcAssignedRole('Buyer Agent TC') === BUYER_AGENT_TC && tcAssignedRole('Listing Agent TC') === LISTING_AGENT_TC && tcAssignedRole('') === '' && tcAssignedRole('Transaction coordinator') === '', 'only the two sides count as an Assigned to choice');
ok(tcAssignedLabel(BUYER_AGENT_TC) === "Buyer's Agent TC" && tcAssignedLabel(LISTING_AGENT_TC) === 'Listing Agent TC', 'the stored role maps back to the mockup label');

ok(knownTcAssignedRole({ linkedRoles: ['Listing Agent TC'] }) === 'Listing Agent TC', 'a prior listing-side link is pre-selected');
ok(knownTcAssignedRole({ linkedRoles: ['Buyer Agent TC'] }) === 'Buyer Agent TC', 'a prior buyer-side link is pre-selected');
ok(knownTcAssignedRole({ fileRoles: ['Listing Agent TC'], linkedRoles: ['Buyer Agent TC'], preferredRole: 'Listing Agent TC' }) === 'Listing Agent TC', 'the row being edited wins over a link on the other side');
ok(knownTcAssignedRole({ fileRoles: ['Buyer Agent TC', 'Listing Agent TC'], preferredRole: 'Buyer Agent TC' }) === 'Buyer Agent TC', 'when both sides are on the file, the opened row is pre-selected');
ok(knownTcAssignedRole({ fileRoles: ['Buyer Agent TC'] }) === 'Buyer Agent TC', 'a single file role is pre-selected when no opened row is passed');
ok(knownTcAssignedRole({}) === '', 'with no file role and no link, Assigned to starts blank');

const bothAgents = [
  { contactId: 'c-bagent', role: 'Buyer Agent', name: 'Bianca' },
  { contactId: 'c-lagent', role: 'Listing Agent', name: 'Larry' },
];
ok(tcAssignedProblem({ hasPerson: false, choice: '', agents: bothAgents }) === '', 'a blank person does not require Assigned to');
ok(tcAssignedProblem({ hasPerson: true, choice: '', agents: bothAgents }) === TC_CHOOSE_ASSIGNED, 'Assigned to is required');
ok(tcAssignedProblem({ hasPerson: true, choice: 'Listing Agent TC', agents: bothAgents }) === '', 'Listing Agent TC is allowed when the listing agent is on the file');
ok(tcAssignedProblem({ hasPerson: true, choice: 'Buyer Agent TC', agents: bothAgents }) === '', "Buyer's Agent TC is allowed when the buyer's agent is on the file");
ok(tcAssignedProblem({ hasPerson: true, choice: 'Listing Agent TC', agents: bothAgents.filter((a) => a.role === 'Buyer Agent') }) === TC_NEED_LISTING_AGENT, 'Listing Agent TC is refused when the listing agent is not on the file');
ok(tcAssignedProblem({ hasPerson: true, choice: 'Buyer Agent TC', agents: bothAgents.filter((a) => a.role === 'Listing Agent') }) === TC_NEED_BUYER_AGENT, "Buyer's Agent TC is refused when the buyer's agent is not on the file");
ok(tcAssignedProblem({ hasPerson: true, choice: 'Listing Agent TC', agents: [], alreadyOnSide: true }) === '', 'saving an already-stored side does not require the agent to still be on the file');

// ---------- source: both forms ----------
const contactsSrc = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
ok(contactsSrc.includes('assignedToField') && contactsSrc.includes('data-tc-assigned') && contactsSrc.includes('data-tc-assigned-sel'), 'Add Contact and Edit Contact share the Assigned to field');
ok(contactsSrc.includes("Buyer's Agent TC") && contactsSrc.includes('Listing Agent TC') && contactsSrc.includes('Select...'), 'the dropdown options and placeholder match the mockup');
ok(contactsSrc.includes("modal('Add contact to this order'") && contactsSrc.includes('${assignedToField("")}'), 'Add Contact includes Assigned to');
ok(contactsSrc.includes("modal('Edit contact'") && contactsSrc.includes('assignedToField(initialAssigned'), 'Edit Contact includes Assigned to');
ok(!contactsSrc.includes('Which agent are they linked to?') && !contactsSrc.includes('data-tc-which') && !contactsSrc.includes('data-tc-agent'), 'Add/Edit Contact no longer use the Which agent follow-up');
ok(contactsSrc.includes('tcPickFor') && contactsSrc.includes('knownTcAssignedRole') && contactsSrc.includes('moveAssignedTcOnFile'), 'a known link is pre-selected and the chosen side is what gets saved');
ok(readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8').includes('Which agent are they linked to?'), 'Place Order is unchanged');
ok(readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8').includes('Which agent are they linked to?'), 'Parties is unchanged');

// ---------- demo portal: save helpers + both forms ----------
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');

const paint = async () => {
  const s = await api.getSession(); const user = s.user || s; const deal = await api.getDeal('deal-1');
  const v = await render({ api, user, deal, refresh() {} });
  const app = document.getElementById('app'); app.innerHTML = toText(v.body); v.mount(app); return { app, deal, user };
};
const rolesOn = async (contactId) => (await api.getDeal('deal-1')).participants.filter((p) => p.contactId === contactId && !p.removed).map((p) => p.role);
const under = async (contactId) => {
  const deal = await api.getDeal('deal-1');
  const ordered = tcUnderAgents(deal.participants.filter((p) => !p.removed)).map((p) => p.contactId + ':' + p.role);
  return ordered;
};

const modalEl = () => document.getElementById('modal');
const openAdd = async () => {
  const { app } = await paint();
  const btn = app.querySelector('#addp');
  ok(!!btn, 'Contacts has + Add contact');
  btn.click();
  await wait(30);
  const m = modalEl();
  ok(m && m.querySelector('#apf'), 'Add contact modal opened');
  return m;
};
const setRole = async (m, role) => {
  const sel = m.querySelector('[name=role]');
  sel.value = role;
  sel.dispatchEvent(ev('change'));
  await wait(20);
  return sel;
};
const assignedBox = (m) => m.querySelector('[data-tc-assigned]');
const assignedSel = (m) => m.querySelector('[data-tc-assigned-sel]');

let m = await openAdd();
ok(assignedBox(m) && assignedBox(m).hidden, 'Assigned to starts hidden until the role is Transaction coordinator');
await setRole(m, AGENT_TC_PICK);
ok(!assignedBox(m).hidden, 'Add Contact: Assigned to is visible for Transaction coordinator');
ok([...assignedSel(m).options].map((o) => o.textContent).join('|') === "Select...|Buyer's Agent TC|Listing Agent TC", "Add Contact options are Select..., Buyer's Agent TC, Listing Agent TC");
ok(assignedSel(m).value === '', 'a new person starts with Select...');
await setRole(m, 'Buyer Agent');
ok(assignedBox(m).hidden, 'Assigned to hides again when the role is not Transaction coordinator');
await setRole(m, AGENT_TC_PICK);

// required validation
m.querySelector('[name=firstName]').value = 'Pat';
m.querySelector('[name=lastName]').value = 'Newbie';
m.querySelector('[name=email]').value = 'pat.newbie.tc@example.test';
m.querySelector('#apf').dispatchEvent(ev('submit'));
await wait(40);
ok(/Choose whether they are the Buyer's Agent TC or the Listing Agent TC/.test(toastText()), 'Add Contact: leaving Assigned to blank is refused in plain words');
ok((await api.listContacts()).every((c) => c.email !== 'pat.newbie.tc@example.test') || (await rolesOn((await api.listContacts()).find((c) => c.email === 'pat.newbie.tc@example.test')?.id)).every((r) => !['Buyer Agent TC', 'Listing Agent TC'].includes(r)), 'a refused add does not put them on the file as a TC');

// new TC as Buyer's Agent TC
assignedSel(m).value = BUYER_AGENT_TC;
assignedSel(m).dispatchEvent(ev('change'));
m.querySelector('#apf').dispatchEvent(ev('submit'));
await wait(80);
const pat = (await api.listContacts()).find((c) => c.email === 'pat.newbie.tc@example.test');
ok(pat && (await rolesOn(pat.id)).includes('Buyer Agent TC') && !(await rolesOn(pat.id)).includes('Listing Agent TC'), "Add Contact: a new TC saved as Buyer's Agent TC is on the buyer side only");
const patLink = (await api.listAgentTcs('c-bagent')).some((r) => r.contactId === pat.id);
ok(patLink, "Add Contact: saving Buyer's Agent TC links them to the buyer's agent");
ok((await under(pat.id)).includes(pat.id + ':Buyer Agent TC'), "the new buyer-side TC lists under the buyer's agent");

// new TC as Listing Agent TC
m = await openAdd();
await setRole(m, AGENT_TC_PICK);
m.querySelector('[name=firstName]').value = 'Quinn';
m.querySelector('[name=lastName]').value = 'Lister';
m.querySelector('[name=email]').value = 'quinn.lister.tc@example.test';
assignedSel(m).value = LISTING_AGENT_TC;
m.querySelector('#apf').dispatchEvent(ev('submit'));
await wait(80);
const quinn = (await api.listContacts()).find((c) => c.email === 'quinn.lister.tc@example.test');
ok(quinn && (await rolesOn(quinn.id)).includes('Listing Agent TC') && !(await rolesOn(quinn.id)).includes('Buyer Agent TC'), 'Add Contact: a new TC saved as Listing Agent TC is on the listing side only');
ok((await api.listAgentTcs('c-lagent')).some((r) => r.contactId === quinn.id), 'Add Contact: saving Listing Agent TC links them to the listing agent');
ok((await under(quinn.id)).includes(quinn.id + ':Listing Agent TC'), 'the new listing-side TC lists under the listing agent');

// existing TC with a prior listing-side link, added as Buyer's Agent TC (user changes the pre-selected side)
const prior = await api.createContact({ firstName: 'Remy', lastName: 'Linked', email: 'remy.linked.tc@example.test', phone: '', company: 'Harbor Realty (fake)', contactType: AGENT_TC_TYPE });
await api.linkAgentTc('c-lagent', prior.id);
m = await openAdd();
await setRole(m, AGENT_TC_PICK);
const dir = m.querySelector('[data-dir-select]');
ok(dir && [...dir.options].some((o) => o.value === prior.id), 'Add Contact lists the existing coordinator in the company or person list');
dir.value = prior.id;
dir.dispatchEvent(ev('change'));
await wait(40);
ok(!assignedBox(m).hidden, 'Add Contact: Assigned to stays visible when picking an existing TC who already has a link');
ok(assignedSel(m).value === LISTING_AGENT_TC, 'Add Contact: the existing listing-side link is pre-selected');
assignedSel(m).value = BUYER_AGENT_TC;
m.querySelector('#apf').dispatchEvent(ev('submit'));
await wait(80);
ok((await rolesOn(prior.id)).includes('Buyer Agent TC') && !(await rolesOn(prior.id)).includes('Listing Agent TC'), "Add Contact: the user's Assigned to choice wins over the prior link, so Remy is the Buyer's Agent TC on this file");
ok((await under(prior.id)).includes(prior.id + ':Buyer Agent TC'), "Remy lists under the buyer's agent after the chosen side is saved");

// Edit Contact: required, pre-select, change side
const { app } = await paint();
const deal = await api.getDeal('deal-1');
const quinnRow = deal.participants.find((p) => p.contactId === quinn.id && p.role === 'Listing Agent TC');
const editBtn = app.querySelector(`[data-edit="${quinnRow.id}"]`);
ok(!!editBtn, 'Quinn has an Edit button');
editBtn.click();
await wait(40);
m = modalEl();
ok(m && m.querySelector('#ecf'), 'Edit contact modal opened');
ok(!assignedBox(m).hidden, 'Edit Contact: Assigned to is visible for a Transaction coordinator');
ok([...assignedSel(m).options].map((o) => o.textContent).join('|') === "Select...|Buyer's Agent TC|Listing Agent TC", 'Edit Contact options match the mockup');
ok(assignedSel(m).value === LISTING_AGENT_TC, 'Edit Contact pre-selects Listing Agent TC for Quinn');
assignedSel(m).value = '';
m.querySelector('#ecf').dispatchEvent(ev('submit'));
await wait(40);
ok(/Choose whether they are the Buyer's Agent TC or the Listing Agent TC/.test(toastText()), 'Edit Contact: clearing Assigned to is refused');
ok((await rolesOn(quinn.id)).includes('Listing Agent TC'), 'a refused edit leaves Quinn on the listing side');
assignedSel(m).value = BUYER_AGENT_TC;
m.querySelector('#ecf').dispatchEvent(ev('submit'));
await wait(80);
ok((await rolesOn(quinn.id)).includes('Buyer Agent TC') && !(await rolesOn(quinn.id)).includes('Listing Agent TC'), "Edit Contact: changing Assigned to to Buyer's Agent TC moves Quinn to the buyer side");
ok((await under(quinn.id)).includes(quinn.id + ':Buyer Agent TC'), 'after Edit, Quinn lists under the buyer agent, not the listing agent');

// helper: moveAssignedTcOnFile itself
const moved = await moveAssignedTcOnFile(api, 'deal-1', pat.id, LISTING_AGENT_TC, (await api.getDeal('deal-1')).participants.filter((p) => p.contactId === pat.id));
ok(moved.role === 'Listing Agent TC' && (await rolesOn(pat.id)).includes('Listing Agent TC') && !(await rolesOn(pat.id)).includes('Buyer Agent TC'), 'moveAssignedTcOnFile drops the old side after adding the new one');

// file with no listing agent
const bare = await api.createDeal({ street: '220 Assigned Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-23', transactionType: 'Purchase', processorId: 'u-proc' });
await api.addParticipant(bare.id, 'c-bagent', 'Buyer Agent');
const agentsBare = fileAgents((await api.getDeal(bare.id)).participants);
ok(tcAssignedProblem({ hasPerson: true, choice: 'Listing Agent TC', agents: agentsBare }) === TC_NEED_LISTING_AGENT, 'Assigned to Listing Agent TC is refused on a file with no listing agent');
const solo = await api.createContact({ firstName: 'Sol', lastName: 'Only', email: 'sol.only.tc@example.test', contactType: AGENT_TC_TYPE });
const savedBare = await saveAssignedTcOnFile(api, bare.id, solo.id, BUYER_AGENT_TC);
ok(savedBare.role === 'Buyer Agent TC', "saveAssignedTcOnFile still adds a Buyer's Agent TC when only the buyer's agent is on the file");

console.log(fail ? `ff-108b: ${fail} failed` : 'ff-108b passed');
if (fail) process.exit(1);
