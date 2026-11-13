// Profile Setting: edit my own name and phone. (Role and email are changed by a processor / by the auth provider.)
import { outsideTypeLabel } from '../data/constants.js?v=202611101015';
import { html, $, guard, formData, toast } from '../ui.js?v=202611161500';
import { cleanBirthdate, BIRTHDATE_NOTE } from '../data/agent-info.js?v=202611101015';
import { agentFormHtml, mountAgentForm } from './agent-profile-form.js?v=202611161500';
import { consumeAgentOnboard, photoFileChosen, photoFileAllowed, PHOTO_TYPE_MSG } from '../data/agent-profile.js?v=202611140100';
export function firstProfileSave(hash) {
  const here = String(hash == null && typeof location !== 'undefined' ? location.hash : hash || '');
  const setup = /(?:\?|&)setup=1(?:&|$)/.test(here);
  const flagged = consumeAgentOnboard();
  return setup || flagged;
}
import { gmailCardHtml, mountGmailCard } from './gmail-card.js?v=202611191000';
import { e2eGmailSetupHtml, mountE2eGmailSetup } from './e2e-gmail-setup.js?v=202611161500';

export async function render({ api, refresh, go }) {
  const p = await api.getMyProfile();
  const agent = p.role === 'Outside user'; const bday = agent && api.getAgentBirthdate ? await api.getAgentBirthdate(p.id).catch(() => null) : null;   // John, Nov 3 call
  // John, Nov 4: an agent who set up their account from an invite edits their agent profile here (picture, DOB month/day, brokerage...)
  const ap = agent && api.getMyAgentProfile ? await api.getMyAgentProfile().catch(() => null) : null;
  if (ap) return { title: 'Profile', crumbs: [['Profile Setting']], body: html`<div class="box-title"><h2><span class="h-ico"></span>My Agent Profile</h2></div><p class="muted">This is what your buyers and sellers see on their portal: your picture, name, brokerage, cell, office phone and email.</p>${agentFormHtml(ap, { emailLocked: true, submitLabel: 'Save profile' })}`,
    mount(root) { const ctl = mountAgentForm(root); ctl.form.addEventListener('submit', guard(async (e) => { e.preventDefault(); ctl.showErr(''); try { await api.updateMyAgentProfile(ctl.values()); } catch (er) { ctl.showErr(er.message); throw er; } toast('Profile saved');
      if (firstProfileSave()) { if (go) go('/orders'); else location.hash = '#/orders'; return; }
      refresh(); })); } };
  // John, Nov 9: Gmail phase 1 (staff roles only; Live Test only). Google sends the browser back here with ?gmail=<result>.
  const gmail = !agent && api.getGmailStatus ? await api.getGmailStatus().catch(() => null) : null;
  const gmailNote = gmail ? new URLSearchParams((typeof location !== 'undefined' ? location.hash : '').split('?')[1] || '').get('gmail') || '' : '';
  const e2eGmail = p.isAdmin && api.e2eGmailStatus ? await api.e2eGmailStatus().catch(() => null) : null;
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Profile Setting</h2></div>
    <form id="pf" class="card form-grid"><label>First name<input name="firstName" required value="${p.firstName}"></label><label>Last name<input name="lastName" value="${p.lastName}"></label>
      <label>Email<input value="${p.email}" disabled></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${p.phone}"></label><label class="span2">${p.role === 'Outside user' ? 'Account type / roles on your files' : 'Role'}<input value="${p.role === 'Outside user' ? `${outsideTypeLabel(p)}: ${(p.fileLabels || p.fileRoles || []).join(' + ') || 'not on any file yet'} (set per order)` : p.role}" disabled></label>
      ${agent ? html`<label data-birthdate-field>Birthdate (optional)<input type="date" name="birthdate" value="${bday || ''}" max="${new Date().toISOString().slice(0, 10)}" data-birthdate><span class="field-hint">${BIRTHDATE_NOTE}</span></label>` : ''}
      <div class="span2"><button class="m-btn" type="submit">Save</button></div></form>${gmail ? gmailCardHtml(gmail, gmailNote) : ''}${e2eGmailSetupHtml(e2eGmail)}`;
  return { title: 'Profile', crumbs: [['Profile Setting']], body, mount(root) {
    if (gmail) mountGmailCard(root, api, gmail, refresh);
    if (e2eGmail) mountE2eGmailSetup(root, api, refresh);
    $('#pf', root).addEventListener('submit', guard(async (e) => { e.preventDefault(); const pic = e.target.querySelector('input[type="file"]'); const picked = pic && pic.files && pic.files[0];
      if (photoFileChosen(picked) && !photoFileAllowed(picked)) throw new Error(PHOTO_TYPE_MSG);
      const fd = formData(e.target); const bd = fd.birthdate; delete fd.birthdate; if (agent && (bd || '') !== (bday || '')) cleanBirthdate(bd);
      await api.updateMyProfile(fd); if (agent && (bd || '') !== (bday || '')) await api.setAgentBirthdate(p.id, bd || ''); toast('Profile saved'); refresh(); }));
  } };
}
