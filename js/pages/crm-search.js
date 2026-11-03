/* crm-search.js : CRM GLOBAL SEARCH (Janine, Zoho video 7). Header box (CLA staff with the CRM only): click shows recent items and recent searches;
 * typing shows quick results grouped by module; Enter (or "View all results") opens the full results page #/crm/search/<q>[/<module>] with an
 * "All Modules" dropdown and one table per module with Zoho's columns. Matches name, email and phone (phone by its digits). Only records you may see. */
import { html, raw, $, $$, guard, toText, esc } from '../ui.js?v=202611031532';
import { SEARCH_MODULES, moduleName, highlight } from '../data/crm-analytics.js?v=202611031532';
import { tabs, head } from './crm-kit.js?v=202611031532';

const resultsHref = (q, module = 'all') => `#/crm/search/${encodeURIComponent(q)}${module && module !== 'all' ? '/' + module : ''}`;
const hl = (text, q) => raw(highlight(text, q).map(([t, on]) => (on ? `<mark>${esc(t)}</mark>` : esc(t))).join(''));

// wire the header box (called by app.js after the layout renders)
export function wireHeaderSearch(api) {
  const input = $('[data-global-search]'); const dd = $('[data-global-search-dd]'); if (!input || !dd) return;
  let timer = null; let seq = 0;
  const showRecent = guard(async () => { const r = await api.listCrmRecent(); const my = ++seq; if (my !== seq) return;
    dd.innerHTML = toText(html`<div data-recent-items><strong>Recent Items</strong>${r.items.length ? html`<ul>${r.items.map((it) => html`<li><a href="${it.link}" data-recent-item>${it.name}</a> <span class="muted small">${it.moduleLabel}</span></li>`)}</ul>` : html`<p class="muted small">Nothing opened yet.</p>`}</div>
      <div data-recent-searches><strong>Recent Searches</strong>${r.searches.length ? html`<ul>${r.searches.map((s) => html`<li><a href="${resultsHref(s)}" data-recent-search>${s}</a></li>`)}</ul>` : html`<p class="muted small">No searches yet.</p>`}</div>`); dd.hidden = false; });
  const quick = guard(async () => { const q = input.value.trim(); if (!q) return showRecent(); const my = ++seq; const r = await api.searchCrm(q, { limit: 5 }); if (my !== seq) return;
    dd.innerHTML = toText(html`<div data-quick-results>${r.groups.length ? r.groups.map((g) => html`<div data-quick-group="${g.module}"><strong>${g.label}</strong> <span class="muted small">(${g.total})</span>
      <ul>${g.rows.map((row) => html`<li><a href="${row.link}" data-quick-hit="${row.id}">${hl(row.title, q)}</a>${row.archived ? html` <span class="muted small">(archived)</span>` : ''} <span class="muted small">${hl([row.cells.email, row.cells.phone].filter(Boolean).join(' · '), q)}</span></li>`)}</ul></div>`) : html`<p class="muted" data-no-results>No records match "${q}".</p>`}
      <p><a href="${resultsHref(q)}" data-view-all>View all results</a></p></div>`); dd.hidden = false; });
  input.addEventListener('focus', () => { if (!input.value.trim()) showRecent(); else quick(); });
  input.addEventListener('click', (e) => e.stopPropagation()); dd.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(quick, 200); });
  input.addEventListener('keydown', guard(async (e) => { if (e.key === 'Escape') { dd.hidden = true; input.blur(); } if (e.key !== 'Enter') return; e.preventDefault(); const q = input.value.trim(); if (!q) return;
    await api.saveCrmRecentSearch(q); dd.hidden = true; location.hash = resultsHref(q); }));
  dd.addEventListener('click', guard(async (e) => { const a = e.target.closest('a'); if (!a) return; if (a.matches('[data-view-all]')) await api.saveCrmRecentSearch(input.value.trim()); dd.hidden = true; }));
  document.addEventListener('click', () => { dd.hidden = true; });
}

// full results page: #/crm/search/<q>[/<module>]
export async function searchPage({ api, params, me }) {
  const q = (() => { try { return decodeURIComponent(params.id || ''); } catch (e) { return params.id || ''; } })(); const module = SEARCH_MODULES.includes(params.sub) ? params.sub : 'all';
  const r = q ? await api.searchCrm(q, { module, remember: true }) : { groups: [] };
  const total = r.groups.reduce((s, g) => s + g.total, 0);
  const cell = (g, row, k) => { const v = row.cells[k] || ''; const l = row.links[k]; return l ? html`<a href="${l}">${hl(v, q)}</a>` : hl(v, q); };
  const body = html`${tabs('search')}${head('Search Results', me)}
    <form class="filter-bar" data-search-form onsubmit="return false"><label>Search<input name="q" type="search" value="${q}" maxlength="100" data-search-page-q></label>
      <label>Module<select name="module" data-search-module><option value="all" ${module === 'all' ? raw('selected') : ''}>All Modules</option>${SEARCH_MODULES.map((m) => html`<option value="${m}" ${m === module ? raw('selected') : ''}>${moduleName(m)}</option>`)}</select></label>
      <button type="submit">Search</button></form>
    ${!q ? html`<p class="muted">Type a name, email or phone number.</p>` : html`<p data-search-summary>${total} record${total === 1 ? '' : 's'} found for "<strong>${q}</strong>"${r.phone ? ' (phone numbers matched by digits)' : ''}${module !== 'all' ? html` in ${moduleName(module)}` : ''}.</p>`}
    ${r.groups.map((g) => html`<div class="card" data-search-group="${g.module}"><h3>${g.label} <span class="muted small">(${g.total}${g.total > g.rows.length ? `; first ${g.rows.length} shown` : ''})</span></h3>
      ${g.rows.length ? html`<table class="tbl"><thead><tr>${g.columns.map(([, l]) => html`<th>${l}</th>`)}</tr></thead><tbody>${g.rows.map((row) => html`<tr data-search-row="${row.id}">${g.columns.map(([k]) => html`<td data-col="${k}">${cell(g, row, k)}</td>`)}</tr>`)}</tbody></table>` : html`<p class="muted">No ${g.label.toLowerCase()} match.</p>`}</div>`)}
    ${q && module === 'all' && !r.groups.length ? html`<p class="muted" data-no-results>No records match. Try fewer words, or the phone number digits.</p>` : ''}`;
  const mount = (root) => { const f = $('[data-search-form]', root); const go = () => { const v = $('[data-search-page-q]', f).value.trim(); if (!v) return; location.hash = resultsHref(v, $('[data-search-module]', f).value); };
    f.addEventListener('submit', go); $('[data-search-module]', f).addEventListener('change', go); };
  return { title: 'CRM search', crumbs: [['CRM', '#/crm'], ['Search']], body, mount };
}
