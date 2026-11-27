/* FF-111: agent profile auto-saves, and the first save goes to the add-coordinator step, not Open Orders. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render as renderProfile, firstProfileSave, isFirstProfileVisit, isAddCoordinatorStep, addCoordinatorPath, scrollToAddCoordinator } from '../js/pages/profile.js';
import { markAgentOnboard, AGENT_ONBOARD_KEY } from '../js/data/agent-profile.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.localStorage = memStore(); window.sessionStorage = memStore();
window.scrollTo = () => {};
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = window.localStorage; globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.InputEvent = window.InputEvent || window.Event;
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
const hash = { value: '#/profile' };
Object.defineProperty(globalThis, 'location', { configurable: true, value: { get hash() { return hash.value; }, set hash(v) { hash.value = v; }, pathname: '/', search: '' } });

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(addCoordinatorPath() === '/profile?addCoordinator=1', 'the add-coordinator path is a profile query');
ok(isAddCoordinatorStep('#/profile?addCoordinator=1') && !isAddCoordinatorStep('#/profile') && !isAddCoordinatorStep('#/orders'), 'the add-coordinator step is detected only from its query');
ok(isFirstProfileVisit('#/profile?setup=1') && !isFirstProfileVisit('#/profile'), 'the invite setup address is the first-time visit');
ok(firstProfileSave('#/profile') === false, 'a later profile visit is not a first save');

const api = createMockAdapter({ storage: memStore(), sessionStorage: memStore() });
async function as(id) { await api.signInDev(id); return api.getSession(); }

async function openProfile(id, { onboard = false, hashValue = '#/profile', store } = {}) {
  const session = await as(id);
  const box = store || memStore();
  if (onboard) markAgentOnboard(box);
  hash.value = hashValue;
  let went = '';
  let refreshed = 0;
  const orig = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: box });
  window.sessionStorage = box;
  const view = await renderProfile({ api, refresh() { refreshed += 1; }, go(path) { went = path; } });
  document.body.innerHTML = toText(view.body);
  view.mount(document.body);
  return { session, went: () => went, refreshed: () => refreshed, form: document.querySelector('[data-agent-form]'), plain: document.querySelector('#pf'), box };
}

function restoreStorage(orig) {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: orig });
  window.sessionStorage = orig;
}

const origStore = globalThis.sessionStorage;

const firstBuyer = await openProfile('u-bagent', { onboard: true });
ok(!!firstBuyer.form, 'Buyer Agent sees My Agent Profile');
ok(!!document.querySelector('[data-agent-tcs]'), 'Buyer Agent sees the add-coordinator section on the profile');
ok(document.querySelector('[data-agent-submit]').textContent.trim() === 'Save and add coordinator', 'the first-time Save button names the add-coordinator step');
firstBuyer.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
ok(firstBuyer.went() === '/profile?addCoordinator=1' && firstBuyer.refreshed() === 0, 'Buyer Agent first save goes to the add-coordinator step, not Open Orders');
restoreStorage(origStore);

const laterBuyer = await openProfile('u-bagent', { onboard: false, hashValue: '#/profile' });
ok(document.querySelector('[data-agent-submit]').textContent.trim() === 'Save profile', 'a later Save button stays Save profile');
laterBuyer.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
ok(laterBuyer.went() === '' && laterBuyer.refreshed() === 1, 'Buyer Agent later save stays on the profile');
restoreStorage(origStore);

const firstListing = await openProfile('u-lagent', { onboard: true });
firstListing.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
ok(firstListing.went() === '/profile?addCoordinator=1', 'Listing Agent first save goes to the add-coordinator step');
restoreStorage(origStore);

hash.value = '#/profile?setup=1';
const setupListing = await openProfile('u-lagent', { onboard: false, hashValue: '#/profile?setup=1' });
setupListing.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
ok(setupListing.went() === '/profile?addCoordinator=1', 'the invite setup address also goes to the add-coordinator step');
restoreStorage(origStore);

hash.value = '#/profile?addCoordinator=1';
const stepPage = await openProfile('u-bagent', { hashValue: '#/profile?addCoordinator=1' });
const tc = document.querySelector('[data-agent-tcs]');
ok(!!tc && tc.getAttribute('data-add-coordinator-step') === '1', 'opening the add-coordinator step marks and focuses the coordinator section');
ok(!!document.querySelector('[data-tc-add]'), 'the add-coordinator form is on the page');
restoreStorage(origStore);

const boxed = memStore();
const auto = await openProfile('u-bagent', { hashValue: '#/profile', store: boxed });
let posts = 0;
const real = api.updateMyAgentProfile.bind(api);
api.updateMyAgentProfile = async (patch) => { posts += 1; return real(patch); };
const brokerage = auto.form.querySelector('[name=brokerage]');
brokerage.value = (brokerage.value || '') + ' Auto Save LLC';
auto.form.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 50));
ok(posts === 0 && auto.went() === '', 'auto-save waits; it does not leave the page while the agent is still typing');
await new Promise((r) => setTimeout(r, 900));
ok(posts === 1, 'a valid change auto-saves without clicking Save');
ok(auto.went() === '', 'auto-save does not jump to the add-coordinator step on its own');
ok(/Saved/.test(document.querySelector('[data-autosave-status]').textContent), 'the form shows that it saved');
api.updateMyAgentProfile = real;
restoreStorage(origStore);

const empty = document.createElement('div');
ok(scrollToAddCoordinator(empty) === false, 'scrolling does nothing when the coordinator section is missing');
const wrap = document.createElement('div');
wrap.innerHTML = '<section data-agent-tcs tabindex="-1"></section>';
let scrolled = false;
wrap.querySelector('[data-agent-tcs]').scrollIntoView = () => { scrolled = true; };
ok(scrollToAddCoordinator(wrap) === true && scrolled && wrap.querySelector('[data-add-coordinator-step]'), 'the coordinator section is scrolled into view when present');

const staff = await openProfile('u-proc', { onboard: true });
ok(!!staff.plain && !staff.form, 'a Processor sees the staff Profile Setting form, not My Agent Profile');
staff.plain.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
ok(staff.went() === '', 'a Processor save stays on Profile Setting');
restoreStorage(origStore);

const tcUser = await openProfile('u-tc', { onboard: true });
ok(!!tcUser.plain && !tcUser.form, 'a Transaction Coordinator sees the staff Profile Setting form');
tcUser.plain.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
ok(tcUser.went() === '', 'a Transaction Coordinator save stays on Profile Setting');
restoreStorage(origStore);

hash.value = '#/profile?setup=1';
const incomplete = await openProfile('u-bagent', { hashValue: '#/profile?setup=1' });
const realSave = api.updateMyAgentProfile.bind(api);
api.updateMyAgentProfile = async () => { throw new Error('The cell phone number is not valid.'); };
try { incomplete.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); } catch (e) { /* guard rethrows after showErr */ }
await new Promise((r) => setTimeout(r, 40));
ok(incomplete.went() === '', 'a failed save does not leave the profile');
ok(/cell phone number is not valid/.test(document.querySelector('[data-form-err]').textContent || ''), 'a failed save shows what went wrong');
api.updateMyAgentProfile = realSave;
restoreStorage(origStore);

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
ok(app.includes("pages/profile.js?v=202611314000") && html.includes('js/app.js?v=202611314800'), 'the profile page stays at stamp 202611314000 and the shell is 202611314500');

console.log(fail ? fail + ' failed' : 'FF-111 profile auto-save and add-coordinator passed');
if (fail) process.exit(1);
