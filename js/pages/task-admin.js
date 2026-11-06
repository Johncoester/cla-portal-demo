/* Task admin (Nov 5): every template can be added, edited, switched, or soft-retired.
 * Title Portal communications are separate from Title Production work. Audiences are chosen per task. */
import { html, $, $$, guard, toast, fmtDateTime, pill, formData } from '../ui.js?v=202611061730';
import { OPEN_TASK_HANDLING } from '../data/nov5-rules.js?v=202611061730';

const LANES = [['portal', 'Title Portal'], ['production', 'Title Production']];
const AUDS = [['buyer', 'Buyer'], ['seller', 'Seller'], ['listing_agent', 'Listing agent'], ['buyer_agent', 'Buyer agent'], ['sales_team', 'Sales team'], ['transaction_coordinator', 'Transaction coordinator'], ['internal', 'Internal only']];
const ROLES = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Processor'];

export async function taskAdminView({ api, refresh }) {
  const data = await api.listTaskAdmin();
  const groups = await api.listAlertGroups();
  const attorneys = await api.listEntityAttorneys();
  const prices = await api.listCplPrices();
  const audOf = (t) => (t.audiences || []).join(', ') || 'Legacy (follows the role on the copy)';
  const row = (t) => html`<tr data-task-admin-row="${t.code}" data-lane="${t.lane || 'legacy'}" data-retired="${t.retired ? 'yes' : 'no'}">
    <td><strong>${t.title}</strong><br><span class="muted small">${t.code} · v${t.version}</span></td>
    <td>${t.lane === 'production' ? 'Title Production' : t.lane === 'portal' ? 'Title Portal' : 'Legacy'}</td>
    <td>${audOf(t)}</td>
    <td>${(t.roles || []).join(', ') || '—'}</td>
    <td data-open-count>${t.openCount} open · ${t.copies} total${t.retired ? html` · ${pill('retired', 'warn')}` : t.enabled ? pill('generates', 'ok') : pill('off', '')}</td>
    <td>${t.retired ? '' : html`<button class="ghost" type="button" data-retire-template="${t.code}">Retire</button>`}</td></tr>`;
  const openNew = new URLSearchParams((location.hash || '').split('?')[1] || '').get('new') === '1';
  const body = html`<section data-task-admin>
    <div class="notice info" data-task-handling><strong>Portal and Production are different.</strong> Title Portal tasks are communications with the parties you select. Title Production tasks default to internal. An audience is not blanket sharing, and it never opens wires, payoffs, or accounting.
      ${OPEN_TASK_HANDLING}</div>
    <p><button type="button" class="m-btn" data-new-task>+ New task</button></p>
    <table class="tbl" data-task-admin-table><thead><tr><th>Task</th><th>Class</th><th>Audience</th><th>Copies for</th><th>On files</th><th></th></tr></thead><tbody>${data.tasks.map(row)}</tbody></table>
    <form class="card form-grid" data-task-admin-form id="task-admin-form" ${openNew ? '' : 'hidden'}><h3 class="span2">New task</h3>
      <p class="span2 muted small">A new code adds a task. An existing code saves a new version. Older copies already on files are not changed.</p>
      <label>Code<input name="code" required pattern="[a-z_]{2,40}" data-task-code placeholder="commitment_received"></label>
      <label>Title<input name="title" required data-task-title></label>
      <label>Class<select name="lane" data-task-lane>${LANES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
      <label>Due days<input name="dueDays" type="number" min="1" max="90" value="7" required data-task-due></label>
      <label class="span2">Description<textarea name="description" rows="2"></textarea></label>
      <fieldset class="span2"><legend>Who may receive it</legend>${AUDS.map(([v, l]) => html`<label class="chk"><input type="checkbox" name="audiences" value="${v}" data-audience="${v}"> ${l}</label>`)}</fieldset>
      <fieldset class="span2"><legend>Whose copy is created</legend>${ROLES.map((r) => html`<label class="chk"><input type="checkbox" name="roles" value="${r}"> ${r}</label>`)}</fieldset>
      <label class="check span2"><input type="checkbox" data-task-on checked> On: create this task on new files</label>
      <label class="span2" data-off-reason hidden>Why is it off? *<textarea name="offReason" rows="2" maxlength="500" data-off-reason-text placeholder="Required when the task starts off"></textarea></label>
      <div class="span2"><button class="m-btn" type="submit" data-save-template>Save task</button> <button type="button" class="ghost" data-new-task-cancel>Cancel</button></div></form>
    <div class="card" data-alert-groups><h3>Post-closing alert groups</h3><p class="muted small">Fake demo names only. Email stays blank until a real address is configured. The processor and the assigned team are still notified.</p>
      <ul>${groups.flatMap((g) => g.members.filter((m) => !m.retiredAt).map((m) => html`<li data-alert-member="${m.id}">${g.label}: <strong>${m.displayName}</strong> (${m.assignmentRole}) ${m.email ? m.email : html`<span class="muted">no email configured</span>`}</li>`))}</ul></div>
    <div class="card" data-entity-attorneys><h3>Entity-review attorneys</h3><p class="muted small">Authorization is the profile id and the attorney or backup role. The display name is not checked.</p>
      <ul>${attorneys.filter((a) => a.active && !a.retiredAt).map((a) => html`<li data-attorney="${a.id}" data-attorney-role="${a.assignmentRole}">${a.displayName} · ${a.assignmentRole}${a.profileId ? '' : html` · <span class="muted">profile id not linked</span>`}</li>`)}</ul></div>
    <div class="card" data-cpl-prices><h3>CPL prices</h3><p class="muted small" data-cpl-unresolved>${prices.filter((p) => !p.retiredAt && p.amount > 0).length ? '' : 'No state / underwriter price is configured. Unresolved CPLs stay blank and blocked.'}</p>
      <ul>${prices.filter((p) => !p.retiredAt).map((p) => html`<li>${p.state} · ${p.underwriter} · ${p.amount == null ? 'blank' : p.amount}</li>`)}</ul></div>
    <div class="card"><h3>Task admin log</h3><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
      ${data.log.length ? data.log.slice(0, 12).map((l) => html`<tr><td>${fmtDateTime(l.at)}</td><td>${l.byName}</td><td>${l.action} ${l.code}<br><span class="muted small">${l.detail}</span></td></tr>`) : html`<tr><td colspan="3" class="muted">No task admin changes yet.</td></tr>`}</tbody></table></div>
  </section>`;
  return { title: 'Task Templates', crumbs: [['Task Templates', '#/admin/templates'], ['Task admin']], body, mount(root) {
    const form = $('#task-admin-form', root);
    const showForm = () => { form.hidden = false; const code = $('[data-task-code]', form); if (code) code.focus(); };
    $('[data-new-task]', root).addEventListener('click', showForm);
    $('[data-new-task-cancel]', form).addEventListener('click', () => { form.reset(); $('[data-task-on]', form).checked = true; $('[data-off-reason]', form).hidden = true; form.hidden = true; });
    $('[data-task-on]', form).addEventListener('change', () => { $('[data-off-reason]', form).hidden = $('[data-task-on]', form).checked; });
    if (openNew) showForm();
    $$('[data-retire-template]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      const why = prompt('Why is this task being retired? Open copies stay open and are not cancelled.'); if (why == null) return;
      await api.retireTaskTemplate(b.dataset.retireTemplate, why); toast('Retired. Open tasks were kept.'); refresh(); })));
    form.addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target);
      const audiences = $$('input[name=audiences]:checked', form).map((el) => el.value);
      const roles = $$('input[name=roles]:checked', form).map((el) => el.value);
      const dueDays = Number(f.dueDays);
      if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 90) throw new Error('Due days must be from 1 to 90.');
      const on = $('[data-task-on]', form).checked;
      if (!on && String(f.offReason || '').trim().length < 3) throw new Error('Say why this task is off (at least 3 characters).');
      await api.saveTaskTemplate({ ...f, audiences, roles, dueDays });
      await api.setTaskEnabled(f.code, on, on ? '' : f.offReason);
      toast(on ? 'Saved. Older copies are unchanged.' : 'Saved and switched off. It will not be created on new files.'); refresh(); }));
  } };
}
