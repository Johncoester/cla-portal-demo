/* Admin > Task Builder (John, Nov 13 2026; spec docs/specs/task-builder.md). Its own admin menu item, Admin / Super admin only.
 * TB-1: the list of flows (name, what starts it, On / Off), add / edit, history.
 * TB-2: which files a flow applies to (conditions), its steps (task, phone call task, wait, stop if EMD received), recent runs,
 * and "Check files now". Flows that are On run on open files; the hosted portal checks about every 15 minutes.
 * Nov 14 (John): Turn on asks "new files only" or "existing open files too"; "Try on one file" runs a flow once on one chosen file. */
import { html, raw, toText, $, $$, guard, toast, fmtDateTime, fmtDate, pill, modal, closeModal, formData } from '../ui.js?v=202611161500';
import { TRIGGERS, triggerNeedsDays, triggerOf, canManageTaskBuilder, cleanFlow, FLOWS_RUN_NOTE, DAYS_MIN, DAYS_MAX, NAME_MAX, DESC_MAX,
  TX_KINDS, STATES, ASSIGN_ROLES, STEP_TYPES, STEP_MAX, TITLE_MAX, DUE_MAX, triggerRuns, SCOPES, TRIAL_NOTE } from '../data/task-builder.js?v=202611221000';

const RUN_STATUS = { waiting: ['Waiting', 'info'], done: ['Finished', 'ok'], stopped: ['Stopped', ''], skipped: ['Skipped', ''] };

export async function render(ctx) {
  const { api, user, refresh } = ctx;
  if (!canManageTaskBuilder(user) || !api.listTaskFlows) throw new Error('That page does not exist.');
  const { flows, log, runs = [] } = await api.listTaskFlows();
  let sales = []; try { sales = (await api.listSalesStaff()) || []; } catch (e) { sales = []; }
  const salesName = (id) => { const p = sales.find((s) => s.id === id); return p ? (p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()) : 'a sales person no longer active'; };
  const whichFiles = (c) => { const parts = [];
    if ((c.transactionTypes || []).length) parts.push(c.transactionTypes.join(' or '));
    if ((c.states || []).length) parts.push(c.states.join(' or '));
    if ((c.salesPeople || []).length) parts.push('Sales: ' + c.salesPeople.map(salesName).join(' or '));
    return parts.length ? parts.join('; ') : 'All open files'; };
  const row = (f) => html`<tr data-tb-row="${f.id}" data-tb-active="${f.active ? 'yes' : 'no'}">
    <td><strong data-tb-name>${f.name}</strong>${f.description ? html`<br><span class="muted small">${f.description}</span>` : ''}
      ${(f.steps || []).length ? html`<ol class="small muted" data-tb-steps>${f.steps.map((s) => html`<li>${s.text}</li>`)}</ol>` : html`<br><span class="muted small" data-tb-no-steps>No steps yet.</span>`}</td>
    <td data-tb-trigger>${f.triggerText}${f.runsNow ? '' : html`<br><span class="muted small">Doesn't run yet</span>`}</td>
    <td class="small" data-tb-which>${whichFiles(f.conditions || {})}</td>
    <td>${f.active ? html`${pill('On', 'ok')}<br><span class="muted small" data-tb-scope>${f.scopeText || 'New files only'}</span>` : pill('Off', '')}</td>
    <td class="small muted">${fmtDateTime(f.updatedAt || f.createdAt)}${f.updatedByName ? html`<br>${f.updatedByName}` : ''}</td>
    <td class="nowrap">
      <button type="button" class="m-btn small" data-tb-edit="${f.id}">Edit</button>
      ${(f.steps || []).some((s) => s.type === 'create_task' || s.type === 'call_task') ? html`<button type="button" class="ghost small" data-tb-try="${f.id}">Try on one file</button>` : ''}
      ${f.active
        ? html`<button type="button" class="ghost small" data-tb-off="${f.id}">Turn off</button>`
        : html`<button type="button" class="ghost small" data-tb-on="${f.id}">Turn on</button>`}
    </td></tr>`;
  const runRow = (r) => { const [label, cls] = RUN_STATUS[r.status] || [r.status, ''];
    return html`<tr data-tb-run="${r.id}"><td class="small">${fmtDateTime(r.startedAt)}</td><td><strong>${r.flowName}</strong><br><a href="#/deals/${r.dealId}/tasks">${r.fileNumber || 'File'}</a></td>
      <td>${pill(label, cls)}${r.trial ? html` ${pill('Test run', 'warn')}` : ''}${r.status === 'waiting' && r.nextAt ? html`<br><span class="muted small">Next: ${fmtDate(r.nextAt)}</span>` : ''}</td>
      <td class="small">${(r.log || []).slice(-3).map((l) => html`${l.text}<br>`)}</td></tr>`; };
  const body = html`<section class="task-builder-page" data-task-builder>
    <div class="page-head"><div><p class="eyebrow">Admin</p><h2 class="page-title">Task Builder</h2>
      <p class="muted">Build automated workflows for title files. A flow starts when something happens on a file (for example, the order is opened, or the EMD hasn't come in after 2 days), checks which files it applies to, then runs its steps.
      Admin / Super admin only.</p></div>
      <div><button type="button" class="m-btn" data-tb-new>+ New flow</button> <button type="button" class="ghost" data-tb-run-now>Check files now</button></div></div>
    <div class="notice info" data-tb-run-note>${FLOWS_RUN_NOTE}</div>
    <div class="card"><h3>Flows <span class="muted small">(${flows.length})</span></h3>
      ${flows.length ? html`<table class="tbl" data-tb-table><thead><tr><th>Flow and steps</th><th>What starts it</th><th>Which files</th><th>Status</th><th>Last changed</th><th></th></tr></thead><tbody>${flows.map(row)}</tbody></table>`
        : html`<p class="muted" data-tb-empty>No flows yet. Click <strong>+ New flow</strong> to add the first one.</p>`}</div>
    <div class="card" data-tb-runs><h3>Recent runs</h3><p class="muted small">Each row is one flow on one file.</p><table class="tbl"><thead><tr><th>Started</th><th>Flow / file</th><th>Status</th><th>Latest</th></tr></thead><tbody>
      ${runs.length ? runs.slice(0, 25).map(runRow) : html`<tr><td colspan="4" class="muted">No flow has run on a file yet.</td></tr>`}</tbody></table></div>
    <div class="card" data-tb-history><h3>History</h3><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
      ${log.length ? log.slice(0, 20).map((l) => html`<tr data-tb-log><td class="small">${fmtDateTime(l.at)}</td><td>${l.byName || ''}</td><td><strong>${l.flowName}</strong> ${l.action}${l.detail ? html`: <br><span class="muted small" data-tb-log-detail>${l.detail}</span>` : ''}</td></tr>`)
        : html`<tr><td colspan="3" class="muted">No changes yet.</td></tr>`}</tbody></table></div>
  </section>`;
  return { title: 'Task Builder', crumbs: [['Task Builder']], body, mount(root) {
    const byId = new Map(flows.map((f) => [f.id, f]));
    $('[data-tb-new]', root).addEventListener('click', () => formModal(null));
    $('[data-tb-run-now]', root).addEventListener('click', guard(async () => {
      if (!api.runTaskFlowsNow) throw new Error('Checking files now is not available on this site yet.');
      const r = await api.runTaskFlowsNow(); toast(`Checked. ${r.started || 0} flow run(s) started, ${r.tasks || 0} task(s) created.`); refresh();
    }));
    $$('[data-tb-edit]', root).forEach((b) => b.addEventListener('click', () => formModal(byId.get(b.dataset.tbEdit))));
    $$('[data-tb-on]', root).forEach((b) => b.addEventListener('click', () => turnOnModal(byId.get(b.dataset.tbOn))));
    $$('[data-tb-try]', root).forEach((b) => b.addEventListener('click', () => tryModal(byId.get(b.dataset.tbTry))));

    // Turn on: which files (John, Nov 14). New files only is the default, so turning a flow on never sweeps the open files already there.
    function turnOnModal(f) {
      const onlyNew = f.trigger === 'order_opened';
      const m = modal(`Turn on: ${f.name}`, html`<form id="tbon" class="form-grid" data-tb-on-form>
        ${onlyNew ? html`<p class="span2">This flow starts when an order is opened, so it runs on orders placed from now on. Open orders already there are not touched.</p>`
          : html`<fieldset class="span2" data-tb-scope-pick><legend>Run it on</legend>
            ${SCOPES.map(([v, l], i) => html`<label class="chk"><input type="radio" name="scope" value="${v}" data-tb-scope-opt="${v}" ${i === 0 ? raw('checked') : ''}> ${l}</label><br>`)}
            <p class="muted small" data-tb-scope-hint>New files only: files opened after you turn it on. Existing open files too: the open files already there also get the flow if they match. Try it on one file first if you're not sure.</p></fieldset>`}
        <p class="span2 err-text" data-tb-on-err hidden></p>
        <div class="span2"><button class="m-btn" type="submit" data-tb-on-save>Turn on</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#tbon', m).addEventListener('submit', async (e) => { e.preventDefault(); const err = $('[data-tb-on-err]', m); err.hidden = true;
        const pick = $$('[data-tb-scope-opt]', m).find((x) => x.checked); const scope = onlyNew ? 'new' : (pick ? pick.value : 'new');
        try { await api.setTaskFlowActive(f.id, true, { scope }); closeModal();
          toast(scope === 'all' ? 'Turned on for new and existing open files.' : 'Turned on for new files only.'); refresh();
        } catch (ex) { err.hidden = false; err.textContent = ex.message || 'Could not turn the flow on. Try again.'; } });
    }

    // Try on one file (John, Nov 14): run the flow once on one open file, now, to see how it works
    async function tryModal(f) {
      let files = []; try { files = ((await api.listDeals({ status: 'Open' })) || []).filter((d) => (d.status || 'Open') === 'Open'); } catch (e) { files = []; }
      const m = modal(`Try on one file: ${f.name}`, html`<form id="tbtry" class="form-grid" data-tb-try-form>
        <p class="span2 notice info">${TRIAL_NOTE}</p>
        <label class="span2">File *<select name="dealId" required data-tb-try-file><option value="">Choose an open file…</option>
          ${files.map((d) => html`<option value="${d.id}">${d.fileNumber || d.id} · ${[d.street, d.city, d.state].filter(Boolean).join(', ')}</option>`)}</select></label>
        ${files.length ? '' : html`<p class="span2 muted">No open files found.</p>`}
        <p class="span2 err-text" data-tb-try-err hidden></p>
        <div class="span2" data-tb-try-result hidden></div>
        <div class="span2"><button class="m-btn" type="submit" data-tb-try-run>Run test</button> <button type="button" class="ghost" data-close>Close</button></div></form>`, { wide: true });
      let ran = false;
      $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => { if (ran) refresh(); }));
      $('#tbtry', m).addEventListener('submit', async (e) => { e.preventDefault(); const err = $('[data-tb-try-err]', m); const out = $('[data-tb-try-result]', m); err.hidden = true;
        const dealId = $('[data-tb-try-file]', m).value;
        if (!dealId) { err.hidden = false; err.textContent = 'Choose a file to try the flow on.'; return; }
        const btn = $('[data-tb-try-run]', m); btn.disabled = true;
        try { const r = await api.tryTaskFlowOnFile(f.id, dealId); ran = true;
          out.hidden = false;
          out.innerHTML = toText(html`<div class="card" data-tb-try-done><p><strong>${r.fileNumber}:</strong> ${r.status === 'skipped' ? 'this file does not match the flow\'s Which files, so nothing was created.' : `${r.tasks} task(s) created.`}
            <a href="#/deals/${dealId}/tasks" data-tb-try-open>Open the file's tasks</a></p><ul class="small">${(r.log || []).map((l) => html`<li>${l.text}</li>`)}</ul></div>`);
        } catch (ex) { err.hidden = false; err.textContent = ex.message || 'Could not run the test. Try again.'; }
        btn.disabled = false; });
    }
    $$('[data-tb-off]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      if (!confirm('Turn this flow off? Runs already started pause, and it can be turned back on.')) return;
      await api.setTaskFlowActive(b.dataset.tbOff, false); toast('Turned off.'); refresh();
    })));

    function formModal(f) {
      const creating = !f;
      const cond = (f && f.conditions) || { transactionTypes: [], states: [], salesPeople: [] };
      let steps = ((f && f.steps) || []).map(({ text, ...s }) => ({ ...s }));
      const checks = (name, list, chosen) => list.map(([v, l]) => html`<label class="chk"><input type="checkbox" data-tb-cond="${name}" value="${v}" ${chosen.includes(v) ? raw('checked') : ''}> ${l}</label> `);
      const m = modal(creating ? 'New flow' : `Edit: ${f.name}`, html`<form id="tbf" class="form-grid" data-tb-form novalidate>
        <label class="span2">Name *<input name="name" maxlength="${NAME_MAX}" required value="${f ? f.name : ''}" placeholder="EMD reminder" data-tb-name-input></label>
        <label class="span2">What starts it *<select name="trigger" required data-tb-trigger-input>
          <option value="">Choose…</option>
          ${TRIGGERS.map((t) => html`<option value="${t.code}" ${f && f.trigger === t.code ? raw('selected') : ''}>${t.label}${triggerRuns(t.code) ? '' : " (doesn't run yet)"}</option>`)}</select></label>
        <label class="span2" data-tb-days hidden>Days *<span class="muted small" data-tb-days-hint></span>
          <input name="triggerDays" type="number" min="${DAYS_MIN}" max="${DAYS_MAX}" step="1" inputmode="numeric" value="${f && f.triggerDays != null ? f.triggerDays : ''}" data-tb-days-input></label>
        <label class="span2">Description <span class="muted small">(optional)</span><textarea name="description" rows="2" maxlength="${DESC_MAX}" data-tb-desc-input placeholder="What this flow is for">${f ? f.description || '' : ''}</textarea></label>
        <fieldset class="span2" data-tb-conds><legend>Which files <span class="muted small">(leave a group blank for "any")</span></legend>
          <p class="small"><strong>Transaction type:</strong> ${checks('transactionTypes', TX_KINDS, cond.transactionTypes || [])}</p>
          <p class="small"><strong>State:</strong> ${checks('states', STATES.map((s) => [s, s]), cond.states || [])}</p>
          <p class="small"><strong>Sales person:</strong> ${sales.length ? checks('salesPeople', sales.map((s) => [s.id, s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim()]), cond.salesPeople || []) : html`<span class="muted">No sales people found.</span>`}</p>
        </fieldset>
        <fieldset class="span2" data-tb-steps-box><legend>Steps <span class="muted small">(run in order)</span></legend>
          <div data-tb-step-list></div>
          <button type="button" class="ghost small" data-tb-add-step>+ Add step</button></fieldset>
        ${creating ? html`<p class="span2 muted small">New flows start Off. Turn it on from the list when it's ready.</p>` : ''}
        <p class="span2 err-text" data-tb-err hidden></p>
        <div class="span2"><button class="m-btn" type="submit" data-tb-save>${creating ? 'Create flow' : 'Save changes'}</button>
          <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
      const sel = $('[data-tb-trigger-input]', m); const days = $('[data-tb-days]', m);
      const showDays = () => { const t = triggerOf(sel.value); days.hidden = !triggerNeedsDays(sel.value); $('[data-tb-days-hint]', m).textContent = t && t.days ? ` (${t.days}, ${DAYS_MIN} to ${DAYS_MAX})` : ''; };
      sel.addEventListener('change', showDays); showDays();

      const list = $('[data-tb-step-list]', m); const addBtn = $('[data-tb-add-step]', m);
      const stepRow = (s, i) => html`<div class="card small" data-tb-step="${i}">
        <p><strong>Step ${i + 1}</strong>
          <select data-tb-step-type aria-label="What step ${i + 1} does">${STEP_TYPES.map(([v, l]) => html`<option value="${v}" ${s.type === v ? raw('selected') : ''}>${l}</option>`)}</select>
          <button type="button" class="ghost small" data-tb-step-up ${i === 0 ? raw('disabled') : ''} aria-label="Move step ${i + 1} up">↑</button>
          <button type="button" class="ghost small" data-tb-step-down ${i === steps.length - 1 ? raw('disabled') : ''} aria-label="Move step ${i + 1} down">↓</button>
          <button type="button" class="ghost small" data-tb-step-remove>Remove</button></p>
        ${s.type === 'create_task' || s.type === 'call_task' ? html`
          <label>Task name<input data-tb-step-field="title" maxlength="${TITLE_MAX}" value="${s.title || ''}" placeholder="${s.type === 'call_task' ? 'Call the buyer\'s agent about the EMD' : 'Chase the EMD'}"></label>
          <label>For<select data-tb-step-field="assignTo"><option value="">Choose…</option>${ASSIGN_ROLES.map(([v, l]) => html`<option value="${v}" ${s.assignTo === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <label>Due in (days)<input data-tb-step-field="dueDays" type="number" min="0" max="${DUE_MAX}" step="1" inputmode="numeric" value="${s.dueDays != null ? s.dueDays : ''}"></label>`
        : s.type === 'wait' ? html`<label>Wait (days)<input data-tb-step-field="days" type="number" min="${DAYS_MIN}" max="${DAYS_MAX}" step="1" inputmode="numeric" value="${s.days != null ? s.days : ''}"></label>`
        : html`<p class="muted">If the EMD is marked received on the file, the flow stops here. If not, it goes on to the next step.</p>`}</div>`;
      const draw = () => { list.innerHTML = steps.length ? steps.map((s, i) => toText(stepRow(s, i))).join('') : '<p class="muted small">No steps yet.</p>';
        addBtn.hidden = steps.length >= STEP_MAX;
        $$('[data-tb-step]', list).forEach((box) => { const i = Number(box.dataset.tbStep);
          $('[data-tb-step-type]', box).addEventListener('change', (e) => { steps[i] = { type: e.target.value, ...(e.target.value === 'wait' ? { days: 1 } : e.target.value === 'stop_if_emd_received' ? {} : { title: steps[i].title || '', assignTo: steps[i].assignTo || '', dueDays: steps[i].dueDays != null ? steps[i].dueDays : 1 }) }; draw(); });
          $$('[data-tb-step-field]', box).forEach((el) => el.addEventListener('input', () => { steps[i][el.dataset.tbStepField] = el.value; }));
          $$('[data-tb-step-field]', box).forEach((el) => el.addEventListener('change', () => { steps[i][el.dataset.tbStepField] = el.value; }));
          $('[data-tb-step-up]', box).addEventListener('click', () => { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; draw(); });
          $('[data-tb-step-down]', box).addEventListener('click', () => { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; draw(); });
          $('[data-tb-step-remove]', box).addEventListener('click', () => { steps.splice(i, 1); draw(); }); }); };
      addBtn.addEventListener('click', () => { steps.push({ type: 'create_task', title: '', assignTo: '', dueDays: 1 }); draw(); });
      draw();

      $('#tbf', m).addEventListener('submit', async (e) => {
        e.preventDefault(); const err = $('[data-tb-err]', m); const btn = $('[data-tb-save]', m);
        err.hidden = true; btn.disabled = true;
        try {
          const conditions = { transactionTypes: [], states: [], salesPeople: [] };
          $$('[data-tb-cond]', m).filter((c) => c.checked).forEach((c) => conditions[c.dataset.tbCond].push(c.value));
          const input = cleanFlow({ ...formData(e.target), conditions, steps });   // checked here first, so a mistake never leaves the window
          if (creating) await api.createTaskFlow(input); else await api.updateTaskFlow(f.id, input);
          closeModal(); toast(creating ? 'Flow created. It is Off.' : 'Flow saved.'); refresh();
        } catch (ex) { err.hidden = false; err.textContent = ex.message || 'Could not save the flow. Try again.'; btn.disabled = false; }
      });
    }
  } };
}
