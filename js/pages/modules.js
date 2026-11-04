// MODULES (John, Nov 3: "an on and off ... for different modules ... controlled through the Admin and Super admins"; "Live on and off switch,
// which means if it's off, we know that it's in beta [and it] can still be tested through the portal"). Admin / Super admin only.
// One "Live" switch per module: ON = live for everyone their role allows; OFF = beta (regular users do not see it at all; Admins and Super
// admins still do, with a "Beta, in testing" badge). Every change is logged below (who, when, old -> new). Nothing is ever deleted.
import { html, raw, $$, guard, toast, fmtDateTime } from '../ui.js?v=202611032132';
import { canManageModules } from '../data/modules.js?v=202611032132';

const state = (m) => (!m.available ? ['Not available', 'off', 'Turned off in this portal\'s config file, so not even Admins see it. Nothing to switch here.']
  : m.live ? ['Live', 'live', 'Everyone their role allows sees it.'] : ['Beta, in testing', 'beta', 'Only Admins and Super admins see it (with a Beta badge). Regular users do not see it at all.']);
const word = (v) => (v ? 'Live' : 'Beta');

export async function render({ api, user, refresh }) {
  if (!canManageModules(user)) throw new Error('Only an Admin or Super admin can see the Modules page.');
  const data = await api.listModules(); const byId = Object.fromEntries(data.modules.map((m) => [m.id, m]));
  const card = (m) => { const [label, cls, note] = state(m); const parent = m.parent ? byId[m.parent] : null;
    return html`<div class="card mod-card is-${cls}" data-module="${m.id}" data-module-state="${cls}">
      <div class="mod-head"><div><h3 class="mod-title">${m.label}</h3><div class="mod-where muted small">${m.where}</div></div>
        <label class="mod-switch ${m.available ? '' : 'is-disabled'}" title="${m.available ? (m.live ? 'Live: on' : 'Live: off (beta)') : 'Not available on this portal'}">
          <input type="checkbox" role="switch" data-live-switch="${m.id}" aria-label="${m.label} Live" ${m.live && m.available ? raw('checked') : ''} ${m.available ? '' : raw('disabled')}>
          <span class="mod-track" aria-hidden="true"><span class="mod-knob"></span></span><span class="mod-switch-label">Live</span></label></div>
      <div class="mod-status"><span class="mod-pill ${cls}" data-module-pill="${m.id}">${label}</span> <span class="muted small">${note}</span></div>
      <p class="mod-desc">${m.desc}</p>
      <p class="small muted mod-who"><strong>Who (by role, always applies):</strong> ${m.who}</p>
      ${parent ? html`<p class="small muted">Part of the ${parent.label}: hidden for regular users whenever the ${parent.label} is not Live.</p>` : ''}
      <p class="small muted mod-changed" data-module-changed="${m.id}">${m.updatedAt ? html`Last changed ${fmtDateTime(m.updatedAt)} by ${m.updatedByName || 'an Admin'}` : 'Never changed (default: Live)'}</p></div>`; };
  const log = data.log;
  const body = html`<section class="modules-page" data-modules-page>
    <div class="page-head"><p class="eyebrow">Admin</p><h2 class="page-title">Modules</h2>
      <p class="muted mod-intro">One <strong>Live</strong> switch per module. <strong>Live on</strong>: the module is live for everyone their role allows.
      <strong>Live off</strong> = <span class="beta-badge">${data.betaLabel}</span>: regular users do not see it at all (no menu item, the page is refused);
      Admins and Super admins still see it and can test it, marked "Beta". Role rules always apply on top (agents and clients never see Accounting; agents never get wire instructions).
      Only Admins and Super admins see this page. Every change is logged below; nothing is deleted.</p></div>
    <div class="mod-grid" data-module-list>${data.modules.map(card)}</div>
    <div class="card mod-always" data-always-on><h3>Always on (no switch)</h3><p class="small muted">Core order pages and admin tools stay on for everyone their role allows.</p>
      <ul class="mod-always-list">${data.alwaysOn.map((a) => html`<li>${a}</li>`)}</ul></div>
    <div class="card mod-log-card"><h3>Change log</h3><p class="small muted">Who changed which switch, when, and from what to what. Read only.</p>
      <table class="tbl" data-module-log><thead><tr><th>When</th><th>Who</th><th>Module</th><th>Change</th></tr></thead><tbody>
      ${log.length ? log.map((l) => html`<tr data-module-log-row="${l.module}" data-log-old="${word(l.old)}" data-log-new="${word(l.new)}"><td class="nowrap">${fmtDateTime(l.at)}</td><td>${l.byName}</td><td>${l.label}</td>
        <td><span class="mod-pill ${l.old ? 'live' : 'beta'}">${word(l.old)}</span> &rarr; <span class="mod-pill ${l.new ? 'live' : 'beta'}">${word(l.new)}</span></td></tr>`)
        : html`<tr><td colspan="4" class="muted">No changes yet. Every module starts Live.</td></tr>`}</tbody></table></div></section>`;
  return { title: 'Modules', crumbs: [['Modules']], body, mount(root) {
    $$('[data-live-switch]', root).forEach((cb) => cb.addEventListener('change', guard(async () => {
      const id = cb.dataset.liveSwitch; const m = byId[id]; const live = cb.checked; cb.disabled = true;
      try { await api.setModuleLive(id, live); } catch (e) { cb.checked = !live; cb.disabled = false; throw e; }
      toast(live ? `${m.label} is Live for everyone their role allows` : `${m.label} is now in beta: only Admins and Super admins see it`); refresh();
    })));
  } };
}
