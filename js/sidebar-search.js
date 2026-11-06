// sidebar-search.js : SIDEBAR SEARCH + ORDER NAV (John, Nov 4 call).
// - Inside an order: a pinned (sticky) block at the very top of the sidebar: "Search property or contact", Switch order, Open Orders.
// - Main pages: the same search first in the sidebar (and big on the dashboard); the long menu sits under "More / All pages",
//   closed by default, open/closed remembered per user (localStorage). Nothing is removed from the menu, only folded.
// SCOPE: results come ONLY from api.listDeals({ status: 'All' }) (adapter dealsFor scope: agents / clients see their own files, TCs their team's),
// and partyNames there are already the names this viewer may see. No new access logic here.
import { html, raw, toText, $, $$ } from './ui.js?v=202611062325';
const MORE_KEY = (u) => `cla-portal-new:nav-more:${u.id}`; const RECENT_KEY = (u) => `cla-portal-new:recent-orders:${u.id}`;
const ls = () => { try { return localStorage; } catch (e) { return null; } };
// test hook: window.CLA_NAV_MORE_OPEN (tools/ui-actions.js) keeps the older suites' menu clicks working; a stored choice always wins
export function moreOpen(u) { const v = ls() && ls().getItem(MORE_KEY(u)); if (v === '1' || v === '0') return v === '1'; return typeof window !== 'undefined' && !!window.CLA_NAV_MORE_OPEN; }
export function noteRecent(u, id) { const s = ls(); if (!s || !u || !id) return; let a = []; try { a = JSON.parse(s.getItem(RECENT_KEY(u)) || '[]'); } catch (e) { a = []; }
  s.setItem(RECENT_KEY(u), JSON.stringify([id, ...a.filter((x) => x !== id)].slice(0, 8))); }
const recent = (u) => { try { return JSON.parse((ls() && ls().getItem(RECENT_KEY(u))) || '[]'); } catch (e) { return []; } };
export const searchBox = (where) => html`<div class="ss-wrap ss-${where}" data-ss-wrap="${where}"><input type="search" class="ss-input" data-ss-input placeholder="Search property or contact" aria-label="Search property or contact" autocomplete="off" maxlength="100"><ul class="ss-dd" data-ss-dd hidden role="listbox"></ul></div>`;
export const orderPin = () => html`<div class="ss-pin" data-order-pin>${searchBox('order')}<div class="ss-row"><select class="ss-switch" data-switch-order aria-label="Switch order"><option value="">Switch order&hellip;</option></select><a class="ss-open" href="#/orders" data-pin-open-orders>Open Orders</a></div></div>`;
export const mainPin = () => html`<div class="ss-pin ss-pin-main" data-main-search>${searchBox('side')}</div>`;
export const homeSearch = () => html`<div class="ss-home" data-home-search><label class="ss-home-l">Find a file</label>${searchBox('home')}</div>`;
export const moreWrap = (u, items) => html`<li class="nav-more"><details data-nav-more${moreOpen(u) ? raw(' open') : ''}><summary data-nav-more-toggle>More &middot; All pages</summary><ul class="nav nav-pills">${items}</ul></details></li>`;
// search text of one order (only fields listDeals already gives this viewer)
const hay = (d) => [d.fileNumber, d.street, d.city, d.state, d.zip, d.county, d.fileTitle, ...(d.partyNames || []), d.processorName, d.salesPersonName].filter(Boolean).join(' ').toLowerCase();
export function matchDeals(deals, q) { const t = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!t.length) return [];
  return deals.filter((d) => { const h = hay(d); return t.every((w) => h.includes(w)); }).slice(0, 8); }
const why = (d, q) => { const l = String(q).toLowerCase(); const n = (d.partyNames || []).find((x) => x.toLowerCase().includes(l)); return n || ''; };
export function wireSideSearch(api, u, go) {
  let deals = null; const load = async () => { if (!deals) { try { deals = await api.listDeals({ status: 'All' }); } catch (e) { deals = []; } } return deals; };
  $$('[data-ss-wrap]').forEach((w) => { const inp = $('[data-ss-input]', w); const dd = $('[data-ss-dd]', w); let hits = []; let at = -1;
    const show = () => { dd.innerHTML = toText(hits.length ? hits.map((d, i) => html`<li role="option" class="${i === at ? 'on' : ''}" data-ss-pick="${d.id}"><strong>${d.street}</strong> <span class="ss-fn">${d.fileNumber}</span><br><span class="muted small">${d.city}, ${d.state}${d.status && d.status !== 'Open' ? ` · ${d.status}` : ''}${why(d, inp.value) ? ` · ${why(d, inp.value)}` : ''}</span></li>`) : html`<li class="muted" data-ss-none>No orders match.</li>`); dd.hidden = !inp.value.trim(); };
    inp.addEventListener('focus', load);
    inp.addEventListener('input', async () => { hits = matchDeals(await load(), inp.value); at = hits.length ? 0 : -1; show(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (hits.length) { at = (at + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; show(); } }
      else if (e.key === 'Enter' && hits[at]) { e.preventDefault(); go('/deals/' + hits[at].id); } else if (e.key === 'Escape') dd.hidden = true; });
    dd.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-ss-pick]'); if (li) { e.preventDefault(); go('/deals/' + li.dataset.ssPick); } });
    inp.addEventListener('blur', () => setTimeout(() => { dd.hidden = true; }, 150)); });
  const sel = $('[data-switch-order]');
  if (sel) { load().then((all) => { const cur = (location.hash.match(/#\/deals\/([^/?]+)/) || [])[1]; const byId = new Map(all.map((d) => [d.id, d]));
    const rec = recent(u).filter((id) => id !== cur && byId.has(id)).map((id) => byId.get(id)); const open = all.filter((d) => d.status === 'Open' && d.id !== cur && !rec.includes(d));
    const opt = (d) => html`<option value="${d.id}">${d.street} · ${d.fileNumber}</option>`;
    sel.insertAdjacentHTML('beforeend', toText(html`${rec.length ? html`<optgroup label="Recent">${rec.map(opt)}</optgroup>` : ''}${open.length ? html`<optgroup label="Open orders">${open.map(opt)}</optgroup>` : ''}`)); });
    sel.addEventListener('change', () => { if (sel.value) go('/deals/' + sel.value); }); }
  const more = $('[data-nav-more]'); if (more) more.addEventListener('toggle', () => { const s = ls(); if (s) s.setItem(MORE_KEY(u), more.open ? '1' : '0'); });
}
