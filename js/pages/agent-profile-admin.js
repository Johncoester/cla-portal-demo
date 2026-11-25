// JC-AGENT-EDIT-1 (John, Nov 25 2026, 1:57 PM ET): Edit agent profile, for an Admin or Super admin. Reuses the agent's own form
// (agent-profile-form.js, staff mode): picture (optional; upload, replace or remove), first and last name, cell phone, brokerage,
// office phone. Email stays locked. Opened from User List > Edit User and from an order's Contacts tab (Buyer Agent / Listing Agent rows).
// Route: #/users/agent-profile/<profile id>?back=<#/... to return to>. The adapter and the database refuse anyone who is not an Admin.
import { html, guard, toast } from '../ui.js?v=202611161500';
import { agentFormHtml, mountAgentForm } from './agent-profile-form.js?v=202611310600';
import { canEditAgentProfiles, AGENT_EDIT_DENIED } from '../data/agent-profile-admin.js?v=202611310600';
// only a page inside the portal (User List or an order); anything else goes back to the person's Edit User page
export function agentEditBackHref(id, hash) {
  const q = new URLSearchParams(String(hash == null && typeof location !== 'undefined' ? location.hash : hash || '').split('?')[1] || '');
  const b = q.get('back') || '';
  return /^#\/(users|deals)\/[A-Za-z0-9_\-/]+(\?[A-Za-z0-9_=&\-]*)?$/.test(b) ? b : '#/users/edit/' + encodeURIComponent(String(id || ''));
}
export async function renderAgentProfileAdmin({ api, user, params, refresh }) {
  if (!canEditAgentProfiles(user) || !api.adminGetAgentProfile) throw new Error(AGENT_EDIT_DENIED);
  const ap = await api.adminGetAgentProfile(params.id);
  const name = `${ap.firstName || ''} ${ap.lastName || ''}`.trim() || ap.email;
  const back = agentEditBackHref(ap.profileId);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Edit agent profile</h2></div>
    <p class="muted" data-agent-edit-for="${ap.profileId}">You are editing ${name}'s agent profile. Their buyers and sellers see this picture, name, brokerage, cell, office phone and email on their portal. The picture is optional.</p>
    ${agentFormHtml(ap, { emailLocked: true, submitLabel: 'Save agent profile', staff: true })}
    <p><a class="ghost" href="${back}" data-agent-edit-back>Back</a></p>`;
  return { title: 'Edit agent profile', crumbs: [['User List', '#/users'], [name, '#/users/edit/' + encodeURIComponent(ap.profileId)], ['Agent profile']], body, mount(root) {
    const ctl = mountAgentForm(root);
    ctl.form.addEventListener('submit', guard(async (e) => { e.preventDefault(); ctl.showErr('');
      try { await api.adminUpdateAgentProfile(ap.profileId, ctl.values()); } catch (er) { ctl.showErr(er.message); throw er; }   // the typed values stay in the form
      toast('Agent profile saved'); refresh(); }));
  } };
}
