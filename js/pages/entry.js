import { raw, html, $, guard, options } from '../ui.js?v=202611061447';
import { roleLabel, fileRolesLabel, isOutside, accountTypeLabel } from '../data/constants.js?v=202611061447';
import { devPickerOn, PLAIN_URL_NOTICE } from '../data/locked-links.js?v=202611061447';
import { clearSessionWs } from '../workspace.js?v=202611061447';

export async function render({ api, go }) {
  // Supabase mode is a real login. No person picker, no ?as= identity, no sign-up.
  if (api.mode === 'supabase') {
    const recovery = sessionStorage.getItem('cla-portal-recovery') === '1';
    const card = (inner) => html`<div class="login-page" data-supabase-login><div class="login-card"><img class="login-logo" src="assets/img/login-logo-new.png" alt="CLA Portal Live Test"><h2 data-site-name="CLA Portal Live Test">CLA Portal Live Test</h2><p class="dev-banner" data-test-environment>TEST ENVIRONMENT &middot; FAKE DATA ONLY</p>${inner}</div></div>`;
    const body = recovery
      ? card(html`<p>Choose a new password for CLA Portal Live Test. Registration is closed.</p><form id="new-password" class="stack" data-new-password><label>New password<input name="password" type="password" autocomplete="new-password" required minlength="8"></label><p class="err-text" data-form-err></p><button class="m-btn" type="submit">Save password</button></form>`)
      : card(html`<p>Registration is closed. Sign in with the login an administrator provisioned.</p><form id="login-form" class="stack"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><p class="err-text" data-form-err></p><button class="m-btn" type="submit">Sign in</button></form><p><button type="button" class="linkish" data-forgot>Forgot password</button></p><form id="reset-form" class="stack" data-reset-form hidden><label>Email<input name="email" type="email" autocomplete="username" required></label><p class="muted small">If this email has a login, a reset message is on its way. It opens CLA Portal Live Test.</p><button class="m-btn" type="submit">Send reset email</button></form>`);
    return { title: '', body, mount(root) { wireLogin(root, api, go); } };
  }
  // NO PICKER ON THE PUBLIC DEMO (John, Nov 4): without the test-harness flag the plain URL shows only the notice; nobody can pick a fake user here
  if (!devPickerOn()) return { title: '', body: raw(`<div class="login-page" data-test-portal-notice><div class="login-card"><img class="login-logo" src="assets/img/login-logo-new.png" alt="CLA Portal Live Test"><h2 data-site-name="CLA Portal Live Test">CLA Portal Live Test</h2><p class="dev-banner" data-test-environment>TEST ENVIRONMENT &middot; FAKE DATA ONLY</p><p data-notice-text>${PLAIN_URL_NOTICE}</p></div></div>`) };
  const users = await api.listDevUsers();
  const tpl = await (await fetch('partials/entry.html?v=202611061447')).text();
  const opts = options(users, '', (x) => `${x.firstName} ${x.lastName} \u2014 ${isOutside(x.role) ? accountTypeLabel(x) : roleLabel(x)}`, (x) => x.id);
  const body = raw(tpl.replace('</select>', opts.toString() + '</select>'));
  return { title: 'Welcome', body, mount: (root) => wire(root, api, go) };
}

function wireLogin(root, api, go) {
  const login = $('#login-form', root);
  if (login) login.addEventListener('submit', guard(async (e) => {
    e.preventDefault(); const f = new FormData(e.target); const err = $('[data-form-err]', root); err.textContent = '';
    try { await api.signIn(String(f.get('email') || ''), String(f.get('password') || '')); } catch (ex) { err.textContent = ex.message; throw ex; }
    clearSessionWs(); go('/dashboard');
  }));
  const forgot = $('[data-forgot]', root); const reset = $('#reset-form', root);
  if (forgot && reset) forgot.addEventListener('click', () => { reset.hidden = !reset.hidden; });
  if (reset) reset.addEventListener('submit', guard(async (e) => {
    e.preventDefault(); const err = $('[data-form-err]', root); if (err) err.textContent = '';
    await api.requestPasswordReset(new FormData(e.target).get('email'));
    reset.querySelector('button').textContent = 'Reset email requested';
  }));
  const fresh = $('#new-password', root);
  if (fresh) fresh.addEventListener('submit', guard(async (e) => {
    e.preventDefault(); const err = $('[data-form-err]', root); err.textContent = '';
    try { await api.updatePassword(new FormData(e.target).get('password')); } catch (ex) { err.textContent = ex.message; throw ex; }
    sessionStorage.removeItem('cla-portal-recovery'); clearSessionWs(); go('/dashboard');
  }));
}

function wire(root, api, go) {
  $('#pickform', root).addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const who = new FormData(e.target).get('who');
    if (!who) throw new Error('Choose a sample person first.');
    await api.pickPerson(who); clearSessionWs();   // John, Nov 4: every new sign-in lands on the neutral Home first
    // invite deep link ("Complete Requests Now"): go back to the order page that was asked for, if any
    const back = sessionStorage.getItem('cla-portal-new:return'); sessionStorage.removeItem('cla-portal-new:return');
    go(back && /^#\/deals\/[\w-]+(\/[\w-]+)?$/.test(back) ? back.slice(1) : '/dashboard');
  }));
}
