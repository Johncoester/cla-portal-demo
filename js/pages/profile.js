// Profile Setting: edit my own name and phone. (Role and email are changed by a processor / by the auth provider.)
import { outsideTypeLabel } from '../data/constants.js?v=202611302300';
import { html, $, guard, formData, toast } from '../ui.js?v=202611161500';
import { cleanBirthdate, BIRTHDATE_NOTE } from '../data/agent-info.js?v=202611247700';
import { agentFormHtml, mountAgentForm } from './agent-profile-form.js?v=202611312900';
import { AGENT_ONBOARD_KEY, consumeAgentOnboard, photoFileChosen, photoFileAllowed, PHOTO_TYPE_MSG } from '../data/agent-profile.js?v=202611312900';
export const ADD_COORDINATOR_QUERY = 'addCoordinator=1';
export function addCoordinatorPath() { return '/profile?' + ADD_COORDINATOR_QUERY; }
function hashOf(hash) {
  return String(hash == null && typeof location !== 'undefined' ? location.hash : hash || '');
}
function hasSetupFlag(hash) {
  return /(?:\?|&)setup=1(?:&|$)/.test(hashOf(hash));
}
function hasOnboardFlag(storage) {
  const box = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!box) return false;
  try { return box.getItem(AGENT_ONBOARD_KEY) === '1'; } catch (e) { return false; }
}
export function isAddCoordinatorStep(hash) {
  return /(?:\?|&)addCoordinator=1(?:&|$)/.test(hashOf(hash));
}
export function isFirstProfileVisit(hash, storage) {
  return hasSetupFlag(hash) || hasOnboardFlag(storage);
}
export function firstProfileSave(hash, storage) {
  return hasSetupFlag(hash) || consumeAgentOnboard(storage);
}
export function scrollToAddCoordinator(root) {
  const box = root && root.querySelector && root.querySelector('[data-agent-tcs]');
  if (!box) return false;
  box.setAttribute('data-add-coordinator-step', '1');
  if (typeof box.scrollIntoView === 'function') box.scrollIntoView({ block: 'start' });
  if (typeof box.focus === 'function') {
    if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
    try { box.focus({ preventScroll: false }); } catch (e) { box.focus(); }
  }
  return true;
}
import { gmailCardHtml, mountGmailCard } from './gmail-card.js?v=202611312900';
import { e2eGmailSetupHtml, mountE2eGmailSetup } from './e2e-gmail-setup.js?v=202611161500';
import { isRealEstateAgent } from '../data/agent-tc-links.js?v=202611248300';
import { agentTcSectionHtml, mountAgentTcSection } from './agent-tc-panel.js?v=202611248300';

export async function render({ api, refresh, go }) {
  const p = await api.getMyProfile();
  const agent = p.role === 'Outside user'; const bday = agent && api.getAgentBirthdate ? await api.getAgentBirthdate(p.id).catch(() => null) : null;   // John, Nov 3 call
  // John, Nov 4: an agent who set up their account from an invite edits their agent profile here (picture, DOB month/day, brokerage...)
  const ap = agent && api.getMyAgentProfile ? await api.getMyAgentProfile().catch(() => null) : null;
  const people = api.listContacts ? await api.listContacts().catch(() => []) : [];
  const mine = (people || []).find((c) => c && c.profileId === p.id) || null;
  const showTcs = !!(mine && isRealEstateAgent(mine, p.fileRoles || []) && api.listAgentTcs);
  const tcBlock = showTcs ? agentTcSectionHtml({ canEdit: true }) : '';
  if (ap) return { title: 'Profile', crumbs: [['Profile Setting']], body: html`<div class="box-title"><h2><span class="h-ico"></span>My Agent Profile</h2></div><p class="muted">This is what your buyers and sellers see on their portal: your picture, name, brokerage, cell, office phone and email.</p>${agentFormHtml(ap, { emailLocked: true, submitLabel: 'Save profile' })}${tcBlock}`,
    mount(root) {
      const ctl = mountAgentForm(root);
      const firstVisit = isFirstProfileVisit();
      const submit = ctl.form.querySelector('[data-agent-submit]');
      if (submit && firstVisit) submit.textContent = 'Save and add coordinator';
      if (submit && !ctl.form.querySelector('[data-autosave-status]')) {
        const st = document.createElement('span');
        st.className = 'muted small';
        st.dataset.autosaveStatus = '';
        st.setAttribute('aria-live', 'polite');
        st.style.marginLeft = '12px';
        submit.insertAdjacentElement('afterend', st);
      }
      const statusEl = ctl.form.querySelector('[data-autosave-status]');
      const setStatus = (m) => { if (statusEl) statusEl.textContent = m || ''; };
      const goAddCoordinator = () => { if (go) go(addCoordinatorPath()); else location.hash = '#' + addCoordinatorPath(); };
      let lastKey = '';
      async function saveAgent({ toastOnOk = false, advance = false } = {}) {
        ctl.showErr('');
        try {
          const vals = ctl.values();
          await api.updateMyAgentProfile(vals);
          lastKey = JSON.stringify(vals);
          setStatus('Saved');
          if (toastOnOk) toast('Profile saved');
          if (advance && firstProfileSave()) { goAddCoordinator(); return 'advanced'; }
          if (toastOnOk && !advance) refresh();
          return 'saved';
        } catch (er) { ctl.showErr(er.message); throw er; }
      }
      ctl.form.addEventListener('submit', guard(async (e) => { e.preventDefault(); await saveAgent({ toastOnOk: true, advance: firstVisit || isFirstProfileVisit() }); }));
      let timer = 0;
      const queueAutoSave = () => { clearTimeout(timer); timer = setTimeout(() => { void runAutoSave(); }, 800); };
      async function runAutoSave() {
        let vals;
        try { vals = ctl.values(); } catch (er) { return; }
        const key = JSON.stringify(vals);
        if (key === lastKey) return;
        setStatus('Saving…');
        try {
          await api.updateMyAgentProfile(vals);
          lastKey = key;
          setStatus('Saved');
        } catch (er) { setStatus(''); ctl.showErr(er.message); }
      }
      ctl.form.addEventListener('input', queueAutoSave);
      ctl.form.addEventListener('change', queueAutoSave);
      if (showTcs) mountAgentTcSection(root, { api, agentContactId: mine.id, canEdit: true });
      if (isAddCoordinatorStep()) scrollToAddCoordinator(root);
    } };
  // John, Nov 9: Gmail phase 1 (staff roles only; Live Test only). Google sends the browser back here with ?gmail=<result>.
  const gmail = !agent && api.getGmailStatus ? await api.getGmailStatus().catch(() => null) : null;
  const gmailNote = gmail ? new URLSearchParams((typeof location !== 'undefined' ? location.hash : '').split('?')[1] || '').get('gmail') || '' : '';
  const e2eGmail = p.isAdmin && api.e2eGmailStatus ? await api.e2eGmailStatus().catch(() => null) : null;
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Profile Setting</h2></div>
    <form id="pf" class="card form-grid"><label>First name<input name="firstName" required value="${p.firstName}"></label><label>Last name<input name="lastName" value="${p.lastName}"></label>
      <label>Email<input value="${p.email}" disabled></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${p.phone}"></label><label class="span2">${p.role === 'Outside user' ? 'Account type / roles on your files' : 'Role'}<input value="${p.role === 'Outside user' ? `${outsideTypeLabel(p)}: ${(p.fileLabels || p.fileRoles || []).join(' + ') || 'not on any file yet'} (set per order)` : p.role}" disabled></label>
      ${agent ? html`<label data-birthdate-field>Birthdate (optional)<input type="date" name="birthdate" value="${bday || ''}" max="${new Date().toISOString().slice(0, 10)}" data-birthdate><span class="field-hint">${BIRTHDATE_NOTE}</span></label>` : ''}
      <div class="span2"><button class="m-btn" type="submit">Save</button></div></form>${tcBlock}${gmail ? gmailCardHtml(gmail, gmailNote) : ''}${e2eGmailSetupHtml(e2eGmail)}`;
  return { title: 'Profile', crumbs: [['Profile Setting']], body, mount(root) {
    if (showTcs) mountAgentTcSection(root, { api, agentContactId: mine.id, canEdit: true });
    if (gmail) mountGmailCard(root, api, gmail, refresh);
    if (e2eGmail) mountE2eGmailSetup(root, api, refresh);
    $('#pf', root).addEventListener('submit', guard(async (e) => { e.preventDefault(); const pic = e.target.querySelector('input[type="file"]'); const picked = pic && pic.files && pic.files[0];
      if (photoFileChosen(picked) && !photoFileAllowed(picked)) throw new Error(PHOTO_TYPE_MSG);
      const fd = formData(e.target); const bd = fd.birthdate; delete fd.birthdate; if (agent && (bd || '') !== (bday || '')) cleanBirthdate(bd);
      await api.updateMyProfile(fd); if (agent && (bd || '') !== (bday || '')) await api.setAgentBirthdate(p.id, bd || ''); toast('Profile saved'); refresh(); }));
  } };
}
