// crm-home.js : CRM Home (Zoho Classic View: task list widget, Today's Leads, Amount by Stage) and the Task / Meeting detail pages (John, Nov 2).
// Function first, minimal styling. Reminders show in the portal only; nothing is emailed; meetings are never sent as invitations.
import { html, raw, $, $$, guard, toast, toText, fmtDate, fmtDateTime, fmtMoney, pill, modal, closeModal } from '../ui.js?v=202611161500';
import { localDate } from '../data/constants.js?v=202611302300';
import { HOME_TASK_FILTERS, HOME_TASK_DEFAULT, homeTaskFilter, sortTasks, amountByStage, entityLabel, REPEAT_EVERY, dueTone, daysOverdue, taskOpen } from '../data/crm.js?v=202611247700';
import { tabs, head } from './crm-kit.js?v=202611289980';
import { taskModal, meetingModal, fmtWhen } from './crm-forms.js?v=202611302100';
import { canChangeCrmRecord, CRM_LOCK_NOTE } from '../data/crm-visibility.js?v=202611247100';
import { inviteBtn, invitePreview } from './crm-janine.js?v=202611302100';
import { optionsOf, optLabel } from '../data/crm-config.js?v=202611247700';
import { lbl } from './crm-custom.js?v=202611302100';
import { chartSvg, kpiHtml, targetHtml, funnelHtml } from './crm-charts.js?v=202611161500';
import { homeChartsSkip, writeProbe, homeChartMessage, pageSession } from '../data/crm-home-charts.js?v=202611247000';
const subj = (cfg, s) => optLabel(cfg, 'taskSubject', s, { mark: false });   // Task Subject is free text; a subject that is a list option shows its current name
const orderOf = (cfg) => ({ priority: optionsOf(cfg, 'taskPriority').map((o) => o.value), status: optionsOf(cfg, 'taskStatus').map((o) => o.value) });

const crumbs = (label, extra) => [['CRM', '#/crm'], ...(extra ? [[label, extra[0]], [extra[1]]] : [[label]])];
const SS = (k, v) => { try { if (v === undefined) return sessionStorage.getItem('crm-home:' + k); sessionStorage.setItem('crm-home:' + k, v); } catch (e) { return null; } return null; };
// Janine, Nov 19 2026 (Feedback 29, Home tab): Related To is the same name as Contact Name, so it is not a column.
// Contact Name is the link to the lead, client, company, or deal the task belongs to.
const TASK_COLS = [['dueDate', 'Due Date'], ['subject', 'Subject'], ['contactName', 'Contact Name'], ['status', 'Status'], ['priority', 'Priority']];
const LEADS_PER_PAGE = 5;

// ---------------- HOME ----------------
export async function homePage({ api, me, params, cfg, refresh, assignees }) {
  if (!me || !me.id) throw new Error('Sign in to see your tasks.');
  // Every Home view is this person's tasks. The owner filter is on the query (indexed owner_id), including for an admin.
  const [tasks, leads, opps, callRem] = await Promise.all([api.listCrmTasks({ ownerId: me.id }), api.listCrmLeads(), api.listCrmOpportunities(), api.listCrmCallReminders ? api.listCrmCallReminders().catch(() => []) : []]);   // video 11: call reminders (recorded only)
  const today = localDate(); const todayLeads = leads.filter((l) => !l.archived && localDay(l.createdAt) === today).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const so = optionsOf(cfg, 'oppStage'); const stages = amountByStage(opps, so.map((o) => o.value), so.filter((o) => o.retired).map((o) => o.value)); const max = Math.max(1, ...stages.map((s) => s.amount));
  const reminders = tasks.filter((t) => t.reminderDue && (t.ownerId === me.id));
  // Janine, Nov 19 2026 (F31b, confirmed Nov 20): the ... menu is the way to reorder. Move up and Move down save this person's order.
  const homeMenu = html`<details class="dash-kebab" data-home-menu><summary aria-label="Home actions">...</summary><div role="menu" style="left:auto;right:0"><button type="button" data-home-reorder disabled>Reorder</button><p class="muted small" data-home-reorder-note hidden>There are no charts on Home to reorder.</p></div></details> <button type="button" class="m-btn" data-home-reorder-done hidden>Done</button>`;
  const body = html`${head('CRM: Home', me, homeMenu)}${tabs('home')}
    ${params.section === 'followups' ? html`<p class="muted small" data-followups-moved>My follow-ups are now the tasks on CRM Home ("My Open Tasks").</p>` : ''}
    ${reminders.length ? html`<p class="card" data-reminders>${pill('Reminder', 'warn')} ${reminders.length} task reminder(s) due: ${reminders.map((t, i) => html`${i ? ', ' : ''}<a href="#/crm/tasks/${t.id}">${subj(cfg, t.subject)}</a>`)} <span class="muted small">(shown in the portal only; never emailed)</span></p>` : ''}
    ${callRem.length ? html`<p class="card" data-call-reminders>${pill('Reminder', 'warn')} ${callRem.length} call reminder(s) due: ${callRem.map((a, i) => html`${i ? ', ' : ''}<a href="#/crm/calls/${a.id}" data-call-reminder-link="${a.id}">${a.subject}</a> <span class="muted small">(${String(a.callStart || '').replace('T', ' ')})</span>`)} <span class="muted small">(shown in the portal only; nothing is sent)</span></p>` : ''}
    <div class="card" data-home-tasks><h3><select data-task-filter aria-label="Task view">${HOME_TASK_FILTERS.map((f) => html`<option value="${f}">${f}</option>`)}</select> <span class="muted small" data-task-count></span></h3>
      <table class="tbl" id="home-tasks"><thead><tr>${TASK_COLS.map(([k, l]) => html`<th><a href="#" data-sort="${k}">${l}</a> <span class="muted small" data-sort-mark="${k}"></span></th>`)}<th></th></tr></thead><tbody></tbody></table></div>
    <div class="card" data-home-leads><h3>Today's Leads <a class="right small" href="#/crm/leads" data-view-all>View All</a></h3>
      <table class="tbl" id="home-leads"><thead><tr><th>Lead Name</th><th>Company</th><th>Email</th><th>Lead Source</th></tr></thead><tbody></tbody></table>
      <p><button class="ghost" data-leads-prev>&lsaquo; Prev</button> <span class="muted small" data-leads-page></span> <button class="ghost" data-leads-next>Next &rsaquo;</button></p></div>
    <div class="card" data-home-stages><h3>Amount by Stage</h3>
      <table class="tbl" id="home-stages"><thead><tr><th>Stage</th><th>Opportunities</th><th>Amount (est. yearly volume)</th><th style="width:40%"></th></tr></thead><tbody>
      ${stages.map((s) => html`<tr data-stage-row="${s.stage}"><td>${lbl(cfg, 'oppStage', s.stage)}</td><td>${s.count}</td><td data-amount>${fmtMoney(s.amount)}</td><td><div class="bar" style="background:#7FB539;height:12px;width:${Math.round((s.amount / max) * 100)}%"></div></td></tr>`)}</tbody></table>
      <p class="muted small">From the referral-partner pipeline (open the <a href="#/crm/pipeline">Pipeline</a>). Archived opportunities are left out.</p></div>`;
  const CHART_H = { s: 180, m: 260, l: 380 };
  const chartBody = (c) => {
    if (c.error) return html`<p class="err-text" data-comp-error>${c.error}</p>`;
    const d = c.data || {}; const cur = !!d.currency;
    if (c.type === 'kpi') return raw(kpiHtml(d, cur));
    if (c.type === 'target') return raw(targetHtml(d, cur));
    if (c.type === 'funnel') return raw(funnelHtml(d, cur));
    return raw(chartSvg(d, (c.config && c.config.chartType) || 'column', { currency: cur, height: CHART_H[c.height] || 260 }));
  };
  const chartCard = (c) => html`<div class="card" data-home-chart="${c.id}" data-source-name="${c.sourceName || ''}" style="width:100%;box-sizing:border-box">
    <h3 style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><span class="dash-drag" data-drag-handle>${c.name}</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ghost" data-home-up="${c.id}" hidden aria-label="Move ${c.name} up">Move up</button> <button type="button" class="ghost" data-home-down="${c.id}" hidden aria-label="Move ${c.name} down">Move down</button> <button type="button" class="ghost" data-home-refresh="${c.id}">Refresh</button> <button type="button" class="ghost" data-home-rename="${c.id}">Rename</button> <button type="button" class="ghost" data-home-remove="${c.id}">Remove</button></span></h3>
    <div data-comp-body>${chartBody(c)}</div></div>`;
  const cssId = (id) => (globalThis.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/[^A-Za-z0-9_-]/g, ''));
  let chartBox = null;
  let rootEl = null;
  let orderBusy = false;
  const chartIds = (box) => [...box.querySelectorAll('[data-home-chart]')].map((el) => el.dataset.homeChart);
  function setReorderOffer(mode) {
    const scope = rootEl || document;
    const btn = $('[data-home-reorder]', scope);
    const note = $('[data-home-reorder-note]', scope);
    if (btn) btn.disabled = mode !== 'ready';
    if (!note) return;
    note.hidden = mode === 'ready' || mode === 'pending';
    if (mode === 'empty') note.textContent = 'There are no charts on Home to reorder.';
    if (mode === 'one') note.textContent = 'Add another chart to Home to reorder. There is only one.';
    if (mode === 'error') note.textContent = 'Charts could not be loaded. Refresh the page and try again.';
  }
  function syncMoveEnds() {
    if (!chartBox) return;
    const nodes = [...chartBox.querySelectorAll('[data-home-chart]')];
    nodes.forEach((node, i) => {
      const up = node.querySelector('[data-home-up]');
      const down = node.querySelector('[data-home-down]');
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === nodes.length - 1;
    });
  }
  function placeIds(box, ids) {
    const byId = new Map([...box.querySelectorAll('[data-home-chart]')].map((node) => [node.dataset.homeChart, node]));
    ids.forEach((id) => { const node = byId.get(id); if (node) box.appendChild(node); });
  }
  function stopReorder() {
    const scope = rootEl || document;
    const menu = $('[data-home-menu]', scope);
    if (menu) menu.hidden = false;
    const done = $('[data-home-reorder-done]', scope);
    if (done) done.hidden = true;
    if (chartBox) chartBox.querySelectorAll('[data-home-up], [data-home-down]').forEach((b) => { b.hidden = true; });
    if (chartBox) chartBox.removeAttribute('data-home-reordering');
  }
  function startReorder() {
    const scope = rootEl || document;
    const offer = $('[data-home-reorder]', scope);
    const count = chartBox ? chartBox.querySelectorAll('[data-home-chart]').length : 0;
    if (!chartBox || count < 2 || (offer && offer.disabled)) return;
    const menu = $('[data-home-menu]', scope);
    if (menu) { menu.open = false; menu.hidden = true; }
    const done = $('[data-home-reorder-done]', scope);
    if (done) done.hidden = false;
    chartBox.querySelectorAll('[data-home-up], [data-home-down]').forEach((b) => { b.hidden = false; });
    chartBox.setAttribute('data-home-reordering', '1');
    syncMoveEnds();
  }
  async function persistOrder(box, next, previous) {
    try {
      await api.reorderCrmHomeCharts(next);
      writeProbe(pageSession(), 'on', me.id);
      toast('Order saved');
      syncMoveEnds();
    } catch (err) {
      placeIds(box, previous);
      syncMoveEnds();
      toast(homeChartMessage(err), 'err');
    }
  }
  async function moveChart(id, dir) {
    if (!chartBox || orderBusy) return;
    const previous = chartIds(chartBox);
    const i = previous.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= previous.length) return;
    const nodes = [...chartBox.querySelectorAll('[data-home-chart]')];
    if (dir < 0) chartBox.insertBefore(nodes[i], nodes[j]);
    else chartBox.insertBefore(nodes[j], nodes[i]);
    orderBusy = true;
    chartBox.querySelectorAll('[data-home-up], [data-home-down]').forEach((b) => { b.disabled = true; });
    try {
      await persistOrder(chartBox, chartIds(chartBox), previous);
    } finally {
      orderBusy = false;
      syncMoveEnds();
    }
  }
  function paintHomeCharts(root, charts) {
    let box = $('[data-home-charts]', root);
    if (!box) { box = document.createElement('div'); box.setAttribute('data-home-charts', ''); root.appendChild(box); }
    box.innerHTML = toText(charts.map((c) => chartCard(c)));
    chartBox = box;
    wireHomeCharts(box, charts);
    setReorderOffer(charts.length > 1 ? 'ready' : 'one');
  }
  function wireHomeCharts(box, charts) {
    const byId = new Map(charts.map((c) => [c.id, c]));
    const order = () => chartIds(box);
    box.addEventListener('click', guard(async (e) => {
      const upBtn = e.target.closest('[data-home-up]');
      const downBtn = e.target.closest('[data-home-down]');
      if (upBtn || downBtn) {
        const moveBtn = upBtn || downBtn;
        if (!moveBtn.hidden && !moveBtn.disabled) await moveChart(upBtn ? upBtn.dataset.homeUp : downBtn.dataset.homeDown, upBtn ? -1 : 1);
        return;
      }
      const refreshBtn = e.target.closest('[data-home-refresh]');
      const renameBtn = e.target.closest('[data-home-rename]');
      const removeBtn = e.target.closest('[data-home-remove]');
      if (refreshBtn) {
        const id = refreshBtn.dataset.homeRefresh;
        const card = await api.refreshCrmHomeChart(id);
        const node = box.querySelector(`[data-home-chart="${cssId(id)}"]`);
        if (node && card) {
          const title = node.querySelector('[data-drag-handle]'); if (title) title.textContent = card.name || '';
          const body = node.querySelector('[data-comp-body]'); if (body) body.innerHTML = toText(chartBody(card));
          byId.set(id, card);
        }
        toast('Chart refreshed');
        return;
      }
      if (renameBtn) { openHomeRename(renameBtn.dataset.homeRename, byId.get(renameBtn.dataset.homeRename) || {}); return; }
      if (!removeBtn) return;
      const id = removeBtn.dataset.homeRemove;
      if (!confirm('Take this chart off Home? The chart stays on the dashboard.')) return;
      await api.removeCrmHomeChart(id);
      const node = box.querySelector(`[data-home-chart="${cssId(id)}"]`); if (node) node.remove();
      byId.delete(id);
      toast('Removed from Home. The dashboard chart is unchanged.');
      if (!box.querySelector('[data-home-chart]')) {
        writeProbe(pageSession(), 'empty', me.id);
        stopReorder(); box.remove(); chartBox = null; setReorderOffer('empty');
      } else if (box.querySelectorAll('[data-home-chart]').length === 1) {
        stopReorder();
        setReorderOffer('one');
      } else syncMoveEnds();
    }));
    let card = null; let before = '';
    const chartUnder = (e, skip) => {
      const list = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
      for (const el of list) {
        const hit = el && el.closest ? el.closest('[data-home-chart]') : null;
        if (hit && hit !== skip && box.contains(hit)) return hit;
      }
      const under = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
      const target = under && under.closest ? under.closest('[data-home-chart]') : null;
      if (!target || target === skip || !box.contains(target)) return null;
      return target;
    };
    box.addEventListener('pointerdown', (e) => {
      const from = e.target && e.target.closest ? e.target : (e.target && e.target.parentElement);
      if (!from || !from.closest) return;
      if (from.closest('button, a, input, select, textarea, summary')) return;
      const handle = from.closest('[data-drag-handle]');
      if (!handle || !box.contains(handle)) return;
      card = handle.closest('[data-home-chart]'); if (!card) return;
      before = order().join('|'); card.classList.add('is-dragging');
      try { if (e.pointerId != null && card.setPointerCapture) card.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer has no capture */ }
      card.style.pointerEvents = 'none';
      e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
      if (!card) return;
      const target = chartUnder(e, card);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      box.insertBefore(card, e.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
    });
    const finish = async () => {
      if (!card) return;
      card.classList.remove('is-dragging'); card.style.pointerEvents = '';
      const next = order(); const previous = before.split('|').filter(Boolean); card = null;
      if (next.join('|') === previous.join('|')) return;
      await persistOrder(box, next, previous);
    };
    box.addEventListener('pointerup', finish); box.addEventListener('pointercancel', finish);
  }
  function openHomeRename(id, cur) {
    const m = modal('Rename on Home', html`<form data-home-rename-form>
      <p class="muted small">This name is only on your Home. The chart on the dashboard keeps its name. Leave this blank to use the dashboard name.</p>
      <label>Name on Home<input name="homeName" maxlength="100" value="${cur.homeTitle || ''}" placeholder="${cur.sourceName || cur.name || ''}"></label>
      <p><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">Save</button></p></form>`);
    const form = $('[data-home-rename-form]', m);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const typed = $('[name="homeName"]', e.target).value;
      try {
        await api.renameCrmHomeChart(id, typed);
        closeModal(); writeProbe(pageSession(), 'on', me.id);
        toast('Name saved on Home. The dashboard chart is unchanged.');
        if (typeof refresh === 'function') refresh();
      } catch (err) { toast(homeChartMessage(err), 'err'); }
    });
  }
  function loadHomeCharts(root) {
    if (homeChartsSkip(pageSession(), me.id)) { setReorderOffer('empty'); return Promise.resolve(); }
    if (!api || typeof api.listCrmHomeCharts !== 'function') { setReorderOffer('empty'); return Promise.resolve(); }
    return api.listCrmHomeCharts().then((pack) => {
      if (!pack || pack.available === false) { writeProbe(pageSession(), 'off', me.id); setReorderOffer('empty'); return; }
      const charts = Array.isArray(pack.charts) ? pack.charts : [];
      if (!charts.length) { writeProbe(pageSession(), 'empty', me.id); setReorderOffer('empty'); return; }
      writeProbe(pageSession(), 'on', me.id);
      paintHomeCharts(root, charts);
    }).catch(() => { setReorderOffer('error'); });
  }
  let chartsReady = Promise.resolve();
  return { title: 'CRM Home', crumbs: crumbs('Home'), body, chartsReady: () => chartsReady, mount(root) {
    rootEl = root;
    const reorderBtn = $('[data-home-reorder]', root); if (reorderBtn) reorderBtn.addEventListener('click', () => startReorder());
    const doneBtn = $('[data-home-reorder-done]', root); if (doneBtn) doneBtn.addEventListener('click', () => stopReorder());
    const fsel = $('[data-task-filter]', root); fsel.value = HOME_TASK_FILTERS.includes(SS('filter')) ? SS('filter') : HOME_TASK_DEFAULT;
    let [sk, sd] = (SS('sort') || 'dueDate:asc').split(':');
    const draw = () => { SS('filter', fsel.value); SS('sort', `${sk}:${sd}`);
      const list = sortTasks(homeTaskFilter(tasks, fsel.value, me.id, today), sk, sd, orderOf(cfg)); SS('order', JSON.stringify(list.map((t) => t.id)));
      const dueCell = (t) => { const tone = dueTone(t.dueDate, today, taskOpen(t)); const late = tone === 'overdue' ? daysOverdue(t.dueDate, today) : 0;
        return html`<span class="due-${tone}" data-due-tone="${tone}">${t.dueDate ? fmtDate(t.dueDate) : 'No due date'}${late ? html` <span data-days-overdue="${late}">${late} day${late === 1 ? '' : 's'} overdue</span>` : ''}</span>`; };
      $('#home-tasks tbody', root).innerHTML = toText(list.length ? list.map((t) => html`<tr data-task="${t.id}" class="${dueTone(t.dueDate, today, taskOpen(t)) === 'overdue' ? 'overdue' : ''}">
        <td data-col="dueDate">${dueCell(t)}</td>
        <td data-col="subject"><a href="#/crm/tasks/${t.id}" data-task-subject>${subj(cfg, t.subject)}</a>${t.reminderDue ? html` ${pill('Reminder', 'warn')}` : ''}</td>
        <td data-col="contactName">${t.contactLink && t.contactName ? html`<a href="${t.contactLink}" data-task-contact="${t.entity}">${t.contactName}</a>` : t.contactName || ''}</td>
        <td data-col="status">${lbl(cfg, 'taskStatus', t.status)}</td><td data-col="priority">${lbl(cfg, 'taskPriority', t.priority)}</td>
        <td data-col="actions">${!t.system ? (canChangeCrmRecord(me, t) ? html`<button type="button" class="ghost" data-quick-edit="${t.id}">Edit</button>${t.open ? html` <button type="button" class="ghost" data-quick-close="${t.id}">Close</button>` : ''}` : html`<button type="button" class="ghost" disabled data-locked-edit style="opacity:.45">Edit</button> <span class="muted" data-lock-note>${CRM_LOCK_NOTE}</span>`) : ''}</td></tr>`) : html`<tr><td colspan="${TASK_COLS.length + 1}" class="muted">No tasks in this view.</td></tr>`);
      $('[data-task-count]', root).textContent = `${list.length} task(s)`;
      $$('[data-sort-mark]', root).forEach((s) => { s.innerHTML = s.dataset.sortMark === sk ? (sd === 'asc' ? '&uarr;' : '&darr;') : ''; }); };
    fsel.addEventListener('change', draw);
    $('#home-tasks', root).addEventListener('click', guard(async (e) => {
      const edit = e.target.closest('[data-quick-edit]'); const close = e.target.closest('[data-quick-close]');
      if (!edit && !close) return;
      const id = (edit || close).dataset.quickEdit || (edit || close).dataset.quickClose;
      const t = tasks.find((z) => z.id === id); if (!t || !canChangeCrmRecord(me, t) || t.system) return;
      if (edit) { taskModal(api, { entity: t.entity, entityId: t.entityId, parentName: t.relatedTo || t.contactName, me, assignees: assignees || [], cfg }, t, () => refresh()); return; }
      await api.closeCrmTask(t.id); toast('Task closed'); refresh();
    }));
    $$('[data-sort]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const k = a.dataset.sort; if (k === sk) sd = sd === 'asc' ? 'desc' : 'asc'; else { sk = k; sd = 'asc'; } draw(); }));
    draw();
    let page = 0; const pages = Math.max(1, Math.ceil(todayLeads.length / LEADS_PER_PAGE));
    const drawLeads = () => { const slice = todayLeads.slice(page * LEADS_PER_PAGE, (page + 1) * LEADS_PER_PAGE);
      $('#home-leads tbody', root).innerHTML = toText(slice.length ? slice.map((l) => html`<tr data-lead-row="${l.id}"><td><a href="#/crm/leads/${l.id}">${l.name}</a></td><td>${l.company}</td><td>${l.email}</td><td>${l.leadSource}</td></tr>`) : html`<tr><td colspan="4" class="muted">No leads created today.</td></tr>`);
      $('[data-leads-page]', root).textContent = `${todayLeads.length ? page * LEADS_PER_PAGE + 1 : 0}-${Math.min(todayLeads.length, (page + 1) * LEADS_PER_PAGE)} of ${todayLeads.length}`;
      $('[data-leads-prev]', root).disabled = page === 0; $('[data-leads-next]', root).disabled = page >= pages - 1; };
    $('[data-leads-prev]', root).addEventListener('click', () => { if (page > 0) { page -= 1; drawLeads(); } });
    $('[data-leads-next]', root).addEventListener('click', () => { if (page < pages - 1) { page += 1; drawLeads(); } });
    drawLeads();
    chartsReady = loadHomeCharts(root);
  } };

}
const localDay = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// The lead or client this task belongs to (Janine, Feedback 29 item 6). The name is already on the task.
// The link is built from the record id. The page does not load the lead list or the client list.
const PROFILE_ID = /^[A-Za-z0-9_-]{1,80}$/;
function taskProfile(t) {
  if (!t || (t.entity !== 'lead' && t.entity !== 'contact')) return null;
  const name = String(t.parentName || t.contactName || '').trim();
  const id = String(t.entityId || '').trim();
  const href = PROFILE_ID.test(id) ? (t.entity === 'lead' ? `#/crm/leads/${id}` : `#/crm/contacts/${id}`) : '';
  return { entity: t.entity, label: entityLabel(t.entity), name, href: name && href ? href : '' };
}

// ---------------- TASK detail (Zoho: Edit, Close Task, prev / next) ----------------
export async function taskPage({ api, me, assignees, params, refresh, go, cfg }) {
  const t = await api.getCrmTask(params.id);
  const profile = taskProfile(t);
  let order = []; try { order = JSON.parse(SS('order') || '[]'); } catch (e) { order = []; }
  if (!order.includes(t.id)) order = sortTasks(await api.listCrmTasks({ ownerId: me.id }), 'dueDate', 'asc', orderOf(cfg)).map((x) => x.id);
  const i = order.indexOf(t.id); const prev = i > 0 ? order[i - 1] : null; const next = i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  const rep = t.repeatEvery ? `${(REPEAT_EVERY.find(([k]) => k === t.repeatEvery) || [, t.repeatEvery])[1]}${t.repeatUntil ? ', until ' + fmtDate(t.repeatUntil) : ''}` : 'No';
  const contactLabel = profile ? profile.label : 'Contact Name';
  const contactValue = profile
    ? (profile.href ? html`<a href="${profile.href}" data-task-profile-link="${profile.entity}">${profile.name}</a>`
      : html`<span class="muted" data-task-profile-missing>This ${profile.label.toLowerCase()} could not be shown. Open <a href="${profile.entity === 'lead' ? '#/crm/leads' : '#/crm/contacts'}">${profile.entity === 'lead' ? 'Leads' : 'Clients'}</a> and find the person there.</span>`)
    : (t.contactName ? html`<a href="${t.contactLink}">${t.contactName}</a>` : '—');
  const contactHint = profile ? '' : html` <span class="muted small">(${entityLabel(t.entity)})</span>`;
  const body = html`${head(`Task: ${subj(cfg, t.subject)}`, me)}${tabs('home')}
    <div class="card" data-task-detail="${t.id}">
      <p>${!t.system && canChangeCrmRecord(me, t) ? html`<button class="ghost" data-edit-task>Edit</button> ${t.open ? html`<button class="m-btn" data-close-task>Close Task</button> ` : ''}` : (!t.system ? html`<button class="ghost" type="button" disabled data-locked-edit style="opacity:.45">Edit</button> <span class="muted" data-lock-note>${CRM_LOCK_NOTE}</span> ` : '')}
        ${prev ? html`<a class="ghost" href="#/crm/tasks/${prev}" data-prev>&lsaquo; Previous</a>` : html`<span class="muted" data-prev-none>&lsaquo; Previous</span>`}
        ${next ? html`<a class="ghost" href="#/crm/tasks/${next}" data-next>Next &rsaquo;</a>` : html`<span class="muted" data-next-none>Next &rsaquo;</span>`}
        ${profile && profile.href ? html`<a class="ghost" href="${profile.href}" data-task-back="${profile.entity}">Back to ${profile.name}</a> ` : ''}<a class="ghost" href="#/crm">Back to Home</a></p>
      <dl class="kv" data-task-fields>
        <dt>Task Owner</dt><dd data-f="owner">${t.ownerName}</dd><dt>Due Date</dt><dd data-f="dueDate">${fmtDate(t.dueDate)}${t.overdue ? html` ${pill('Overdue', 'bad')}` : ''}</dd>
        <dt>Subject</dt><dd data-f="subject">${subj(cfg, t.subject)}</dd><dt>Priority</dt><dd data-f="priority">${lbl(cfg, 'taskPriority', t.priority)}</dd><dt>Status</dt><dd data-f="status">${lbl(cfg, 'taskStatus', t.status)}${t.cancelled ? ' (cancelled)' : ''}</dd>
        <dt>Related To</dt><dd data-f="relatedTo">${t.relatedLink ? html`<a href="${t.relatedLink}">${t.relatedTo}</a>` : t.relatedTo || '—'}</dd>
        <dt>${contactLabel}</dt><dd data-f="contactName" data-task-profile="${profile ? profile.entity : ''}">${contactValue}${contactHint}</dd>
        <dt>Created By</dt><dd>${t.createdByName}, ${fmtDateTime(t.createdAt)}</dd><dt>Modified By</dt><dd data-f="modifiedBy">${t.modifiedByName || t.createdByName}, ${fmtDateTime(t.modifiedAt || t.createdAt)}</dd>
        <dt>Closed Time</dt><dd data-f="closedTime">${t.closedAt ? fmtDateTime(t.closedAt) : '—'}</dd>
        <dt>Reminder</dt><dd data-f="reminder">${t.reminder ? html`${fmtWhen(t.reminderAt)}${t.reminderDue ? html` ${pill('Due', 'warn')}` : ''} <span class="muted small">(in the portal only; never emailed)</span>` : 'None'}</dd>
        <dt>Repeat</dt><dd data-f="repeat">${rep}</dd><dt>Description</dt><dd data-f="description">${t.body || '—'}</dd></dl></div>`;
  return { title: 'Task ' + t.subject, crumbs: crumbs('Home', ['#/crm', t.subject]), body, mount(root) {
    const e = $('[data-edit-task]', root); if (e) e.addEventListener('click', () => taskModal(api, { entity: t.entity, entityId: t.entityId, parentName: t.parentName, me, assignees, cfg }, t, () => refresh()));
    const c = $('[data-close-task]', root); if (c) c.addEventListener('click', guard(async () => { const r = await api.closeCrmTask(t.id); toast(r.nextTaskId ? 'Task closed; next occurrence created' : 'Task closed'); refresh(); })); } };
}

// ---------------- MEETING detail ----------------
export async function meetingPage({ api, me, assignees, params, refresh, cfg }) {
  const m = await api.getCrmMeeting(params.id);
  const body = html`${head(`Meeting: ${m.subject}`, me)}${tabs('home')}
    <div class="card" data-meeting-detail="${m.id}">
      <p>${canChangeCrmRecord(me, m) ? html`<button class="ghost" data-edit-meeting>Edit</button> ${inviteBtn(me)} ` : html`<button class="ghost" type="button" disabled data-locked-edit style="opacity:.45">Edit</button> <span class="muted" data-lock-note>${CRM_LOCK_NOTE}</span> `}<a class="ghost" href="${m.parentLink}">Back to ${m.parentName}</a></p>
      <dl class="kv" data-meeting-fields>
        <dt>Title</dt><dd data-f="title">${m.subject}</dd><dt>Type</dt><dd data-f="type">${lbl(cfg, 'meetingType', m.meetingType) || '—'}</dd><dt>Location</dt><dd>${m.location || '—'}</dd>
        <dt>From</dt><dd data-f="from">${fmtWhen(m.startsAt)}</dd><dt>To</dt><dd data-f="to">${fmtWhen(m.endsAt)}</dd><dt>All Day</dt><dd>${m.allDay ? 'Yes' : 'No'}</dd>
        <dt>Host</dt><dd data-f="host">${m.hostName}</dd>
        <dt>Participants</dt><dd data-f="participants">${m.participants.length ? m.participants.map((p, k) => html`${k ? ', ' : ''}${p.link ? html`<a href="${p.link}">${p.name}</a>` : p.name} <span class="muted small">(${p.label})</span>`) : '—'}</dd>
        <dt>${entityLabel(m.entity)}</dt><dd><a href="${m.parentLink}">${m.parentName}</a></dd>
        <dt>Status</dt><dd>${m.open ? 'Upcoming' : 'Held'}</dd>
        <dt>Created By</dt><dd>${m.createdByName}, ${fmtDateTime(m.createdAt)}</dd><dt>Modified By</dt><dd>${m.modifiedByName || m.createdByName}, ${fmtDateTime(m.modifiedAt || m.createdAt)}</dd>
        <dt>Description</dt><dd>${m.body || '—'}</dd></dl>
      <p class="muted small">Recorded in the portal only: no invitations were sent and nothing was added to any calendar. "Send invite" shows a preview and an .ics file; sending turns on once Gmail is connected.</p></div>`;
  return { title: 'Meeting ' + m.subject, crumbs: crumbs('Home', ['#/crm', m.subject]), body, mount(root) {
    const e = $('[data-edit-meeting]', root); if (e) e.addEventListener('click', guard(() => meetingModal(api, { entity: m.entity, entityId: m.entityId, parentName: m.parentName, me, assignees, cfg }, m, () => refresh())));
    const si = $('[data-send-invite]', root); if (si) si.addEventListener('click', guard(() => invitePreview(api, m.id))); } };
}
