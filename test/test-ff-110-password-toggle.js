/* FF-110 (Francis Santos, confirmed Nov 24 2026): every password field on the
   login screen and the invite / set-password screens has a show/hide eye icon. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { enhancePasswordFields } from '../js/data/password-toggle.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const entry = read('js/pages/entry.js');
const agent = read('js/pages/agent-signup.js');
const hr = read('js/pages/hr-invite.js');
ok(entry.includes("from '../data/password-toggle.js?v=202611310300'") && entry.includes('enhancePasswordFields(root)'), 'the login page loads and runs the show/hide helper');
ok(agent.includes("from '../data/password-toggle.js?v=202611310300'") && (agent.match(/enhancePasswordFields\(root\)/g) || []).length >= 2, 'the agent and client invite pages run the helper after the password fields are on the page');
ok(hr.includes("from '../data/password-toggle.js?v=202611310300'") && hr.includes('enhancePasswordFields(root)'), 'the HR invite page loads and runs the show/hide helper');
ok(read('js/app.js').includes("pages/entry.js?v=202611312900") && read('js/app.js').includes("pages/agent-signup.js?v=202611312900") && read('js/app.js').includes("pages/hr-invite.js?v=202611310300"), 'the shell loads the updated login and invite pages');
ok(read('index.html').includes('css/portal.css?v=202611314400') && read('css/portal.css').includes('.password-toggle'), 'the published styles include the eye button and load at the new stamp');
ok(!read('js/pages/e2e-gmail-setup.js').includes('enhancePasswordFields'), 'the e2e Gmail secret fields are not treated as portal password fields');

function mountLoginLike() {
  const root = document.createElement('div');
  root.innerHTML = '<form id="login-form"><label>Email<input name="email" type="email"></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form>';
  document.body.appendChild(root);
  enhancePasswordFields(root);
  return root;
}

const login = mountLoginLike();
const input = login.querySelector('input[name="password"]');
const btn = login.querySelector('[data-password-toggle]');
ok(input && input.type === 'password' && btn && btn.tagName === 'BUTTON' && btn.getAttribute('type') === 'button', 'the login password field starts hidden and has a button next to it');
ok(btn.getAttribute('aria-label') === 'Show password' && btn.getAttribute('aria-pressed') === 'false' && btn.querySelector('svg'), 'the button is labeled Show password and has an icon');
ok(input.closest('[data-password-field]') === btn.parentNode, 'the button sits in the same field as the input');
btn.dispatchEvent(new window.Event('click', { bubbles: true }));
ok(input.type === 'text' && btn.getAttribute('aria-label') === 'Hide password' && btn.getAttribute('aria-pressed') === 'true', 'clicking the eye shows the password and changes the label to Hide password');
btn.dispatchEvent(new window.Event('click', { bubbles: true }));
ok(input.type === 'password' && btn.getAttribute('aria-label') === 'Show password' && btn.getAttribute('aria-pressed') === 'false', 'clicking again hides the password');
ok(btn.type === 'button' && !btn.disabled && btn.getAttribute('tabindex') !== '-1', 'the button is a real button, not disabled, and is not taken out of the tab order');
enhancePasswordFields(login);
ok(login.querySelectorAll('[data-password-toggle]').length === 1, 'running the helper twice does not add a second eye');
login.remove();

const invite = document.createElement('div');
invite.innerHTML = '<form data-hr-accept-form><label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" data-hr-password></label><label>Confirm password<input type="password" name="confirm" required minlength="8" autocomplete="new-password" data-hr-password-2></label><button type="submit">Set up my login</button></form>';
document.body.appendChild(invite);
enhancePasswordFields(invite);
const fields = [...invite.querySelectorAll('input[type="password"], input[name="password"], input[name="confirm"]')].filter((el) => el.closest('[data-password-field]'));
const toggles = invite.querySelectorAll('[data-password-toggle]');
ok(fields.length === 2 && toggles.length === 2, 'password and confirm password on the invite form each have an eye');
const first = invite.querySelector('[data-hr-password]');
const firstBtn = first.closest('[data-password-field]').querySelector('[data-password-toggle]');
first.value = 'Secret9x';
firstBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
ok(first.type === 'text' && first.value === 'Secret9x' && invite.querySelector('[data-hr-password-2]').type === 'password', 'showing one password does not reveal the confirm field or change what was typed');
ok(first.name === 'password' && first.closest('form') && first.value === 'Secret9x', 'the password input keeps its name and value inside the form after it is wrapped');
invite.remove();

console.log(fail ? `FAIL ${fail}` : 'all FF-110 password toggle checks passed');
if (fail) process.exit(1);
