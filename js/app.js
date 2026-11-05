// app.js : hash router + role-aware layout (topbar, sidebar, welcome title, footer).
import { getAdapter } from './data/adapter.js?v=202611051010';
import { html, raw, toText, esc, $, $$, toast, closeModal, fmtDate } from './ui.js?v=202611051010';
import { runsOrders, isProcessor, isStaff, isClient, isAgent, isOutside, roleLabel, fileRolesLabel, phoneTyping } from './data/constants.js?v=202611051010';
import { canUseCrm } from './data/crm.js?v=202611051010';
import { acctCanRead } from './data/accounting.js?v=202611051010';
import { setModuleMap, modOn, modBeta, moduleById, canManageModules, BETA_LABEL } from './data/modules.js?v=202611051010';
import { phaseOf } from './data/agent-portal.js?v=202611051010';
import { formatMoneyInput } from './pages/money-input.js?v=202611051010';
import { applyTheme, themeOn } from './theme.js?v=202611051010';   // CARD THEME MOCKUP (opt-in, ?theme=cards); off = unchanged
import { icon } from './pages/theme-cards.js?v=202611051010';
import { canInviteAgents } from './data/agent-profile.js?v=202611051010';
import { yourAgentHtml } from './pages/your-agent.js?v=202611051010';
import { titleCanRead } from './data/title.js?v=202611051010';
import { LOCK_KEY, lockForToken, readLock, safeLanding, sectionHash, routeAllowed, canViewAs, effectiveLockUser, canReachPayoffs } from './data/locked-links.js?v=202611051010';   // John, Nov 4: one locked login link per fake user
import { orderPin, mainPin, homeSearch, moreWrap, noteRecent, wireSideSearch } from './sidebar-search.js?v=202611051010';   // John, Nov 4 call: sidebar search + pinned order nav
import { WORKSPACES, wsById, usesWorkspaces, currentWs, lastWs, setWs, clearSessionWs, routeWs, navInWs, hrVisible, hrOnly } from './workspace.js?v=202611051010';
import { hrCanManage, hrIsSuper, HR_HEARTBEAT_MS } from './data/hr.js?v=202611051010';   // HR workspace (John + Francis, Nov 4)   // John, Nov 4: Workspace dropdown (Admin / Super admin)
// PHONE FORMAT (Matt, Oct 31): every phone input (data-phone, or a form field of type tel) formats itself as xxx-xxx-xxxx while typing
document.addEventListener('input', (e) => { const el = e.target; if (!(el instanceof HTMLInputElement) || !(el.type === 'tel' || el.hasAttribute('data-phone'))) return;
  const v = phoneTyping(el.value); if (v !== el.value) el.value = v; });
// MONEY FORMAT (Matt, Nov 3 (b)): every <input data-money> shows commas while typing (485,000); pages send the clean number (money-input.js)
document.addEventListener('input', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.hasAttribute('data-money')) formatMoneyInput(el); });
document.addEventListener('focusout', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.hasAttribute('data-money')) { formatMoneyInput(el); el.value = el.value.replace(/\.$/, ''); } });

const pages = {
  login: () => import('./pages/entry.js?v=202611051010'),
  dashboard: () => import('./pages/dashboard.js?v=202611051010'),
  orders: () => import('./pages/orders.js?v=202611051010'),
  'orders/new': () => import('./pages/ordernew.js?v=202611051010'),
  deal: () => import('./pages/deal.js?v=202611051010'),
  users: () => import('./pages/users.js?v=202611051010'),
  profile: () => import('./pages/profile.js?v=202611051010'),
  'contact-us': () => import('./pages/contact.js?v=202611051010'),
  teams: () => import('./pages/teams.js?v=202611051010'),
  templates: () => import('./pages/templates.js?v=202611051010'),
  library: () => import('./pages/library.js?v=202611051010'),
  activity: () => import('./pages/activity.js?v=202611051010'),
  outbox: () => import('./pages/outbox.js?v=202611051010'),
  tasks: () => import('./pages/tasks.js?v=202611051010'),            // Matt, Nov 2: all tasks across files (filters, sort, Buyer / Seller / Agent groups)
  'task-grid': () => import('./pages/taskgrid.js?v=202611051010'),   // Matt, Nov 2: Processor / Admin grid, files across, tasks down
  schedule: () => import('./pages/schedule.js?v=202611051010'),   // public closing-time link (no sign-in needed)
  crm: () => import('./pages/crm.js?v=202611051010'),   // John, Nov 2: the CRM. Only reachable when the `crm` feature flag is on (features.js)
  modules: () => import('./pages/modules.js?v=202611051010'),
  'agent-invites': () => import('./pages/agent-invites.js?v=202611051010'),   // John, Nov 4: invite agents (link shown, nothing sent)
  'agent-invite': () => import('./pages/agent-signup.js?v=202611051010'),     // the agent's one-time setup link (no sign-in)
  underwriters: () => import('./pages/underwriters.js?v=202611051010'),
  hr: () => import('./pages/hr.js?v=202611051010'),                   // HR workspace (John + Francis, Nov 4; Zoho People style)
  'hr-invite': () => import('./pages/hr-invite.js?v=202611051010'),   // the employee's one-time login setup link (no sign-in; nothing sent)   // John, Nov 3 call: per-state underwriter split (Admin / Super admin)
  offices: () => import('./pages/offices.js?v=202611051010'),   // John, Nov 4: Admin > Offices (the closing office picker reads them)
};
// pages behind a feature flag: when the flag is off the route is "Page not found" and the module is never loaded
const FLAGGED = { crm: 'crm' };
const PUBLIC = new Set(['login', 'schedule', 'agent-invite', 'hr-invite']);
// MODULE SWITCHES (John, Nov 3): which switchable module a route belongs to (data/modules.js). Not Live = beta: only Admins / Super admins get it.
export function routeModule(route) {
  const p = route.page;
  if (p === 'crm') return route.params.section === 'deals' ? 'crm-deals' : route.params.section === 'calls' ? 'calls' : 'crm';
  if (p === 'deal' && route.params.tab === 'accounting') return 'accounting';
  if (p === 'deal' && route.params.tab === 'title') return 'title';   // John, Nov 4: order > Title
  if (p === 'hr') return 'hr';   // HR: off = Super admins only (Beta)
  return ['tasks', 'task-grid', 'library'].includes(p) ? p : null;
}

function parse() {
  const h = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0]; const seg = h.split('/').filter(Boolean);
  if (!seg.length || seg[0] === 'work-queue') return { page: 'dashboard', params: {} };
  if (seg[0] === 'deals' && seg[1]) return { page: 'deal', params: { id: seg[1], tab: seg[2] || 'overview', sub: seg[3], v: new URLSearchParams((location.hash || '').split('?')[1] || '').get('v') || '' } };   // v: the Accounting view (route guard: payoffs views)
  if (seg[0] === 'orders' && seg[1] === 'new') return { page: 'orders/new', params: {} };
  if (seg[0] === 'users') return { page: 'users', params: { mode: seg[1] || 'list', id: seg[2] } };
  if (seg[0] === 'crm') return { page: 'crm', params: { section: seg[1] || 'home', id: seg[2] || '', sub: seg[3] || '' } };
  if (seg[0] === 'agent-invite') return { page: 'agent-invite', params: { token: seg[1] || '' } };
  if (seg[0] === 'hr') return { page: 'hr', params: { section: seg[1] === 'employees' && seg[2] ? 'employee' : (seg[1] || 'home'), id: seg[1] === 'employees' ? (seg[2] || '') : '' } };
  if (seg[0] === 'hr-invite') return { page: 'hr-invite', params: { token: seg[1] || '' } };
  if (seg[0] === 'schedule') return { page: 'schedule', params: { token: seg[1] || '' } };
  return { page: seg[0], params: {} };
}
export const go = (path) => { if (location.hash === '#' + path) render(); else location.hash = path; };
export const homeFor = (u) => (u && u.role === 'Employee' ? '/hr' : '/dashboard');   // an HR-only login lives in HR
export const dashLabel = (u) => u.isAdmin ? 'Admin' : ({ 'Processor': 'Work Queue', 'Sales Person': 'Team Dashboard', 'Sales Team': 'Team Dashboard', 'Transaction Coordinator': 'Dashboard', 'Buyer Agent': 'Transactions', 'Listing Agent': 'Transactions', 'Client-Buyer': 'My Closing', 'Client-Seller': 'My Closing', 'Outside user': 'My Files' }[u.role]);

// HR workspace menu (data/hr.js decides who gets what): HR managers / Super admins the Zoho-style sections, everyone else My profile (+ My team)
export function hrNavFor(u) {
  if (!u || !u.hrRole || !hrVisible(u)) return [];
  const b = modBeta('hr'); const items = []; const add = (id, label, href, cls) => items.push({ id, label, href, cls, beta: b });
  if (hrCanManage(u)) { add('hr-home', 'HR Home', '#/hr', 'orders'); add('hr-employees', 'Employee Information', '#/hr/employees', 'contact-us'); add('hr-add', 'Add Employee', '#/hr/add', 'documents');
    add('hr-departments', 'Departments', '#/hr/departments', 'documents'); add('hr-designations', 'Designations', '#/hr/designations', 'documents'); }
  if (u.hrEmployeeId) add('hr-me', 'My profile', '#/hr/me', 'contact-us');
  if (u.hrEmployeeId && u.hrHasReports) add('hr-team', 'My team', '#/hr/team', 'contact-us');
  if (hrIsSuper(u)) add('hr-settings', 'HR Settings', '#/hr/settings', 'documents');
  if (hrCanManage(u)) add('hr-documents', 'HR Documents', '#/hr/documents', 'documents');   // John, Nov 4 HR review: below the Settings gear at the bottom of the sidebar
  return items;
}
export function navFor(u, dealId, unread, features = {}, ws = 'everything') {
  if (ws === null) return [{ id: 'home', label: 'Home', href: '#/dashboard', cls: 'orders', beta: false }];   // neutral Home: nothing picked yet
  if (ws === 'hr') return hrNavFor(u);   // the HR workspace has its own menu (not part of Everything)
  const items = [];
  const add = (id, label, href, cls) => items.push({ id, label, href, cls });
  add('dashboard', dashLabel(u), '#/dashboard', 'orders');
  add('orders', u.role === 'Transaction Coordinator' ? 'Orders' : 'Open Orders', '#/orders', 'orders');
  if ((u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator') && modOn('tasks')) add('tasks', 'All Tasks', '#/tasks', 'task');
  if ((u.isAdmin || runsOrders(u)) && modOn('task-grid')) add('task-grid', 'Task Grid', '#/task-grid', 'task');
  if (u.isAdmin) { add('users/new', 'Create User', '#/users/new', 'documents'); add('users', 'User List', '#/users', 'documents'); add('teams', 'Teams', '#/teams', 'contact-us'); add('offices', 'Offices', '#/offices', 'contact-us'); }   // John, Nov 4: Admin > Offices (Admin / Super admin)
  if (features.crm && canUseCrm(u) && modOn('crm')) add('crm', 'CRM', '#/crm', 'contact-us');   // feature flag + CLA staff only (not TCs, not outside users)
  if (modOn('library')) add('library', 'Library', '#/library', 'documents');
  if (runsOrders(u) || u.isAdmin) add('activity', 'Activity Log', '#/activity', 'activity');
  if (runsOrders(u) || u.isAdmin || u.role === 'Transaction Coordinator') { add('templates', 'Task Templates', '#/templates', 'task'); add('outbox', 'Reminder Outbox', '#/outbox', 'inbox'); }
  if (canInviteAgents(u)) add('agent-invites', 'Agent Invites', '#/agent-invites', 'contact-us');   // John, Nov 4
  if (canManageModules(u)) add('modules', 'Modules', '#/modules', 'documents');
  if (canManageModules(u)) add('underwriters', 'Underwriter Splits', '#/underwriters', 'documents');   // John, Nov 3 call (Admin / Super admin)   // John, Nov 3: the Live switches (Admin / Super admin only)
  let out = items.map((n) => ({ ...n, beta: modBeta(n.id) }));
  if (ws === 'everything') return out;   // Everything = exactly the full menu of before
  if (ws === 'crm') { const i = out.findIndex((n) => n.id === 'crm'); if (i >= 0) {   // the CRM workspace spells out its main sections
    const c = out[i].beta; const sub = [['crm-home', 'CRM Home', '#/crm', 'contact-us', c], ['crm-deals', 'Deals', '#/crm/deals', 'orders', c || modBeta('crm-deals'), 'crm-deals'],
      ['crm-contacts', 'Clients', '#/crm/contacts', 'contact-us', c], ['crm-leads', 'Leads', '#/crm/leads', 'contact-us', c], ['crm-calls', 'Calls', '#/crm/calls', 'task', c || modBeta('calls'), 'calls'],
      ['crm-templates', 'Email Templates', '#/crm/templates', 'documents', c]].filter((x) => !x[5] || modOn(x[5])).map(([id, label, href, cls, beta]) => ({ id, label, href, cls, beta }));
    out.splice(i, 1, ...sub); } }
  return out.filter((n) => navInWs(n.id, ws));
}

async function layout(u, view, route, ws = 'everything') {
  const api = await getAdapter(); const unread = await api.notificationCount();
  const dealId = route.page === 'deal' ? route.params.id : null; let deal = null;
  if (dealId) { try { deal = await api.getDeal(dealId); } catch (e) { deal = null; } }
  // Francis, Nov 3: a count badge on every order tab (Tasks = outstanding for you, Inbox = unread, Documents, Activity)
  let counts = null; if (deal) { try { counts = (await api.getOrderOverview(dealId)).counts; } catch (e) { counts = null; } }
  const cnt = (tab) => { if (!counts) return ''; const n = { tasks: counts.tasks, inbox: counts.inbox, documents: counts.documents, activity: counts.activity }[tab]; return n == null ? '' : html`<span class="tab-count" data-tab-count="${tab}">${n}</span>`; };
  const HR_CUR = { home: 'hr-home', employees: 'hr-employees', employee: 'hr-employees', add: 'hr-add', departments: 'hr-departments', designations: 'hr-designations', me: 'hr-me', team: 'hr-team', settings: 'hr-settings', documents: 'hr-documents' };
  const cur = route.page === 'hr' ? (HR_CUR[route.params.section] || '') : route.page === 'crm' && ws === 'crm' ? ({ home: 'crm-home', deals: 'crm-deals', contacts: 'crm-contacts', leads: 'crm-leads', calls: 'crm-calls', templates: 'crm-templates' }[route.params.section] || '') : (route.page === 'dashboard' && ws === null ? 'home' : route.page + (route.page === 'users' && route.params.mode === 'new' ? '/new' : ''));
  // card theme only: an inline SVG icon + the label in a span (shown as a tooltip in the icon-only sidebar); the link text stays the same
  const tc = themeOn(); const ICO = { 'hr-home': 'dashboard', 'hr-employees': 'users', 'hr-add': 'users/new', 'hr-departments': 'teams', 'hr-designations': 'templates', 'hr-me': 'contacts', 'hr-team': 'teams', 'hr-settings': 'modules', 'hr-documents': 'documents', home: 'dashboard', title: 'documents', 'crm-home': 'crm', 'crm-deals': 'orders', 'crm-contacts': 'contacts', 'crm-leads': 'users/new', 'crm-calls': 'closing', 'crm-templates': 'templates' };   // workspace menu items reuse the card-theme icons
  const lbl = (id, label) => (tc ? html`${icon(ICO[id] || id)}<span class="nav-label">${label}</span>` : label); const tip = (label, beta) => (tc || beta ? raw(` title="${esc(label)}${beta ? ` (${BETA_LABEL})` : ''}"`) : '');
  const betaTag = (id) => html`<span class="beta-badge" data-beta-badge="${id}" title="${BETA_LABEL}">Beta</span>`;
  const hrTip = (n) => (/^hr-/.test(n.id) ? raw(` title="${esc(n.label)}${n.beta ? ` (${BETA_LABEL})` : ''}" aria-label="${esc(n.label)}" data-tip="${esc(n.label)}" data-hr-nav="${n.id}"`) : tip(n.label, n.beta));   // John, Nov 4: HR icons get hover labels
  const core = navFor(u, null, 0, api.features || {}, ws).map((n) => html`<li class="nav-item"><a class="nav-link ${n.cls} ${n.id === cur || (n.id === 'orders' && route.page === 'orders') ? 'active' : ''}" href="${n.href}"${hrTip(n)}${n.beta ? raw(' data-beta-nav') : ''}>${lbl(n.id, n.label)}${n.beta ? betaTag(n.id) : ''}</a></li>`);
  const t = route.params.tab; const link = (tab, label, cls, beta) => html`<li class="nav-item"><a class="nav-link ${cls} ${t === tab && !(tab === 'accounting' && route.params.v === 'payoffs') ? 'active' : ''}" href="#/deals/${dealId}/${tab === 'overview' ? '' : tab}"${tip(label, beta)}${beta ? raw(' data-beta-nav') : ''}>${lbl(tab, label)}${beta ? betaTag(tab) : ''}${tab === 'inbox' && deal && deal.unread ? html`<span class="nav-badge">${deal.unread}</span>` : tab === 'inbox' ? '' : cnt(tab)}</a></li>`;
  // BUYER (Nov 4 call): plain tab names; no Contacts tab (the Overview lists the closing team) and no Agreements tab (they are to-dos now)
  const pureBuyer = deal && ['Client-Buyer', 'Client-Seller'].some((c) => (deal.myRoles || [deal.myRole]).includes(c)) && !(deal.myRoles || [deal.myRole]).some((r) => /Agent$/.test(r));   // seller mirror (Nov 4): a pure seller gets the same plain tabs
  const dealNav = deal && pureBuyer ? html`<li class="nav-sep">This file</li>${link('overview', 'Overview', 'orders')}${link('tasks', 'To-do list', 'task')}${link('inbox', 'Messages', 'inbox')}${link('documents', 'Documents', 'documents')}${link('closing', 'Closing appointment', 'task')}${link('activity', 'Activity', 'activity')}`
    : deal ? html`<li class="nav-sep">This file</li>${link('overview', 'File Overview', 'orders')}${link('tasks', 'Tasks', 'task')}${link('inbox', deal && isClient(deal.myRole) ? 'Messages' : 'Inbox', 'inbox')}${link('documents', 'Documents', 'documents')}${link('closing', 'Closing Date', 'task')}${link('contacts', 'Contacts', 'contact-us')}${link('agreements', 'Agreements', 'documents')}${link('activity', 'Activity', 'activity')}${(api.features || {}).accounting && acctCanRead(u) && modOn('accounting') ? html`${link('accounting', 'Accounting', 'documents', modBeta('accounting'))}${canReachPayoffs(u) ? html`<li class="nav-item"><a class="nav-link payoffs ${t === 'accounting' && route.params.v === 'payoffs' ? 'active' : ''}" href="#/deals/${dealId}/accounting?v=payoffs" data-nav-payoffs${tip('Payoffs / HOA', modBeta('accounting'))}>${lbl('accounting', 'Payoffs / HOA')}</a></li>` : ''}` : ''}${(api.features || {}).title && titleCanRead(u) && modOn('title') ? html`<li class="nav-item"><a class="nav-link title-nav ${t === 'title' ? 'active' : ''}" href="#/deals/${dealId}/title" data-nav-title${tip('Title', modBeta('title'))}${modBeta('title') ? raw(' data-beta-nav') : ''}>${lbl('title', 'Title')}${modBeta('title') ? betaTag('title') : ''}</a></li>` : ''}` : '';   // John, Nov 4: Title sits directly under Payoffs / HOA (staff only)   // (buyer branch above)
  // Order-only sidebar inside an order for non-admins (feature/sidebar-order-search); data-order-only-nav kept for tools/ui-order-page.js
  const orderOnly = !!deal && !u.isAdmin;
  const contact = isStaff(u.role) || hrOnly(u) ? '' : html`<li class="nav-item"><a class="nav-link contact-us ${route.page === 'contact-us' ? 'active' : ''}" href="#/contact-us"${tip('Contact Us')}>${lbl('contact-us', 'Contact Us')}</a></li>`;
  // John, Nov 4: the clients' "Your agent" card (buyer -> buyer's agent, seller -> listing agent); empty for staff and agents
  let agents = []; if (isOutside(u.role) && api.listMyAgents) { try { agents = await api.listMyAgents(deal ? { dealId: deal.id } : {}); } catch (e) { agents = []; } }
  const agentCard = yourAgentHtml(agents);
  const sidebarHead = deal ? html`<a class="logo-home-link" href="#/deals/${deal.id}"><div class="order-heading-left"><span>${deal.fileNumber}</span></div><div class="map-div"><img class="map-pin" src="assets/img/map-icon-new.png" alt=""><p>${deal.street}<br>${deal.city}, ${deal.state}, ${deal.zip}</p></div></a>` : '';
  // John, Nov 4 call: order search in the sidebar (not in the CRM-only workspace or the neutral Home); inside an order non-admins get order-only items
  const sideSearchOn = !deal && ws !== null && ws !== 'crm'; if (deal) noteRecent(u, deal.id);
  // CLIENT SHELL (John, Nov 4): the buyer / seller File Overview AND every file tab (To-do list, Messages, Documents, Closing appointment, Activity; the seller's
  // tabs too) use a light shell: white top bar with the CLA logo and a baby-blue rule, pill tabs in the page, no sidebar. Tab pages keep the "Your agent" card.
  if (view.clientPage) return html`<div class="co-shell" data-client-shell>
  <div class="co-top"><a href="#${homeFor(u)}" class="co-logo"><img src="assets/img/login-logo-new.png" alt="CLA Title &amp; Escrow"></a>
    <div class="co-topr"><a class="co-home" href="#${homeFor(u)}" data-co-home>${dashLabel(u)}</a>
      <div class="notif-wrap"><button class="bell" data-bell title="${unread} unread notification(s)" aria-label="Notifications"><img src="assets/img/bell_new.png" alt=""><span class="notification-num">${unread}</span></button>
        <div class="notif-dd" hidden><div class="notif-head"><strong>Notifications</strong><button class="linkish" data-readall>Mark all read</button></div><ul class="notif-list"><li class="muted">Loading&hellip;</li></ul></div></div>
      ${VIEW_AS ? viewAsHtml(u) : ''}<div class="user-menu"><button class="user-btn" data-usermenu>Signed in as <b>${u.firstName} ${u.lastName}</b> <span class="role-tag" data-role-tag>${deal ? `${deal.myRoleLabel || deal.myRole} on this file` : fileRolesLabel(u.fileLabels || u.fileRoles)}</span> &#9662;</button>
        <ul class="user-dd" hidden><li><a href="#/profile">Profile Setting</a></li><li><a href="#/contact-us">Contact Us</a></li>${sessionStorage.getItem(LOCK_KEY) ? html`<li class="muted" data-locked-note>${VIEW_AS && VIEW_AS.viewing ? `Viewing as this person from ${VIEW_AS.owner.firstName} ${VIEW_AS.owner.lastName}'s admin link` : 'Test link: signed in as this person only'}</li>` : raw('<li><a href="#" data-signout>Logout</a></li>')}</ul></div></div></div>
  <div class="co-wrap"><p class="welcome-title co-sr">Welcome ${u.firstName} ${u.lastName} to CLATitle Portal</p><div class="dev-banner">DEV BUILD &middot; FAKE DATA ONLY &middot; no real clients, no Zoho &middot; <a href="#" data-reset>reset demo data</a></div>${view.clientPage.tab && agentCard ? html`<div class="with-agent co-with-agent" data-with-agent><div id="view">${view.body}</div>${agentCard}</div>` : html`<div id="view">${view.body}</div>`}</div>
  <div class="footer-bar"><span><img src="assets/img/logo-icon.png" alt="" class="foot-logo"> Copyright 2026 C.L.A Title &amp; Escrow | All Rights Reserved.</span><span>Security / Privacy Policy</span></div></div>`;
  const topButtons = runsOrders(u) && (ws === 'portal' || ws === 'everything') ? html`<a class="green-btn" href="#/orders/new">Place Order</a>` : '';
  return html`
  <div class="topbar-main"><div class="topbar-inner">
    <a class="brand" href="#${homeFor(u)}"><img src="assets/img/logo-white.png" alt="CLA Title &amp; Escrow"></a>${usesWorkspaces(u) ? wsMenu(u, ws, api) : hrOnly(u) ? html`<div class="ws-wrap" data-ws-wrap><span class="ws-btn ws-static"><span class="ws-k">Workspace</span> <strong data-ws-current="hr">HR</strong></span></div>` : ''}
    <div class="topbar-right">${crmSearchOn(u, api) && (ws === 'crm' || ws === 'everything') ? raw(HEADER_SEARCH) : ''}${topButtons}
      <div class="notif-wrap"><button class="bell" data-bell title="${unread} unread notification(s)" aria-label="Notifications"><img src="assets/img/bell_new.png" alt=""><span class="notification-num">${unread}</span></button>
        <div class="notif-dd" hidden><div class="notif-head"><strong>Notifications</strong><button class="linkish" data-readall>Mark all read</button></div><ul class="notif-list"><li class="muted">Loading&hellip;</li></ul></div></div>
      ${VIEW_AS ? viewAsHtml(u) : ''}<div class="user-menu"><button class="user-btn" data-usermenu>${u.firstName} ${u.lastName} <span class="role-tag" data-role-tag>${isOutside(u.role) ? (deal ? `${deal.myRoleLabel || deal.myRole} on this file` : fileRolesLabel(u.fileLabels || u.fileRoles)) : roleLabel(u)}</span> &#9662;</button>
        <ul class="user-dd" hidden><li><a href="#/profile">Profile Setting</a></li>${sessionStorage.getItem(LOCK_KEY) ? html`<li class="muted" data-locked-note>${VIEW_AS && VIEW_AS.viewing ? `Viewing as this person from ${VIEW_AS.owner.firstName} ${VIEW_AS.owner.lastName}'s admin link` : 'Test link: signed in as this person only'}</li>` : raw('<li><a href="#" data-signout>Logout</a></li>')}</ul></div>
    </div></div></div>
  <div class="wrapper-main">
    <div class="left-bar">${deal ? orderPin() : sideSearchOn ? mainPin() : ''}<div class="logo">${sidebarHead}</div><div class="main-nav"><ul class="nav nav-pills"${orderOnly ? raw(' data-order-only-nav') : ''}>${orderOnly ? dealNav : deal ? html`${core}${dealNav}${contact}` : sideSearchOn && !isStaff(u.role) ? moreWrap(u, html`${core}${contact}`) : html`${core}${contact}`}</ul></div></div>
    <div class="right-bar">
      <h1 class="welcome-title">Welcome ${u.firstName} ${u.lastName} to CLATitle Portal</h1>
      ${view.crumbs ? html`<ol class="breadcrumb"><li><a href="#${homeFor(u)}"><img src="assets/img/bread-home.png" alt="">Home</a></li>${view.crumbs.map(([label, href], i) => html`<li class="${i === view.crumbs.length - 1 ? 'active' : ''}">${href ? html`<a href="${href}">${label}</a>` : label}</li>`)}</ol>` : ''}
      <div class="dev-banner">DEV BUILD &middot; FAKE DATA ONLY &middot; no real clients, no Zoho &middot; <a href="#" data-reset>reset demo data</a></div>
      ${deal && !view.noOrderHeader ? orderHeader(deal) : ''}${sideSearchOn && route.page === 'dashboard' ? homeSearch() : ''}
      ${betaBanner(route)}
      ${agentCard ? html`<div class="with-agent" data-with-agent><div id="view">${view.body}</div>${agentCard}</div>` : html`<div id="view">${view.body}</div>`}
    </div>
    <div class="footer-bar"><span><img src="assets/img/logo-icon.png" alt="" class="foot-logo"> Copyright 2026 C.L.A Title &amp; Escrow | All Rights Reserved.</span><span>Security / Privacy Policy</span></div>
  </div>`;
}

// WORKSPACE DROPDOWN (John, Nov 4): top bar, next to the logo. Admin / Super admin only.
// HR is offered only to people hrVisible() allows (Super admins while Beta; HR managers / employees when Live). A non-admin with HR gets two choices:
// their usual portal (the full menu they always had, id 'everything', labelled 'Portal') and HR.
const wsChoices = (u, api) => (!u.isAdmin ? [{ ...wsById('everything'), label: 'Portal', desc: 'Your usual portal: orders, tasks, documents' + ((api.features || {}).crm && canUseCrm(u) && modOn('crm') ? ', CRM' : '') }, ...(hrVisible(u) ? [wsById('hr')] : [])]
  : WORKSPACES.filter((w) => (w.id !== 'crm' || ((api.features || {}).crm && canUseCrm(u) && modOn('crm'))) && (w.id !== 'hr' || hrVisible(u))));   // no CRM option when the CRM is off
const wsBetaTag = (id) => (id === 'hr' && modBeta('hr') ? html` <span class="beta-badge" data-ws-beta="hr" title="${BETA_LABEL}">Beta</span>` : '');
function wsMenu(u, ws, api) {
  const w = wsChoices(u, api).find((x) => x.id === ws) || wsById(ws); const last = lastWs(u);
  return html`<div class="ws-wrap" data-ws-wrap><button class="ws-btn" data-ws-btn aria-haspopup="true" aria-label="Choose a workspace"><span class="ws-k">Workspace</span> <strong data-ws-current="${ws || 'none'}">${w ? w.label : 'Choose…'}</strong> &#9662;</button>
    <div class="ws-dd" data-ws-dd hidden role="menu">${wsChoices(u, api).map((x) => html`<button class="ws-opt ${x.id === ws ? 'on' : ''}" data-ws-pick="${x.id}" role="menuitem"><span class="ws-opt-l">${x.id === ws ? raw('&#10003; ') : ''}${x.label}${wsBetaTag(x.id)}${x.id === last && x.id !== ws ? html` <span class="ws-chip">Last used</span>` : ''}</span><small>${x.desc}</small></button>`)}</div></div>`;
}
// the neutral Home after sign-in: a welcome and the choices, NO CRM or portal data (nothing is even loaded)
function neutralHome(u, api) {
  const last = wsChoices(u, api).find((x) => x.id === lastWs(u)) || null;
  return { title: 'Home', crumbs: [['Home']], body: html`<div class="ws-home" data-ws-home><div class="ws-home-head"><h2 class="page-title">Welcome, ${u.firstName}</h2>
    <p class="muted">Pick a workspace to get started. You can switch any time from the <strong>Workspace</strong> menu at the top.</p>
    ${last ? html`<p><button class="m-btn" data-ws-pick="${last.id}" data-ws-continue>${last.label}</button> <span class="muted small">last used</span></p>` : ''}</div>
    <div class="ws-prompts">${wsChoices(u, api).map((x) => html`<button class="ws-prompt" data-ws-pick="${x.id}"><strong>${x.label}${wsBetaTag(x.id)}</strong><span>${x.desc}</span><em>Open ${x.label} &rarr;</em></button>`)}</div></div>` };
}
// MODULE SWITCHES: an Admin testing a module that is not Live sees this above the page (regular users never reach the page)
function betaBanner(route) {
  const id = routeModule(route); if (!id || !modBeta(id)) return '';
  const m = moduleById(id);
  return html`<div class="beta-banner" data-beta-banner="${id}" role="note"><span class="beta-badge">${BETA_LABEL}</span> <span>${id === 'hr' ? html`<span data-hr-beta-text><strong>HR</strong> isn't live yet, so only Super admins can see it. Turn it live on the <a href="#/modules">Modules</a> page.</span>` : html`<strong>${m.label}</strong> is not Live yet: only ${m.superOnly ? 'Super admins' : 'Admins and Super admins'} can see it.
    Turn it Live on the <a href="#/modules">Modules</a> page.`}</span></div>`;
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

let rendering = 0; let VIEW_AS = null;
export async function render() {
  const my = ++rendering; applyTheme(); const root = $('#app'); const api = await getAdapter(); const route = parse(); closeModal();
  let u = await api.getSession();
  // LOCKED LOGIN LINK (John, Nov 4): ?as=<token> signs in as that one fake user and locks this tab to them (data/locked-links.js)
  const asTok = new URLSearchParams(location.search).get('as');
  if (asTok != null) { const lk = lockForToken(asTok); let okLink = false;
    if (lk && api.mode !== 'supabase') { try { await api.pickPerson(lk.user); sessionStorage.setItem(LOCK_KEY, JSON.stringify(lk)); okLink = true; } catch (e) { okLink = false; } }
    if (!okLink) { sessionStorage.removeItem(LOCK_KEY); try { await api.signOut(); } catch (e) { /* none */ } root.innerHTML = toText(html`<div class="box-title" data-bad-link><h2>This test link is not valid</h2></div><p>Ask for a new link.</p>`); return; }
    let land = safeLanding(new URLSearchParams(location.search).get('file')); if (land) { try { await api.getDeal(land); } catch (e) { land = null; } }   // landing only, never wider access
    const qs = new URLSearchParams(location.search); const sec = qs.get('section') ? sectionHash(qs.get('section'), qs.get('file')) : null;   // section links pick the first page only
    if (typeof clearSessionWs === 'function') clearSessionWs();
    history.replaceState(null, '', location.pathname + (sec || (land ? `#/deals/${land}` : (location.hash || '#/dashboard')))); return render(); }   // re-render on the landing route (replaceState fires no hashchange)
  const lock = readLock(sessionStorage); VIEW_AS = null;
  // VIEW AS (Super admin locked link only, John Nov 4): the owner of the link decides; a stored viewAs on anyone else's lock is dropped
  if (lock && api.mode !== 'supabase') { let people = []; try { people = await api.listDevUsers(); } catch (e) { people = []; }
    const owner = people.find((x) => x.id === lock.user);
    if (lock.viewAs && !canViewAs(owner)) { delete lock.viewAs; sessionStorage.setItem(LOCK_KEY, JSON.stringify(lock)); }
    if (canViewAs(owner)) VIEW_AS = { owner, people, viewing: lock.viewAs || null }; }
  const lockedId = lock ? effectiveLockUser(lock, VIEW_AS ? VIEW_AS.owner : null) : null;
  if (lockedId && (!u || u.id !== lockedId)) { try { await api.pickPerson(lockedId); } catch (e) { /* removed user */ } u = await api.getSession();
    if (!u || u.id !== lockedId) { root.innerHTML = toText(html`<div class="box-title" data-bad-link><h2>This test link is no longer valid</h2></div>`); return; } }
  if (!u && !PUBLIC.has(route.page)) { if (route.page === 'deal') sessionStorage.setItem('cla-portal-new:return', location.hash); location.hash = '#/login'; return; }   // invite deep link: back to the order after sign-in
  if (u && route.page === 'login') { location.hash = '#' + homeFor(u); return; }
  if (u && hrOnly(u) && route.page === 'dashboard') { location.hash = '#/hr'; return; }   // HR-only login: HR is home
  let mods = {}; if (u && api.getModuleAccess) { try { mods = await api.getModuleAccess(); } catch (e) { mods = {}; } } setModuleMap(mods);   // module switches for this user
  if (!routeAllowed(u, route, { locked: !!lockedId })) {   // not part of this user's portal: refused for menu AND typed URLs
    if (!u) { location.hash = '#/login'; return; }
    root.innerHTML = toText(await layout(u, { body: html`<div class="box-title" data-route-refused><h2>Not available</h2></div><p data-refused-msg>${route.page === 'crm' ? 'The CRM is for CLA staff only.' : route.page === 'hr' ? 'HR is not available for your account. You are still in your own portal.' : 'That section is not available for your account. You are still in your own portal.'}</p>` }, route, hrOnly(u) ? 'hr' : 'everything')); wireChrome(u); return; }
  let ws = u ? currentWs(u) : 'everything';
  if (u && usesWorkspaces(u)) { const rw = routeWs(route);   // deep link: auto-switch to that link's workspace
    if (rw === 'hr') { if (ws !== 'hr' && hrVisible(u)) { setWs(u, 'hr'); ws = 'hr'; } }   // HR is not part of Everything: an HR link always opens HR
    else if (rw && ws !== 'everything' && ws !== rw) { const t = u.isAdmin ? rw : 'everything'; setWs(u, t); ws = t; }   // a non-admin leaving HR goes back to their usual portal
    if (route.page === 'dashboard' && ws && ws !== 'portal' && ws !== 'everything') { location.hash = '#' + wsById(ws).home; return; }
    if (route.page === 'dashboard' && ws === null) { const v = neutralHome(u, api); if (my !== rendering) return; root.innerHTML = toText(await layout(u, v, route, ws)); wireChrome(u); document.title = 'Home | CLA Title & Escrow Portal'; return; } }
  const modId = u ? routeModule(route) : null;
  const loader = (FLAGGED[route.page] && !(api.features || {})[FLAGGED[route.page]]) || (route.page === 'deal' && route.params.tab === 'accounting' && !(api.features || {}).accounting) || (modId && !modOn(modId)) ? null : pages[route.page];   // a module that is not Live (beta): Page not found for everyone but Admins   // Accounting tab: Page not found when the flag is off
  if (!loader) { root.innerHTML = toText(await layout(u, { body: html`<div class="box-title"><h2>Page not found</h2></div><p>That page does not exist.</p>` }, route, ws)); wireChrome(u); return; }
  const mod = await loader(); let view;
  try { view = await mod.render({ api, user: u, params: route.params, refresh: render, go }); }
  catch (e) { view = { crumbs: [['Not available']], body: html`<div class="box-title"><h2>Not available</h2></div><p class="err-text">${e.message}</p><p><a class="back-btn" href="#${homeFor(u)}">Back</a></p>` }; }
  if (my !== rendering) return;
  if (PUBLIC.has(route.page)) { root.innerHTML = toText(view.body); }
  else { let shell; try { shell = await layout(u, view, route, ws); } catch (e) { if (/sign in/i.test(e.message || '')) { location.hash = '#/login'; return; } throw e; }   // session ended mid-render
    if (my !== rendering) return; root.innerHTML = toText(shell); wireChrome(u); }
  document.title = (view.title ? view.title + ' | ' : '') + 'CLA Title & Escrow Portal';
  if (view.mount) view.mount($('#view') || root, { api, user: u, refresh: render, go });
}
// Nov 3 (b), Zoho video 7: CRM global search in the header (CLA staff with the CRM only; the module loads only then)
const HEADER_SEARCH = `<div class="crm-global-search" data-global-search-wrap style="position:relative;display:inline-block;margin-right:10px"><input type="search" data-global-search placeholder="Search CRM (name, email, phone)" aria-label="Search the CRM" autocomplete="off" maxlength="100"><div data-global-search-dd hidden style="position:absolute;right:0;top:100%;z-index:50;background:#fff;color:#222;min-width:420px;max-height:70vh;overflow:auto;border:1px solid #ccc;padding:6px;text-align:left"></div></div>`;
const crmSearchOn = (u, api) => !!(u && (api.features || {}).crm && canUseCrm(u) && modOn('crm'));
// VIEW AS dropdown (Super admin locked link only): every active fake user; picking the owner goes back to them
function viewAsHtml(u) {
  const o = VIEW_AS.owner; const label = (x) => `${x.firstName} ${x.lastName} \u2014 ${isOutside(x.role) ? 'Outside user' : x.role}`;
  return html`<label class="view-as" data-view-as-wrap title="Super admin only: view the portal as another fake user"><span class="small">View as</span>
    <select data-view-as aria-label="View as"><option value="${o.id}"${u.id === o.id ? ' selected' : ''}>${o.firstName} ${o.lastName} (you, Super admin)</option>${VIEW_AS.people.filter((x) => x.id !== o.id).map((x) => html`<option value="${x.id}"${u.id === x.id ? ' selected' : ''}>${label(x)}</option>`)}</select></label>`;
}
function wireViewAs() {
  const sel = $('[data-view-as]'); if (!sel || !VIEW_AS) return;
  sel.addEventListener('change', async () => { const lock = readLock(sessionStorage); if (!lock || !VIEW_AS) return; const id = sel.value;
    if (id === lock.user) delete lock.viewAs; else lock.viewAs = id;
    sessionStorage.setItem(LOCK_KEY, JSON.stringify(lock)); const api = await getAdapter(); await api.pickPerson(id); clearSessionWs();
    if (location.hash === '#/dashboard') render(); else location.hash = '#/dashboard'; });
}
function wireChrome(u) {
  wireViewAs(); startHeartbeat(u);
  getAdapter().then((api) => { if (crmSearchOn(u, api) && $('[data-global-search]')) import('./pages/crm-search.js?v=202611051010').then((m) => m.wireHeaderSearch(api)); });
  const btn = $('[data-usermenu]'); const dd = $('.user-dd');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; });
  document.addEventListener('click', () => { if (dd) dd.hidden = true; }, { once: true });
  wireBell(); wireWs(u); getAdapter().then((api) => wireSideSearch(api, u, go));
  const so = $('[data-signout]'); if (so) so.addEventListener('click', async (e) => { e.preventDefault(); const api = await getAdapter(); clearSessionWs(); stopHeartbeat(); if (api.hrSessionEnd) { try { await api.hrSessionEnd('logout'); } catch (er) { /* best effort */ } } await api.signOut(); location.hash = '#/login'; });
  const rs = $('[data-reset]'); if (rs) rs.addEventListener('click', async (e) => { e.preventDefault(); if (!confirm('Reset all demo data back to the 4 fake deals?')) return; const api = await getAdapter(); await api.resetDemoData(); toast('Demo data reset'); render(); });
}
function wireWs(u) {
  const b = $('[data-ws-btn]'); const dd = $('[data-ws-dd]');
  if (b && dd) { b.addEventListener('click', (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; }); document.addEventListener('click', () => { dd.hidden = true; }, { once: true }); }
  $$('[data-ws-pick]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); const id = el.dataset.wsPick; setWs(u, id); go(wsById(id).home); }));
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
// PORTAL TIME LOG (John, Nov 4 HR review): a heartbeat every 60 s while the tab is visible; 15 min without one ends the session (adapter / SQL).
// Only people linked to an HR employee record are recorded; the time log is read by HR managers, Super admins and the reporting manager.
let hbTimer = null; let hbUser = null;
async function beat() { if (document.visibilityState !== 'visible') return; try { const api = await getAdapter(); if (api.hrSessionHeartbeat) await api.hrSessionHeartbeat(); } catch (e) { /* best effort */ } }
function startHeartbeat(u) { if (!u || !u.hrEmployeeId) { stopHeartbeat(); return; } if (hbTimer && hbUser === u.id) return; stopHeartbeat(); hbUser = u.id; beat(); hbTimer = setInterval(beat, HR_HEARTBEAT_MS); }
function stopHeartbeat() { if (hbTimer) clearInterval(hbTimer); hbTimer = null; hbUser = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && hbTimer) beat(); });
window.claHrHeartbeat = { start: startHeartbeat, stop: stopHeartbeat, beat };
render();
