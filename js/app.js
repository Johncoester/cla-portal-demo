// app.js : hash router + role-aware layout (topbar, sidebar, welcome title, footer).
import { getAdapter } from './data/adapter.js?v=202611032132';
import { html, raw, toText, esc, $, $$, toast, closeModal, fmtDate } from './ui.js?v=202611032132';
import { runsOrders, isProcessor, isStaff, isClient, isAgent, isOutside, roleLabel, fileRolesLabel, phoneTyping } from './data/constants.js?v=202611032132';
import { canUseCrm } from './data/crm.js?v=202611032132';
import { acctCanRead } from './data/accounting.js?v=202611032132';
import { setModuleMap, modOn, modBeta, moduleById, canManageModules, BETA_LABEL } from './data/modules.js?v=202611032132';
import { phaseOf } from './data/agent-portal.js?v=202611032132';
import { formatMoneyInput } from './pages/money-input.js?v=202611032132';
import { applyTheme, themeOn } from './theme.js?v=202611032132';   // CARD THEME MOCKUP (opt-in, ?theme=cards); off = unchanged
import { icon } from './pages/theme-cards.js?v=202611032132';
// PHONE FORMAT (Matt, Oct 31): every phone input (data-phone, or a form field of type tel) formats itself as xxx-xxx-xxxx while typing
document.addEventListener('input', (e) => { const el = e.target; if (!(el instanceof HTMLInputElement) || !(el.type === 'tel' || el.hasAttribute('data-phone'))) return;
  const v = phoneTyping(el.value); if (v !== el.value) el.value = v; });
// MONEY FORMAT (Matt, Nov 3 (b)): every <input data-money> shows commas while typing (485,000); pages send the clean number (money-input.js)
document.addEventListener('input', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.hasAttribute('data-money')) formatMoneyInput(el); });
document.addEventListener('focusout', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.hasAttribute('data-money')) { formatMoneyInput(el); el.value = el.value.replace(/\.$/, ''); } });

const pages = {
  login: () => import('./pages/entry.js?v=202611032132'),
  dashboard: () => import('./pages/dashboard.js?v=202611032132'),
  orders: () => import('./pages/orders.js?v=202611032132'),
  'orders/new': () => import('./pages/ordernew.js?v=202611032132'),
  deal: () => import('./pages/deal.js?v=202611032132'),
  users: () => import('./pages/users.js?v=202611032132'),
  profile: () => import('./pages/profile.js?v=202611032132'),
  'contact-us': () => import('./pages/contact.js?v=202611032132'),
  teams: () => import('./pages/teams.js?v=202611032132'),
  templates: () => import('./pages/templates.js?v=202611032132'),
  library: () => import('./pages/library.js?v=202611032132'),
  activity: () => import('./pages/activity.js?v=202611032132'),
  outbox: () => import('./pages/outbox.js?v=202611032132'),
  tasks: () => import('./pages/tasks.js?v=202611032132'),            // Matt, Nov 2: all tasks across files (filters, sort, Buyer / Seller / Agent groups)
  'task-grid': () => import('./pages/taskgrid.js?v=202611032132'),   // Matt, Nov 2: Processor / Admin grid, files across, tasks down
  schedule: () => import('./pages/schedule.js?v=202611032132'),   // public closing-time link (no sign-in needed)
  crm: () => import('./pages/crm.js?v=202611032132'),   // John, Nov 2: the CRM. Only reachable when the `crm` feature flag is on (features.js)
  modules: () => import('./pages/modules.js?v=202611032132'),
  underwriters: () => import('./pages/underwriters.js?v=202611032132'),   // John, Nov 3 call: per-state underwriter split (Admin / Super admin)
};
// pages behind a feature flag: when the flag is off the route is "Page not found" and the module is never loaded
const FLAGGED = { crm: 'crm' };
const PUBLIC = new Set(['login', 'schedule']);
// MODULE SWITCHES (John, Nov 3): which switchable module a route belongs to (data/modules.js). Not Live = beta: only Admins / Super admins get it.
export function routeModule(route) {
  const p = route.page;
  if (p === 'crm') return route.params.section === 'deals' ? 'crm-deals' : route.params.section === 'calls' ? 'calls' : 'crm';
  if (p === 'deal' && route.params.tab === 'accounting') return 'accounting';
  return ['tasks', 'task-grid', 'library'].includes(p) ? p : null;
}

function parse() {
  const h = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0]; const seg = h.split('/').filter(Boolean);
  if (!seg.length || seg[0] === 'work-queue') return { page: 'dashboard', params: {} };
  if (seg[0] === 'deals' && seg[1]) return { page: 'deal', params: { id: seg[1], tab: seg[2] || 'overview', sub: seg[3] } };
  if (seg[0] === 'orders' && seg[1] === 'new') return { page: 'orders/new', params: {} };
  if (seg[0] === 'users') return { page: 'users', params: { mode: seg[1] || 'list', id: seg[2] } };
  if (seg[0] === 'crm') return { page: 'crm', params: { section: seg[1] || 'home', id: seg[2] || '', sub: seg[3] || '' } };
  if (seg[0] === 'schedule') return { page: 'schedule', params: { token: seg[1] || '' } };
  return { page: seg[0], params: {} };
}
export const go = (path) => { if (location.hash === '#' + path) render(); else location.hash = path; };
export const homeFor = () => '/dashboard';
export const dashLabel = (u) => u.isAdmin ? 'Admin' : ({ 'Processor': 'Work Queue', 'Sales Person': 'Team Dashboard', 'Sales Team': 'Team Dashboard', 'Transaction Coordinator': 'Dashboard', 'Buyer Agent': 'Transactions', 'Listing Agent': 'Transactions', 'Client-Buyer': 'My Closing', 'Client-Seller': 'My Closing', 'Outside user': 'My Files' }[u.role]);

export function navFor(u, dealId, unread, features = {}) {
  const items = [];
  const add = (id, label, href, cls) => items.push({ id, label, href, cls });
  add('dashboard', dashLabel(u), '#/dashboard', 'orders');
  add('orders', u.role === 'Transaction Coordinator' ? 'Orders' : 'Open Orders', '#/orders', 'orders');
  if ((u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator') && modOn('tasks')) add('tasks', 'All Tasks', '#/tasks', 'task');
  if ((u.isAdmin || runsOrders(u)) && modOn('task-grid')) add('task-grid', 'Task Grid', '#/task-grid', 'task');
  if (u.isAdmin) { add('users/new', 'Create User', '#/users/new', 'documents'); add('users', 'User List', '#/users', 'documents'); add('teams', 'Teams', '#/teams', 'contact-us'); }
  if (features.crm && canUseCrm(u) && modOn('crm')) add('crm', 'CRM', '#/crm', 'contact-us');   // feature flag + CLA staff only (not TCs, not outside users)
  if (modOn('library')) add('library', 'Library', '#/library', 'documents');
  if (runsOrders(u) || u.isAdmin) add('activity', 'Activity Log', '#/activity', 'activity');
  if (runsOrders(u) || u.isAdmin || u.role === 'Transaction Coordinator') { add('templates', 'Task Templates', '#/templates', 'task'); add('outbox', 'Reminder Outbox', '#/outbox', 'inbox'); }
  if (canManageModules(u)) add('modules', 'Modules', '#/modules', 'documents');
  if (canManageModules(u)) add('underwriters', 'Underwriter Splits', '#/underwriters', 'documents');   // John, Nov 3 call (Admin / Super admin)   // John, Nov 3: the Live switches (Admin / Super admin only)
  return items.map((n) => ({ ...n, beta: modBeta(n.id) }));
}

async function layout(u, view, route) {
  const api = await getAdapter(); const unread = await api.notificationCount();
  const dealId = route.page === 'deal' ? route.params.id : null; let deal = null;
  if (dealId) { try { deal = await api.getDeal(dealId); } catch (e) { deal = null; } }
  // Francis, Nov 3: a count badge on every order tab (Tasks = outstanding for you, Inbox = unread, Documents, Activity)
  let counts = null; if (deal) { try { counts = (await api.getOrderOverview(dealId)).counts; } catch (e) { counts = null; } }
  const cnt = (tab) => { if (!counts) return ''; const n = { tasks: counts.tasks, inbox: counts.inbox, documents: counts.documents, activity: counts.activity }[tab]; return n == null ? '' : html`<span class="tab-count" data-tab-count="${tab}">${n}</span>`; };
  const cur = route.page + (route.page === 'users' && route.params.mode === 'new' ? '/new' : '');
  // card theme only: an inline SVG icon + the label in a span (shown as a tooltip in the icon-only sidebar); the link text stays the same
  const tc = themeOn(); const lbl = (id, label) => (tc ? html`${icon(id)}<span class="nav-label">${label}</span>` : label); const tip = (label, beta) => (tc || beta ? raw(` title="${esc(label)}${beta ? ` (${BETA_LABEL})` : ''}"`) : '');
  const betaTag = (id) => html`<span class="beta-badge" data-beta-badge="${id}" title="${BETA_LABEL}">Beta</span>`;
  const core = navFor(u, null, 0, api.features || {}).map((n) => html`<li class="nav-item"><a class="nav-link ${n.cls} ${n.id === cur || (n.id === 'orders' && route.page === 'orders') ? 'active' : ''}" href="${n.href}"${tip(n.label, n.beta)}${n.beta ? raw(' data-beta-nav') : ''}>${lbl(n.id, n.label)}${n.beta ? betaTag(n.id) : ''}</a></li>`);
  const t = route.params.tab; const link = (tab, label, cls, beta) => html`<li class="nav-item"><a class="nav-link ${cls} ${t === tab ? 'active' : ''}" href="#/deals/${dealId}/${tab === 'overview' ? '' : tab}"${tip(label, beta)}${beta ? raw(' data-beta-nav') : ''}>${lbl(tab, label)}${beta ? betaTag(tab) : ''}${tab === 'inbox' && deal && deal.unread ? html`<span class="nav-badge">${deal.unread}</span>` : tab === 'inbox' ? '' : cnt(tab)}</a></li>`;
  const dealNav = deal ? html`<li class="nav-sep">This file</li>${link('overview', 'File Overview', 'orders')}${link('tasks', 'Tasks', 'task')}${link('inbox', 'Inbox', 'inbox')}${link('documents', 'Documents', 'documents')}${link('closing', 'Closing Date', 'task')}${link('contacts', 'Contacts', 'contact-us')}${link('agreements', 'Agreements', 'documents')}${link('activity', 'Activity', 'activity')}${(api.features || {}).accounting && acctCanRead(u) && modOn('accounting') ? link('accounting', 'Accounting', 'documents', modBeta('accounting')) : ''}` : '';
  const contact = isStaff(u.role) ? '' : html`<li class="nav-item"><a class="nav-link contact-us ${route.page === 'contact-us' ? 'active' : ''}" href="#/contact-us"${tip('Contact Us')}>${lbl('contact-us', 'Contact Us')}</a></li>`;
  const sidebarHead = deal ? html`<a class="logo-home-link" href="#/deals/${deal.id}"><div class="order-heading-left"><span>${deal.fileNumber}</span></div><div class="map-div"><img class="map-pin" src="assets/img/map-icon-new.png" alt=""><p>${deal.street}<br>${deal.city}, ${deal.state}, ${deal.zip}</p></div></a>` : '';
  const topButtons = runsOrders(u) ? html`<a class="green-btn" href="#/orders/new">Place Order</a>` : '';
  return html`
  <div class="topbar-main"><div class="topbar-inner">
    <a class="brand" href="#${homeFor(u)}"><img src="assets/img/logo-white.png" alt="CLA Title &amp; Escrow"></a>
    <div class="topbar-right">${crmSearchOn(u, api) ? raw(HEADER_SEARCH) : ''}${topButtons}
      <div class="notif-wrap"><button class="bell" data-bell title="${unread} unread notification(s)" aria-label="Notifications"><img src="assets/img/bell_new.png" alt=""><span class="notification-num">${unread}</span></button>
        <div class="notif-dd" hidden><div class="notif-head"><strong>Notifications</strong><button class="linkish" data-readall>Mark all read</button></div><ul class="notif-list"><li class="muted">Loading&hellip;</li></ul></div></div>
      <div class="user-menu"><button class="user-btn" data-usermenu>${u.firstName} ${u.lastName} <span class="role-tag" data-role-tag>${isOutside(u.role) ? (deal ? `${deal.myRoleLabel || deal.myRole} on this file` : fileRolesLabel(u.fileLabels || u.fileRoles)) : roleLabel(u)}</span> &#9662;</button>
        <ul class="user-dd" hidden><li><a href="#/profile">Profile Setting</a></li><li><a href="#" data-signout>Logout</a></li></ul></div>
    </div></div></div>
  <div class="wrapper-main">
    <div class="left-bar"><div class="logo">${sidebarHead}</div><div class="main-nav"><ul class="nav nav-pills">${core}${dealNav}${contact}</ul></div></div>
    <div class="right-bar">
      <h1 class="welcome-title">Welcome ${u.firstName} ${u.lastName} to CLATitle Portal</h1>
      ${view.crumbs ? html`<ol class="breadcrumb"><li><a href="#${homeFor(u)}"><img src="assets/img/bread-home.png" alt="">Home</a></li>${view.crumbs.map(([label, href], i) => html`<li class="${i === view.crumbs.length - 1 ? 'active' : ''}">${href ? html`<a href="${href}">${label}</a>` : label}</li>`)}</ol>` : ''}
      <div class="dev-banner">DEV BUILD &middot; FAKE DATA ONLY &middot; no real clients, no Zoho &middot; <a href="#" data-reset>reset demo data</a></div>
      ${deal ? orderHeader(deal) : ''}
      ${betaBanner(route)}
      <div id="view">${view.body}</div>
    </div>
    <div class="footer-bar"><span><img src="assets/img/logo-icon.png" alt="" class="foot-logo"> Copyright 2026 C.L.A Title &amp; Escrow | All Rights Reserved.</span><span>Security / Privacy Policy</span></div>
  </div>`;
}

// MODULE SWITCHES: an Admin testing a module that is not Live sees this above the page (regular users never reach the page)
function betaBanner(route) {
  const id = routeModule(route); if (!id || !modBeta(id)) return '';
  const m = moduleById(id);
  return html`<div class="beta-banner" data-beta-banner="${id}" role="note"><span class="beta-badge">${BETA_LABEL}</span> <span><strong>${m.label}</strong> is not Live yet: only Admins and Super admins can see it.
    Turn it Live on the <a href="#/modules">Modules</a> page.</span></div>`;
}
// REDESIGN (John, Nov 3): the persistent order header on every tab of a file: Order #, progress badge, address, then type / dates / status.
// Same data-order-header / data-progress-badge / .order-no hooks as before (the badge text is exactly the phase name).
function orderHeader(deal) {
  const ph = phaseOf(deal).badge;
  return html`<div class="order-header" data-order-header>
    <div class="oh-top"><span class="order-no">Order # ${deal.fileNumber}</span><span class="pill ${ph === 'Closed' ? '' : 'ok'}" data-progress-badge>${ph}</span>${deal.status && deal.status !== 'Open' ? html`<span class="pill warn" data-oh-status>${deal.status}</span>` : ''}</div>
    <strong class="oh-address">${deal.street}, ${deal.city}, ${deal.state} ${deal.zip}</strong>
    <div class="oh-meta"><span>${deal.transactionType || 'Purchase'}${deal.fileTitle ? html` &middot; <strong>${deal.fileTitle}</strong>` : ''}</span>${deal.openDate ? html`<span>Opened <strong>${fmtDate(deal.openDate)}</strong></span>` : ''}${deal.county ? html`<span>${deal.county} County</span>` : ''}</div>
    <div class="oh-side"><span class="oh-big-label">Settlement date</span><span class="oh-big">${fmtDate(deal.closingDate) || 'Not set'}</span></div></div>`;
}

let rendering = 0;
export async function render() {
  const my = ++rendering; applyTheme(); const root = $('#app'); const api = await getAdapter(); const route = parse(); closeModal();
  let u = await api.getSession();
  if (!u && !PUBLIC.has(route.page)) { if (route.page === 'deal') sessionStorage.setItem('cla-portal-new:return', location.hash); location.hash = '#/login'; return; }   // invite deep link: back to the order after sign-in
  if (u && route.page === 'login') { location.hash = '#' + homeFor(u); return; }
  let mods = {}; if (u && api.getModuleAccess) { try { mods = await api.getModuleAccess(); } catch (e) { mods = {}; } } setModuleMap(mods);   // module switches for this user
  const modId = u ? routeModule(route) : null;
  const loader = (FLAGGED[route.page] && !(api.features || {})[FLAGGED[route.page]]) || (route.page === 'deal' && route.params.tab === 'accounting' && !(api.features || {}).accounting) || (modId && !modOn(modId)) ? null : pages[route.page];   // a module that is not Live (beta): Page not found for everyone but Admins   // Accounting tab: Page not found when the flag is off
  if (!loader) { root.innerHTML = toText(await layout(u, { body: html`<div class="box-title"><h2>Page not found</h2></div><p>That page does not exist.</p>` }, route)); wireChrome(u); return; }
  const mod = await loader(); let view;
  try { view = await mod.render({ api, user: u, params: route.params, refresh: render, go }); }
  catch (e) { view = { crumbs: [['Not available']], body: html`<div class="box-title"><h2>Not available</h2></div><p class="err-text">${e.message}</p><p><a class="back-btn" href="#${homeFor(u)}">Back</a></p>` }; }
  if (my !== rendering) return;
  if (PUBLIC.has(route.page)) { root.innerHTML = toText(view.body); }
  else { let shell; try { shell = await layout(u, view, route); } catch (e) { if (/sign in/i.test(e.message || '')) { location.hash = '#/login'; return; } throw e; }   // session ended mid-render
    if (my !== rendering) return; root.innerHTML = toText(shell); wireChrome(u); }
  document.title = (view.title ? view.title + ' | ' : '') + 'CLA Title & Escrow Portal';
  if (view.mount) view.mount($('#view') || root, { api, user: u, refresh: render, go });
}
// Nov 3 (b), Zoho video 7: CRM global search in the header (CLA staff with the CRM only; the module loads only then)
const HEADER_SEARCH = `<div class="crm-global-search" data-global-search-wrap style="position:relative;display:inline-block;margin-right:10px"><input type="search" data-global-search placeholder="Search CRM (name, email, phone)" aria-label="Search the CRM" autocomplete="off" maxlength="100"><div data-global-search-dd hidden style="position:absolute;right:0;top:100%;z-index:50;background:#fff;color:#222;min-width:420px;max-height:70vh;overflow:auto;border:1px solid #ccc;padding:6px;text-align:left"></div></div>`;
const crmSearchOn = (u, api) => !!(u && (api.features || {}).crm && canUseCrm(u) && modOn('crm'));
function wireChrome(u) {
  getAdapter().then((api) => { if (crmSearchOn(u, api) && $('[data-global-search]')) import('./pages/crm-search.js?v=202611032132').then((m) => m.wireHeaderSearch(api)); });
  const btn = $('[data-usermenu]'); const dd = $('.user-dd');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; });
  document.addEventListener('click', () => { if (dd) dd.hidden = true; }, { once: true });
  wireBell();
  const so = $('[data-signout]'); if (so) so.addEventListener('click', async (e) => { e.preventDefault(); const api = await getAdapter(); await api.signOut(); location.hash = '#/login'; });
  const rs = $('[data-reset]'); if (rs) rs.addEventListener('click', async (e) => { e.preventDefault(); if (!confirm('Reset all demo data back to the 4 fake deals?')) return; const api = await getAdapter(); await api.resetDemoData(); toast('Demo data reset'); render(); });
}
function wireBell() {
  const b = $('[data-bell]'); const dd = $('.notif-dd'); if (!b) return;
  const fill = async () => { const api = await getAdapter(); const list = await api.listNotifications({ limit: 12 });
    $('.notif-list', dd).innerHTML = toText(list.length ? list.map((n) => html`<li class="${n.readAt ? '' : 'unread'}"><a href="${n.link || '#/dashboard'}" data-nid="${n.id}">${n.fileNumber ? html`<strong data-notif-file>${n.fileNumber}</strong> <span class="muted small" data-notif-address>${n.address}</span><br>` : ''}${n.title}<br><span class="muted small">${new Date(n.createdAt).toLocaleString('en-US')}</span></a></li>`) : html`<li class="muted">No notifications.</li>`);
    $$('[data-nid]', dd).forEach((a) => a.addEventListener('click', async () => { const api2 = await getAdapter(); await api2.markNotificationRead(a.dataset.nid); })); };
  b.addEventListener('click', async (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; if (!dd.hidden) await fill(); });
  dd.addEventListener('click', (e) => e.stopPropagation());
  $('[data-readall]', dd).addEventListener('click', async () => { const api = await getAdapter(); await api.markAllNotificationsRead(); render(); });
  document.addEventListener('click', () => { dd.hidden = true; }, { once: true });
}
// UNSAVED CHANGES (Francis, Nov 3: "are you sure you want to leave... continue editing"): a page that sets window.claDirty() = true is asked before leaving
let lastHash = location.hash; let bounce = false;
window.addEventListener('hashchange', () => { if (bounce) { bounce = false; return; }
  if (typeof window.claDirty === 'function' && window.claDirty() && !confirm('You have unsaved changes. Leave this page? Press Cancel to continue editing.')) { bounce = true; location.hash = lastHash; return; }
  window.claDirty = null; lastHash = location.hash; render(); });
window.addEventListener('beforeunload', (e) => { if (typeof window.claDirty === 'function' && window.claDirty()) { e.preventDefault(); e.returnValue = ''; } });
render();
