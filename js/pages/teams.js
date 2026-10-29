// Teams: a transaction coordinator sees the orders of the agents on their team(s). Admin manages teams; a TC can view their own team.
// Removing someone from a team takes away the access right away.
import { html, $, $$, guard, formData, options, pill, toast } from '../ui.js';

export async function render({ api, user, refresh }) {
  const teams = await api.listTeams(); const admin = user.isAdmin;
  const people = admin ? (await api.adminListUsers()).filter((u) => u.status === 'active' && ['Transaction Coordinator', 'Outside user'].includes(u.role)) : [];
  const card = (t) => html`<div class="card team-card"><div class="deal-card-head"><h3>${t.name}</h3>${admin ? html`<button class="ghost" data-rename="${t.id}" data-name="${t.name}">Rename</button>` : ''}</div>
    <table class="tbl"><thead><tr><th>Member</th><th>Role</th><th>On team as</th><th></th></tr></thead><tbody>
    ${t.members.length ? t.members.map((m) => html`<tr><td>${m.name}</td><td>${m.role}</td><td>${pill(m.memberRole, m.memberRole === 'coordinator' ? 'info' : '')}</td>
      <td>${admin ? html`<button class="ghost" data-remove="${t.id}" data-pid="${m.profileId}" data-name="${m.name}">Remove</button>` : ''}</td></tr>`) : html`<tr><td colspan="4" class="muted">No members yet.</td></tr>`}</tbody></table>
    ${admin ? html`<form class="inline-form" data-add="${t.id}"><select name="profileId" required aria-label="Person"><option value="">Add a coordinator or agent&hellip;</option>${options(people.filter((p) => !t.members.some((m) => m.profileId === p.id)), '', (p) => `${p.firstName} ${p.lastName} (${p.role})`, (p) => p.id)}</select><button class="m-btn" type="submit">Add</button></form>` : ''}</div>`;
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Teams</h2></div>
    <p class="muted">A transaction coordinator sees every order that has an agent from their team on it. Removing the coordinator or the agent from the team removes that access immediately.${admin ? '' : ' Only an Admin can change teams.'}</p>
    ${admin ? html`<form id="newteam" class="inline-form card"><input name="name" placeholder="New team name" required maxlength="120"><button class="m-btn" type="submit">Create team</button></form>` : ''}
    <div class="team-list">${teams.length ? teams.map(card) : html`<p class="muted">You are not on a team yet.</p>`}</div>`;
  return { title: 'Teams', crumbs: [['Teams']], body, mount(root) {
    const nt = $('#newteam', root); if (nt) nt.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.createTeam(formData(e.target).name); toast('Team created'); refresh(); }));
    $$('[data-add]', root).forEach((f) => f.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.addTeamMember(f.dataset.add, formData(f).profileId); toast('Added to team'); refresh(); })));
    $$('[data-remove]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm(`Remove ${b.dataset.name} from this team? Access through the team ends now.`)) return;
      await api.removeTeamMember(b.dataset.remove, b.dataset.pid); toast('Removed from team'); refresh(); })));
    $$('[data-rename]', root).forEach((b) => b.addEventListener('click', guard(async () => { const n = prompt('New team name', b.dataset.name); if (!n) return; await api.renameTeam(b.dataset.rename, n); refresh(); })));
  } };
}
