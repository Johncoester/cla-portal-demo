/* JC-AGENT-EDIT-1 (John, Nov 25 2026, 1:57 PM ET): an Admin or Super admin edits a real estate agent's profile
 * (name, brokerage, cell, office phone, picture). Processor, Sales Person, Sales Team, agents and clients cannot edit
 * someone else's. The agent's own edit still works. Mock adapter, the Supabase adapter (fake client), and the pages.
 * Fake names and data only. No hosted project. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { agentInviteSupabase } from '../js/data/supabase-agent-invite.js';
import { canEditAgentProfiles, cleanAdminAgentPatch, AGENT_EDIT_DENIED, AGENT_EDIT_NOT_FOUND, agentProfileHref } from '../js/data/agent-profile-admin.js';
import { PHOTO_TYPE_MSG } from '../js/data/agent-profile.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="modal"></div><div id="toast"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/users', hash: '#/users', search: '', pathname: '/' };
window.scrollTo = () => {};
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
globalThis.sessionStorage = mem(); globalThis.localStorage = mem();

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const refused = async (fn, want) => { try { await fn(); return false; } catch (e) { return want ? String(e.message).includes(want) : true; } };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

// ---------- shared rules ----------
ok(canEditAgentProfiles({ role: 'Super admin', isAdmin: true, status: 'active' }) && canEditAgentProfiles({ role: 'Admin', isAdmin: true }), 'Admin and Super admin may edit agent profiles');
ok(!canEditAgentProfiles({ role: 'Processor', isAdmin: false }) && !canEditAgentProfiles({ role: 'Sales Person' }) && !canEditAgentProfiles({ role: 'Sales Team' })
  && !canEditAgentProfiles({ role: 'Transaction Coordinator' }) && !canEditAgentProfiles({ role: 'Outside user' }) && !canEditAgentProfiles(null), 'Processor, Sales, TC, agents and clients may not');
ok(!canEditAgentProfiles({ role: 'Admin', isAdmin: true, status: 'disabled' }), 'a suspended Admin may not');
const clean = cleanAdminAgentPatch({ firstName: ' Bea ', lastName: 'Agent', email: 'x@y.test', licenseNumber: 'L1', birthMonth: '2', birthDay: '30', street: '1 Main', cellPhone: '3015550199', officePhone: '', brokerage: 'B', photoShape: 'square' });
ok(clean.firstName === 'Bea' && clean.cellPhone === '301-555-0199' && clean.officePhone === '' && clean.photoShape === 'square' && !('email' in clean) && !('licenseNumber' in clean) && !('birthMonth' in clean) && !('street' in clean),
  'only name, brokerage, phones and picture are kept (email, license, birthday and address are dropped)');
ok(await refused(() => cleanAdminAgentPatch({ photo: 'data:text/plain;base64,QUJD' }), PHOTO_TYPE_MSG), 'a picture that is not an image is refused with the same message as the agent form');
ok(await refused(() => cleanAdminAgentPatch({ cellPhone: '' }), 'Cell phone is required'), 'cell phone stays required');
ok(await refused(() => cleanAdminAgentPatch({ officePhone: '12' }), 'Office phone'), 'a bad office phone is refused');
ok(agentProfileHref('u-bagent') === '#/users/agent-profile/u-bagent', 'the edit page lives under User List');

// ---------- mock adapter ----------
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
const as = async (id) => { await api.signInDev(id); return api.getSession(); };
await as('u-admin');
const before = await api.adminGetAgentProfile('u-bagent');
ok(before.firstName === 'Bianca' && before.email && before.brokerage, 'Super admin reads the agent profile');
const saved = await api.adminUpdateAgentProfile('u-bagent', { firstName: 'Bianca', lastName: 'Buyer-Agent', cellPhone: '410-555-0177', officePhone: '410-555-0178', brokerage: 'Harbor Realty II (fake)', photo: PNG, photoShape: 'square', email: 'hacker@example.test', licenseNumber: 'CHANGED' });
ok(saved.brokerage === 'Harbor Realty II (fake)' && saved.cellPhone === '410-555-0177' && saved.officePhone === '410-555-0178' && saved.photo === PNG && saved.photoShape === 'square', 'Super admin can edit name, brokerage, phones and the picture');
ok(saved.email === before.email, 'the email stays locked');
await as('u-bagent');
const own = await api.getMyAgentProfile();
ok(own.licenseNumber === 'FAKE-MD-0505' && own.brokerage === 'Harbor Realty II (fake)', 'the license number is not changed; the agent sees the new brokerage');
await as('u-adam');
const byAdmin = await api.adminUpdateAgentProfile('u-bagent', { brokerage: 'Harbor Realty III (fake)' });
ok(byAdmin.brokerage === 'Harbor Realty III (fake)' && byAdmin.photo === PNG, 'a plain Admin can edit too; leaving the picture out keeps it (the picture is optional)');
const removed = await api.adminUpdateAgentProfile('u-bagent', { photo: null });
ok(removed.photo === null, 'an Admin can remove the picture');
ok(await refused(() => api.adminUpdateAgentProfile('u-bagent', { photo: 'data:application/pdf;base64,JVBERi0=' }), PHOTO_TYPE_MSG), 'the same image check as the agent upload');
ok(await refused(() => api.adminUpdateAgentProfile('u-proc', { brokerage: 'x' }), AGENT_EDIT_NOT_FOUND), 'a staff login is not an agent');
ok(await refused(() => api.adminUpdateAgentProfile('u-buyer', { brokerage: 'x' }), AGENT_EDIT_NOT_FOUND), 'a buyer is not an agent');
ok(await refused(() => api.adminUpdateAgentProfile('u-gone', { brokerage: 'x' }), AGENT_EDIT_NOT_FOUND), 'a removed agent is not edited');
for (const id of ['u-proc', 'u-sp', 'u-team', 'u-tc', 'u-lagent', 'u-buyer', 'u-seller']) {
  await as(id);
  ok(await refused(() => api.adminUpdateAgentProfile('u-bagent', { brokerage: 'Hijack (fake)' }), AGENT_EDIT_DENIED), `${id} cannot edit someone else's agent profile`);
  ok(await refused(() => api.adminGetAgentProfile('u-bagent'), AGENT_EDIT_DENIED), `${id} cannot open the edit page`);
}
await as('u-admin');
ok((await api.adminGetAgentProfile('u-bagent')).brokerage === 'Harbor Realty III (fake)', 'nothing was changed by the refused tries');
await as('u-lagent');
const self = await api.updateMyAgentProfile({ brokerage: 'Oak Street Realty II (fake)', cellPhone: '301-555-0166' });
ok(self.brokerage === 'Oak Street Realty II (fake)' && self.cellPhone === '301-555-0166', "the agent's own edit still works");

// ---------- pages ----------
const { render: renderUsers } = await import('../js/pages/users.js');
const { render: renderContacts } = await import('../js/pages/dealcontacts.js');
const admin = await as('u-admin');
globalThis.location.hash = '#/users/agent-profile/u-bagent?back=' + encodeURIComponent('#/deals/deal-1/contacts');
const page = await renderUsers({ api, user: admin, params: { mode: 'agent-profile', id: 'u-bagent' }, refresh() {}, go() {} });
document.body.innerHTML = toText(page.body);
const form = document.querySelector('[data-agent-form]');
ok(page.title === 'Edit agent profile' && !!form, 'User List > Edit agent profile opens the agent form');
ok(!!form.querySelector('[name=firstName]') && !!form.querySelector('[name=lastName]') && !!form.querySelector('[name=cellPhone]') && !!form.querySelector('[name=brokerage]') && !!form.querySelector('[name=officePhone]') && !!form.querySelector('[data-photo-file]'),
  'the form has name, cell, brokerage, office phone and the picture picker');
ok(form.querySelector('[name=email]').hasAttribute('disabled'), 'email is shown locked');
ok(!form.querySelector('[name=birthMonth]') && !form.querySelector('[name=licenseNumber]') && !form.querySelector('[name=street]') && !form.querySelector('[name=otherContact]'), 'birthday, license and address are not on the staff form');
ok(document.querySelector('[data-agent-edit-back]').getAttribute('href') === '#/deals/deal-1/contacts', 'Back returns to the order Contacts tab');
globalThis.location.hash = '#/users/agent-profile/u-bagent?back=' + encodeURIComponent('https://evil.example/');
const page2 = await renderUsers({ api, user: admin, params: { mode: 'agent-profile', id: 'u-bagent' }, refresh() {}, go() {} });
document.body.innerHTML = toText(page2.body);
ok(document.querySelector('[data-agent-edit-back]').getAttribute('href') === '#/users/edit/u-bagent', 'a Back address outside the portal is ignored');
// the agent's own form is unchanged
const { agentFormHtml } = await import('../js/pages/agent-profile-form.js');
document.body.innerHTML = toText(agentFormHtml({ firstName: 'A', lastName: 'B' }, { emailLocked: true }));
ok(!!document.querySelector('[name=birthMonth]') && !!document.querySelector('[name=licenseNumber]') && !!document.querySelector('[name=street]') && (document.body.textContent || '').includes('Your details'), "the agent's own form keeps every field");

globalThis.location.hash = '#/users/edit/u-bagent';
const edit = await renderUsers({ api, user: admin, params: { mode: 'edit', id: 'u-bagent' }, refresh() {}, go() {} });
document.body.innerHTML = toText(edit.body);
const btn = document.querySelector('[data-edit-agent-profile="u-bagent"]');
ok(!!btn && btn.textContent.trim() === 'Edit agent profile' && btn.getAttribute('href').startsWith('#/users/agent-profile/u-bagent'), 'Edit User shows Edit agent profile for an agent');
const editProc = await renderUsers({ api, user: admin, params: { mode: 'edit', id: 'u-proc' }, refresh() {}, go() {} });
document.body.innerHTML = toText(editProc.body);
ok(!document.querySelector('[data-edit-agent-profile]'), 'Edit User shows no Edit agent profile for a staff login');
const editBuyer = await renderUsers({ api, user: admin, params: { mode: 'edit', id: 'u-buyer' }, refresh() {}, go() {} });
document.body.innerHTML = toText(editBuyer.body);
ok(!document.querySelector('[data-edit-agent-profile]'), 'Edit User shows no Edit agent profile for a buyer');

const sampleDeal = (dealId) => ({ id: dealId, fileNumber: 'MD-26-00001', transactionType: 'Purchase', processorName: 'Paula Processor', processorId: 'u-proc', salesPeople: [],
  participants: [
    { id: 'p-ba', role: 'Buyer Agent', contactId: 'c-bagent', contact: { id: 'c-bagent', firstName: 'Bianca', lastName: 'Buyer-Agent', profileId: 'u-bagent' } },
    { id: 'p-la', role: 'Listing Agent', contactId: 'c-lena', contact: { id: 'c-lena', firstName: 'Lena', lastName: 'Listing', profileId: null } },
    { id: 'p-b', role: 'Client-Buyer', contactId: 'c-buyer', contact: { id: 'c-buyer', firstName: 'Ben', lastName: 'Buyer', profileId: 'u-buyer' } },
  ] });
globalThis.location.hash = '#/deals/deal-x/contacts?g=ALL';
const cv = await renderContacts({ api, user: admin, deal: sampleDeal('deal-x'), refresh() {} });
document.body.innerHTML = toText(cv.body);
const link = document.querySelector('[data-participant="p-ba"] [data-edit-agent-profile="u-bagent"]');
ok(!!link && link.textContent.trim() === 'Edit agent profile', 'Order Contacts: an Admin sees Edit agent profile on the Buyer Agent row');
ok(link && decodeURIComponent(link.getAttribute('href').split('back=')[1] || '') === '#/deals/deal-x/contacts', 'it comes back to the same Contacts tab');
ok(!document.querySelector('[data-participant="p-la"] [data-edit-agent-profile]') && !document.querySelector('[data-participant="p-b"] [data-edit-agent-profile]'), 'not on an agent without a portal login, or on a buyer');
const proc = await as('u-proc');
const cvp = await renderContacts({ api, user: proc, deal: sampleDeal('deal-x'), refresh() {} });
document.body.innerHTML = toText(cvp.body);
ok(!document.querySelector('[data-edit-agent-profile]'), 'Order Contacts: a Processor does not see Edit agent profile');
ok(await refused(() => renderUsers({ api, user: proc, params: { mode: 'agent-profile', id: 'u-bagent' }, refresh() {}, go() {} })), 'a Processor cannot open the edit page');

// ---------- Supabase adapter (fake client): same names and checks ----------
const calls = [];
const fakeSb = (rpcResult = {}) => ({
  rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: name === 'admin_get_agent_profile' ? { profile_id: 'uid-a', first_name: 'Bea', last_name: 'Agent', email: 'bea@example.test', cell_phone: '301-555-0101', office_phone: '', brokerage: 'Fake Realty', photo_path: 'uid-a/avatar.jpg', photo_shape: 'circle', has_agent_profile: true, ...rpcResult } : null, error: null }; },
  storage: { from: (bucket) => ({ upload: async (path, blob, opts) => { calls.push(['upload', bucket, path, opts && opts.upsert]); return { data: {}, error: null }; }, createSignedUrl: async (path) => ({ data: { signedUrl: 'https://signed.example/' + path } }) }) },
  from: () => { throw new Error('no table reads expected'); },
});
const okR = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const sbAdmin = agentInviteSupabase({ sb: fakeSb(), ok: okR, me: async () => ({ id: 'uid-admin', role: 'Admin', isAdmin: true, status: 'active' }) });
const got = await sbAdmin.adminGetAgentProfile('uid-a');
ok(got.firstName === 'Bea' && got.photo === 'https://signed.example/uid-a/avatar.jpg' && calls.some((c) => c[1] === 'admin_get_agent_profile' && c[2].p_profile === 'uid-a'), 'Supabase: reads through admin_get_agent_profile and shows the picture by a signed link');
calls.length = 0;
globalThis.fetch = async (u) => ({ blob: async () => ({ size: 10, type: 'image/jpeg', u }) });
await sbAdmin.adminUpdateAgentProfile('uid-a', { firstName: 'Bea', lastName: 'Agent', cellPhone: '3015550101', brokerage: 'New (fake)', photo: JPG, photoShape: 'circle', email: 'no@example.test', licenseNumber: 'NO' });
const up = calls.find((c) => c[0] === 'upload'); const rpc = calls.find((c) => c[1] === 'admin_update_agent_profile');
ok(up && up[1] === 'agent-photos' && up[2] === 'uid-a/avatar.jpg' && up[3] === true, "Supabase: the picture goes where the agent's own upload goes (agent-photos/<agent id>/avatar.jpg)");
ok(rpc && rpc[2].p_profile === 'uid-a' && rpc[2].p.photoPath === 'uid-a/avatar.jpg' && rpc[2].p.brokerage === 'New (fake)' && !('email' in rpc[2].p) && !('licenseNumber' in rpc[2].p) && !('photo' in rpc[2].p), 'Supabase: only the allowed fields go to admin_update_agent_profile');
calls.length = 0;
await sbAdmin.adminUpdateAgentProfile('uid-a', { brokerage: 'Keep picture (fake)', photo: 'https://signed.example/uid-a/avatar.jpg' });
ok(!calls.some((c) => c[0] === 'upload') && !('photoPath' in calls.find((c) => c[1] === 'admin_update_agent_profile')[2].p), 'Supabase: no new picture means no upload and the stored picture is kept');
calls.length = 0;
await sbAdmin.adminUpdateAgentProfile('uid-a', { photo: null });
ok(calls.find((c) => c[1] === 'admin_update_agent_profile')[2].p.photoPath === '', 'Supabase: removing the picture sends an empty photoPath');
for (const role of ['Processor', 'Sales Person', 'Sales Team', 'Outside user']) {
  calls.length = 0;
  const sbX = agentInviteSupabase({ sb: fakeSb(), ok: okR, me: async () => ({ id: 'uid-x', role, isAdmin: false, status: 'active' }) });
  ok(await refused(() => sbX.adminUpdateAgentProfile('uid-a', { brokerage: 'x' }), AGENT_EDIT_DENIED) && !calls.length, `Supabase: ${role} is refused before anything is uploaded or saved`);
}

// ---------- the database file says the same ----------
const sql = readFileSync(new URL('../supabase/migrations/20261131060000_admin_edit_agent_profile.sql', import.meta.url), 'utf8');
ok(/rpc_admin_update_agent_profile[\s\S]*security definer[\s\S]*private\.is_admin\(\)/i.test(sql), 'the database function is SECURITY DEFINER and checks private.is_admin()');
ok(sql.includes("e.key in ('firstName', 'lastName', 'cellPhone', 'officePhone', 'brokerage', 'photoShape', 'photoPath')"), 'the database keeps only the same fields');
ok(readFileSync(new URL('../supabase/rollbacks/20261131060000_admin_edit_agent_profile.sql', import.meta.url), 'utf8').includes('drop function if exists public.admin_update_agent_profile'), 'there is a rollback');

console.log(fail ? `${fail} failed` : 'jc-agent-edit-1 passed');
if (fail) process.exit(1);
