// User List + Create User + Edit User: ADMIN only (isAdmin; roles 'Admin' and 'Super admin' always have it; the Processor is not an admin).
// The adapter (and the database, migrations 17-18) enforce every rule shown here too.
// Delete = the account is removed (cannot sign in, leaves teams and salesperson links), but their documents, messages and history stay.
// Nov 2 (John): filter/search, staff role vs per-file roles for outside users, clients linked to salespeople (many-to-many),
// Super admin (only a Super admin grants/removes it or deletes/suspends/changes a Super admin).
import { html, raw, $, $$, guard, formData, pill, toast, fmtDate, options } from '../ui.js?v=202611062001';
import { cleanBirthdate, BIRTHDATE_NOTE } from '../data/agent-info.js?v=202611062001';
import { ROLES, ADMIN_ROLE, SUPER_ADMIN_ROLE, OUTSIDE, isAdminRole, isSuperAdmin, isSalesRole, roleLabel, CONTACT_TYPES, contactTypeLabel, outsideTypeLabel } from '../data/constants.js?v=202611062001';
// contact type (John, Nov 2): outside users only (agents, clients, lenders); staff have none
const ctypeSel = (sel, dis = '') => html`<label data-ctype-field>Contact type <span class="muted small">(outside users; for reporting)</span><select name="contactType" ${dis}><option value="">(not set)</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}" ${v === sel ? raw('selected') : ''}>${l}</option>`)}</select></label>`;
import { USER_ROLE_FILTERS, USER_STATUS_FILTERS, filterUsers } from '../data/user-filter.js?v=202611062001';
const acct = (r) => (r === OUTSIDE ? 'Realtor / Client (role set per order)' : r);   // display only (live40): the stored value stays 'Outside user'
const fullName = (u) => `${u.firstName} ${u.lastName}`.trim();
// account-type options; a plain Admin sees "Super admin" but cannot pick it
const roleOptions = (actor, selected) => ROLES.map((r) => { const locked = r === SUPER_ADMIN_ROLE && !isSuperAdmin(actor);
  return html`<option value="${r}" ${r === selected ? raw('selected') : ''} ${locked ? raw('disabled title="Only a Super admin can grant the Super admin role"') : ''}>${acct(r)}${locked ? ' (Super admin only)' : ''}</option>`; });
const fileRoles = (u) => (u.files && u.files.length ? html`<div class="muted small" data-files="${u.id}"><strong data-acct-type="${outsideTypeLabel(u)}">${outsideTypeLabel(u)}:</strong> ${u.files.map((f) => `${f.role} on ${f.fileNumber}`).join(', ')}</div>`
  : u.role === OUTSIDE ? html`<div class="muted small"><strong data-acct-type="${outsideTypeLabel(u)}">${outsideTypeLabel(u)}:</strong> not on any order yet</div>` : '');
const salesPicker = (sales, chosen) => (sales.length ? sales.map((s) => html`<label class="check"><input type="checkbox" name="salesIds" value="${s.id}" ${chosen.includes(s.id) ? raw('checked') : ''}> ${fullName(s)} <span class="muted small">(${s.role})</span></label>`)
  : html`<p class="muted">No active Sales Person or Sales Team users yet.</p>`);
// a plain Admin cannot change anything about a Super admin except name and phone
const lockedFor = (actor, u) => u.role === SUPER_ADMIN_ROLE && !isSuperAdmin(actor);

export async function render({ api, user, params, refresh, go }) {
  if (!user.isAdmin) throw new Error('User management is for Admins only.');
  const users = await api.adminListUsers();
  const sales = users.filter((u) => isSalesRole(u.role) && u.status === 'active').sort((a, b) => a.lastName.localeCompare(b.lastName));
  if (params.mode === 'new') {
    const body = html`<div class="box-title"><h2><span class="h-ico"></span>Create User</h2></div>
      <div class="card" data-invite-instead><p>Creating a login is closed on this page. Public sign-up stays off, and nothing is emailed.</p>
        <p><strong>Employees</strong> (including a Sales Person): add them in <a href="#/hr/add">HR</a> and copy the invite link.</p>
        <p><strong>Agents</strong>: use <a href="#/agent-invites">Agent Invites</a> and copy the link.</p>
        <p class="muted">After they accept, edit the user here to set the role, status, or salesperson links. A Super admin is still the only person who can grant Super admin.</p>
        <p><a class="m-btn" href="#/hr/add">Open HR</a> <a class="ghost" href="#/agent-invites">Agent Invites</a> <a class="ghost" href="#/users">Back to User List</a></p></div>`;
    return { title: 'Create User', crumbs: [['User List', '#/users'], ['Create User']], body };
  }
  if (params.mode === 'edit') {
    const u = users.find((z) => z.id === params.id); if (!u) throw new Error('User not found.');
    const self = u.id === user.id; const gone = u.status === 'removed'; const locked = lockedFor(user, u);
    const lockNote = locked ? 'Only a Super admin can change the role or status of a Super admin.' : self ? 'You cannot change your own role, status or Admin access.' : '';
    const dis = gone || locked || self ? raw('disabled') : '';
    const chosen = (u.salesReps || []).map((s) => s.id);
    const bday = u.role === OUTSIDE && api.getAgentBirthdate ? await api.getAgentBirthdate(u.id).catch(() => null) : null;   // John, Nov 3 call: optional agent birthdate
    const body = html`<div class="box-title"><h2><span class="h-ico"></span>Edit User</h2></div>
      <form id="euf" class="card form-grid" data-user="${u.id}">
        <label>First name *<input name="firstName" required maxlength="80" value="${u.firstName}" ${gone ? raw('disabled') : ''}></label><label>Last name<input name="lastName" maxlength="80" value="${u.lastName}" ${gone ? raw('disabled') : ''}></label>
        <label>Email<input value="${u.email}" disabled title="Changed by the sign-in provider only"></label><label>Phone<input name="phone" type="tel" inputmode="tel" data-phone maxlength="40" value="${u.phone || ''}" ${gone ? raw('disabled') : ''}></label>
        <label>Account type<select name="role" ${dis}>${roleOptions(user, u.role)}</select></label>
        ${u.role === OUTSIDE ? ctypeSel(u.contactType || '', gone ? raw('disabled') : '') : ''}
        ${u.role === OUTSIDE ? html`<label data-birthdate-field>Agent birthdate (optional)<input type="date" name="birthdate" value="${bday || ''}" max="${new Date().toISOString().slice(0, 10)}" data-birthdate ${gone ? raw('disabled') : ''}><span class="field-hint">${BIRTHDATE_NOTE}</span></label>` : ''}
        <label>Status<select name="status" ${dis}>${options(['active', 'disabled'], u.status === 'removed' ? 'disabled' : u.status, (s) => (s === 'active' ? 'Active' : 'Disabled (suspended)'))}</select></label>
        <label class="check"><input type="checkbox" name="isAdmin" ${u.isAdmin ? raw('checked') : ''} ${gone || locked || self || isAdminRole(u.role) ? raw('disabled') : ''}> Admin access${isAdminRole(u.role) ? ` (role ${u.role} always has it)` : ''}</label>
        ${lockNote ? html`<p class="muted span2" data-lock-note>${lockNote}</p>` : ''}
        <div class="span2"><strong>Roles on files:</strong> ${u.role === OUTSIDE ? fileRoles(u) : html`<span class="muted">Staff role: ${roleLabel(u)}</span>`}</div>
        ${u.role === OUTSIDE ? html`<fieldset class="span2" data-sales-picker><legend>Salespeople linked to this client</legend>${salesPicker(sales.concat((u.salesReps || []).filter((s) => !sales.some((z) => z.id === s.id)).map((s) => ({ id: s.id, firstName: s.name, lastName: '', role: s.role }))), chosen)}
          <p class="muted small">A client can have any number of salespeople, and a salesperson any number of clients. Untick to remove a link. Linking does not change who can see a file.</p></fieldset>`
        : isSalesRole(u.role) ? html`<div class="span2" data-clients><strong>Linked clients:</strong> ${(u.clients || []).length ? u.clients.map((c) => c.name).join(', ') : html`<span class="muted">none</span>`} <span class="muted small">(edit links from the client's page)</span></div>` : ''}
        <div class="span2">${gone ? '' : html`<button class="m-btn" type="submit">Save</button> `}<a class="ghost" href="#/users">Back to User List</a></div></form>`;
    return { title: 'Edit User', crumbs: [['User List', '#/users'], [fullName(u)]], body, mount(root) {
      const f = $('#euf', root); if (gone) return;
      f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const fd = formData(e.target); const patch = { firstName: fd.firstName, lastName: fd.lastName, phone: fd.phone }; if ('contactType' in fd) patch.contactType = fd.contactType;
        if (!dis) { patch.role = fd.role; patch.status = fd.status; }
        const adm = $('[name=isAdmin]', f); if (!adm.disabled) patch.isAdmin = adm.checked;
        if ($('[data-sales-picker]', f)) patch.salesIds = new FormData(e.target).getAll('salesIds');
        const bdIn = $('[data-birthdate]', f); if (bdIn && (bdIn.value || '') !== (bday || '')) { cleanBirthdate(bdIn.value); }
        await api.adminUpdateUser(u.id, patch); if (bdIn && (bdIn.value || '') !== (bday || '')) await api.setAgentBirthdate(u.id, bdIn.value); toast('User saved'); go('/users'); }));
    } };
  }
  const order = { active: 0, disabled: 1, removed: 2 };
  const rows = users.sort((a, b) => order[a.status] - order[b.status] || a.lastName.localeCompare(b.lastName)).map((u) => { const self = u.id === user.id; const gone = u.status === 'removed'; const locked = lockedFor(user, u);
    const links = u.role === OUTSIDE ? ((u.salesReps || []).length ? html`<div data-sales="${u.id}">${u.salesReps.map((s) => html`<span class="nowrap">${s.name}${gone ? '' : html` <button class="ghost" data-unlink="${u.id}" data-sales-id="${s.id}" title="Remove this link" aria-label="Remove link to ${s.name}">&times;</button>`}</span> `)}</div>` : html`<span class="muted small">${u.isClient ? 'no salesperson yet' : ''}</span>`)
      : isSalesRole(u.role) ? html`<div class="muted small" data-clients="${u.id}">${(u.clients || []).length ? 'Clients: ' + u.clients.map((c) => c.name).join(', ') : 'no clients linked'}</div>` : '';
    return html`<tr class="${u.status !== 'active' ? 'is-done' : ''}" data-user-row="${u.id}"><td><a href="#/users/edit/${u.id}">${fullName(u)}</a>${gone ? html` ${pill('removed', 'bad')}` : ''}${u.isClient ? html` ${pill('client')}` : ''}${u.contactType ? html`<div class="muted small" data-user-ctype="${u.contactType}">${contactTypeLabel(u.contactType)}</div>` : ''}</td><td>${u.email}</td>
    <td>${gone ? acct(u.role) : html`<select data-role="${u.id}" aria-label="Role" ${self ? raw('disabled title="You cannot change your own role"') : locked ? raw('disabled title="Only a Super admin can change a Super admin"') : ''}>${roleOptions(user, u.role)}</select>`}${fileRoles(u)}</td>
    <td>${links}</td>
    <td class="center">${gone ? '' : html`<input type="checkbox" data-admin="${u.id}" ${u.isAdmin ? raw('checked') : ''} ${self || isAdminRole(u.role) ? html`disabled title="${self ? 'This is you' : `Role ${u.role} always has Admin access`}"` : ''} aria-label="Admin">`}</td>
    <td>${(u.teams || []).join(', ')}</td><td>${gone ? html`<span class="muted small">removed ${fmtDate(u.removedAt)}</span>` : pill(u.status, u.status === 'active' ? 'ok' : 'warn')}</td>
    <td class="nowrap"><a class="ghost" href="#/users/edit/${u.id}" data-edit="${u.id}">${gone ? 'View' : 'Edit'}</a>${self || gone ? '' : locked ? html` <span class="muted small" data-locked="${u.id}">Super admin: only a Super admin can suspend or delete</span>` : html` <button class="ghost" data-status="${u.id}" data-to="${u.status === 'active' ? 'disabled' : 'active'}">${u.status === 'active' ? 'Disable' : 'Enable'}</button>
      <button class="ghost danger" data-del="${u.id}" data-name="${fullName(u)}">Delete user</button>`}</td></tr>`; });
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>User List</h2><a class="m-btn right" href="#/users/new">+ Create user</a></div>
    <div class="table-tools"><span class="muted">${users.length} user(s)</span><span class="muted" data-filter-count></span></div>
    <form class="filter-bar" id="ufilters">
      <label>Search<input id="usearch" name="q" type="search" placeholder="Name, email, file no, salesperson"></label>
      <label>Role<select name="role"><option value="">Any role</option>${options(USER_ROLE_FILTERS, '', (o) => o[1], (o) => o[0])}</select></label>
      <label>Status<select name="status">${options(USER_STATUS_FILTERS, '', (o) => o[1], (o) => o[0])}</select></label>
      <label>Contact type<select name="contactType"><option value="">Any</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}<option value="none">Not set</option></select></label></form>
    <table class="tbl striped"><thead><tr><th>Name</th><th>Email</th><th>Account type / roles on files</th><th>Salespeople / clients</th><th>Admin</th><th>Teams</th><th>Status</th><th></th></tr></thead><tbody>${rows}<tr data-nomatch hidden><td colspan="8" class="muted center">No users match your filters.</td></tr></tbody></table>
    <p class="muted small">Admins only. Staff have one fixed role; outside users (agents, clients) have a role on each file, shown under their account type. Picking role Admin or Super admin gives Admin access; moving someone off it takes it away. There is always at least one Admin and at least one Super admin. Only a Super admin can grant or remove Super admin, or suspend, delete or change the role of a Super admin. Deleting a user stops their sign-in and takes them off teams and salesperson links; their documents, messages, task answers and audit history are kept and shown as "(removed)". Documents are never deleted.</p>`;
  return { title: 'User List', crumbs: [['User List']], body, mount(root) {
    const form = $('#ufilters', root);
    const apply = () => { const f = new FormData(form); const vis = new Set(filterUsers(users, { q: f.get('q'), role: f.get('role'), status: f.get('status'), contactType: f.get('contactType') }).map((u) => u.id));
      $$('[data-user-row]', root).forEach((tr) => { tr.hidden = !vis.has(tr.dataset.userRow); }); $('[data-nomatch]', root).hidden = vis.size > 0;
      $('[data-filter-count]', root).textContent = vis.size === users.length ? '' : ` · ${vis.size} shown`; };
    form.addEventListener('submit', (e) => e.preventDefault()); form.addEventListener('input', apply); form.addEventListener('change', apply);
    $$('[data-role]', root).forEach((s) => s.addEventListener('change', guard(async () => { try { await api.adminUpdateUser(s.dataset.role, { role: s.value }); toast(isAdminRole(s.value) ? `Role set to ${s.value} (Admin access granted)` : 'Role updated'); } finally { refresh(); } })));
    $$('[data-admin]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.adminUpdateUser(c.dataset.admin, { isAdmin: c.checked }); toast(c.checked ? 'Admin granted' : 'Admin removed'); } finally { refresh(); } })));
    $$('[data-status]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.adminUpdateUser(b.dataset.status, { status: b.dataset.to }); toast('User ' + b.dataset.to); refresh(); })));
    $$('[data-unlink]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.adminUnlinkSalesRep(b.dataset.unlink, b.dataset.salesId); toast('Salesperson link removed'); refresh(); })));
    $$('[data-del]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      if (!confirm(`Delete ${b.dataset.name}? They will no longer be able to sign in. Their documents, messages and history are kept.`)) return;
      await api.adminDeleteUser(b.dataset.del); toast('User removed (history kept)'); refresh(); })));
  } };
}
