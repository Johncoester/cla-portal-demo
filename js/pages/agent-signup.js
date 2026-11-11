// Agent account setup from a one-time invite link (#/agent-invite/<token>), John Nov 4. Works without signing in. FAKE DATA ONLY, nothing sent.
import { html, $, guard, toast } from '../ui.js?v=202611070139';
import { agentFormHtml, mountAgentForm } from './agent-profile-form.js?v=202611140100';
import { STATUS_LABEL, markAgentOnboard } from '../data/agent-profile.js?v=202611140100';
const shell = (inner) => html`<div class="login-page ap-signup-page"><div class="login-card ap-signup-card"><img src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow" class="sched-logo">${inner}</div></div>`;
const signInPath = (email) => { const e = String(email || '').trim(); return '/login' + (e ? '?email=' + encodeURIComponent(e) : ''); };
export async function render({ api, params, go }) {
  const inv = await api.getAgentInvite(params.token);
  if (inv.status === 'accepted' || inv.status === 'exists') {
    if (go) go(signInPath(inv.email));
    return { title: 'Sign in', body: shell(html`<p data-invite-redirect="signin"></p>`) };
  }
  if (inv.status !== 'pending') {
    const why = { expired: 'This invite link has expired. Ask your CLA Title contact to resend it.', accepted: 'This invite was already used. Sign in to the portal instead.', revoked: 'This invite is no longer active.', invalid: 'This invite link is not valid. It may have been replaced by a newer link.' }[inv.status] || 'This invite link is not valid.';
    return { title: 'Agent invite', body: shell(html`<div class="eyebrow">AGENT INVITE</div><h2 data-invite-state="${inv.status}">Invite ${STATUS_LABEL[inv.status] || 'not valid'}</h2><p>${why}</p><p><a class="m-btn" href="#/login">Go to sign in</a></p>`) };
  }
  const supa = api.mode === 'supabase';
  if (inv.inviteKind === 'client') return clientSignup({ api, params, go, inv, supa });
  const inner = html`<div class="eyebrow">AGENT INVITE &middot; CLA TITLE PORTAL</div><h2 data-invite-state="pending">Set up your agent account</h2>
    <p class="muted">Welcome, ${inv.firstName}. Fill in the four required fields and you are in. Your picture, brokerage and contact info show on the portal of the buyers and sellers you work with, so they always remember their agent.</p>
    ${agentFormHtml({ firstName: inv.firstName, lastName: inv.lastName, email: inv.email, cellPhone: inv.cellPhone, brokerage: inv.brokerage }, { submitLabel: 'Create my account', emailLocked: supa })}
    <p class="muted small">${supa ? 'Nothing is emailed. This link works once' : 'FAKE DATA DEMO. In the demo nothing is emailed; this link works once'} and expires on ${new Date(inv.expiresAt).toLocaleDateString('en-US')}.</p>`;
  return { title: 'Set up your account', body: shell(inner), mount(root) {
    const ctl = mountAgentForm(root);
    if (supa) {
      const btn = $('[data-agent-submit]', ctl.form); const slot = document.createElement('div'); slot.className = 'span2';
      slot.innerHTML = '<label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" data-invite-password></label><label>Confirm password<input type="password" name="password2" required minlength="8" autocomplete="new-password" data-invite-password-2></label><p class="field-hint">At least 8 characters. This becomes your portal password. Nothing is emailed.</p>';
      btn.parentElement.before(slot);
    }
    ctl.form.addEventListener('submit', guard(async (e) => { e.preventDefault(); ctl.showErr('');
      let v; try { v = ctl.values(); v.email = inv.email;
        if (supa) { const password = ($('[data-invite-password]', ctl.form) || {}).value || ''; const again = ($('[data-invite-password-2]', ctl.form) || {}).value || '';
          if (password.length < 8) throw new Error('Password must be at least 8 characters.'); if (password !== again) throw new Error('Those passwords do not match.'); v.password = password; }
        await api.acceptAgentInvite(params.token, v); } catch (er) { ctl.showErr(er.message); throw er; }
      markAgentOnboard(); toast('Welcome! Your account is set up.'); go('/profile?setup=1'); }));
  } };
}

// Buyer / seller invite (Nov 9): a short login form. Name, the invited email (locked), cell phone and a password; no brokerage, license or photo.
function clientSignup({ api, params, go, inv, supa }) {
  const inner = html`<div class="eyebrow">PORTAL INVITE &middot; CLA TITLE PORTAL</div><h2 data-invite-state="pending" data-invite-kind="client">Set up your portal login</h2>
    <p class="muted">Welcome, ${inv.firstName}. Your CLA Title portal shows your file's progress, documents and tasks.</p>
    <form class="form-grid" data-client-signup novalidate>
      <label>First name<input name="firstName" maxlength="80" required value="${inv.firstName}"></label><label>Last name<input name="lastName" maxlength="80" required value="${inv.lastName}"></label>
      <label class="span2">Email<input name="email" type="email" readonly value="${inv.email}"></label>
      <label class="span2">Cell phone<input name="cellPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" required value="${inv.cellPhone || ''}"></label>
      ${supa ? html`<label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" data-invite-password></label><label>Confirm password<input type="password" name="password2" required minlength="8" autocomplete="new-password" data-invite-password-2></label><p class="field-hint span2">At least 8 characters.</p>` : ''}
      <p class="err span2" data-form-err hidden></p>
      <div class="span2"><button class="m-btn" type="submit" data-client-submit>Create my login</button></div></form>
    <p class="muted small">${supa ? 'Nothing is emailed. This link works once' : 'FAKE DATA DEMO. In the demo nothing is emailed; this link works once'} and expires on ${new Date(inv.expiresAt).toLocaleDateString('en-US')}.</p>`;
  return { title: 'Set up your login', body: shell(inner), mount(root) {
    const f = $('[data-client-signup]', root); const err = $('[data-form-err]', f);
    const show = (m) => { err.textContent = m || ''; err.hidden = !m; };
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); show('');
      const v = { firstName: f.firstName.value, lastName: f.lastName.value, email: inv.email, cellPhone: f.cellPhone.value };
      try {
        if (supa) { const password = f.password.value || ''; if (password.length < 8) throw new Error('Password must be at least 8 characters.'); if (password !== f.password2.value) throw new Error('Those passwords do not match.'); v.password = password; }
        await api.acceptAgentInvite(params.token, v);
      } catch (er) { show(er.message); throw er; }
      toast('Welcome! Your portal login is ready.'); go('/'); }));
  } };
}
