// Workflows (John, Nov 6). Admin / Super admin define a flowchart of existing task templates.
// The chart is read-only. Files do not receive these steps yet.
import { html, raw, $, $$, toText, guard, toast, formData } from '../ui.js?v=202611061447';
import { DEAL_ROLES, TX_TYPES, US_STATE_NAMES } from '../data/constants.js?v=202611061447';
import { WORKFLOW_AUDIENCES, addStep, removeStep, moveStep, layoutWorkflow } from '../data/workflows.js?v=202611061447';

const audienceLabel = (id) => (WORKFLOW_AUDIENCES.find(([v]) => v === id) || ['', id])[1];
const blank = () => ({ id: '', name: '', description: '', active: true, audience: 'processing', steps: [], assignments: [] });
const newKey = () => `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function chart(steps) {
  if (!steps.length) return html`<p class="muted" data-workflow-empty>Add tasks to see the flowchart.</p>`;
  const { columns } = layoutWorkflow(steps);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const arrow = html`<svg class="wf-arrow" viewBox="0 0 28 24" width="28" height="24" aria-hidden="true" data-workflow-arrow><path d="M2 12h18M16 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  return html`<div class="wf-chart" data-workflow-chart role="img" aria-label="Workflow flowchart">${columns.map((col, i) => html`${i ? arrow : ''}<div class="wf-col" data-workflow-column="${i}" data-parallel="${col.length > 1 && col.every((s) => (s.dependsOn || '') === (col[0].dependsOn || '')) ? 'yes' : 'no'}">${col.map((s) => {
    const parent = s.dependsOn ? byId.get(s.dependsOn) : null;
    const sideBySide = col.filter((o) => (o.dependsOn || '') === (s.dependsOn || '')).length > 1;
    return html`<div class="wf-box" data-step="${s.id}"><strong>${s.templateTitle || 'Task'}</strong><span class="muted small">${s.templateCode}${s.templateVersion ? ` · v${s.templateVersion}` : ''}</span><span class="muted small">${parent ? `After ${parent.templateTitle}` : 'Starts here'}${sideBySide ? ' · side by side' : ''}</span></div>`;
  })}</div>`)}</div>`;
}

function editorBody(draft, templates) {
  const ordered = [...draft.steps].sort((a, b) => a.position - b.position);
  const earlier = (s) => ordered.filter((o) => o.position < s.position);
  const stepRow = (s) => html`<div class="wf-step" data-workflow-step="${s.id}">
    <span class="wf-pos">${s.position}</span>
    <span><strong>${s.templateTitle || s.templateCode}</strong><br><span class="muted small">${s.templateCode}</span></span>
    <label>Runs after<select data-depends="${s.id}" aria-label="Runs after for ${s.templateTitle || 'task'}"><option value="">Start of the workflow</option>${earlier(s).map((o) => html`<option value="${o.id}" ${s.dependsOn === o.id ? raw('selected') : ''}>${o.position}. ${o.templateTitle || o.templateCode}</option>`)}</select></label>
    <span class="wf-step-act"><button type="button" class="ghost" data-move="${s.id}" data-dir="-1" aria-label="Move up">Up</button> <button type="button" class="ghost" data-move="${s.id}" data-dir="1" aria-label="Move down">Down</button> <button type="button" class="ghost" data-remove-step="${s.id}">Remove</button></span>
  </div>`;
  const asgRow = (a, i) => html`<div class="wf-asg" data-workflow-assignment="${i}">
    <label>Role<select data-asg="role" data-i="${i}"><option value="">Any role</option>${DEAL_ROLES.map((r) => html`<option value="${r}" ${a.role === r ? raw('selected') : ''}>${r}</option>`)}</select></label>
    <label>File type<select data-asg="fileType" data-i="${i}"><option value="">Any file type</option>${TX_TYPES.map((t) => html`<option value="${t}" ${a.fileType === t ? raw('selected') : ''}>${t}</option>`)}</select></label>
    <label>State<select data-asg="state" data-i="${i}"><option value="">Any state</option>${US_STATE_NAMES.map(([c, n]) => html`<option value="${c}" ${a.state === c ? raw('selected') : ''}>${c} — ${n}</option>`)}</select></label>
    <button type="button" class="ghost" data-remove-asg="${i}">Remove</button>
  </div>`;
  return html`${chart(ordered)}
    <h3>Steps</h3>
    <p class="muted small">Pick a current task template. "Runs after" an earlier step. Two steps that run after the same step sit side by side on the chart.</p>
    <div data-workflow-steps>${ordered.length ? ordered.map(stepRow) : html`<p class="muted" data-steps-empty>No steps yet.</p>`}</div>
    <div class="wf-add"><label>Add a task<select data-add-template><option value="">Choose a task template</option>${templates.map((t) => html`<option value="${t.id}">${t.title} (${t.code})</option>`)}</select></label> <button type="button" class="ghost" data-add-step>Add step</button></div>
    <h3>Applies to</h3>
    <p class="muted small">Role, file type, and state can each be "any". A more specific active workflow wins when one is chosen later. This screen does not apply it to a file.</p>
    <div data-workflow-assignments>${draft.assignments.length ? draft.assignments.map(asgRow) : html`<p class="muted">Not assigned yet. It will not match a file until you add one.</p>`}</div>
    <p><button type="button" class="ghost" data-add-asg>Add assignment</button></p>`;
}

export async function render({ api, params, go }) {
  const data = await api.listWorkflows();
  const templates = (await api.listTaskTemplates()).filter((t) => t.active !== false && !t.retiredAt);
  const latest = new Map();
  for (const t of templates) { const cur = latest.get(t.code); if (!cur || (t.version || 1) > (cur.version || 1)) latest.set(t.code, t); }
  const choices = [...latest.values()].sort((a, b) => a.title.localeCompare(b.title));
  const creating = params.id === 'new';
  const selected = creating ? blank() : (params.id ? data.find((w) => w.id === params.id) : data[0]) || (params.id ? null : blank());
  const missing = !creating && params.id && !data.some((w) => w.id === params.id);
  const list = html`<ul class="wf-list" data-workflow-list>${data.map((w) => html`<li><a href="#/admin/workflows/${w.id}" class="${!creating && selected && selected.id === w.id ? 'active' : ''}" data-workflow-link="${w.id}"><strong>${w.name}</strong><br><span class="muted small">${audienceLabel(w.audience)}${w.active ? '' : ' · inactive'} · ${w.steps.length} step${w.steps.length === 1 ? '' : 's'}</span></a></li>`)}<li><a href="#/admin/workflows/new" class="${creating ? 'active' : ''}" data-workflow-new>New workflow</a></li></ul>`;
  const form = !selected ? html`<p data-workflow-missing>That workflow was not found.</p>` : html`<form id="wf-form" class="form-grid" data-workflow-form>
    <label>Name<input name="name" required maxlength="80" value="${selected.name}" data-workflow-name></label>
    <label>Audience<select name="audience" data-workflow-audience>${WORKFLOW_AUDIENCES.map(([v, l]) => html`<option value="${v}" ${selected.audience === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
    <label class="span2">Description<textarea name="description" rows="2" maxlength="500">${selected.description}</textarea></label>
    <label class="check"><input type="checkbox" name="active" ${selected.active ? raw('checked') : ''} data-workflow-active> Active</label>
    <div class="span2" data-wf-body></div>
    <div class="span2"><button class="m-btn" type="submit" data-workflow-save>Save workflow</button></div>
  </form>`;
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Workflows</h2></div><section data-workflows>
    <p class="notice info" data-workflow-scope><strong>Definitions only.</strong> A workflow is a flowchart of task templates for a role and a file type (Purchase or Refinance), and a state when you need one. Saving it does not add tasks to a file. Files still get their tasks the way they do today.</p>
    <div class="wf-layout">${list}<div>${missing ? html`<p data-workflow-missing>That workflow was not found.</p>` : ''}${form}</div></div>
  </section>`;
  return { title: 'Workflows', crumbs: [['Workflows']], body, mount(root) {
    if (!selected) return;
    const draft = JSON.parse(JSON.stringify(selected));
    const bodyEl = $('[data-wf-body]', root);
    const paint = () => { bodyEl.innerHTML = toText(editorBody(draft, choices)); wire(); };
    const wire = () => {
      $$('[data-depends]', bodyEl).forEach((sel) => sel.addEventListener('change', () => {
        const step = draft.steps.find((s) => s.id === sel.dataset.depends); if (!step) return;
        step.dependsOn = sel.value || null; paint();
      }));
      $$('[data-move]', bodyEl).forEach((b) => b.addEventListener('click', () => { draft.steps = moveStep(draft.steps, b.dataset.move, Number(b.dataset.dir)); paint(); }));
      $$('[data-remove-step]', bodyEl).forEach((b) => b.addEventListener('click', () => { draft.steps = removeStep(draft.steps, b.dataset.removeStep); paint(); }));
      const add = $('[data-add-step]', bodyEl);
      if (add) add.addEventListener('click', () => {
        const id = ($('[data-add-template]', bodyEl) || {}).value;
        const tpl = choices.find((t) => t.id === id);
        if (!tpl) { toast('Choose a task template first.', 'err'); return; }
        draft.steps = addStep(draft.steps, tpl, newKey()); paint();
      });
      $$('[data-asg]', bodyEl).forEach((sel) => sel.addEventListener('change', () => {
        const row = draft.assignments[Number(sel.dataset.i)]; if (!row) return;
        row[sel.dataset.asg] = sel.value; paint();
      }));
      $$('[data-remove-asg]', bodyEl).forEach((b) => b.addEventListener('click', () => { draft.assignments.splice(Number(b.dataset.removeAsg), 1); paint(); }));
      const addAsg = $('[data-add-asg]', bodyEl);
      if (addAsg) addAsg.addEventListener('click', () => { draft.assignments.push({ role: '', fileType: '', state: '' }); paint(); });
    };
    paint();
    $('#wf-form', root).addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const saved = await api.saveWorkflow({ id: draft.id || null, name: f.name, description: f.description, audience: f.audience, active: e.target.querySelector('[name=active]').checked, steps: draft.steps, assignments: draft.assignments });
      toast('Workflow saved. No file tasks were changed.');
      go(`/admin/workflows/${saved.id}`);
    }));
  } };
}
