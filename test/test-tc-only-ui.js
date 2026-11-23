/* TC-ONLY-2 (John, Nov 22 2026, 3:12-4:09 PM ET): the "Only communicate with TC" box on Order Contacts, and the "goes to the TC" notes in
 * the email compose and the Email sellers and agents preview. Staff only, set per agent, disabled until a TC is linked on that side.
 * Every role is checked on the demo portal. Fake data only. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="modal"></div><div id="toast"></div></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { hash: '#/deals/deal-1/contacts', pathname: '/', search: '' };
const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { tcOnlyBox, tcOnlyNotes, tcOnlyPreviewNote, tcOnlyMap, canSetTcOnly, canReadTcOnly, TC_ONLY_LABEL } = await import('../js/data/tc-only.js');
const { render } = await import('../js/pages/dealcontacts.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(e.message), name + ' [' + e.message + ']'); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the pure rules ----------
const linked = { tcOnly: false, tcs: [{ name: 'Riley Coordinator', email: 'riley.tc@example.test' }] };
const none = { tcOnly: false, tcs: [] };
ok(tcOnlyBox(linked, 'Buyer Agent', { canEdit: true }).disabled === false && /go to Riley Coordinator instead/.test(tcOnlyBox(linked, 'Buyer Agent', { canEdit: true }).hint), 'with a linked TC the box can be ticked and says who gets the email');
ok(tcOnlyBox(none, 'Listing Agent', { canEdit: true }).disabled === true && /Listing Agent TC/.test(tcOnlyBox(none, 'Listing Agent', { canEdit: true }).hint), 'with no TC on that side the box is disabled and says what to add');
ok(tcOnlyBox({ tcOnly: true, tcs: [] }, 'Buyer Agent', { canEdit: true }).disabled === false, 'a box already ticked can be unticked even when the TC was removed');
ok(tcOnlyBox(linked, 'Buyer Agent', { canEdit: false }).disabled === true, 'staff who do not run the file see the box but cannot change it');
ok(tcOnlyBox(linked, 'Client-Buyer', { canEdit: true }) === null && tcOnlyBox(null, 'Buyer Agent', { canEdit: true }) === null, 'only agent rows get a box');
const parts = [{ id: 'p1', role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Agent', email: 'Bianca@Example.test' } }, { id: 'p2', role: 'Listing Agent', contact: { firstName: 'Larry', lastName: 'Agent', email: 'larry@example.test' } }];
const rows = tcOnlyMap([{ participantId: 'p1', role: 'Buyer Agent', tcOnly: true, tcs: linked.tcs }, { participantId: 'p2', role: 'Listing Agent', tcOnly: true, tcs: [] }]);
const notes = tcOnlyNotes(rows, parts, ['bianca@example.test', 'larry@example.test', 'other@example.test']);
ok(notes.length === 2 && notes[0].kind === 'redirect' && /goes to their TC, Riley Coordinator, instead/.test(notes[0].text) && notes[1].kind === 'held' && /can't be sent to them/.test(notes[1].text), 'compose notes: swapped to the TC, or held when no TC is linked');
ok(tcOnlyNotes(rows, parts, ['other@example.test']).length === 0 && tcOnlyNotes(new Map(), parts, ['bianca@example.test']).length === 0, 'no note when no TC-only agent is on the email');
ok(/goes to their TC, Riley Coordinator/.test(tcOnlyPreviewNote(rows, 'p1')) && /held and not sent/.test(tcOnlyPreviewNote(rows, 'p2')) && tcOnlyPreviewNote(rows, 'p9') === '', 'Email sellers and agents preview notes');
ok(canSetTcOnly({ role: 'Processor' }) && canSetTcOnly({ role: 'Preprocessor' }) && canSetTcOnly({ role: 'Transaction Coordinator' }) && canSetTcOnly({ role: 'Super admin', isAdmin: true })
  && !canSetTcOnly({ role: 'Sales Person' }) && !canSetTcOnly({ role: 'Outside user' }) && !canSetTcOnly({ role: 'Outside user', accountRole: 'agent_tc' }), 'who can tick it: processor, pre-processor, CLA TC, Admin');

// ---------- TC-ONLY-2b (CRM Bot review of PR 414) ----------
// a TC with a name but no email is not a usable TC: the database holds the email, so the screen must say "held", not "goes to <TC>"
const noEmail = { tcOnly: false, tcs: [{ name: 'Nora Noemail', email: '', hasLogin: false }] };
const nb = tcOnlyBox(noEmail, 'Buyer Agent', { canEdit: true });
ok(nb.hasTc === false && nb.disabled === true && !/go to Nora/.test(nb.hint) && /no email address/.test(nb.hint), 'a TC with no email counts as no TC: the box is disabled and says why');
const noEmailOn = tcOnlyMap([{ participantId: 'p1', role: 'Buyer Agent', tcOnly: true, tcs: noEmail.tcs }]);
const ne = tcOnlyNotes(noEmailOn, [{ id: 'p1', role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Agent', email: 'bianca@example.test' } }], ['bianca@example.test']);
ok(ne.length === 1 && ne[0].kind === 'held' && /no email address/.test(ne[0].text) && !/Nora/.test(ne[0].text), 'compose: a ticked agent whose TC has no email shows the held note');
ok(/held and not sent/.test(tcOnlyPreviewNote(noEmailOn, 'p1')) && !/Nora/.test(tcOnlyPreviewNote(noEmailOn, 'p1')), 'Email sellers and agents: held wording for a TC with no email');
// a TC with an email but no portal login: typed emails (and title package, post-closing, scheduling, Task Builder emails) go to the TC;
// portal alerts and most automatic emails are held. TC-ONLY-2c (CRM Bot review of PR 415): the wording now says exactly that (it said only 'in-app alerts').
const noLogin = { tcOnly: true, tcs: [{ name: 'Lou Nologin', email: 'lou.tc@example.test', hasLogin: false }] };
const lb = tcOnlyBox(noLogin, 'Buyer Agent', { canEdit: true });
ok(/^Emails staff type, and title package, post-closing, scheduling and Task Builder emails, for this agent go to Lou Nologin instead\./.test(lb.hint) && /no portal login yet, so portal alerts and most automatic emails \(reminders and portal notices\) for this agent are held until they're invited\./.test(lb.hint) && !/[Ee]mails and alerts/.test(lb.hint),
  'box hint: a TC with no portal login: the opening line names the emails that still reach them, then says portal alerts and most automatic emails are held');
const nlRows = tcOnlyMap([{ participantId: 'p1', role: 'Buyer Agent', tcOnly: true, tcs: noLogin.tcs }]);
const nl = tcOnlyNotes(nlRows, [{ id: 'p1', role: 'Buyer Agent', contact: { email: 'bianca@example.test' } }], ['bianca@example.test']);
ok(nl[0].kind === 'redirect' && /goes to their TC, Lou Nologin, instead/.test(nl[0].text) && /portal alerts and most automatic emails \(reminders and portal notices\) for this agent are held until they're invited \(title package, post-closing, scheduling and Task Builder emails still go to them\)/.test(nl[0].text), 'compose note: no-login line');
ok(/portal alerts and most automatic emails \(reminders and portal notices\) for this agent are held until they're invited/.test(tcOnlyPreviewNote(nlRows, 'p1')), 'preview note: no-login line');
// TC-ONLY-2c: two TCs, only one with a login: the alerts go to the one with a login, so nothing is said to be held
const mixed = { tcOnly: true, tcs: [{ name: 'Lou Nologin', email: 'lou.tc@example.test', hasLogin: false }, { name: 'Sam Login', email: 'sam.tc@example.test', hasLogin: true }] };
const mb = tcOnlyBox(mixed, 'Buyer Agent', { canEdit: true }).hint;
ok(/^Emails and alerts for this agent go to Lou Nologin and Sam Login instead\./.test(mb) && /Lou Nologin has no portal login yet, so portal alerts and most automatic emails go only to Sam Login\. Lou Nologin still gets emails staff type, and title package, post-closing, scheduling and Task Builder emails\./.test(mb) && !/held/.test(mb),
  'two TCs, one without a login: worded per TC, nothing held');
const mRows = tcOnlyMap([{ participantId: 'p1', role: 'Buyer Agent', tcOnly: true, tcs: mixed.tcs }]);
ok(/go only to Sam Login/.test(tcOnlyPreviewNote(mRows, 'p1')) && !/held/.test(tcOnlyPreviewNote(mRows, 'p1')), 'preview note: two TCs, one without a login, nothing held');
// TC-ONLY-2c: ticked box whose only TC has no email: one message (not 'No TC is linked' plus 'has no email address')
const one = tcOnlyBox({ tcOnly: true, tcs: [{ name: 'Nora Noemail', email: '', hasLogin: false }] }, 'Buyer Agent', { canEdit: true });
ok(one.disabled === false && one.hint === "Their linked TC, Nora Noemail, has no email address, so emails and alerts for this agent are held. Add the TC's email on Contacts, or untick the box." && !/No TC is linked/.test(one.hint),
  'ticked, only TC has no email: one clear message, and the box can still be unticked');
ok(nb.hint === "Their linked TC, Nora Noemail, has no email address. Add the TC's email on Contacts first.", 'not ticked, only TC has no email: one clear message');
ok(!/portal login/.test(tcOnlyBox(linked, 'Buyer Agent', { canEdit: true }).hint) && !/portal login/.test(tcOnlyBox({ tcOnly: true, tcs: [{ name: 'Riley', email: 'r@example.test', hasLogin: true }] }, 'Buyer Agent', { canEdit: true }).hint), 'no extra line when the TC has a login (or the flag is unknown)');
// compose matches an agent by contact email OR portal-login email, like the server
const lp = [{ id: 'p1', role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Agent', email: 'bianca@example.test', profileId: 'u-b' } }];
const lr = tcOnlyMap([{ participantId: 'p1', role: 'Buyer Agent', tcOnly: true, tcs: linked.tcs }]);
ok(tcOnlyNotes(lr, lp, ['Bianca.Login@Example.test'], { 'u-b': 'bianca.login@example.test' }).length === 1, 'compose: the agent typed by their portal-login email gets the note');
ok(tcOnlyNotes(lr, lp, ['bianca.login@example.test'], new Map([['u-b', 'bianca.login@example.test']])).length === 1, 'login emails can be a Map too');
ok(tcOnlyNotes(lr, lp, ['bianca.login@example.test']).length === 0 && tcOnlyNotes(lr, lp, ['bianca@example.test'], {}).length === 1, 'contact email still matches; no login map, no login match');
// the server's admin rule: the admin flag, not the role name
ok(!canSetTcOnly({ role: 'Admin' }) && !canSetTcOnly({ role: 'Super admin' }) && canSetTcOnly({ role: 'Admin', isAdmin: true }) && canSetTcOnly({ role: 'Sales Person', isAdmin: true }),
  'Admin / Super admin need the admin flag (private.is_admin), like the server; any role with the flag may');
ok(!canReadTcOnly({ role: 'Sales Person' }) && !canReadTcOnly({ role: 'Sales Team' }) && canReadTcOnly({ role: 'Processor', viewOnly: true }) && !canSetTcOnly({ role: 'Processor', viewOnly: true }), 'sales staff do not read it; view-only staff read but cannot change');

// ---------- the demo portal, every role ----------
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const riley = await api.createAndLinkAgentTc('c-bagent', { firstName: 'Riley', lastName: 'Coordinator', email: 'riley.tc@example.test', phone: '301-555-0199', company: 'Harbor Realty (fake)' });
let st = await api.tcOnlyStatus('deal-1');
const bag = st.find((r) => r.participantId === 'dp-1-bagent'); const lag = st.find((r) => r.participantId === 'dp-1-lagent');
ok(bag && bag.tcs.length === 1 && bag.tcs[0].email === 'riley.tc@example.test' && !bag.tcOnly && lag && lag.tcs.length === 0, 'status lists the buyer agent\'s linked TC; the listing agent has none');
await rejects(() => api.setParticipantTcOnly('dp-1-lagent', true), 'the listing agent with no TC cannot be ticked', /no TC on the listing side/);
await rejects(() => api.setParticipantTcOnly('dp-1-buyer', true), 'a buyer row has no box', /buyer's agent or listing agent/);
const set = await api.setParticipantTcOnly('dp-1-bagent', true);
ok(set.tcOnly === true && set.tcs[0] === 'Riley Coordinator', 'the processor ticks it for the buyer\'s agent');
st = await api.tcOnlyStatus('deal-1');
ok(st.find((r) => r.participantId === 'dp-1-bagent').tcOnly && !st.find((r) => r.participantId === 'dp-1-lagent').tcOnly, 'set per agent: the listing agent is unchanged');

for (const [who, okRole] of [['u-preproc', true], ['u-tc', true], ['u-admin', true], ['u-sp', false], ['u-team', false], ['u-bagent', false], ['u-lagent', false], ['u-buyer', false], ['u-seller', false]]) {
  await api.signInDev(who);
  if (okRole) { const r = await api.tcOnlyStatus('deal-1').catch((e) => e); ok(Array.isArray(r), `${who} can read the setting`); }
  else await rejects(() => api.setParticipantTcOnly('dp-1-bagent', false), `${who} cannot change it`, /Only CLA staff|not found/i);
}

// ---------- the Contacts screen ----------
const paint = async (userId) => {
  await api.signInDev(userId);
  const s = await api.getSession(); const user = s.user || s; const deal = await api.getDeal('deal-1');
  const v = await render({ api, user, deal, refresh() {} });
  const app = document.getElementById('app'); app.innerHTML = toText(v.body); v.mount(app); return app;
};
let app = await paint('u-proc');
let box = app.querySelector('[data-tc-only="dp-1-bagent"]');
ok(box && box.hasAttribute('checked') && !box.hasAttribute('disabled') && app.textContent.includes(TC_ONLY_LABEL), 'processor: the buyer agent row shows the ticked box');
const lbox = app.querySelector('[data-tc-only="dp-1-lagent"]');
ok(lbox && lbox.hasAttribute('disabled') && /Listing Agent TC/.test(app.querySelector('[data-tc-only-row="dp-1-lagent"]').textContent), 'processor: the listing agent box is disabled until a TC is linked');
ok(!app.querySelector('[data-tc-only="dp-1-buyer"]') && !app.querySelector('[data-tc-only="dp-1-proc"]'), 'no box on buyer or staff rows');
box.checked = false; box.dispatchEvent(new window.Event('change')); await wait(20);
ok((await api.tcOnlyStatus('deal-1')).find((r) => r.participantId === 'dp-1-bagent').tcOnly === false, 'unticking on the screen turns it off');
app = await paint('u-proc'); box = app.querySelector('[data-tc-only="dp-1-bagent"]');
box.checked = true; box.dispatchEvent(new window.Event('change')); await wait(20);
ok((await api.tcOnlyStatus('deal-1')).find((r) => r.participantId === 'dp-1-bagent').tcOnly === true, 'ticking on the screen turns it on');
// TC-ONLY-2b: sales staff make no status call (the server would refuse it), and see no box
let calls = 0; const realStatus = api.tcOnlyStatus; api.tcOnlyStatus = async (...a) => { calls += 1; return realStatus(...a); };
for (const who of ['u-sp', 'u-team']) {
  calls = 0; app = await paint(who);
  ok(!app.querySelector('[data-tc-only]') && calls === 0, `${who}: no box and no refused status call`);
}
for (const who of ['u-proc', 'u-preproc', 'u-tc', 'u-admin']) {
  calls = 0; app = await paint(who);
  ok(calls === 1 && app.querySelector('[data-tc-only="dp-1-bagent"]'), `${who}: one status read and the box shows`);
}
api.tcOnlyStatus = realStatus;
// a TC with no portal login on the demo file: the hint on the screen says alerts are held
await api.signInDev('u-proc');
for (const who of ['u-bagent', 'u-lagent', 'u-buyer', 'u-seller']) {
  app = await paint(who).catch(() => null);
  ok(!app || !app.querySelector('[data-tc-only]'), `${who}: no box on Contacts`);
}

const realS2 = api.tcOnlyStatus;
api.tcOnlyStatus = async (id) => (await realS2(id)).map((r) => (r.participantId === 'dp-1-bagent' ? { ...r, tcs: r.tcs.map((t) => ({ ...t, hasLogin: false })) } : r));
app = await paint('u-proc');
ok(/portal alerts and most automatic emails \(reminders and portal notices\) for this agent are held until they're invited/.test(app.querySelector('[data-tc-only-row="dp-1-bagent"]').textContent), 'Contacts: TC with no portal login shows the held line');
api.tcOnlyStatus = async (id) => (await realS2(id)).map((r) => (r.participantId === 'dp-1-bagent' ? { ...r, tcs: r.tcs.map((t) => ({ ...t, email: '' })) } : r));
app = await paint('u-proc');
ok(/no email address/.test(app.querySelector('[data-tc-only-row="dp-1-bagent"]').textContent) && !/go to Riley/.test(app.querySelector('[data-tc-only-row="dp-1-bagent"]').textContent), 'Contacts: TC with no email shows the held wording');
api.tcOnlyStatus = realS2;
ok(typeof api.tcOnlyLoginEmails === 'function' && Object.keys(await api.tcOnlyLoginEmails(['u-bagent'])).length === 1, 'demo portal: login emails for compose');

// TC-ONLY-2c: the demo portal refuses ticking when the only linked TC has no email (same as the server's new guard)
{
  await api.signInDev('u-proc');
  await api.setParticipantTcOnly('dp-1-bagent', false);
  const before = await api.tcOnlyStatus('deal-1');
  const rc = (before.find((r) => r.participantId === 'dp-1-bagent').tcs[0] || {});
  ok(rc.email === 'riley.tc@example.test', 'demo: Riley is linked with an email');
  const nora = await api.createAndLinkAgentTc('c-lagent', { firstName: 'Nora', lastName: 'Noemail', email: '', phone: '301-555-0198', company: 'Harbor Realty (fake)' }).catch((e) => e);
  const lst = (await api.tcOnlyStatus('deal-1')).find((r) => r.participantId === 'dp-1-lagent');
  if (!(nora instanceof Error) && lst && lst.tcs.length && !lst.tcs.some((t) => t.email)) {
    await rejects(() => api.setParticipantTcOnly('dp-1-lagent', true), 'demo: the listing agent whose only TC has no email cannot be ticked', /has no email address/);
  } else console.log('note: the demo cannot add a TC with no email (' + (nora instanceof Error ? nora.message : 'TC has an email or is not on the file') + '); covered by the helpers and the SQL test');
  await api.setParticipantTcOnly('dp-1-bagent', true);
}

// ---------- the compose and preview notes are wired ----------
const email = readFileSync(new URL('../js/pages/dealemail.js', import.meta.url), 'utf8');
ok(email.includes('data-tc-only-note') && email.includes('tcOnlyNotes(') && email.includes("'[data-mail-bcc]'"), 'compose shows a note for To, Cc and Bcc');
ok(email.includes('canReadTcOnly(user)') && email.includes('tcOnlyLoginEmails(') && email.includes('all, tcLogins)'), 'compose: no call for sales; matches login emails');
const dealSrc = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(dealSrc.includes('tcOnlyPreviewNote(') && dealSrc.includes('data-tc-only-note'), 'Email sellers and agents preview shows the note');
ok(dealSrc.includes('canReadTcOnly(user)') && dealSrc.includes('automationModal(api, d, user)'), 'Email sellers and agents: no status call for sales');

console.log(fail ? fail + ' failed' : 'tc-only ui passed');
if (fail) process.exit(1);
