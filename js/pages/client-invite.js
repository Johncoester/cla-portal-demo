// Buyer / seller one-time link. Public. Nothing is emailed. Public sign-up stays off.
// A new login is an Outside user. An existing Outside user can link this file only.
// The page does not show the token again and does not change a staff role.
import { html, $, guard, toast, fmtDateTime } from '../ui.js?v=202611061842';
const GENERIC = 'This invite link is not valid or has expired.';
export async function render({ api, params, go }) {
  const inv = await api.getClientInvite(params.token);
  const supa = api.mode === 'supabase';
  const who = inv.role === 'Client-Seller' ? 'seller' : 'buyer';
  const shell = (inner) => html`<div class="login-page" data-client-invite-page="${inv.status}"><div class="login-card"><img src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow" class="sched-logo"><div class="eyebrow">PORTAL INVITE &middot; CLA TITLE PORTAL</div><h2>Set up your login</h2>${inner}
    <p class="dev-banner" data-test-environment>TEST ENVIRONMENT &middot; FAKE DATA ONLY</p></div></div>`;
  if (inv.status !== 'pending') return { title: 'Invite', body: shell(html`<p data-client-invite-bad>${inv.status === 'expired' ? 'This invite link has expired.' : inv.status === 'accepted' ? 'This invite link was already used. Sign in instead.' : GENERIC} Ask your closing team for a new link. Nothing was emailed.</p>`) };
  const action = inv.hasAccount
    ? html`<p data-client-has-account>This email already has a portal login. Sign in with that email, then open this same link again. This page will not change that password or your account type.</p><button class="m-btn m-btn-lg" type="button" data-client-link>Link this file to my login</button><p class="err-text" data-client-err role="alert" hidden></p>`
    : supa
      ? html`<form data-client-accept-form><label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" data-client-password></label><label>Confirm password<input type="password" name="confirm" required minlength="8" autocomplete="new-password" data-client-password-2></label><p class="field-hint" data-no-email>At least 8 characters. Nothing is emailed. Registration is closed except through this link.</p><p class="err-text" data-client-err role="alert" hidden></p><button class="m-btn m-btn-lg" type="submit">Create my login</button></form>`
      : html`<p class="field-hint" data-no-email>Nothing is emailed. This creates your portal login for this file only.</p><button class="m-btn m-btn-lg" type="button" data-client-accept>Create my login</button><p class="err-text" data-client-err role="alert" hidden></p>`;
  return { title: 'Set up your login', body: shell(html`<p>Welcome, <strong data-client-invite-name>${inv.firstName} ${inv.lastName}</strong>. You were invited as the ${who} with <strong>${inv.email}</strong>.</p>
    <p class="muted small">This link works once${inv.expiresAt ? `, until ${fmtDateTime(inv.expiresAt)}` : ''}. You will see only your own file.</p>
    ${action}`), mount(root) {
    const err = $('[data-client-err]', root);
    const show = (m) => { if (!err) return; err.textContent = m || ''; err.hidden = !m; };
    const linkExisting = guard(async () => { show(''); try { await api.acceptClientInvite(params.token, { existing: true }); } catch (e) { show(e.message); throw e; } toast('This file is linked to your login'); go('/orders'); });
    const linkBtn = $('[data-client-link]', root); if (linkBtn) linkBtn.addEventListener('click', linkExisting);
    const mockBtn = $('[data-client-accept]', root); if (mockBtn) mockBtn.addEventListener('click', guard(async () => { show(''); try { await api.acceptClientInvite(params.token, {}); } catch (e) { show(e.message); throw e; } toast('Your login is ready'); go('/orders'); }));
    const form = $('[data-client-accept-form]', root); if (form) form.addEventListener('submit', guard(async (e) => {
      e.preventDefault(); show('');
      const password = $('[data-client-password]', root).value; const again = $('[data-client-password-2]', root).value;
      if (password.length < 8) { show('Password must be at least 8 characters.'); return; }
      if (password !== again) { show('Those passwords do not match.'); return; }
      try { await api.acceptClientInvite(params.token, { password }); } catch (er) { show(er.message); throw er; }
      toast('Your login is ready'); go('/orders');
    }));
  } };
}
