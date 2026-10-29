// Task templates (definitions with versions). Each participant gets a COPY that records the version it was made from.
// Admin publishes a new version (title / description / due days); existing copies keep their version. Processor and TC can view.
import { html, $$, guard, toast, fmtDate, pill } from '../ui.js';

export async function render({ api, user, refresh }) {
  const list = await api.listTaskTemplates(); const codes = [...new Set(list.map((t) => t.code))];
  const block = (code) => { const vs = list.filter((t) => t.code === code); const cur = vs.find((t) => t.active) || vs[0];
    return html`<div class="card"><div class="deal-card-head"><h3>${cur.title}</h3><span class="muted small">${code}</span><span class="spacer"></span>
      ${user.isAdmin ? html`<button class="ghost" data-publish="${code}" data-title="${cur.title}">Publish new version</button>` : ''}</div>
      <p class="muted">${cur.description} &middot; For: ${cur.roles.join(', ')} &middot; ${cur.fields.length} field(s): ${cur.fields.map((f) => f.label).join('; ')}</p>
      <table class="tbl"><thead><tr><th>Version</th><th>Title</th><th>Due after</th><th>Published</th><th>Copies made from it</th><th></th></tr></thead><tbody>
      ${vs.map((t) => html`<tr><td>v${t.version}</td><td>${t.title}</td><td>${t.dueDays} days</td><td>${fmtDate(t.publishedAt)} &middot; ${t.publishedByName}</td><td>${t.copies}</td><td>${t.active ? pill('current', 'ok') : pill('older', '')}</td></tr>`)}</tbody></table></div>`; };
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Task Templates</h2></div>
    <p class="muted">When someone is added to an order they get their own copy of each current template for their role. A copy keeps the version it was made from, so publishing a new version never changes work in progress.${user.isAdmin ? '' : ' Only an Admin can publish versions.'}</p>
    ${codes.map(block)}`;
  return { title: 'Task Templates', crumbs: [['Task Templates']], body, mount(root) {
    $$('[data-publish]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      const title = prompt('Title for the new version', b.dataset.title); if (title == null) return;
      const v = await api.publishTemplateVersion(b.dataset.publish, { title }); toast(`Published v${v.version}`); refresh(); })));
  } };
}
