/* FF-108 (Francis, report Nov 23 2026 12:40 PM ET, Gmail 1a2097f4b647e378; confirmed 1:23 PM ET, Gmail 1a209a6175f2ed5f).
 * MD-26-97260 Order Contacts > Realtor: the Listing Agent's "Only communicate with TC" box works the same as the Buyer Agent's once that side's
 * TC is added and linked; each TC is listed directly under their agent; clearer greyed-out text. Demo portal, fake data only. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="modal"></div><div id="toast"></div></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { hash: '#/deals/deal-1/contacts', pathname: '/', search: '' };
const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { tcOnlyBox } = await import('../js/data/tc-only.js');
const { saveAgentTcOnFile, tcAgentChoices, fileAgents } = await import('../js/data/agent-tc.js');
const { AGENT_TC_TYPE } = await import('../js/data/constants.js');
const { render, tcUnderAgents } = await import('../js/pages/dealcontacts.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- (2) each TC directly under their agent ----------
const R = (id, role) => ({ id, role });
const order = (rows) => tcUnderAgents(rows).map((r) => r.id).join(',');
ok(order([R('b', 'Client-Buyer'), R('ba', 'Buyer Agent'), R('la', 'Listing Agent'), R('l', 'Lender'), R('btc', 'Buyer Agent TC'), R('ltc', 'Listing Agent TC')]) === 'b,ba,btc,la,ltc,l',
  'Buyer Agent TC sits under the Buyer Agent and Listing Agent TC under the Listing Agent; others keep their order');
ok(order([R('ba', 'Buyer Agent'), R('btc1', 'Buyer Agent TC'), R('p', 'Processor'), R('btc2', 'Buyer Agent TC')]) === 'ba,btc1,btc2,p', 'two buyer-side TCs both sit under the buyer agent, in their order');
ok(order([R('s', 'Client-Seller'), R('ltc', 'Listing Agent TC')]) === 's,ltc', 'a TC whose agent is not in the view stays where it was');
ok(order([R('b', 'Client-Buyer'), R('l', 'Lender')]) === 'b,l', 'files without TCs are unchanged');

// ---------- (3) clearer greyed-out text ----------
const none = { tcOnly: false, tcs: [] };
const h1 = tcOnlyBox(none, 'Listing Agent', { canEdit: true, agentName: 'Bridget Rigato' });
ok(h1.disabled && h1.hint === 'Add a Listing Agent TC for Bridget Rigato first to use this.', 'no TC: "Add a Listing Agent TC for <agent> first to use this."');
ok(tcOnlyBox(none, 'Buyer Agent', { canEdit: true, agentName: 'Noah Fields' }).hint === 'Add a Buyer Agent TC for Noah Fields first to use this.', 'buyer side wording is the same');
ok(tcOnlyBox(none, 'Listing Agent', { canEdit: true }).hint === 'Add a Listing Agent TC for this agent first to use this.', 'no agent name: says "this agent"');
const h2 = tcOnlyBox(none, 'Listing Agent', { canEdit: true, agentName: 'Bridget Rigato', sideTcNames: ['Kim Second'] });
ok(h2.disabled && /^Kim Second is on this file as Listing Agent TC but not linked to Bridget Rigato\./.test(h2.hint), 'a Listing Agent TC on the file but not linked: says so and what to do');
ok(/go to Riley/.test(tcOnlyBox({ tcOnly: false, tcs: [{ name: 'Riley', email: 'r@example.test', hasLogin: true }] }, 'Listing Agent', { canEdit: true, agentName: 'X' }).hint), 'linked TC: wording unchanged');

// ---------- (1) the demo portal, both sides end to end ----------
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
let deal = await api.getDeal('deal-1');
const choices = tcAgentChoices(fileAgents(deal.participants));
const lagentChoice = choices.find((c) => c.value.startsWith('Listing Agent:'));
const bagentChoice = choices.find((c) => c.value.startsWith('Buyer Agent:'));
ok(lagentChoice && bagentChoice, 'the add-contact form offers both agents');
let st = await api.tcOnlyStatus('deal-1');
ok(st.find((r) => r.participantId === 'dp-1-lagent').tcs.length === 0, 'before: the listing agent has no linked TC');
// add a coordinator for the listing agent, the way Order Contacts > + Add contact does it
const kim = await api.createContact({ firstName: 'Kim', lastName: 'Lister-TC', email: 'kim.lister.tc@example.test', phone: '', company: 'Oak Realty (fake)', contactType: AGENT_TC_TYPE });
const saved = await saveAgentTcOnFile(api, 'deal-1', kim.id, { linkedRoles: [], choice: lagentChoice.value, choices });
ok(saved.roles.join() === 'Listing Agent TC' && !saved.linkProblem, 'added as Listing Agent TC and linked to the listing agent');
st = await api.tcOnlyStatus('deal-1');
ok(st.find((r) => r.participantId === 'dp-1-lagent').tcs.map((t) => t.email).join() === 'kim.lister.tc@example.test', 'after: the listing agent has Kim as linked TC');
const on = await api.setParticipantTcOnly('dp-1-lagent', true);
ok(on.tcOnly === true, 'the listing agent box can now be ticked');
// buyer side the same way
const riley = await api.createContact({ firstName: 'Riley', lastName: 'Buyer-TC', email: 'riley.buyer.tc@example.test', phone: '', company: 'Harbor Realty (fake)', contactType: AGENT_TC_TYPE });
const savedB = await saveAgentTcOnFile(api, 'deal-1', riley.id, { linkedRoles: [], choice: bagentChoice.value, choices });
ok(savedB.roles.join() === 'Buyer Agent TC' && !savedB.linkProblem, 'buyer side: added and linked the same way');
ok((await api.setParticipantTcOnly('dp-1-bagent', true)).tcOnly === true, 'the buyer agent box can be ticked too');
// adding someone already linked: no second link, no error
const again = await saveAgentTcOnFile(api, 'deal-1', kim.id, { linkedRoles: ['Listing Agent TC'], choice: '', choices });
ok(!again.linkProblem, 'an already-linked coordinator: nothing more to link');

// ---------- the Contacts screen ----------
const paint = async (userId) => {
  await api.signInDev(userId);
  const s = await api.getSession(); const user = s.user || s; deal = await api.getDeal('deal-1');
  const v = await render({ api, user, deal, refresh() {} });
  const app = document.getElementById('app'); app.innerHTML = toText(v.body); v.mount(app); return app;
};
let app = await paint('u-proc');
const lbox = app.querySelector('[data-tc-only="dp-1-lagent"]');
ok(lbox && lbox.hasAttribute('checked') && !lbox.hasAttribute('disabled'), 'Contacts: the listing agent box is ticked and can be changed');
const ids = [...app.querySelectorAll('tr[data-participant]')].map((tr) => tr.getAttribute('data-participant'));
const roleOf = new Map(deal.participants.map((p) => [p.id, p.role]));
const roles = ids.map((id) => roleOf.get(id));
const iLA = roles.lastIndexOf('Listing Agent'); const iBA = roles.lastIndexOf('Buyer Agent');
ok(roles[iLA + 1] === 'Listing Agent TC', 'Contacts: the Listing Agent TC row is directly under the Listing Agent');
ok(roles[iBA + 1] === 'Buyer Agent TC', 'Contacts: the Buyer Agent TC row is directly under the Buyer Agent');
lbox.checked = false; lbox.dispatchEvent(new window.Event('change')); await wait(20);
ok((await api.tcOnlyStatus('deal-1')).find((r) => r.participantId === 'dp-1-lagent').tcOnly === false, 'Contacts: unticking the listing agent works');
// outside users still see no box
for (const who of ['u-lagent', 'u-bagent', 'u-seller']) {
  app = await paint(who).catch(() => null);
  ok(!app || !app.querySelector('[data-tc-only]'), `${who}: no box on Contacts`);
}

console.log(fail ? fail + ' failed' : 'ff-108 passed');
if (fail) process.exit(1);
