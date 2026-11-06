// Agent account setup from a one-time invite link (#/agent-invite/<token>), John Nov 4. Works without signing in. FAKE DATA ONLY, nothing sent.
import { html, $, guard, toast } from '../ui.js?v=202611062120';
import { agentFormHtml, mountAgentForm } from './agent-profile-form.js?v=202611062120';
import { STATUS_LABEL } from '../data/agent-profile.js?v=202611062120';
const shell = (inner) => html`<div class="login-page ap-signup-page"><div class="login-card ap-signup-card"><img src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow" class="sched-logo">${inner}</div></div>`;
export async function render({ api, params, go }) {
  const inv = await api.getAgentInvite(params.token);
  if (inv.status !== 'pending') {
    const why = { expired: 'This invite link has expired. Ask your CLA Title contact to resend it.', accepted: 'This invite was already used. Sign in to the portal instead.', revoked: 'This invite is no longer active.', invalid: 'This invite link is not valid. It may have been replaced by a newer link.' }[inv.status] || 'This invite link is not valid.';
    return { title: 'Agent invite', body: shell(html`<div class="eyebrow">AGENT INVITE</div><h2 data-invite-state="${inv.status}">Invite ${STATUS_LABEL[inv.status] || 'not valid'}</h2><p>${why}</p><p><a class="m-btn" href="#/login">Go to sign in</a></p>`) };
  }
  const supa = api.mode === 'supabase';
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
      toast('Welcome! Your account is set up.'); go('/profile'); }));
  } };
}
