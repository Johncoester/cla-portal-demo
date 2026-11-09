/* UI side of the invite auto-email (John, Nov 9). Mock data, sendInviteEmail is a fake: nothing is sent. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/deal-4/contacts', hash: '#/deals/deal-4/contacts' };
let fail = 0; const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.sessionStorage = mem();
globalThis.FormData = class { constructor(f) { this.f = f; } entries() { return [...this.f.querySelectorAll('[name]')].map((el) => [el.getAttribute('name'), el.tagName === 'SELECT' ? (([...el.querySelectorAll('option')].find((o) => o.hasAttribute('selected')) || {}).value || '') : (el.getAttribute('value') || '')])[Symbol.iterator](); } };
const tick = () => new Promise((r) => setTimeout(r, 30));

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc'); const user = await api.getSession();
ok((await api.sendInviteEmail({ kind: 'agent', token: 'a'.repeat(64) })).sent === false, 'demo adapter never emails');
const asked = []; let answer = { sent: true, to: 'clatestportal+s1@gmail.com', from: 'fsantos@clatitle.com' };
api.sendInviteEmail = async (a) => { asked.push(a); return answer; };

// file Contacts row: seller (client) and listing agent
const { render } = await import('../js/pages/dealcontacts.js');
const open = async (cid, role, email) => { const page = await render({ api, user, deal: await api.getDeal('deal-4'), refresh: () => {} });
  document.body.innerHTML = toText(page.body); page.mount(document.body);
  document.querySelector(`[data-invite-portal="${cid}"][data-invite-role="${role}"]`).dispatchEvent(new window.Event('click', { bubbles: true }));
  const m = document.getElementById('modal'); if (email) m.querySelector('[data-invite-email]').value = email;
  m.querySelector('#ipf').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick(); return m; };
let m = await open('c-cora', 'Client-Seller');
ok(asked.length === 1 && asked[0].kind === 'agent' && /^[0-9a-f]{64}$/.test(asked[0].token), 'Contacts row: seller invite is emailed');
ok(m.querySelector('[data-invite-sent="yes"]') && /Emailed to clatestportal\+s1@gmail\.com/.test(m.textContent) && m.querySelector('[data-invite-link]'), 'dialog says emailed and still shows the link');
answer = { sent: false, connectGmail: true, to: '', error: 'Connect your @clatitle.com Gmail first.' };
for (const i of await api.listAgentInvites()) if (/lena/i.test(i.email) && i.status === 'pending') await api.revokeAgentInvite(i.id);   // free the seeded pending invite
m = await open('c-lena', 'Listing Agent');
ok(asked.length === 2 && m.querySelector('[data-invite-sent="connect"]') && /Connect Gmail to send automatically/.test(m.textContent) && m.querySelector('a[href="#/profile"]') && m.querySelector('[data-invite-link]'), 'listing agent, no Gmail connected: Connect Gmail message + copy link');

// Agent Invites page: create, Resend, Emailed column
globalThis.location = { href: 'https://testportal.example/#/agent-invites', hash: '#/agent-invites' };
const ai = await import('../js/pages/agent-invites.js');
const renderAI = async () => { const p = await ai.render({ api, refresh: () => {} }); document.body.innerHTML = toText(p.body); p.mount(document.body); return p; };
answer = { sent: true, to: 'clatestportal+a7@gmail.com', from: 'fsantos@clatitle.com' };
let refreshed = false; let p = await ai.render({ api, refresh: () => { refreshed = true; } }); document.body.innerHTML = toText(p.body); p.mount(document.body);
const f = document.querySelector('[data-invite-form]');
const setV = (sel, v) => { const el = f.querySelector(sel); if (el.tagName === 'SELECT') el.querySelectorAll('option').forEach((o) => { if (o.getAttribute('value') === v) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); else el.setAttribute('value', v); };
setV('[data-invite-contact]', ''); setV('[name="firstName"]', 'Al'); setV('[name="lastName"]', 'Agent'); setV('[name="email"]', 'clatestportal+a7@gmail.com');
f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick();
ok(asked.length === 3 && refreshed, 'Agent Invites: Create invite link emails it');
await renderAI();
ok(document.querySelector('[data-invite-sent="yes"]') && !document.querySelector('[data-invite-draft]') && !/Email delivery is paused|Invitation email \(not sent\)/.test(document.body.textContent), 'after create: emailed notice, no stale "not sent" draft block');
ok(!!document.querySelector('[data-invite-emailed]'), 'list has an Emailed column');
const rb = document.querySelector('[data-resend]');
if (rb) { rb.dispatchEvent(new window.Event('click', { bubbles: true })); await tick(); ok(asked.length === 4, 'Resend emails the new link'); } else ok(false, 'a Resend button is shown');
const realList = api.listAgentInvites;
api.listAgentInvites = async () => (await realList()).map((i, n) => (n === 0 ? { ...i, sentAt: '2026-11-09T23:10:00Z', sendCount: 2, sentTo: i.email } : n === 1 ? { ...i, sentAt: null, sendError: 'Live Test only emails test addresses' } : i));
await renderAI();
const cells = [...document.querySelectorAll('[data-invite-emailed]')].map((c) => c.textContent);
ok(/Emailed/.test(cells[0]) && /2/.test(cells[0]) && /Not emailed/.test(cells[1] || ''), 'Emailed column shows date and count, or Not emailed');
// Nov 9 6:04 PM: a refused / failed send shows the real reason once, and no stale draft block
answer = { sent: false, to: 'clatestportal+a8@gmail.com', error: 'Not sent. CLA Portal Live Test only sends to test addresses.' };
p = await ai.render({ api, refresh: () => {} }); document.body.innerHTML = toText(p.body); p.mount(document.body);
const f2 = document.querySelector('[data-invite-form]'); const setV2 = (sel, v) => f2.querySelector(sel).setAttribute('value', v);
setV2('[name="firstName"]', 'Bo'); setV2('[name="lastName"]', 'Agent'); setV2('[name="email"]', 'clatestportal+a8@gmail.com');
f2.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick(); await renderAI();
const t2 = document.querySelector('[data-invite-result]').textContent;
ok(/Not emailed: Not sent\. CLA Portal Live Test only sends to test addresses\. Until then/.test(t2) && !/\.\./.test(t2) && !document.querySelector('[data-invite-draft]'), 'failed send: real reason, single period, no draft block');
// a tab opened before the update (old data layer, new page): says reload, not a vague error
const { autoSendInvite, inviteSendNotice } = await import('../js/data/invite-send.js');
const stale = await autoSendInvite({}, 'agent', '#/agent-invite/' + 'b'.repeat(64));
const st = toText(inviteSendNotice(stale));
ok(stale.stale && /updated while this page was open/.test(st) && /Reload the page/.test(st) && /Resend on Agent Invites/.test(st) && !/\.\./.test(st), 'stale tab: tells you to reload and Resend');
const hrStale = toText(inviteSendNotice(await autoSendInvite({}, 'hr', '#/hr-invite/' + 'b'.repeat(64))));
ok(/Make a new invite link/.test(hrStale), 'stale tab (HR): points at the HR new-link button');
const bad = toText(inviteSendNotice(await autoSendInvite({ sendInviteEmail: async () => ({ sent: true }) }, 'agent', '#/agent-invite/xyz')));
ok(/not in the expected form/.test(bad) && /Use Resend on Agent Invites/.test(bad), 'malformed link: specific reason');
const conn = toText(inviteSendNotice({ sent: false, connectGmail: true, error: 'Connect Gmail first (Profile Setting > Gmail).' }));
ok(!/\.\./.test(conn) && /Connect Gmail to send automatically/.test(conn), 'connect-Gmail notice has no double period');
console.log(fail ? `FAIL ${fail}` : 'all invite auto-email UI checks passed'); process.exit(fail ? 1 : 0);
