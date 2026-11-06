// HR INVITE LINK (John + Francis, Nov 4): #/hr-invite/<token>. Public (no sign-in). The employee (US or Philippines team) sets up their portal login.
// Mock mode: one click makes the login (account role 'Employee', or links an existing staff login with the same email) and signs them in.
// Supabase: the page asks for a password and calls the accept-invite function. Public sign-up stays off. Nothing is emailed.
// Refused inside a locked test-link session (locked-links.js routeAllowed).
import { html, $, guard, toast, fmtDateTime } from '../ui.js?v=202611062210';
export async function render({ api, params, go }) {
  const inv = await api.getHrInvite(params.token);
  const supa = api.mode === 'supabase';
  const shell = (inner) => html`<div class="login-page hr-invite-page" data-hr-invite-page="${inv.status}"><div class="login-card"><img src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow" class="sched-logo"><div class="eyebrow">HR INVITE &middot; CLA TITLE PORTAL</div><h2>Set up your login</h2>${inner}
    <p class="dev-banner" data-test-environment>TEST ENVIRONMENT &middot; FAKE DATA ONLY</p></div></div>`;
  if (inv.status !== 'pending') return { title: 'Invite', body: shell(html`<p data-hr-invite-bad>${inv.status === 'expired' ? 'This invite link has expired.' : inv.status === 'accepted' ? 'This invite link was already used. Sign in instead.' : 'This invite link is not valid.'} Ask HR for a new link.</p>`) };
  const action = supa
    ? html`<form data-hr-accept-form><label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" data-hr-password></label><label>Confirm password<input type="password" name="confirm" required minlength="8" autocomplete="new-password" data-hr-password-2></label><p class="field-hint">At least 8 characters. This becomes your portal password. Nothing is emailed.</p><p class="err-text" data-hr-err role="alert" hidden></p><button class="m-btn m-btn-lg" type="submit">Set up my login</button></form>`
    : html`<button class="m-btn m-btn-lg" data-hr-accept>Set up my login</button>`;
  return { title: 'Set up your login', body: shell(html`<p>Welcome, <strong data-hr-invite-name>${inv.firstName} ${inv.lastName}</strong>. HR invited you to the CLA Title portal with <strong>${inv.email}</strong>.</p>
    <p class="muted small">This link works once, until ${fmtDateTime(inv.expiresAt)}. You will see your own employee profile and can update your phone, address and emergency contact.</p>
    ${action}`), mount(root) {
    if (!supa) { $('[data-hr-accept]', root).addEventListener('click', guard(async () => { await api.acceptHrInvite(params.token); toast('Your login is ready'); go('/hr/me'); })); return; }
    $('[data-hr-accept-form]', root).addEventListener('submit', guard(async (e) => { e.preventDefault(); const err = $('[data-hr-err]', root); const password = $('[data-hr-password]', root).value; const again = $('[data-hr-password-2]', root).value;
      const show = (m) => { err.textContent = m || ''; err.hidden = !m; }; show('');
      if (password.length < 8) { show('Password must be at least 8 characters.'); return; }
      if (password !== again) { show('Those passwords do not match.'); return; }
      try { await api.acceptHrInvite(params.token, { password }); } catch (er) { show(er.message); throw er; }
      toast('Your login is ready'); go('/hr/me'); }));
  } };
}
