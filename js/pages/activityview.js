// Shared activity log table with filters (type, person, date range, text). Filters live in the URL query so they survive refresh.
import { html, $, fmtDateTime, options } from '../ui.js';
export async function activityView(api, dealId, base) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const f = { type: q.get('type') || '', actorId: q.get('actor') || '', from: q.get('from') || '', to: q.get('to') || '', q: q.get('q') || '' };
  const r = await api.listActivity(dealId, f);
  const rows = r.items.map((a) => html`<tr><td class="nowrap">${fmtDateTime(a.createdAt)}</td>${dealId ? '' : html`<td>${a.fileNumber ? html`<a href="#/deals/${a.dealId}">${a.fileNumber}</a>` : html`<span class="muted">portal</span>`}</td>`}
    <td>${a.actorName}<br><span class="muted small">${a.actorRole || ''}</span></td><td><span class="pill">${a.action}</span></td><td>${a.detail}</td></tr>`);
  const body = html`<form id="actf" class="filter-bar"><label>Type<select name="type"><option value="">All types</option>${options(r.types, f.type)}</select></label>
      <label>Person<select name="actor"><option value="">Everyone</option>${options(r.actors, f.actorId, (x) => x.name, (x) => x.id)}</select></label>
      <label>From<input type="date" name="from" value="${f.from}"></label><label>To<input type="date" name="to" value="${f.to}"></label>
      <label>Contains<input name="q" value="${f.q}" placeholder="text"></label><button class="m-btn" type="submit">Filter</button> <a class="ghost" href="${base}">Clear</a></form>
    <p class="muted small">${r.total} matching entr${r.total === 1 ? 'y' : 'ies'}${r.total > r.items.length ? ` (showing ${r.items.length})` : ''}. The log is read-only.</p>
    <table class="tbl striped"><thead><tr><th>When</th>${dealId ? '' : html`<th>Order</th>`}<th>Who</th><th>Type</th><th>What</th></tr></thead><tbody>${rows.length ? rows : html`<tr><td colspan="5" class="muted">Nothing matches.</td></tr>`}</tbody></table>`;
  const mount = (root) => $('#actf', root).addEventListener('submit', (e) => { e.preventDefault(); const p = new URLSearchParams();
    new FormData(e.target).forEach((v, k) => { if (v) p.set(k, v); }); location.hash = base.slice(1) + (p.toString() ? '?' + p : ''); });
  return { body, mount };
}
