// Task templates (definitions with versions). Each participant gets a COPY that records the version it was made from.
// Admin and Super admin only (route guard). Each tab is the same page: Templates, Task switches, Task admin.
import { html, raw, $, $$, guard, toast, fmtDate, fmtDateTime, pill, modal, closeModal, formData } from '../ui.js?v=202611161500';
import { canManageTaskSwitches, REASON_MSG } from '../data/task-switches.js?v=202611191300';
import { taskAdminView } from './task-admin.js?v=202611161500';
import { runsOrders, isProcessor } from '../data/constants.js?v=202611101015';
const DELEG = [['', 'No - client only'], ['Buyer Agent', 'Buyer Agent (for the buyer)'], ['Listing Agent', 'Listing Agent (for the seller)'], ['Buyer Agent,Listing Agent', 'Each side\'s agent for their own client']];

export async function render(ctx) {
  // TASK SWITCHES (John, Nov 4; mockup 04): Admin / Super admin get the tabs; #/templates?tab=switches opens the switches
  const tab = new URLSearchParams((location.hash || '').split('?')[1] || '').get('tab') || '';
  const admin = canManageTaskSwitches(ctx.user);
  const tabs = admin ? html`<nav class="tpl-tabs" role="tablist" data-tpl-tabs><a role="tab" href="#/admin/templates" class="${tab ? '' : 'active'}" aria-selected="${tab ? 'false' : 'true'}">Templates</a><a role="tab" href="#/admin/templates?tab=switches" data-tab-switches class="${tab === 'switches' ? 'active' : ''}" aria-selected="${tab === 'switches' ? 'true' : 'false'}">Task switches</a><a role="tab" href="#/admin/templates?tab=admin" data-tab-task-admin class="${tab === 'admin' ? 'active' : ''}" aria-selected="${tab === 'admin' ? 'true' : 'false'}">Task admin</a></nav>` : '';
  const v = admin && tab === 'admin' ? await taskAdminView(ctx) : admin && tab === 'switches' ? await switchesView(ctx) : await templatesView(ctx);
  return { ...v, body: html`<div class="box-title"><h2><span class="h-ico"></span>Task Templates</h2></div>${tabs}${v.body}` };
}

async function templatesView({ api, user, refresh, go }) {
  const list = await api.listTaskTemplates(); const canSet = user.isAdmin || runsOrders(user); const codes = [...new Set(list.map((t) => t.code))];
  const block = (code) => { const vs = list.filter((t) => t.code === code); const cur = vs.find((t) => t.active) || vs[0];
    return html`<div class="card"><div class="deal-card-head"><h3>${cur.title}</h3><span class="muted small">${code}</span><span class="spacer"></span>
      ${user.isAdmin ? html`<button class="ghost" data-publish="${code}" data-title="${cur.title}">Publish new version</button>` : ''}</div>
      <p class="muted">${cur.description} &middot; For: ${cur.roles.join(', ')} &middot; ${cur.fields.length} field(s): ${cur.fields.map((f) => f.label).join('; ')}</p>
      ${cur.roles.some((r) => r.startsWith('Client-')) ? html`<p class="deleg">Agent may complete it for their client: ${cur.locked ? html`<strong>Never</strong> ${pill('client only - personal item', '')}`
        : canSet ? html`<select data-deleg="${code}" aria-label="Agent may complete">${DELEG.map(([v, l]) => html`<option value="${v}" ${v === cur.agentRoles.join(',') ? html`selected` : ''}>${l}</option>`)}</select>`
        : html`<strong>${cur.agentRoles.join(', ') || 'No - client only'}</strong>`}</p>` : ''}
      <table class="tbl"><thead><tr><th>Version</th><th>Title</th><th>Due after</th><th>Published</th><th>Copies made from it</th><th></th></tr></thead><tbody>
      ${vs.map((t) => html`<tr><td>v${t.version}</td><td>${t.title}</td><td>${t.dueDays} days</td><td>${fmtDate(t.publishedAt)} &middot; ${t.publishedByName}</td><td>${t.copies}</td><td>${t.active ? pill('current', 'ok') : pill('older', '')}</td></tr>`)}</tbody></table></div>`; };
  const body = html`<p class="muted">When someone is added to an order they get their own copy of each current template for their role. A copy keeps the version it was made from, so publishing a new version never changes work in progress.${user.isAdmin ? '' : ' Only an Admin can publish versions.'}</p>
    ${user.isAdmin ? html`<p><button type="button" class="m-btn" data-new-task>+ New task</button> <span class="muted small">Opens the task form on the Task admin tab. Class, audience, and due days are set there.</span></p>` : ''}
    ${codes.map(block)}`;
  return { title: 'Task Templates', crumbs: [['Task Templates']], body, mount(root) {
    const add = $('[data-new-task]', root); if (add) add.addEventListener('click', () => go('/admin/templates?tab=admin&new=1'));
    $$('[data-publish]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      const title = prompt('Title for the new version', b.dataset.title); if (title == null) return;
      const v = await api.publishTemplateVersion(b.dataset.publish, { title }); toast(`Published v${v.version}`); refresh(); })));
    $$('[data-deleg]', root).forEach((sel) => sel.addEventListener('change', guard(async () => {
      try { const r = await api.setTemplateAgentRoles(sel.dataset.deleg, sel.value ? sel.value.split(',') : []); toast(`Saved: ${r.agentRoles.join(', ') || 'client only'}`); } finally { refresh(); } })));
  } };
}

// ---------- Task switches (Admin / Super admin) ----------
const onOff = (v) => (v ? 'On' : 'Off');
async function switchesView({ api, refresh }) {
  const data = await api.listTaskSwitches(); const all = new URLSearchParams((location.hash || '').split('?')[1] || '').get('show') === 'all';
  const rows = all ? data.tasks : data.tasks.filter((t) => t.loan); const nLoan = data.tasks.filter((t) => t.loan).length;
  const who = (t) => html`${t.roles.join(', ')}${t.agentRoles.length ? html` <span class="muted">(${t.agentRoles.join(', ')} helps)</span>` : ''}`;
  const onFiles = (t) => (t.openCount == null ? '\u2014' : !t.openCount ? '\u2014' : html`${t.openCount} on open files${t.files.length && t.files.length <= 3 ? html` <span class="muted small">(${t.files.join(', ')})</span>` : ''}${t.enabled ? '' : html` &middot; <strong>kept</strong>`}`);
  const row = (t) => html`<tr data-task-switch-row="${t.code}" data-enabled="${t.enabled ? 'on' : 'off'}" class="${t.enabled ? '' : 'is-off'}">
    <td><strong>${t.title}</strong> ${t.enabled ? '' : html`<span class="ts-off-pill" data-off-since>Off since ${fmtDateTime(t.updatedAt).split(',')[0]}</span>`}<br><span class="muted small">${t.code}</span>
      ${t.enabled ? '' : html`<br><span class="small" data-off-why>Switched off by <strong>${t.updatedByName || '\u2014'}</strong>${t.reason ? html`: &ldquo;${t.reason}&rdquo;` : ''}</span>`}</td>
    <td>${who(t)}</td><td>${t.type}${t.type === 'Intake form' ? ` \u00b7 v${t.version}` : ''}</td><td data-on-files>${onFiles(t)}</td>
    <td><label class="mod-switch" title="${t.enabled ? 'On: created on new files' : 'Off: not created on new files'}"><input type="checkbox" role="switch" data-task-switch="${t.code}" aria-label="${t.title}: create on new files" ${t.enabled ? raw('checked') : ''}>
      <span class="mod-track" aria-hidden="true"><span class="mod-knob"></span></span><span class="mod-switch-label">${onOff(t.enabled)}</span></label></td></tr>`;
  const body = html`<section class="task-switches" data-task-switches>
    <div class="notice info" data-switch-rule><strong>Off = not created on new files; existing tasks are kept, never deleted.</strong> Turning a task off stops it being added to orders from now on
      (new files, and people added later). Copies already on files keep their answers but are hidden from the file's task lists for everyone except Admin / Super admin (shown to you marked &ldquo;Switched off&rdquo;); turning it back on shows them again.
      You are asked why when you switch a task off. Admin / Super admin only. Every change is logged below (who, when, why).</div>
    <p class="ts-filter small"><a href="#/admin/templates?tab=switches" class="${all ? '' : 'pill info'}" data-filter-loan>Loan-related tasks (${nLoan})</a> &middot; <a href="#/admin/templates?tab=switches&show=all" class="${all ? 'pill info' : ''}" data-filter-all>All tasks (${data.tasks.length})</a></p>
    <table class="tbl" data-task-switch-table><thead><tr><th>Task</th><th>Who gets it</th><th>Type</th><th>On open files</th><th>New files</th></tr></thead><tbody>${rows.map(row)}</tbody></table>
    <div class="card"><h3>Change log</h3><p class="small muted">Who changed which task switch, when, and from what to what. Read only; also written to the Activity Log.</p>
    <table class="tbl" data-task-switch-log><thead><tr><th>When</th><th>Who</th><th>Task</th><th>Change</th><th>Why</th></tr></thead><tbody>
    ${data.log.length ? data.log.map((l) => html`<tr data-task-log-row="${l.code}" data-log-old="${onOff(l.old)}" data-log-new="${onOff(l.new)}"><td class="nowrap">${fmtDateTime(l.at)}</td><td>${l.byName}</td><td>${l.label}</td>
      <td><span class="mod-pill ${l.old ? 'live' : 'beta'}">${onOff(l.old)}</span> &rarr; <span class="mod-pill ${l.new ? 'live' : 'beta'}">${onOff(l.new)}</span></td><td data-log-why>${l.reason || html`<span class="muted">&mdash;</span>`}</td></tr>`)
      : html`<tr><td colspan="5" class="muted">No changes yet. Every task starts On.</td></tr>`}</tbody></table></div></section>`;
  return { title: 'Task Templates', crumbs: [['Task Templates', '#/admin/templates'], ['Task switches']], body, mount(root) {
    $$('[data-task-switch]', root).forEach((cb) => cb.addEventListener('change', guard(async () => {
      const code = cb.dataset.taskSwitch; const t = data.tasks.find((z) => z.code === code); const on = cb.checked;
      if (on) { cb.disabled = true; try { await api.setTaskEnabled(code, true); } catch (e) { cb.checked = false; cb.disabled = false; throw e; }
        toast(`${t.title}: On (created on new files again; kept copies shown again)`); refresh(); return; }
      cb.checked = true;   // stays On until the reason is saved
      const m = modal(`Switch off \u201c${t.title}\u201d`, html`<form id="tsoff" class="form-grid" data-switch-off-form="${code}">
        <p class="span2">It stops being added to new files. ${t.openCount ? html`The <strong>${t.openCount}</strong> cop${t.openCount === 1 ? 'y' : 'ies'} already on open files ${t.openCount === 1 ? 'is' : 'are'} kept (answers too) but hidden from everyone except Admin / Super admin.` : 'Nothing already on a file is deleted.'}</p>
        <label class="span2">Why is it being switched off? *<textarea name="reason" rows="3" maxlength="500" required minlength="3" data-switch-reason placeholder="e.g. Lender information now comes from the lender directly"></textarea></label>
        <p class="span2 muted small">${REASON_MSG} Saved with your name and the time; shown in the change log.</p>
        <div class="span2"><button class="m-btn" type="submit" data-switch-off-save>Switch off</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#tsoff', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target);
        await api.setTaskEnabled(code, false, f.reason); closeModal(); toast(`${t.title}: Off (not created on new files; kept copies hidden from non-admins)`); refresh(); })); })));
  } };
}
