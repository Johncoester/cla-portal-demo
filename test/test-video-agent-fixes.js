/* John's video fixes. Buyer Agent and Listing Agent, and the other roles still work.
 * No hosted project. My Tasks filters the tasks already loaded. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render as renderTasks } from '../js/pages/dealtasks.js';
import { render as renderProfile } from '../js/pages/profile.js';
import { agentFormHtml, mountAgentForm } from '../js/pages/agent-profile-form.js';
import { cleanAgentProfile, photoFileAllowed, photoFileChosen, markAgentOnboard, consumeAgentOnboard } from '../js/data/agent-profile.js';
import { firstProfileSave } from '../js/pages/profile.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.localStorage = memStore(); window.sessionStorage = memStore();
window.scrollTo = () => {};
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = window.localStorage; globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.File = globalThis.File || class File { constructor(bits, name, opts = {}) { this.name = name; this.type = opts.type || ''; this.size = String(bits[0] || '').length; } };
Object.defineProperty(window.HTMLFormElement.prototype, 'elements', {
  configurable: true,
  get() { return this.querySelectorAll('input, select, textarea, button'); },
});
globalThis.FormData = class FormData {
  constructor(form) {
    this.pairs = [];
    for (const el of [...(form && form.elements ? form.elements : [])]) {
      if (!el.name || el.type === 'file' || el.type === 'submit' || el.type === 'button') continue;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
      this.pairs.push([el.name, el.value == null ? '' : String(el.value)]);
    }
  }
  *entries() { yield* this.pairs; }
};
const hash = { value: '#/deals/deal-1/tasks?mine=1' };
Object.defineProperty(globalThis, 'location', { configurable: true, value: { get hash() { return hash.value; }, set hash(v) { hash.value = v; }, pathname: '/', search: '' } });

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const dealSrc = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(app.includes("${link('tasks', 'Tasks', 'task')}${myTasksLink}"), 'My Tasks sits directly under Tasks for agents and staff');
ok(app.includes("${link('tasks', 'To-do list', 'task')}${myTasksLink}"), 'My Tasks sits directly under the to-do list for buyers and sellers');
ok(app.includes('data-nav-my-tasks') && app.includes('tasks?mine=1'), 'My Tasks opens the file tasks already loaded, marked as mine');
ok(dealSrc.includes('viewTasksHref(d.id, user)') && dealSrc.includes('data-view-tasks'), 'View Tasks opens that person\'s own section');

const api = createMockAdapter({ storage: memStore(), sessionStorage: memStore() });
async function as(id) { await api.signInDev(id); return api.getSession(); }
function fileUser(session, deal) {
  return session.role === 'Outside user' && deal.myRole ? { ...session, role: deal.myRole, roles: deal.myRoles || [deal.myRole], accountRole: session.role } : session;
}
async function myTasks(id) {
  const session = await as(id);
  const deal = await api.getDeal('deal-1');
  const user = fileUser(session, deal);
  let calls = 0;
  const orig = api.listTasks.bind(api);
  api.listTasks = async (...args) => { calls += 1; return orig(...args); };
  hash.value = '#/deals/deal-1/tasks?mine=1';
  const view = await renderTasks({ api, user, deal, refresh() {} });
  api.listTasks = orig;
  return { calls, html: toText(view.body), user };
}

const buyerAgent = await myTasks('u-bagent');
ok(buyerAgent.calls === 1, 'Buyer Agent My Tasks does not load tasks again');
ok(buyerAgent.html.includes('data-file-tasks="mine"') && buyerAgent.html.includes('data-sidebox="buyer-agent"'), 'Buyer Agent My Tasks is the buyer-agent section');
ok(!buyerAgent.html.includes('data-sidebox="listing-agent"') && !buyerAgent.html.includes('data-sidebox="seller"'), 'Buyer Agent My Tasks hides the other sections');

const listingAgent = await myTasks('u-lagent');
ok(listingAgent.calls === 1, 'Listing Agent My Tasks does not load tasks again');
ok(listingAgent.html.includes('data-file-tasks="mine"') && listingAgent.html.includes('data-sidebox="listing-agent"'), 'Listing Agent My Tasks is the listing-agent section');
ok(!listingAgent.html.includes('data-sidebox="buyer-agent"') && !listingAgent.html.includes('data-sidebox="buyer"'), 'Listing Agent My Tasks hides the other sections');

const processor = await myTasks('u-proc');
ok(processor.calls === 1 && processor.html.includes('data-file-tasks="mine"'), 'a Processor My Tasks still uses the tasks already loaded');
const buyer = await myTasks('u-buyer');
ok(buyer.calls === 1 && buyer.html.includes('data-file-tasks="mine"'), 'a buyer My Tasks still uses the tasks already loaded');

ok(!photoFileChosen(null) && !photoFileChosen({ name: '', type: '', size: 0 }) && photoFileAllowed(null) && photoFileAllowed(undefined) && photoFileAllowed({ name: '', type: '', size: 0 }), 'no chosen picture is allowed');
ok(photoFileAllowed({ type: 'image/png', name: 'a.png' }) && photoFileAllowed({ type: 'image/jpeg', name: 'a.jpg' }) && photoFileAllowed({ type: 'image/jpg', name: 'a.jpg' }) && photoFileAllowed({ type: 'image/webp', name: 'a.webp' }) && photoFileAllowed({ type: 'image/gif', name: 'a.gif' }), 'PNG, JPG, WEBP and GIF are allowed when a file is chosen');
ok(!photoFileAllowed({ type: 'application/pdf', name: 'a.pdf' }) && !photoFileAllowed({ type: 'text/plain', name: 'a.txt' }), 'another file type is refused only when a file is chosen');
const blank = cleanAgentProfile({ firstName: 'Bianca', lastName: 'Buyer-Agent', email: 'bianca.buyer-agent@example.test', cellPhone: '301-555-0105', photo: '', photoShape: 'circle' });
ok(blank.photo === null, 'a profile with no picture cleans without a type error');
const stored = cleanAgentProfile({ firstName: 'Rosy', lastName: 'Listing', email: 'rosy.listing@example.test', cellPhone: '301-555-0199', photo: 'https://example.test/storage/v1/object/sign/agent-photos/avatar.jpg' }, { partial: true });
ok(!Object.prototype.hasOwnProperty.call(stored, 'photo'), 'a stored picture address is left alone');

document.body.innerHTML = toText(agentFormHtml({ firstName: 'Bianca', lastName: 'Buyer-Agent', email: 'bianca.buyer-agent@example.test', cellPhone: '301-555-0105', photo: '' }));
const ctl = mountAgentForm(document.body);
const bad = new globalThis.File(['x'], 'notes.txt', { type: 'text/plain' });
const input = document.querySelector('[data-photo-file]');
Object.defineProperty(input, 'files', { configurable: true, value: [bad] });
let typeErr = '';
try { ctl.values(); } catch (e) { typeErr = e.message; }
ok(/PNG, JPG, WEBP or GIF/.test(typeErr), 'a chosen file of the wrong type is refused');
Object.defineProperty(input, 'files', { configurable: true, value: [{ name: '', type: '', size: 0 }] });
let emptyErr = '';
try { ctl.values(); } catch (e) { emptyErr = e.message; }
ok(!emptyErr && ctl.values().photo == null, 'an empty file input still saves with no picture');
document.querySelector('[data-photo-value]').value = 'https://example.test/storage/v1/object/sign/agent-photos/rosy.jpg';
Object.defineProperty(input, 'files', { configurable: true, value: [] });
let urlErr = '';
let urlValues;
try { urlValues = ctl.values(); } catch (e) { urlErr = e.message; }
ok(!urlErr && !Object.prototype.hasOwnProperty.call(urlValues, 'photo'), 'saving does not recheck a picture that is already stored');

async function saveProfile(id, onboard) {
  const session = await as(id);
  const box = memStore();
  if (onboard) markAgentOnboard(box);
  let went = '';
  let refreshed = 0;
  const view = await renderProfile({ api, refresh() { refreshed += 1; }, go(path) { went = path; } });
  document.body.innerHTML = toText(view.body);
  view.mount(document.body);
  const form = document.querySelector('[data-agent-form]');
  ok(!!form, id + ' sees My Agent Profile');
  const photo = form && form.querySelector('[data-photo-value]');
  if (photo) photo.value = '';
  const real = api.updateMyAgentProfile.bind(api);
  let posted = null;
  api.updateMyAgentProfile = async (patch) => { posted = patch; return real(patch); };
  const orig = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: box });
  window.sessionStorage = box;
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 40));
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: orig });
  window.sessionStorage = orig;
  api.updateMyAgentProfile = real;
  return { went, refreshed, posted, email: session.email };
}

const firstBuyer = await saveProfile('u-bagent', true);
ok(firstBuyer.posted && firstBuyer.posted.photo == null && !firstBuyer.posted.email, 'Buyer Agent saves with no picture and does not send a new photo type check');
ok(firstBuyer.went === '/orders' && firstBuyer.refreshed === 0, 'Buyer Agent first profile save opens Open Orders');
const againBuyer = await saveProfile('u-bagent', false);
ok(againBuyer.went === '' && againBuyer.refreshed === 1, 'Buyer Agent later profile save stays on the profile');
const firstListing = await saveProfile('u-lagent', true);
ok(firstListing.posted && firstListing.posted.photo == null, 'Listing Agent saves with no picture');
ok(firstListing.went === '/orders' && firstListing.refreshed === 0, 'Listing Agent first profile save opens Open Orders');
const againListing = await saveProfile('u-lagent', false);
ok(againListing.went === '' && againListing.refreshed === 1, 'Listing Agent later profile save stays on the profile');
hash.value = '#/profile?setup=1';
const setupListing = await saveProfile('u-lagent', false);
ok(setupListing.went === '/orders', 'the invite setup address also opens Open Orders after Save profile');
hash.value = '#/profile';
ok(firstProfileSave('#/profile') === false, 'Profile settings is not the first-time path');

async function savePlain(id) {
  await as(id);
  let err = '';
  const view = await renderProfile({ api, refresh() {}, go() {} });
  document.body.innerHTML = toText(view.body);
  view.mount(document.body);
  const form = document.querySelector('#pf');
  ok(!!form && !form.querySelector('[data-photo-file]'), id + ' profile has no required picture');
  form.addEventListener('submit', (e) => { e.preventDefault(); });
  try { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); } catch (e) { err = e.message; }
  await new Promise((r) => setTimeout(r, 30));
  ok(!/Profile picture/.test(err) && !/Profile picture/.test(document.body.textContent), id + ' can save profile with no picture');
}
await savePlain('u-buyer');
await savePlain('u-proc');
const signup = readFileSync(new URL('../js/pages/agent-signup.js', import.meta.url), 'utf8');
ok(signup.includes("go('/profile?setup=1')") && signup.includes('markAgentOnboard()'), 'accepting an invite opens My Agent Profile as first-time setup');

console.log(fail ? fail + ' failed' : 'video agent fixes passed');
if (fail) process.exit(1);
