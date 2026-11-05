// HR WORKSPACE, PHASE 1 (John + Francis, Nov 4): Zoho People's screens in the portal's baby-blue card style. FAKE DATA ONLY; nothing is sent.
//   #/hr                 HR Home (greeting, quick actions, counts; Leave / Check-in / Time logs = Coming soon)   HR managers + Super admins
//   #/hr/employees       Employee Information: search, filter panel, grid / list, ... menu (Export, History Export, Import = Coming soon)
//   #/hr/employees/<id>  Employee profile: Basic, Work, Compensation, Contact, Emergency contact, History (edit rules: data/hr.js)
//   #/hr/add             Add Employee (Employee ID + Generate ...): makes a one-time invite link, never emails it
//   #/hr/departments, #/hr/designations   list, add, archive / restore (no deletes)
//   #/hr/me              My profile (every employee)        #/hr/team   My team (direct reports' basic fields only)
//   #/hr/settings        HR Settings: assign / remove HR managers (Super admin only, logged to the history)
// The adapter refuses anything the person may not do; the page only hides what they cannot use.
import { html, raw, $, $$, guard, toast, fmtDate, fmtDateTime } from '../ui.js?v=202611052321';
import { hrCanManage, hrIsSuper, filterEmployees, initials, fullNameOf, COUNTRIES, EMPLOYMENT_TYPES, EMPLOYMENT_STATUSES, PAY_TYPES, PAY_CURRENCIES, WORK_LOCATIONS, EMPLOYEE_ROLE_FILTER,
  HR_NO_EMAIL_NOTE, HR_INVITE_DAYS, FIELD_LABEL, labelOf, jobTitleOf } from '../data/hr.js?v=202611052321';
import { companyDocsPage, employeeDocsCard, sharedDocsCard, portalTimeCard, wireEmployeeDocs, wireSharedDocs } from './hr-feedback.js?v=202611052321';
const PILL = { active: 'ok', on_leave: 'warn', separated: 'bad' };
const INV = { pending: ['Invite pending', 'warn'], expired: ['Invite expired', 'bad'], revoked: ['Invite revoked', ''], none: ['No login yet', ''], accepted: ['Has login', 'ok'] };
const abs = (link) => location.href.split('#')[0] + link;
const opt = (list, sel, blank) => html`${blank != null ? html`<option value="">${blank}</option>` : ''}${list.map(([v, l]) => html`<option value="${v}"${String(v) === String(sel == null ? '' : sel) ? raw(' selected') : ''}>${l}</option>`)}`;
const avatar = (e, cls = '') => html`<span class="hr-av ${cls}" aria-hidden="true">${initials(e)}</span>`;
const statusPill = (e) => html`<span class="pill ${PILL[e.employmentStatus] || ''}" data-hr-status>${labelOf(EMPLOYMENT_STATUSES, e.employmentStatus)}</span>${e.archivedAt ? html` <span class="pill" data-hr-archived>Archived</span>` : ''}`;
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'; };
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function head(user, title, sub, tab) {
  const tabs = hrCanManage(user) && ['employees', 'departments', 'designations'].includes(tab) ? html`<ul class="nav-tabs hr-subtabs" data-hr-subtabs>${[['employees', 'Employees', '#/hr/employees'], ['departments', 'Departments', '#/hr/departments'], ['designations', 'Designations', '#/hr/designations']]
    .map(([k, l, h]) => html`<li><a class="${k === tab ? 'active' : ''}" href="${h}" data-hr-subtab="${k}">${l}</a></li>`)}</ul>` : '';
  const quick = hrCanManage(user) ? html`<div class="hr-quick-wrap"><button class="m-btn hr-plus" data-hr-quick aria-haspopup="true" title="Quick Actions">+ <span class="hr-plus-l">Quick Actions</span></button>
    <div class="hr-quick-dd card" data-hr-quick-dd hidden role="menu"><strong class="small muted">Quick Actions</strong><a href="#/hr/add" data-hr-qa="employee" role="menuitem">Employee</a><a href="#/hr/departments?add=1" data-hr-qa="department" role="menuitem">Department</a><a href="#/hr/designations?add=1" data-hr-qa="designation" role="menuitem">Designation</a>
      <span class="muted small" data-hr-qa-soon>Leave, Travel Request, Task, Exit Details: coming in later phases</span></div></div>` : '';
  return html`<div class="page-head hr-head"><div><p class="eyebrow">HR${user.hrRole ? html` &middot; ${user.hrRole === 'super' ? 'Super admin' : user.hrRole === 'hr_manager' ? 'HR manager' : 'Employee'}` : ''}</p><h2 class="page-title">${title}</h2>${sub ? html`<p class="muted">${sub}</p>` : ''}</div>${quick}</div>${tabs}`;
}
const wireQuick = (root) => { const b = $('[data-hr-quick]', root); const dd = $('[data-hr-quick-dd]', root); if (!b) return;
  b.addEventListener('click', (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; }); document.addEventListener('click', () => { dd.hidden = true; }, { once: true }); };

export async function render(ctx) {
  const { api, user, params } = ctx; const sec = params.section || 'home';
  if (!user.hrRole) throw new Error('HR is not available for your account.');
  let me; try { me = await api.hrMe(); } catch (e) { return notOpen(user, e.message); }
  if (sec === 'home') return hrCanManage(user) ? home(ctx, me) : profile(ctx, me.employee ? me.employee.id : '', true);
  if (sec === 'me') { if (!me.employee) throw new Error('You do not have an HR employee record yet.'); return profile(ctx, me.employee.id, true); }
  if (sec === 'team') return team(ctx, me);
  if (sec === 'employee') return profile(ctx, params.id, me.employee && me.employee.id === params.id);
  if (!hrCanManage(user)) throw new Error('Only HR managers and Super admins can open this. You can see your own profile under My profile.');
  if (sec === 'employees') return list(ctx);
  if (sec === 'add') return addForm(ctx);
  if (sec === 'departments' || sec === 'designations') return lookup(ctx, sec);
  if (sec === 'documents') return companyDocsPage(ctx, head, wireQuick);   // John, Nov 4 HR review: HR Documents page
  if (sec === 'settings') { if (!hrIsSuper(user)) throw new Error('Only a Super admin can assign or remove HR managers.'); return settings(ctx); }
  throw new Error('That HR page does not exist.');
}
function notOpen(user, msg) {
  return { title: 'HR', crumbs: [['HR']], body: html`${head(user, 'HR', '')}<div class="card hr-soon" data-hr-not-open><h3>HR is not open yet</h3><p class="muted">${msg}</p></div>` };
}
// ---------------- HR Home ----------------
function home({ user }, me) {
  const c = me.counts || {}; const e = me.employee;
  const stat = (k, n, l, href) => html`<a class="card hr-stat" href="${href}" data-hr-stat="${k}"><span class="hr-stat-n">${n}</span><span class="hr-stat-l">${l}</span></a>`;
  const body = html`<section class="hr-page" data-hr-home>${head(user, 'HR Home', '')}
    <div class="hr-home-grid">
      <div class="card hr-greet" data-hr-greet><div class="hr-greet-row">${e ? avatar(e, 'lg') : ''}<div><h3>${greet()}, ${user.firstName}</h3>
        <p class="muted">${e ? html`${e.employeeCode} &middot; ${e.designationName || e.jobTitle} &middot; ${e.departmentName}` : 'Super admin'}${me.access === 'beta' ? html` &middot; <span class="beta-badge">Beta</span> only Super admins see HR while it is set up` : ''}</p>
        ${e ? html`<a class="ghost" href="#/hr/me" data-hr-my-profile-link>My profile</a>` : ''}</div></div></div>
      <div class="card hr-actions" data-hr-actions><h3>Quick actions</h3><div class="hr-action-row">
        <a class="m-btn" href="#/hr/add" data-hr-action="add">+ Add Employee</a><a class="ghost" href="#/hr/employees" data-hr-action="list">Employee Information</a>
        <a class="ghost" href="#/hr/departments?add=1" data-hr-action="department">+ Department</a><a class="ghost" href="#/hr/designations?add=1" data-hr-action="designation">+ Designation</a>
        ${hrIsSuper(user) ? html`<a class="ghost" href="#/hr/settings" data-hr-action="settings">HR managers</a>` : ''}</div></div>
      <div class="hr-stats">${stat('employees', c.employees, 'Employees', '#/hr/employees')}${stat('pending', c.pendingInvites, 'Invites pending', '#/hr/employees')}${stat('nologin', c.noLogin, 'Without a login yet', '#/hr/employees')}
        ${stat('departments', c.departments, 'Departments', '#/hr/departments')}${stat('managers', c.hrManagers, 'HR managers', hrIsSuper(user) ? '#/hr/settings' : '#/hr/employees')}${stat('new', c.newThisMonth, 'Joining this month', '#/hr/employees')}</div>
      <div class="card hr-soon" data-hr-soon="checkin"><h3>Check-in <span class="pill">Coming soon</span></h3><p class="muted small">Attendance, shifts and the work-schedule week strip arrive in Phase 3.</p></div>
      <div class="card hr-soon" data-hr-soon="leave"><h3>Leave <span class="pill">Coming soon</span></h3><p class="muted small">Apply Leave, approvals by the reporting manager and the team calendar arrive in Phase 2.</p></div>
      <div class="card hr-soon" data-hr-soon="time"><h3>Time logs <span class="pill">Coming soon</span></h3><p class="muted small">Projects, jobs and timesheets arrive in Phase 4.</p></div>
    </div></section>`;
  return { title: 'HR Home', crumbs: [['HR']], body, mount(root) { wireQuick(root); } };
}
// ---------------- Employee Information ----------------
const FKEY = 'cla-portal-new:hr-filter';
async function list({ api, user, refresh }) {
  const [rows, lk] = await Promise.all([api.listHrEmployees({ includeArchived: true }), api.listHrLookups()]);
  let f = {}; try { f = JSON.parse(sessionStorage.getItem(FKEY) || '{}'); } catch (e) { f = {}; }
  const viewMode = f.view === 'grid' ? 'grid' : 'list';
  const shown = filterEmployees(rows, f); const nActive = Object.entries(f).filter(([k, v]) => v && !['q', 'view', 'open'].includes(k)).length;
  const td = (e) => html`<tr data-hr-row="${e.id}" data-hr-role="${e.employeeRole}"><td>${avatar(e)}</td><td class="nowrap"><a href="#/hr/employees/${e.id}" data-hr-open="${e.id}">${e.employeeCode}</a></td><td>${e.firstName}</td><td>${e.lastName}</td><td class="small">${e.email}</td>
    <td>${e.departmentName}</td><td>${e.designationName}</td><td>${e.reportingToName}</td><td class="nowrap">${fmtDate(e.dateOfJoining)}</td><td>${e.workLocation}</td><td>${statusPill(e)}${e.isHrManager ? html` <span class="pill hr-chip" data-hr-mgr-chip>HR manager</span>` : ''}</td></tr>`;
  const cardOf = (e) => html`<a class="card hr-emp-card" href="#/hr/employees/${e.id}" data-hr-card="${e.id}">${avatar(e, 'lg')}<strong>${e.firstName} ${e.lastName}</strong><span class="muted small">${e.employeeCode} &middot; ${e.designationName}</span>
    <span class="small">${e.departmentName}</span><span class="small muted">${e.workLocation}</span><span>${statusPill(e)}</span></a>`;
  const sel = (name, label, list, blank) => html`<label>${label}<select name="${name}" data-hr-f="${name}">${opt(list, f[name], blank)}</select></label>`;
  const body = html`<section class="hr-page" data-hr-list>${head(user, 'Employee Information', '', 'employees')}
    <div class="hr-toolbar card"><input type="search" placeholder="Search employees (name, ID, email, department)" value="${f.q || ''}" data-hr-search aria-label="Search employees" maxlength="100">
      <button class="ghost ${f.open ? 'on' : ''}" data-hr-filter-btn aria-expanded="${f.open ? 'true' : 'false'}">Filter${nActive ? html` <span class="tab-count" data-hr-filter-count>${nActive}</span>` : ''}</button>
      <span class="hr-view-toggle" role="group" aria-label="View"><button class="ghost ${viewMode === 'list' ? 'on' : ''}" data-hr-view="list" title="List view">List</button><button class="ghost ${viewMode === 'grid' ? 'on' : ''}" data-hr-view="grid" title="Grid view">Grid</button></span>
      <span class="hr-tb-right"><a class="m-btn" href="#/hr/add" data-hr-add-btn>Add Employee(s)</a>
      <span class="hr-more-wrap"><button class="ghost" data-hr-more aria-haspopup="true" title="More actions">&hellip;</button><div class="hr-more-dd card" data-hr-more-dd hidden role="menu">
        <button class="linkish" data-hr-export role="menuitem">Export (CSV)</button><button class="linkish" data-hr-history-export role="menuitem">History Export (CSV)</button>
        <span class="muted" data-hr-import title="Coming soon">Import <span class="pill">Coming soon</span></span><span class="muted" title="Coming soon">Profile Photo Upload <span class="pill">Coming soon</span></span></div></span></span></div>
    <form class="card hr-filter" data-hr-filter ${f.open ? '' : raw('hidden')}><h3>Filter</h3><div class="form-grid hr-filter-grid">
      ${sel('departmentId', 'Department', lk.departments.map((d) => [d.id, d.name + (d.archivedAt ? ' (archived)' : '')]), 'All Departments')}
      ${sel('designationId', 'Designation', lk.designations.map((d) => [d.id, d.name + (d.archivedAt ? ' (archived)' : '')]), 'All Designations')}
      ${sel('workLocation', 'Location', [...new Set([...WORK_LOCATIONS, ...rows.map((r) => r.workLocation).filter(Boolean)])].map((l) => [l, l]), 'All Locations')}
      ${sel('employmentStatus', 'Employment Status', EMPLOYMENT_STATUSES, 'Any status')}
      ${sel('employeeRole', 'Employee Role', EMPLOYEE_ROLE_FILTER.map((r) => [r, r]), 'Any role')}
      ${sel('country', 'Country', COUNTRIES, 'US and PH')}
      <label class="check"><input type="checkbox" name="includeArchived" ${f.includeArchived ? raw('checked') : ''} data-hr-f="includeArchived"> Show archived</label></div>
      <p><button class="m-btn" type="submit" data-hr-apply>Apply</button> <button class="ghost" type="button" data-hr-reset>Reset</button></p></form>
    ${viewMode === 'grid' ? html`<div class="hr-grid" data-hr-grid>${shown.map(cardOf)}</div>`
      : html`<div class="card hr-table-card"><table class="tbl striped hr-table" data-hr-table><thead><tr><th>Photo</th><th>Employee ID</th><th>First Name</th><th>Last Name</th><th>Email ID</th><th>Department</th><th>Designation</th><th>Reporting To</th><th>Date of joining</th><th>Work location</th><th>Status</th></tr></thead>
        <tbody>${shown.length ? shown.map(td) : html`<tr><td colspan="11" class="muted">No employees match.</td></tr>`}</tbody></table></div>`}
    <p class="muted small" data-hr-total>Total Record Count: <strong>${shown.length}</strong>${shown.length !== rows.length ? html` of ${rows.length}` : ''}</p></section>`;
  const keep = (patch) => { sessionStorage.setItem(FKEY, JSON.stringify({ ...f, ...patch })); refresh(); };
  return { title: 'Employee Information', crumbs: [['HR', '#/hr'], ['Employee Information']], body, mount(root) {
    wireQuick(root);
    const s = $('[data-hr-search]', root); let t = null; s.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => keep({ q: s.value }), 250); });
    if (f.q) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    $('[data-hr-filter-btn]', root).addEventListener('click', () => keep({ open: !f.open }));
    $$('[data-hr-view]', root).forEach((b) => b.addEventListener('click', () => keep({ view: b.dataset.hrView })));
    const form = $('[data-hr-filter]', root);
    form.addEventListener('submit', (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(form).entries()); keep({ departmentId: d.departmentId, designationId: d.designationId, workLocation: d.workLocation, employmentStatus: d.employmentStatus, employeeRole: d.employeeRole, country: d.country, includeArchived: !!d.includeArchived }); });
    $('[data-hr-reset]', root).addEventListener('click', () => { sessionStorage.setItem(FKEY, JSON.stringify({ view: f.view, open: true })); refresh(); });
    const mb = $('[data-hr-more]', root); const md = $('[data-hr-more-dd]', root); mb.addEventListener('click', (e) => { e.stopPropagation(); md.hidden = !md.hidden; });
    document.addEventListener('click', () => { md.hidden = true; }, { once: true });
    $('[data-hr-export]', root).addEventListener('click', guard(async () => { const r = await api.exportHrEmployeesCsv({ ids: shown.map((e) => e.id), includeArchived: true }); download(r.filename, r.csv); toast(`Exported ${r.count} employee(s)`); }));
    $('[data-hr-history-export]', root).addEventListener('click', guard(async () => { const r = await api.exportHrHistoryCsv(); download(r.filename, r.csv); toast(`Exported ${r.count} history row(s)`); }));
  } };
}
// ---------------- Add Employee ----------------
async function addForm({ api, user, go }) {
  const [lk, all, code] = await Promise.all([api.listHrLookups(), api.listHrEmployees(), api.generateHrEmployeeCode()]);
  const deps = lk.departments.filter((d) => !d.archivedAt).map((d) => [d.id, d.name]); const des = lk.designations.filter((d) => !d.archivedAt).map((d) => [d.id, d.name]);
  const body = html`<section class="hr-page" data-hr-add>${head(user, 'Add Employee', 'One step. The person gets a one-time invite link to set up their login (the portal sends no email).')}
    <form class="card hr-form" data-hr-add-form><div class="form-grid">
      <label>Employee ID <span class="req">*</span><span class="hr-inline"><input name="employeeCode" value="${code}" maxlength="20" required data-hr-code><button type="button" class="ghost" data-hr-generate>Generate</button></span></label>
      <label>Country <span class="req">*</span><select name="country" data-hr-country>${opt(COUNTRIES, 'US')}</select></label>
      <label>First Name <span class="req">*</span><input name="firstName" maxlength="80" required></label><label>Last Name <span class="req">*</span><input name="lastName" maxlength="80" required></label>
      <label class="span2">Email ID <span class="req">*</span><input name="email" type="email" maxlength="160" required placeholder="name@example.test"></label>
      <label>Department<select name="departmentId">${opt(deps, '', 'Select')}</select></label><label>Designation<select name="designationId">${opt(des, '', 'Select')}</select></label>
      <label>Location<select name="workLocation" data-hr-loc>${opt(WORK_LOCATIONS.map((l) => [l, l]), '', 'Select')}</select></label><label>Date of joining<input name="dateOfJoining" type="date"></label>
      <label>Reporting To<select name="reportingToId">${opt(all.map((e) => [e.id, `${fullNameOf(e)} (${e.employeeCode})`]), '', 'Nobody')}</select></label>
      <label>Employment type<select name="employmentType">${opt(EMPLOYMENT_TYPES, 'full_time')}</select></label></div>
      <p class="muted small">No SSN or government ID numbers are collected. Pay, address and emergency contact can be added on the profile.</p>
      <p><button class="m-btn" type="submit" data-hr-add-submit>Add Employee and create invite link</button> <a class="ghost" href="#/hr/employees">Cancel</a></p>
      <div class="ai-link hr-invite-box" data-hr-invite-result hidden></div></form></section>`;
  return { title: 'Add Employee', crumbs: [['HR', '#/hr'], ['Add Employee']], body, mount(root) {
    wireQuick(root); const f = $('[data-hr-add-form]', root);
    $('[data-hr-generate]', root).addEventListener('click', guard(async () => { $('[data-hr-code]', root).value = await api.generateHrEmployeeCode(); }));
    $('[data-hr-country]', root).addEventListener('change', (e) => { const l = $('[data-hr-loc]', root); if (!l.value) l.value = e.target.value === 'PH' ? 'Remote (Philippines)' : ''; });
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(f).entries());
      const r = await api.createHrEmployee(d); toast('Employee added' + (r.invite ? ' (invite link made, nothing sent)' : ' and linked to their existing login'));
      const box = $('[data-hr-invite-result]', root); box.hidden = false;
      box.innerHTML = (r.invite ? html`<p><strong>Invite link</strong> for ${r.employee.firstName} ${r.employee.lastName} (${r.employee.email}). Not sent: copy it and send it yourself.</p>
        <div class="ai-link-row"><input readonly value="${abs(r.invite.link)}" data-hr-invite-link aria-label="One-time invite link"><button type="button" class="m-btn" data-hr-copy>Copy</button></div>
        <p class="muted small">Works once, for ${HR_INVITE_DAYS} days (until ${fmtDateTime(r.invite.expiresAt)}). ${HR_NO_EMAIL_NOTE}</p>`
        : html`<p><strong>${r.employee.firstName} ${r.employee.lastName}</strong> already has a portal login with that email, so it is linked now. No invite needed.</p>`)
        + html`<p><a class="ghost" href="#/hr/employees/${r.employee.id}" data-hr-open-new>Open the profile</a> <a class="ghost" href="#/hr/add" data-hr-add-another>Add another</a></p>`.toString();
      const cp = $('[data-hr-copy]', box); if (cp) cp.addEventListener('click', async () => { const i = $('[data-hr-invite-link]', box); i.select(); try { await navigator.clipboard.writeText(i.value); toast('Link copied'); } catch (er) { toast('Select the link and copy it'); } });
      $$('input,select,button[type=submit]', f).forEach((x) => { if (!box.contains(x)) x.disabled = true; }); }));
  } };
}
// ---------------- Employee profile (also My profile) ----------------
async function profile({ api, user, refresh }, id, mine) {
  if (!id) throw new Error('You do not have an HR employee record yet.');
  const r = await api.getHrEmployee(id); const e = r.employee; const hr = r.access === 'hr'; const basic = r.access === 'basic';
  const lk = r.lookups || { departments: [], designations: [] }; let all = [];
  if (hr) { try { all = await api.listHrEmployees(); } catch (er) { all = []; } }
  // John, Nov 4 HR review: portal time log (HR + the reporting manager), the Documents card (HR + the employee), documents HR shared with the employee
  if ((hr || basic || mine) && api.listHrPortalTime) { try { r.timeLog = await api.listHrPortalTime(e.id); } catch (er) { r.timeLog = null; } }
  let empDocs = null; let shared = null;
  if (!basic && api.listHrEmployeeDocs) { try { empDocs = await api.listHrEmployeeDocs(e.id, { includeArchived: hr }); } catch (er) { empDocs = null; } }
  if (!basic && api.listHrDocsSharedWith) { try { shared = await api.listHrDocsSharedWith(hr && !mine ? e.id : null); } catch (er) { shared = null; } }
  const can = (k) => (r.canEditHr ? true : r.selfFields.includes(k));   // an HR manager on their OWN record edits only the employee fields
  const val = (k) => { const v = e[k]; if (k === 'departmentId') return e.departmentName; if (k === 'designationId') return e.designationName; if (k === 'reportingToId') return e.reportingToName;
    if (k === 'employmentType') return labelOf(EMPLOYMENT_TYPES, v); if (k === 'employmentStatus') return labelOf(EMPLOYMENT_STATUSES, v); if (k === 'country') return labelOf(COUNTRIES, v);
    if (k === 'jobTitle') return jobTitleOf(e) ? html`${jobTitleOf(e)}${String(e.jobTitle || '').trim() ? '' : html` <span class="muted small" data-hr-title-fallback>(from designation)</span>`}` : '';
    if (k === 'commissioned') return e.commissioned ? 'Yes' : 'No'; if (k === 'commissionNotes') return v;
    if (k === 'payType') return labelOf(PAY_TYPES, v); if (k === 'dateOfJoining') return fmtDate(v); if (k === 'payRate') return v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 }); return v; };
  const modeKey0 = 'cla-portal-new:hr-edit'; const editingNow = !basic && (hr || r.canEditSelf) && sessionStorage.getItem(modeKey0) === e.id;
  const SECTIONS = [
    ['basic', 'Basic information', ['employeeCode', 'firstName', 'lastName', 'email']],
    ['work', 'Work information', ['departmentId', 'designationId', 'jobTitle', 'reportingToId', 'dateOfJoining', 'workLocation', 'employmentType', 'employmentStatus', 'country', 'workPhone']],
    ...(basic ? [['contact', 'Contact', ['workPhone']]] : [['comp', 'Compensation', ['payType', 'payRate', 'payCurrency', 'commissioned', ...(e.commissioned || editingNow ? ['commissionNotes'] : [])]],
      ['contact', 'Contact details', ['phone', 'addressLine1', 'addressLine2', 'city', 'stateProvince', 'postalCode', 'addressCountry']],
      ['emergency', 'Emergency contact', ['emergencyName', 'emergencyRelationship', 'emergencyPhone']]])];
  const input = (k) => { const v = e[k] == null ? '' : e[k]; const dis = can(k) ? '' : raw(' disabled');
    const sel = (list, blank) => html`<select name="${k}" data-hr-field="${k}"${dis}>${opt(list, v, blank)}</select>`;
    if (k === 'departmentId') return sel(lk.departments.filter((d) => !d.archivedAt || d.id === v).map((d) => [d.id, d.name]), 'None');
    if (k === 'designationId') return sel(lk.designations.filter((d) => !d.archivedAt || d.id === v).map((d) => [d.id, d.name]), 'None');
    if (k === 'reportingToId') return sel(all.filter((z) => z.id !== e.id).map((z) => [z.id, `${fullNameOf(z)} (${z.employeeCode})`]).concat(v && !all.some((z) => z.id === v) ? [[v, e.reportingToName]] : []), 'Nobody');
    if (k === 'employmentType') return sel(EMPLOYMENT_TYPES); if (k === 'employmentStatus') return sel(EMPLOYMENT_STATUSES); if (k === 'country') return sel(COUNTRIES);
    if (k === 'commissioned') return html`<select name="commissioned" data-hr-field="commissioned" data-hr-commissioned${dis}><option value="false"${e.commissioned ? '' : raw(' selected')}>No</option><option value="true"${e.commissioned ? raw(' selected') : ''}>Yes</option></select>`;
    if (k === 'commissionNotes') return html`<textarea name="commissionNotes" rows="3" maxlength="2000" placeholder="How the commission is worked out (rate, base, when it is paid)" data-hr-field="commissionNotes"${dis}>${v}</textarea>`;
    if (k === 'payType') return sel(PAY_TYPES, 'Not set'); if (k === 'payCurrency') return sel(PAY_CURRENCIES, 'Not set');
    if (k === 'workLocation') return html`<input name="${k}" value="${v}" list="hr-locs" maxlength="80" data-hr-field="${k}"${dis}>`;
    if (k === 'dateOfJoining') return html`<input name="${k}" type="date" value="${v}" data-hr-field="${k}"${dis}>`;
    if (/phone/i.test(k)) return html`<input name="${k}" value="${v}" inputmode="tel" maxlength="25" placeholder="${e.country === 'PH' ? '+63 917 555 0100' : '301-555-0100'}" data-hr-field="${k}"${dis}>`;
    if (k === 'payRate') return html`<input name="${k}" value="${v}" inputmode="decimal" maxlength="20" data-hr-field="${k}"${dis}>`;
    return html`<input name="${k}" value="${v}" maxlength="160" data-hr-field="${k}"${dis}>`; };
  const editable = !basic && (hr || r.canEditSelf);
  const sectionCard = (key, title, fields, edit) => html`<div class="card hr-sec" data-hr-section="${key}"><div class="hr-sec-head"><h3>${title}</h3>${!hr && !basic && !fields.some(can) ? html`<span class="muted small" data-hr-locked="${key}">Set by HR</span>` : ''}</div>
    <dl class="hr-dl">${fields.map((k) => html`<div class="hr-dl-row" data-hr-row-of="${k}"${k === 'commissionNotes' && !e.commissioned ? raw(' hidden') : ''}><dt>${FIELD_LABEL[k]}</dt><dd data-hr-value="${k}">${edit ? input(k) : val(k) || html`<span class="muted">&mdash;</span>`}</dd></div>`)}</dl></div>`;
  const history = r.history.length ? html`<table class="tbl hr-hist" data-hr-history><thead><tr><th>When</th><th>Who</th><th>Field</th><th>Old value</th><th>New value</th><th>Action</th></tr></thead><tbody>
    ${r.history.slice(0, 200).map((h) => html`<tr data-hr-hist-row="${h.field}"><td class="nowrap small">${fmtDateTime(h.changedAt)}</td><td class="small">${h.changedByName}</td><td>${h.fieldLabel}</td><td class="small">${h.oldValue}</td><td class="small">${h.newValue}</td><td class="small muted">${h.action}</td></tr>`)}</tbody></table>`
    : html`<p class="muted" data-hr-history>No changes yet.</p>`;
  const mgrNote = basic ? html`<p class="notice small" data-hr-basic-note>You are ${e.firstName}'s reporting manager: you see their basic work details only (no pay, address or emergency contact). Leave and timesheet approvals come in Phase 2.</p>` : '';
  const selfNote = !hr && !basic ? html`<p class="notice small" data-hr-self-note>You can edit your <strong>phone, address and emergency contact</strong>. HR keeps your job title, department, designation, pay, status, date of joining, reporting manager, work location and employee ID up to date.</p>` : '';
  const timeLog = (hr || basic || mine) && r.timeLog ? portalTimeCard(r.timeLog) : '';
  const invite = hr ? html`<div class="card hr-sec${timeLog ? ' hr-sec-wide' : ''}" data-hr-login><h3>Portal login</h3>${e.profileId ? html`<p><span class="pill ok">Has login</span></p>${timeLog}`
    : html`<p><span class="pill ${INV[e.inviteStatus] ? INV[e.inviteStatus][1] : ''}" data-hr-invite-status="${e.inviteStatus}">${(INV[e.inviteStatus] || [e.inviteStatus])[0]}</span>${e.inviteExpiresAt ? html` <span class="muted small">${e.inviteStatus === 'expired' ? 'expired' : 'expires'} ${fmtDateTime(e.inviteExpiresAt)}</span>` : ''}</p>
      ${e.archivedAt ? '' : html`<button class="ghost" data-hr-new-invite>${e.inviteStatus === 'none' ? 'Create invite link' : 'Make a new invite link'}</button>`}<div class="ai-link hr-invite-box" data-hr-invite-result hidden></div>`}
    ${e.isHrManager ? html`<p class="small"><span class="pill hr-chip">HR manager</span>${hrIsSuper(user) ? html` <a href="#/hr/settings">Change in HR Settings</a>` : ''}</p>` : ''}</div>` : '';
  const modeKey = 'cla-portal-new:hr-edit'; const editing = editable && sessionStorage.getItem(modeKey) === e.id;
  const body = html`<section class="hr-page" data-hr-profile="${e.id}" data-hr-access="${r.access}">${head(user, mine ? 'My profile' : `${e.firstName} ${e.lastName}`, '')}
    <div class="card hr-prof-head">${avatar(e, 'xl')}<div class="hr-prof-id"><h3 data-hr-name>${e.firstName} ${e.lastName}</h3><p class="muted">${e.employeeCode} &middot; ${e.designationName || e.jobTitle || ''} &middot; ${e.departmentName || ''}</p>
      <p>${statusPill(e)} <span class="pill">${labelOf(COUNTRIES, e.country)}</span>${e.employeeRole && !basic ? html` <span class="pill hr-chip" data-hr-role-chip>${e.employeeRole}</span>` : ''}</p>
      ${e.reportingToName ? html`<p class="small muted">Reports to <strong>${e.reportingToName}</strong></p>` : ''}</div>
      <div class="hr-prof-actions">${editable && !e.archivedAt ? (editing ? '' : html`<button class="m-btn" data-hr-edit>Edit${hr ? '' : ' my contact details'}</button>`) : ''}
        ${hr ? html`<button class="ghost" data-hr-archive="${e.archivedAt ? 'restore' : 'archive'}">${e.archivedAt ? 'Restore' : 'Archive'}</button> <button class="ghost" data-hr-emp-history-export>History Export (CSV)</button>` : ''}</div></div>
    ${mgrNote}${selfNote}
    <form data-hr-edit-form class="hr-prof-body"><datalist id="hr-locs">${WORK_LOCATIONS.map((l) => html`<option value="${l}">`)}</datalist>
      <div class="hr-sec-grid">${SECTIONS.map(([k, t, fs]) => sectionCard(k, t, fs, editing))}${invite}</div>
      ${editing ? html`<p class="hr-save-row"><button class="m-btn" type="submit" data-hr-save>Save changes</button> <button class="ghost" type="button" data-hr-cancel>Cancel</button></p>` : ''}</form>
    ${basic ? '' : html`<div class="card hr-sec" data-hr-section="history"><h3>History</h3><p class="muted small">Every change: who, when, field, old and new value. Read only.</p>${history}</div>`}
    ${(basic || (!hr && mine)) && r.timeLog ? html`<div class="card hr-sec" data-hr-section="time"><h3>Portal time log</h3>${timeLog}</div>` : ''}
    ${shared && shared.length ? sharedDocsCard(shared, mine) : ''}${empDocs ? employeeDocsCard(e, empDocs, hr) : ''}</section>`;
  return { title: mine ? 'My profile' : `${e.firstName} ${e.lastName}`, crumbs: hr ? [['HR', '#/hr'], ['Employee Information', '#/hr/employees'], [`${e.firstName} ${e.lastName}`]] : [['HR', '#/hr'], [mine ? 'My profile' : `${e.firstName} ${e.lastName}`]], body, mount(root) {
    wireQuick(root);
    wireEmployeeDocs(root, { api, refresh, employee: e, hr }); wireSharedDocs(root, api);
    const cs = $('[data-hr-commissioned]', root); if (cs) cs.addEventListener('change', () => { const row = $('[data-hr-row-of="commissionNotes"]', root); if (row) row.hidden = cs.value !== 'true'; });
    const ed = $('[data-hr-edit]', root); if (ed) ed.addEventListener('click', () => { sessionStorage.setItem(modeKey, e.id); refresh(); });
    const cn = $('[data-hr-cancel]', root); if (cn) cn.addEventListener('click', () => { sessionStorage.removeItem(modeKey); window.claDirty = null; refresh(); });
    const form = $('[data-hr-edit-form]', root);
    if (editing) { let dirty = false; form.addEventListener('input', () => { dirty = true; }); window.claDirty = () => dirty;
      form.addEventListener('submit', guard(async (ev) => { ev.preventDefault(); const patch = {};
        $$('[data-hr-field]', form).forEach((el) => { if (el.disabled) return; const k = el.dataset.hrField; const old = e[k] == null ? '' : String(e[k]); if (el.value !== old) patch[k] = el.value; });
        if (patch.commissioned === 'false') delete patch.commissionNotes;
        const res = await api.updateHrEmployee(e.id, patch); window.claDirty = null; sessionStorage.removeItem(modeKey); toast(res.changed ? `Saved ${res.changed} change(s)` : 'Nothing changed'); refresh(); })); }
    const ar = $('[data-hr-archive]', root); if (ar) ar.addEventListener('click', guard(async () => { const on = ar.dataset.hrArchive === 'archive';
      if (on && !confirm(`Archive ${e.firstName} ${e.lastName}? They leave the directory and lose HR access. Nothing is deleted; you can restore them.`)) return;
      await api.archiveHrEmployee(e.id, on); toast(on ? 'Employee archived (kept, not deleted)' : 'Employee restored'); refresh(); }));
    const hx = $('[data-hr-emp-history-export]', root); if (hx) hx.addEventListener('click', guard(async () => { const x = await api.exportHrHistoryCsv({ employeeId: e.id }); download(x.filename.replace('.csv', `-${e.employeeCode}.csv`), x.csv); toast(`Exported ${x.count} history row(s)`); }));
    const ni = $('[data-hr-new-invite]', root); if (ni) ni.addEventListener('click', guard(async () => { const x = await api.createHrInvite(e.id); const box = $('[data-hr-invite-result]', root); box.hidden = false;
      box.innerHTML = html`<p class="small"><strong>New invite link</strong> (any older link stopped working). Not sent: copy it and send it yourself.</p><div class="ai-link-row"><input readonly value="${abs(x.link)}" data-hr-invite-link aria-label="One-time invite link"></div><p class="muted small">Works once, until ${fmtDateTime(x.expiresAt)}.</p>`.toString(); toast('Invite link made (nothing sent)'); }));
  } };
}
// ---------------- My team (line manager: basic fields only) ----------------
function team({ user }, me) {
  const body = html`<section class="hr-page" data-hr-team>${head(user, 'My team', 'Your direct reports. You see their basic work details only; leave and timesheet approvals come in Phase 2.')}
    <div class="hr-grid">${me.reports.map((e) => html`<a class="card hr-emp-card" href="#/hr/employees/${e.id}" data-hr-report="${e.id}">${avatar(e, 'lg')}<strong>${e.firstName} ${e.lastName}</strong><span class="muted small">${e.employeeCode} &middot; ${e.designationName}</span><span class="small">${e.departmentName}</span><span class="small muted">${e.workLocation}</span></a>`)}</div>
    ${me.reports.length ? '' : html`<p class="muted">Nobody reports to you.</p>`}</section>`;
  return { title: 'My team', crumbs: [['HR', '#/hr'], ['My team']], body };
}
// ---------------- Departments / Designations ----------------
async function lookup({ api, user, refresh }, sec) {
  const [lk, emps] = await Promise.all([api.listHrLookups(), api.listHrEmployees({ includeArchived: false })]);
  const isDep = sec === 'departments'; const rows = isDep ? lk.departments : lk.designations; const key = isDep ? 'departmentId' : 'designationId'; const label = isDep ? 'Department' : 'Designation';
  const addOpen = new URLSearchParams(location.hash.split('?')[1] || '').get('add') === '1';
  const body = html`<section class="hr-page" data-hr-lookup="${sec}">${head(user, isDep ? 'Departments' : 'Designations', '', sec)}
    <form class="card hr-form hr-add-lookup" data-hr-lookup-form><label>New ${label.toLowerCase()} name<span class="hr-inline"><input name="name" maxlength="80" required data-hr-lookup-name ${addOpen ? raw('autofocus') : ''}><button class="m-btn" type="submit" data-hr-lookup-add>Add ${label}</button></span></label>
      <p class="muted small">Nothing is deleted: archive a ${label.toLowerCase()} you no longer use (move its active employees first).</p></form>
    <div class="card"><table class="tbl striped" data-hr-lookup-table><thead><tr><th>${label}</th><th>Employees</th><th>Status</th><th>Added</th><th></th></tr></thead><tbody>
      ${rows.map((d) => html`<tr data-hr-lookup-row="${d.id}" data-hr-lookup-state="${d.archivedAt ? 'archived' : 'active'}"><td><strong>${d.name}</strong></td><td>${emps.filter((z) => z[key] === d.id).length}</td>
        <td>${d.archivedAt ? html`<span class="pill">Archived</span>` : html`<span class="pill ok">Active</span>`}</td><td class="small muted">${fmtDate(d.createdAt)}</td>
        <td><button class="ghost small" data-hr-lookup-archive="${d.id}" data-on="${d.archivedAt ? '0' : '1'}">${d.archivedAt ? 'Restore' : 'Archive'}</button></td></tr>`)}</tbody></table></div></section>`;
  const create = isDep ? api.createHrDepartment : api.createHrDesignation; const archive = isDep ? api.archiveHrDepartment : api.archiveHrDesignation;
  return { title: isDep ? 'Departments' : 'Designations', crumbs: [['HR', '#/hr'], [isDep ? 'Departments' : 'Designations']], body, mount(root) {
    wireQuick(root); const f = $('[data-hr-lookup-form]', root); if (addOpen) $('[data-hr-lookup-name]', root).focus();
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); await create($('[data-hr-lookup-name]', f).value); toast(`${label} added`); location.hash = '#/hr/' + sec; refresh(); }));
    $$('[data-hr-lookup-archive]', root).forEach((b) => b.addEventListener('click', guard(async () => { await archive(b.dataset.hrLookupArchive, b.dataset.on === '1'); toast(b.dataset.on === '1' ? `${label} archived` : `${label} restored`); refresh(); })));
  } };
}
// ---------------- HR Settings (Super admin): HR managers ----------------
async function settings({ api, user, refresh }) {
  const d = await api.listHrManagers();
  const body = html`<section class="hr-page" data-hr-settings>${head(user, 'HR Settings', 'Only a Super admin can assign or remove an HR manager. Every change is kept in the history.')}
    <div class="hr-sec-grid"><div class="card hr-sec" data-hr-managers><h3>HR managers</h3><p class="muted small">HR managers see the whole employee directory and can add, edit and archive employees. They get the HR workspace only, unless their portal role already gives them the CRM or the Portal.</p>
      <table class="tbl" data-hr-manager-table><thead><tr><th>Employee</th><th>Login</th><th>Assigned</th><th></th></tr></thead><tbody>
      ${d.managers.length ? d.managers.map((m) => html`<tr data-hr-manager-row="${m.employeeId}"><td><strong>${m.name}</strong><br><span class="muted small">${m.employeeCode} &middot; ${m.email}</span></td><td>${m.hasLogin ? html`<span class="pill ok">Yes</span>` : html`<span class="pill">Not yet</span>`}</td>
        <td class="small">${fmtDateTime(m.assignedAt)}<br><span class="muted">by ${m.assignedByName}</span></td><td><button class="ghost small danger" data-hr-remove-mgr="${m.employeeId}">Remove</button></td></tr>`) : html`<tr><td colspan="4" class="muted">No HR managers yet.</td></tr>`}</tbody></table>
      <form class="hr-assign" data-hr-assign-form><label>Assign an HR manager<span class="hr-inline"><select name="employeeId" data-hr-assign-select required><option value="">Pick an employee</option>${d.candidates.map((c) => html`<option value="${c.employeeId}">${c.name} (${c.employeeCode}${c.employeeRole !== 'Employee' ? ', ' + c.employeeRole : ''})</option>`)}</select><button class="m-btn" type="submit" data-hr-assign>Assign</button></span></label></form></div>
    <div class="card hr-sec" data-hr-manager-log><h3>Assignment history</h3>${d.log.length ? html`<table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Employee</th><th>Change</th></tr></thead><tbody>${d.log.map((h) => html`<tr data-hr-mgr-log="${h.action}"><td class="small nowrap">${fmtDateTime(h.changedAt)}</td><td class="small">${h.changedByName}</td><td>${h.recordLabel}</td><td><span class="pill ${h.action === 'assign' ? 'ok' : ''}">${h.action === 'assign' ? 'Made HR manager' : 'Removed as HR manager'}</span></td></tr>`)}</tbody></table>` : html`<p class="muted">No changes yet.</p>`}</div></div></section>`;
  return { title: 'HR Settings', crumbs: [['HR', '#/hr'], ['HR Settings']], body, mount(root) {
    wireQuick(root); const f = $('[data-hr-assign-form]', root);
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const id = $('[data-hr-assign-select]', f).value; if (!id) throw new Error('Pick an employee.'); await api.setHrManager(id, true); toast('HR manager assigned (logged)'); refresh(); }));
    $$('[data-hr-remove-mgr]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Remove this HR manager? They keep their own profile.')) return; await api.setHrManager(b.dataset.hrRemoveMgr, false); toast('HR manager removed (logged)'); refresh(); })));
  } };
}
