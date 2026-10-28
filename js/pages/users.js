// User List + Create User: Sales Processor only (the adapter enforces it too). Users are disabled, never deleted.
import { html, $, $$, guard, formData, options, pill, toast } from '../ui.js';
import { ROLES } from '../data/constants.js';

export async function render({ api, user, params, refresh, go }) {
  if (params.mode === 'new') {
    const body = html`<div class="box-title"><h2><span class="h-ico"></span>Create User</h2></div>
      <form id="cuf" class="card form-grid"><label>First name *<input name="firstName" required maxlength="80"></label><label>Last name<input name="lastName" maxlength="80"></label>
        <label>Email *<input name="email" type="email" required></label><label>Phone<input name="phone" maxlength="40"></label>
        <label class="span2">Role *<select name="role" required><option value="">Choose a role&hellip;</option>${options(ROLES, '')}</select></label>
        <p class="muted span2">Fake build: no invitation email is sent. At go-live this sends an invite through Supabase Auth.</p>
        <div class="span2"><button class="m-btn" type="submit">Create user</button> <a class="ghost" href="#/users">Cancel</a></div></form>`;
    return { title: 'Create User', crumbs: [['User List', '#/users'], ['Create User']], body, mount(root) {
      $('#cuf', root).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.adminCreateUser(formData(e.target)); toast('User created'); go('/users'); }));
    } };
  }
  const users = await api.adminListUsers();
  const rows = users.map((u) => html`<tr class="${u.status === 'disabled' ? 'is-done' : ''}"><td>${u.firstName} ${u.lastName}</td><td>${u.email}</td><td>${u.phone}</td>
    <td><select data-role="${u.id}" ${u.id === user.id ? html`disabled` : ''} aria-label="Role">${options(ROLES, u.role)}</select></td><td>${pill(u.status, u.status === 'active' ? 'ok' : 'bad')}</td>
    <td>${u.id === user.id ? '' : html`<button class="ghost" data-status="${u.id}" data-to="${u.status === 'active' ? 'disabled' : 'active'}">${u.status === 'active' ? 'Disable' : 'Enable'}</button>`}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>User List</h2><a class="m-btn right" href="#/users/new">+ Create user</a></div>
    <table class="tbl striped"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">Users can be disabled but never deleted. Only a Sales Processor can manage users.</p>`;
  return { title: 'User List', crumbs: [['User List']], body, mount(root) {
    $$('[data-role]', root).forEach((s) => s.addEventListener('change', guard(async () => { try { await api.adminUpdateUser(s.dataset.role, { role: s.value }); toast('Role updated'); } finally { refresh(); } })));
    $$('[data-status]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.adminUpdateUser(b.dataset.status, { status: b.dataset.to }); toast('User ' + b.dataset.to); refresh(); })));
  } };
}
