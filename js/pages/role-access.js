// ROLE ACCESS (John, Nov 9 2026: "allows super admins to allow who sees what"). Admin / Settings > Role access, Super admin only.
// A grid of roles x modules. Tick or untick, then Save. Admins and Super admins always have everything (no checkbox, so nobody locks themselves out).
// Agents, clients and HR-only logins are never in the grid. A cell shows "-" where the module has never been for that role.
// Every change is logged (who, when, old -> new). Saved rows take effect for each person on their next page load.
import { html, raw, $, $$, guard, toast, fmtDateTime } from '../ui.js?v=202611070139';
import { canManageRoleAccess } from '../data/role-access.js?v=202611100100';

const word = (v) => (v ? 'On' : 'Off');
export async function render({ api, user, refresh }) {
  if (!canManageRoleAccess(user)) throw new Error('Only a Super admin can see the Role access page.');
  const data = await api.listRoleAccess();
  const cell = (role, m) => data.rows.find((r) => r.role === role && r.module === m.id);
  const td = (role, m) => {
    if (!m.eligible.includes(role)) return html`<td class="ra-cell ra-na muted" data-ra-na="${role}|${m.id}" title="${m.label} has never been available to ${role}">-</td>`;
    const r = cell(role, m) || { allowed: false };
    const changed = r.updatedAt ? `Last changed ${fmtDateTime(r.updatedAt)}${r.updatedByName ? ` by ${r.updatedByName}` : ''}` : 'Never changed (same as before this screen)';
    return html`<td class="ra-cell"><label class="ra-check" title="${changed}"><input type="checkbox" data-ra="${role}|${m.id}" data-ra-was="${r.allowed ? '1' : '0'}" aria-label="${role}: ${m.label}" ${r.allowed ? raw('checked') : ''}></label></td>`;
  };
  const body = html`<section class="role-access-page" data-role-access-page>
    <div class="page-head"><p class="eyebrow">Admin / Settings</p><h2 class="page-title">Role access</h2>
      <p class="muted">Choose which roles see each area. Untick a box to hide that area from everyone with the role: no menu item, no workspace card, and the database refuses the data.
      <strong>Admins and Super admins always see everything.</strong> Agents and clients are never shown here. Changes take effect on each person's next page load. Every change is logged below.</p>
      ${data.migrated ? '' : html`<p class="err-text" data-ra-not-migrated>The Role access table is not on this database yet. The boxes show the defaults; saving will fail until it is installed.</p>`}</div>
    <div class="card"><table class="tbl ra-grid" data-ra-grid><thead><tr><th>Role</th>${data.modules.map((m) => html`<th title="${m.desc}">${m.label}</th>`)}</tr></thead><tbody>
      <tr class="ra-locked" data-ra-locked><th scope="row">Super admin / Admin</th>${data.modules.map(() => html`<td class="ra-cell muted">Always</td>`)}</tr>
      ${data.roles.map((role) => html`<tr data-ra-role="${role}"><th scope="row">${role}</th>${data.modules.map((m) => td(role, m))}</tr>`)}
    </tbody></table>
    <ul class="small muted ra-notes">${data.modules.map((m) => html`<li><strong>${m.label}:</strong> ${m.desc}</li>`)}</ul>
    <div class="form-actions"><button class="m-btn" type="button" data-ra-save disabled>Save changes</button> <span class="small muted" data-ra-pending></span></div></div>
    <div class="card"><h3>Change log</h3><p class="small muted">Who changed which box, when, and from what to what. Read only.</p>
      <table class="tbl" data-ra-log><thead><tr><th>When</th><th>Who</th><th>Role</th><th>Area</th><th>Change</th></tr></thead><tbody>
      ${data.log.length ? data.log.map((l) => html`<tr data-ra-log-row="${l.role}|${l.module}"><td class="nowrap">${fmtDateTime(l.at)}</td><td>${l.byName}</td><td>${l.role}</td><td>${l.label}</td><td>${word(l.old)} &rarr; ${word(l.new)}</td></tr>`)
        : html`<tr><td colspan="5" class="muted">No changes yet. Every role has what it had before this screen.</td></tr>`}</tbody></table></div></section>`;
  return { title: 'Role access', crumbs: [['Role access']], body, mount(root) {
    const boxes = $$('[data-ra]', root); const btn = $('[data-ra-save]', root); const note = $('[data-ra-pending]', root);
    const dirty = () => boxes.filter((b) => (b.checked ? '1' : '0') !== b.dataset.raWas);
    const upd = () => { const n = dirty().length; btn.disabled = !n; note.textContent = n ? `${n} unsaved change${n === 1 ? '' : 's'}` : ''; };
    boxes.forEach((b) => b.addEventListener('change', upd));
    btn.addEventListener('click', guard(async () => {
      const list = dirty(); if (!list.length) return; btn.disabled = true;
      let done = 0;
      try { for (const b of list) { const [role, module] = b.dataset.ra.split('|'); await api.setRoleAccess(role, module, b.checked); b.dataset.raWas = b.checked ? '1' : '0'; done += 1; } }
      finally { upd(); }
      toast(`Role access saved (${done} change${done === 1 ? '' : 's'})`); refresh();
    }));
  } };
}
