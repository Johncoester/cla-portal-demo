// User List + Create User: ADMIN only (isAdmin; role 'Admin' always has it; the Sales Processor is not an admin). The adapter enforces it too.
// Delete = the account is removed (cannot sign in, leaves teams), but their documents, messages and history stay and show "(removed)".
import { html, $, $$, guard, formData, options, pill, toast, fmtDate } from '../ui.js';
import { ROLES, ADMIN_ROLE, OUTSIDE } from '../data/constants.js';
const acct = (r) => (r === OUTSIDE ? 'Outside user (role set per order)' : r);

export async function render({ api, user, params, refresh, go }) {
  if (!user.isAdmin) throw new Error('User management is for Admins only.');
  if (params.mode === 'new') {
    const body = html`<div class="box-title"><h2><span class="h-ico"></span>Create User</h2></div>
      <form id="cuf" class="card form-grid"><label>First name *<input name="firstName" required maxlength="80"></label><label>Last name<input name="lastName" maxlength="80"></label>
        <label>Email *<input name="email" type="email" required></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone maxlength="40"></label>
        <label>Account type *<select name="role" required><option value="">Choose&hellip;</option>${options(ROLES, '', acct)}</select></label>
        <p class="muted span2">Agents and clients are <strong>outside users</strong>: they have no fixed role. When the processor adds them to an order, the role picked there (Buyer Agent, Listing Agent, Client-Buyer or Client-Seller) decides what they can see and do <em>on that order</em>. One email = one login, even for someone who is an agent on one file and a buyer on another.</p>
        <label class="check"><input type="checkbox" name="isAdmin"> Also give Admin access (role "Admin" always has it)</label>
        <p class="muted span2">Fake build: no invitation email is sent. At go-live this sends an invite through Supabase Auth.</p>
        <div class="span2"><button class="m-btn" type="submit">Create user</button> <a class="ghost" href="#/users">Cancel</a></div></form>`;
    return { title: 'Create User', crumbs: [['User List', '#/users'], ['Create User']], body, mount(root) {
      $('#cuf', root).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.adminCreateUser(formData(e.target)); toast('User created'); go('/users'); }));
    } };
  }
  const users = await api.adminListUsers();
  const order = { active: 0, disabled: 1, removed: 2 };
  const rows = users.sort((a, b) => order[a.status] - order[b.status] || a.lastName.localeCompare(b.lastName)).map((u) => { const self = u.id === user.id; const gone = u.status === 'removed';
    return html`<tr class="${u.status !== 'active' ? 'is-done' : ''}"><td>${u.firstName} ${u.lastName}${gone ? html` ${pill('removed', 'bad')}` : ''}</td><td>${u.email}</td>
    <td>${gone ? u.role : html`<select data-role="${u.id}" aria-label="Role" ${self ? html`disabled title="You cannot change your own role"` : ''}>${options(ROLES, u.role)}</select>`}${u.files && u.files.length ? html`<div class="muted small" data-files="${u.id}">${u.files.map((f) => `${f.role} on ${f.fileNumber}`).join(' · ')}</div>` : u.role === OUTSIDE ? html`<div class="muted small">not on any order yet</div>` : ''}</td>
    <td class="center">${gone ? '' : html`<input type="checkbox" data-admin="${u.id}" ${u.isAdmin ? html`checked` : ''} ${self || u.role === ADMIN_ROLE ? html`disabled title="${self ? 'This is you' : 'Role Admin always has Admin access'}"` : ''} aria-label="Admin">`}</td>
    <td>${(u.teams || []).join(', ')}</td><td>${gone ? html`<span class="muted small">removed ${fmtDate(u.removedAt)}</span>` : pill(u.status, u.status === 'active' ? 'ok' : 'warn')}</td>
    <td class="nowrap">${self || gone ? '' : html`<button class="ghost" data-status="${u.id}" data-to="${u.status === 'active' ? 'disabled' : 'active'}">${u.status === 'active' ? 'Disable' : 'Enable'}</button>
      <button class="ghost danger" data-del="${u.id}" data-name="${u.firstName} ${u.lastName}">Delete user</button>`}</td></tr>`; });
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>User List</h2><a class="m-btn right" href="#/users/new">+ Create user</a></div>
    <table class="tbl striped"><thead><tr><th>Name</th><th>Email</th><th>Account type / roles on files</th><th>Admin</th><th>Teams</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">Admins only. Picking role Admin gives Admin access; moving someone off the Admin role takes it away. There is always at least one Admin. Deleting a user stops their sign-in and takes them off teams; their documents, messages, task answers and audit history are kept and shown as "(removed)". Documents are never deleted.</p>`;
  return { title: 'User List', crumbs: [['User List']], body, mount(root) {
    $$('[data-role]', root).forEach((s) => s.addEventListener('change', guard(async () => { try { await api.adminUpdateUser(s.dataset.role, { role: s.value }); toast(s.value === ADMIN_ROLE ? 'Role set to Admin (Admin access granted)' : 'Role updated'); } finally { refresh(); } })));
    $$('[data-admin]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.adminUpdateUser(c.dataset.admin, { isAdmin: c.checked }); toast(c.checked ? 'Admin granted' : 'Admin removed'); } finally { refresh(); } })));
    $$('[data-status]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.adminUpdateUser(b.dataset.status, { status: b.dataset.to }); toast('User ' + b.dataset.to); refresh(); })));
    $$('[data-del]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      if (!confirm(`Delete ${b.dataset.name}? They will no longer be able to sign in. Their documents, messages and history are kept.`)) return;
      await api.adminDeleteUser(b.dataset.del); toast('User removed (history kept)'); refresh(); })));
  } };
}
