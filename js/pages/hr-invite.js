// HR INVITE LINK (John + Francis, Nov 4): #/hr-invite/<token>. Public (no sign-in). The employee (US or Philippines team) sets up their portal login.
// Mock mode: one click makes the login (account role 'Employee', or links an existing staff login with the same email) and signs them in.
// Supabase: they first create their sign-in (email + password, Supabase Auth), then public.hr_accept_invite() links it. Nothing is ever emailed.
// Refused inside a locked test-link session (locked-links.js routeAllowed).
import { html, $, guard, toast, fmtDateTime } from '../ui.js?v=202611060250';
export async function render({ api, params, go }) {
  const inv = await api.getHrInvite(params.token);
  const shell = (inner) => html`<div class="login-page hr-invite-page" data-hr-invite-page="${inv.status}"><div class="login-card"><img src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow" class="sched-logo"><div class="eyebrow">HR INVITE &middot; CLA TITLE PORTAL</div><h2>Set up your login</h2>${inner}
    <p class="dev-banner" data-test-environment>TEST ENVIRONMENT &middot; FAKE DATA ONLY</p></div></div>`;
  if (inv.status !== 'pending') return { title: 'Invite', body: shell(html`<p data-hr-invite-bad>${inv.status === 'expired' ? 'This invite link has expired.' : inv.status === 'accepted' ? 'This invite link was already used. Sign in instead.' : 'This invite link is not valid.'} Ask HR for a new link.</p>`) };
  return { title: 'Set up your login', body: shell(html`<p>Welcome, <strong data-hr-invite-name>${inv.firstName} ${inv.lastName}</strong>. HR invited you to the CLA Title portal with <strong>${inv.email}</strong>.</p>
    <p class="muted small">This link works once, until ${fmtDateTime(inv.expiresAt)}. You will see your own employee profile and can update your phone, address and emergency contact.</p>
    <button class="m-btn m-btn-lg" data-hr-accept>Set up my login</button>`), mount(root) {
    $('[data-hr-accept]', root).addEventListener('click', guard(async () => { await api.acceptHrInvite(params.token); toast('Your login is ready'); go('/hr/me'); }));
  } };
}
