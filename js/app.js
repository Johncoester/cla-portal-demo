// app.js : hash router + role-aware layout (topbar, sidebar, welcome title, footer).
import { getAdapter } from './data/adapter.js?v=202611132000';
import { prefetchDealTab } from './pages/deal-tab.js?v=202611131900';
import { html, raw, toText, esc, $, $$, toast, closeModal, fmtDate } from './ui.js?v=202611070139';
import { runsOrders, isProcessor, isStaff, isClient, isAgent, isOutside, roleLabel, fileRolesLabel, accountTypeLabel, isClientOnlyUser, phoneTyping, formatMoneyInput } from './data/constants.js?v=202611101015';
import { canUseCrm } from './data/crm.js?v=202611130900';
import { canManageRoleAccess } from './data/role-access.js?v=202611100100';
import { canUseGmail } from './data/gmail-email.js?v=202611121900';
import { acctCanRead } from './data/accounting.js?v=202611070139';
import { setModuleMap, modOn, modBeta, moduleById, canManageModules, BETA_LABEL } from './data/modules.js?v=202611101015';
import { phaseOf } from './data/agent-portal.js?v=202611101015';
import { applyTheme, themeOn } from './theme.js?v=202611070139';   // CARD THEME MOCKUP (opt-in, ?theme=cards); off = unchanged
import { icon } from './pages/theme-cards.js?v=202611101015';
import { canInviteAgents } from './data/agent-profile.js?v=202611101015';
import { yourAgentHtml } from './pages/your-agent.js?v=202611101015';
import { fwpCanRead } from './data/funding-wire-policy.js?v=202611070139';
import { titleCanRead } from './data/title.js?v=202611101015';
import { LOCK_KEY, lockForToken, readLock, safeLanding, sectionHash, routeAllowed, canViewAs, effectiveLockUser, canReachPayoffs, canOpenTaskSetup, legacyTemplatesHash } from './data/locked-links.js?v=202611131900';   // John, Nov 4: one locked login link per fake user
import { isFeedbackPilot } from './data/staff-feedback.js?v=202611080400';
import { syncStaffFeedbackWidget, openStaffFeedbackPanel, hideStaffFeedbackPanel } from './pages/staff-feedback-widget.js?v=202611082000';
import { botRegistry } from './data/bot-registry.js?v=202611080400';
import { canRequestVoice, voiceRouteOk } from './data/voice-demo.js?v=202611102100';
import { mountVoiceChrome, prepareVoiceShell, stopVoiceNow, voiceMenuHtml } from './pages/voice-panel.js?v=202611102100';
import { orderPin, mainPin, homeSearch, moreWrap, noteRecent, wireSideSearch } from './sidebar-search.js?v=202611111200';   // John, Nov 4 call: sidebar search + pinned order nav
import { WORKSPACES, wsById, usesWorkspaces, currentWs, lastWs, setWs, clearSessionWs, routeWs, navInWs, hrVisible, hrOnly } from './workspace.js?v=202611131900';
import { hrCanManage, hrIsSuper, HR_HEARTBEAT_MS } from './data/hr.js?v=202611091730';   // HR workspace (John + Francis, Nov 4)   // John, Nov 4: Workspace dropdown (Admin / Super admin)
// PHONE FORMAT (Matt, Oct 31): every phone input (data-phone, or a form field of type tel) formats itself as xxx-xxx-xxxx while typing
document.addEventListener('input', (e) => { const el = e.target; if (!(el instanceof HTMLInputElement) || !(el.type === 'tel' || el.hasAttribute('data-phone'))) return;
  const v = phoneTyping(el.value); if (v !== el.value) el.value = v; });
// MONEY FORMAT (Matt, Nov 3 (b)): every <input data-money> shows commas while typing (485,000). The save does not depend on this display.
document.addEventListener('input', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.hasAttribute('data-money')) formatMoneyInput(el); });
document.addEventListener('focusout', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.hasAttribute('data-money')) { formatMoneyInput(el); el.value = el.value.replace(/\.$/, ''); } });

const pages = {
  login: () => import('./pages/entry.js?v=202611131900'),
  dashboard: () => import('./pages/dashboard.js?v=202611131900'),
  orders: () => import('./pages/orders.js?v=202611111700'),
  'orders/new': () => import('./pages/ordernew.js?v=202611131900'),
  deal: () => import('./pages/deal.js?v=202611131900'),
  users: () => import('./pages/users.js?v=202611101015'),
  profile: () => import('./pages/profile.js?v=202611131900'),
  'contact-us': () => import('./pages/contact.js?v=202611070139'),
  teams: () => import('./pages/teams.js?v=202611070139'),
  templates: () => import('./pages/templates.js?v=202611131900'),
  'admin/templates': () => import('./pages/templates.js?v=202611131900'),
  library: () => import('./pages/library.js?v=202611101015'),
  activity: () => import('./pages/activity.js?v=202611070139'),
  outbox: () => import('./pages/outbox.js?v=202611101015'),
  tasks: () => import('./pages/tasks.js?v=202611131900'),            // Matt, Nov 2: all tasks across files (filters, sort, Buyer / Seller / Agent groups)
  'task-grid': () => import('./pages/taskgrid.js?v=202611101015'),   // Matt, Nov 2: Processor / Admin grid, files across, tasks down
  schedule: () => import('./pages/schedule.js?v=202611121300'),   // public closing-time link (no sign-in needed)
  crm: () => import('./pages/crm.js?v=202611132000'),   // John, Nov 2: the CRM. Only reachable when the `crm` feature flag is on (features.js)
  modules: () => import('./pages/modules.js?v=202611101015'),
  'role-access': () => import('./pages/role-access.js?v=202611100100'),   // John, Nov 9: Admin / Settings > Role access (Super admin only)
  'agent-invites': () => import('./pages/agent-invites.js?v=202611110300'),   // John, Nov 4: invite agents; Create and Resend email from the inviter's Gmail
  'agent-invite': () => import('./pages/agent-signup.js?v=202611110800'),     // the agent's one-time setup link (no sign-in)
  underwriters: () => import('./pages/underwriters.js?v=202611070139'),
  hr: () => import('./pages/hr.js?v=202611110300'),                   // HR workspace (John + Francis, Nov 4; Zoho People style)
  'hr-invite': () => import('./pages/hr-invite.js?v=202611110800'),   // the employee's one-time login setup link (no sign-in; nothing sent)   // John, Nov 3 call: per-state underwriter split (Admin / Super admin)
  offices: () => import('./pages/offices.js?v=202611101015'),   // John, Nov 4: Admin > Offices (the closing office picker reads them)
  'admin/email-templates': () => import('./pages/email-templates.js?v=202611110900'),   // John, Nov 9: Admin > Email Templates (file Email tab)
  demo: () => import('./pages/demo-view.js?v=202611070139'),   // permanent Demo mode: Super admin views a seeded demo user
  'voice-demo': () => import('./pages/voice-demo.js?v=202611091110'),   // signed-in Live Test only; the header Voice test panel is the test, this route is not a file
  'staff-feedback': () => import('./pages/staff-feedback.js?v=202611131900'),
};
// pages behind a feature flag: when the flag is off the route is "Page not found" and the module is never loaded
const FLAGGED = { crm: 'crm' };
const PUBLIC = new Set(['login', 'schedule', 'agent-invite', 'hr-invite']);
// MODULE SWITCHES (John, Nov 3): which switchable module a route belongs to (data/modules.js). Not Live = beta: only Admins / Super admins get it.
export function routeModule(route) {
  const p = route.page;
  if (p === 'crm') return route.params.section === 'deals' ? 'crm-deals' : route.params.section === 'calls' ? 'calls' : 'crm';
  if (p === 'deal' && route.params.tab === 'accounting') return route.params.v === 'payoffs' ? 'payoffs' : route.params.v === 'postclosing' ? 'post-closing' : 'accounting';   // live40: Payoffs / HOA has its own switch (child of Accounting)
  if (p === 'deal' && ['funding', 'wires', 'policy'].includes(route.params.tab)) return route.params.tab;
  if (p === 'deal' && route.params.tab === 'title') return 'title';   // John, Nov 4: order > Title
  if (p === 'hr') return 'hr';   // HR: off = Super admins only (Beta)
  return ['tasks', 'task-grid', 'library'].includes(p) ? p : null;
}

function parse() {
  const h = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0]; const seg = h.split('/').filter(Boolean);
  if (!seg.length || seg[0] === 'work-queue') return { page: 'dashboard', params: {} };
  if (seg[0] === 'deals' && seg[1]) return { page: 'deal', params: { id: seg[1], tab: seg[2] || 'overview', sub: seg[3], v: new URLSearchParams((location.hash || '').split('?')[1] || '').get('v') || '' } };   // v: the Accounting view (route guard: payoffs views)
  if (seg[0] === 'orders' && seg[1] === 'new') return { page: 'orders/new', params: {} };
  if (seg[0] === 'admin' && seg[1] === 'templates') return { page: 'admin/templates', params: {} };
  if (seg[0] === 'admin' && seg[1] === 'email-templates') return { page: 'admin/email-templates', params: {} };
  if (seg[0] === 'users') return { page: 'users', params: { mode: seg[1] || 'list', id: seg[2] } };
  if (seg[0] === 'crm') return { page: 'crm', params: { section: seg[1] || 'home', id: seg[2] || '', sub: seg[3] || '' } };
  if (seg[0] === 'agent-invite') return { page: 'agent-invite', params: { token: seg[1] || '' } };
  if (seg[0] === 'hr') return { page: 'hr', params: { section: seg[1] === 'employees' && seg[2] ? 'employee' : (seg[1] || 'home'), id: seg[1] === 'employees' ? (seg[2] || '') : '' } };
  if (seg[0] === 'hr-invite') return { page: 'hr-invite', params: { token: seg[1] || '' } };
  if (seg[0] === 'schedule') return { page: 'schedule', params: { token: seg[1] || '' } };
  if (seg[0] === 'staff-feedback') return { page: 'staff-feedback', params: { id: seg[1] || '' } };
  return { page: seg[0], params: {} };
}
export const go = (path) => { if (location.hash === '#' + path) render(); else location.hash = path; };
export const homeFor = (u) => (u && u.role === 'Employee' ? '/hr' : isClientOnlyUser(u) ? '/orders' : '/dashboard');   // live40: clients land on Open Orders   // an HR-only login lives in HR
const RETURN_KEY = 'cla-portal-new:return';
export function savedFileReturn() {
  let back = '';
  try { back = sessionStorage.getItem(RETURN_KEY) || ''; } catch (e) { back = ''; }
  try { sessionStorage.removeItem(RETURN_KEY); } catch (e) { /* already gone */ }
  return /^#\/deals\/[\w-]+(\/[\w-]+)?$/.test(back) ? back : '';
}
export const dashLabel = (u) => isClientOnlyUser(u) ? 'Open Orders' : u.isAdmin ? 'Admin' : ({ 'Processor': 'Work Queue', 'Preprocessor': 'Work Queue', 'Sales Person': 'Team Dashboard', 'Sales Team': 'Team Dashboard', 'Transaction Coordinator': 'Dashboard', 'Buyer Agent': 'Transactions', 'Listing Agent': 'Transactions', 'Client-Buyer': 'My Closing', 'Client-Seller': 'My Closing', 'Outside user': 'My Files' }[u.role]);

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
export function navFor(u, dealId, unread, features = {}, ws = 'everything', demo = null) {
  if (ws === null) return [{ id: 'home', label: 'Home', href: '#/dashboard', cls: 'orders', beta: false }];   // neutral Home: nothing picked yet
  if (ws === 'hr') return hrNavFor(u);   // the HR workspace has its own menu (not part of Everything)
  const items = [];
  const add = (id, label, href, cls) => items.push({ id, label, href, cls });
  if (!isClientOnlyUser(u)) add('dashboard', dashLabel(u), '#/dashboard', 'orders');   // live40: no "My files" item for clients
  add('orders', u.role === 'Transaction Coordinator' ? 'Orders' : 'Open Orders', '#/orders', 'orders');
  if ((u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator') && modOn('tasks')) add('tasks', 'All Tasks', '#/tasks', 'task');
  if (canOpenTaskSetup(u, demo) && modOn('task-grid')) add('task-grid', 'Task Grid', '#/task-grid', 'task');
  if (u.isAdmin) { add('users/new', 'Create User', '#/users/new', 'documents'); add('users', 'User List', '#/users', 'documents'); add('teams', 'Teams', '#/teams', 'contact-us'); add('offices', 'Offices', '#/offices', 'contact-us'); }   // John, Nov 4: Admin > Offices (Admin / Super admin)
  if (features.crm && canUseCrm(u) && modOn('crm')) add('crm', 'CRM', '#/crm', 'contact-us');   // feature flag + CLA staff only (not TCs, not outside users)
  if (modOn('library')) add('library', 'Library', '#/library', 'documents');
  if (runsOrders(u) || u.isAdmin) add('activity', 'Activity Log', '#/activity', 'activity');
  if (canOpenTaskSetup(u, demo)) add('templates', 'Task Templates', '#/admin/templates', 'task');
  if (u.isAdmin) add('email-templates', 'Email Templates', '#/admin/email-templates', 'inbox');   // John, Nov 9: Admins build; staff select on a file
  if (runsOrders(u) || u.isAdmin || u.role === 'Transaction Coordinator') add('outbox', 'Reminder Outbox', '#/outbox', 'inbox');
  if (isFeedbackPilot(u, { demoActive: !!(demo && demo.active) }) ) add('staff-feedback', 'Portal feedback', '#/staff-feedback', 'inbox');
  if (canInviteAgents(u)) add('agent-invites', 'Agent Invites', '#/agent-invites', 'contact-us');   // John, Nov 4
  if (canManageModules(u)) add('modules', 'Modules', '#/modules', 'documents');
  if (canManageRoleAccess(u)) add('role-access', 'Role access', '#/role-access', 'documents');   // John, Nov 9: which roles see CRM / Accounting / HR (Super admin)
  if (canManageModules(u)) add('underwriters', 'Underwriter Splits', '#/underwriters', 'documents');   // John, Nov 3 call (Admin / Super admin)   // John, Nov 3: the Live switches (Admin / Super admin only)
  let out = items.map((n) => ({ ...n, beta: modBeta(n.id) }));
  if (ws === 'everything') return out.filter((n) => navInWs(n.id, ws));   // Everything keeps Portal and the other admin pages. Task Templates is Admin / Settings only.
  if (ws === 'crm') { const i = out.findIndex((n) => n.id === 'crm'); if (i >= 0) {   // the CRM workspace spells out its main sections
    const c = out[i].beta; const sub = [['crm-home', 'CRM Home', '#/crm', 'contact-us', c], ['crm-deals', 'Deals', '#/crm/deals', 'orders', c || modBeta('crm-deals'), 'crm-deals'],
      ['crm-contacts', 'Clients', '#/crm/contacts', 'contact-us', c], ['crm-leads', 'Leads', '#/crm/leads', 'contact-us', c], ['crm-calls', 'Calls', '#/crm/calls', 'task', c || modBeta('calls'), 'calls'],
      ['crm-templates', 'Email Templates', '#/crm/templates', 'documents', c]].filter((x) => !x[5] || modOn(x[5])).map(([id, label, href, cls, beta]) => ({ id, label, href, cls, beta }));
    out.splice(i, 1, ...sub); } }
  return out.filter((n) => navInWs(n.id, ws));
}

async function layout(u, view, route, ws = 'everything', prep = {}) {
  const api = await getAdapter();
  const dealId = route.page === 'deal' ? route.params.id : null;
  const dealRead = (view && view.deal) ? view.deal : (prep.deal !== undefined ? prep.deal : (dealId ? (api.readDeal ? api.readDeal(dealId) : api.getDeal(dealId)).catch(() => null) : null));
  const token = ++layoutToken;
  const [unread, deal, agentsLoaded] = await Promise.all([
    prep.unread !== undefined ? prep.unread : api.notificationCount(),
    dealRead,
    isOutside(u.role) && api.listMyAgents ? api.listMyAgents(dealId ? { dealId } : {}).catch(() => []) : [],
  ]);
  if (token === layoutToken) shellDeal = deal;   // voice panel: the order header already on screen
  const cnt = (tab) => html`<span class="tab-count" data-tab-count="${tab}" hidden></span>`;
  const HR_CUR = { home: 'hr-home', employees: 'hr-employees', employee: 'hr-employees', add: 'hr-add', departments: 'hr-departments', designations: 'hr-designations', me: 'hr-me', team: 'hr-team', settings: 'hr-settings', documents: 'hr-documents' };
  const navPage = route.page === 'admin/templates' ? 'templates' : route.page === 'admin/email-templates' ? 'email-templates' : route.page;
  const cur = navPage === 'hr' ? (HR_CUR[route.params.section] || '') : navPage === 'crm' && ws === 'crm' ? ({ home: 'crm-home', deals: 'crm-deals', contacts: 'crm-contacts', leads: 'crm-leads', calls: 'crm-calls', templates: 'crm-templates' }[route.params.section] || '') : (navPage === 'dashboard' && ws === null ? 'home' : navPage + (navPage === 'users' && route.params.mode === 'new' ? '/new' : ''));
  // card theme only: an inline SVG icon + the label in a span (shown as a tooltip in the icon-only sidebar); the link text stays the same
  const tc = themeOn(); const ICO = { 'hr-home': 'dashboard', 'hr-employees': 'users', 'hr-add': 'users/new', 'hr-departments': 'teams', 'hr-designations': 'templates', 'hr-me': 'contacts', 'hr-team': 'teams', 'hr-settings': 'modules', 'hr-documents': 'documents', home: 'dashboard', title: 'documents', 'crm-home': 'crm', 'crm-deals': 'orders', 'crm-contacts': 'contacts', 'crm-leads': 'users/new', 'crm-calls': 'closing', 'crm-templates': 'templates' };   // workspace menu items reuse the card-theme icons
  const lbl = (id, label) => (tc ? html`${icon(ICO[id] || id)}<span class="nav-label">${label}</span>` : label); const tip = (label, beta) => (tc || beta ? raw(` title="${esc(label)}${beta ? ` (${BETA_LABEL})` : ''}"`) : '');
  const betaTag = (id) => html`<span class="beta-badge" data-beta-badge="${id}" title="${BETA_LABEL}">Beta</span>`;
  const hrTip = (n) => (/^hr-/.test(n.id) ? raw(` title="${esc(n.label)}${n.beta ? ` (${BETA_LABEL})` : ''}" aria-label="${esc(n.label)}" data-tip="${esc(n.label)}" data-hr-nav="${n.id}"`) : tip(n.label, n.beta));   // John, Nov 4: HR icons get hover labels
  const core = navFor(u, null, 0, api.features || {}, ws, DEMO_VIEW).map((n) => html`<li class="nav-item"><a class="nav-link ${n.cls} ${n.id === cur || (n.id === 'orders' && route.page === 'orders') ? 'active' : ''}" href="${n.href}"${hrTip(n)}${n.beta ? raw(' data-beta-nav') : ''}>${lbl(n.id, n.label)}${n.beta ? betaTag(n.id) : ''}</a></li>`);
  const t = route.params.tab; const link = (tab, label, cls, beta) => html`<li class="nav-item"><a class="nav-link ${cls} ${t === tab && !(tab === 'accounting' && route.params.v === 'payoffs') ? 'active' : ''}" href="#/deals/${dealId}/${tab === 'overview' ? '' : tab}"${tip(label, beta)}${beta ? raw(' data-beta-nav') : ''}>${lbl(tab, label)}${beta ? betaTag(tab) : ''}${tab === 'inbox' && deal && deal.unread ? html`<span class="nav-badge">${deal.unread}</span>` : cnt(tab)}</a></li>`;
  // BUYER (Nov 4 call): plain tab names; no Contacts tab (the Overview lists the closing team) and no Agreements tab (they are to-dos now)
  const pureBuyer = deal && ['Client-Buyer', 'Client-Seller'].some((c) => (deal.myRoles || [deal.myRole]).includes(c)) && !(deal.myRoles || [deal.myRole]).some((r) => /Agent$/.test(r));   // seller mirror (Nov 4): a pure seller gets the same plain tabs
  const dealNav = deal && pureBuyer ? html`<li class="nav-sep">This file</li>${link('overview', 'Overview', 'orders')}${link('tasks', 'To-do list', 'task')}${link('spouse', 'Spouse', 'contact-us')}${link('inbox', 'Messages', 'inbox')}${link('documents', 'Documents', 'documents')}${link('closing', 'Closing appointment', 'task')}${link('activity', 'Activity', 'activity')}`
    : deal ? html`<li class="nav-sep">This file</li>${link('overview', 'File Overview', 'orders')}${link('tasks', 'Tasks', 'task')}${isStaff(u.role) ? link('spouse', 'Spouse', 'contact-us') : ''}${link('inbox', deal && isClient(deal.myRole) ? 'Messages' : 'Inbox', 'inbox')}${canUseGmail(u) && api.listDealEmails && api.mode === 'supabase' ? link('email', 'Email', 'inbox') : ''}${link('documents', 'Documents', 'documents')}${link('closing', 'Closing Date', 'task')}${link('contacts', 'Contacts', 'contact-us')}${link('agreements', 'Agreements', 'documents')}${link('activity', 'Activity', 'activity')}${(api.features || {}).accounting && acctCanRead(u) && modOn('accounting') ? html`${link('accounting', 'Accounting', 'documents', modBeta('accounting'))}${modOn('post-closing') ? html`<li class="nav-item"><a class="nav-link ${t === 'accounting' && route.params.v === 'postclosing' ? 'active' : ''}" href="#/deals/${dealId}/accounting?v=postclosing" data-nav-postclosing>Post-Closing</a></li>` : ''}${modOn('e-recording') ? html`<li class="nav-item"><a class="nav-link" href="#/deals/${dealId}/accounting?v=postclosing" data-nav-recording>E-Recording</a></li>` : ''}${canReachPayoffs(u) && modOn('payoffs') ? html`<li class="nav-item"><a class="nav-link payoffs ${t === 'accounting' && route.params.v === 'payoffs' ? 'active' : ''}" href="#/deals/${dealId}/accounting?v=payoffs" data-nav-payoffs${tip('Payoffs / HOA', modBeta('payoffs'))}>${lbl('accounting', 'Payoffs / HOA')}</a></li>` : ''}` : ''}${(api.features || {}).funding && fwpCanRead(u) && modOn('funding') ? link('funding', 'Funding', 'documents', modBeta('funding')) : ''}${(api.features || {}).wires && fwpCanRead(u) && modOn('wires') ? link('wires', 'Wires', 'documents', modBeta('wires')) : ''}${(api.features || {}).policy && fwpCanRead(u) && modOn('policy') ? link('policy', 'Final Policy', 'documents', modBeta('policy')) : ''}${(api.features || {}).title && titleCanRead(u) && modOn('title') ? html`<li class="nav-item"><a class="nav-link title-nav ${t === 'title' ? 'active' : ''}" href="#/deals/${dealId}/title" data-nav-title${tip('Title', modBeta('title'))}${modBeta('title') ? raw(' data-beta-nav') : ''}>${lbl('title', 'Title')}${modBeta('title') ? betaTag('title') : ''}</a></li>` : ''}` : '';   // John, Nov 4: Title sits directly under Payoffs / HOA (staff only)   // (buyer branch above)
  // Inside a file the portal menu starts closed for every role. The file name and file tabs stay. The button only shows or hides that menu.
  const fileNav = !!deal;
  const contact = isStaff(u.role) || hrOnly(u) ? '' : html`<li class="nav-item"><a class="nav-link contact-us ${route.page === 'contact-us' ? 'active' : ''}" href="#/contact-us"${tip('Contact Us')}>${lbl('contact-us', 'Contact Us')}</a></li>`;
  // John, Nov 4: the clients' "Your agent" card (buyer -> buyer's agent, seller -> listing agent); empty for staff and agents
  const agents = agentsLoaded;
  const agentCard = yourAgentHtml(agents);
  const sidebarHead = deal ? html`<a class="logo-home-link" href="#/deals/${deal.id}"><div class="order-heading-left"><span>${deal.fileNumber}</span></div><div class="map-div"><img class="map-pin" src="assets/img/map-icon-new.png" alt=""><p>${deal.street}<br>${deal.city}, ${deal.state}, ${deal.zip}</p></div></a>` : '';
  // John, Nov 4 call: order search in the sidebar (not in the CRM-only workspace or the neutral Home); inside an order non-admins get order-only items
  // Francis Nov 9: HR-only logins (and anyone in the HR workspace) get flat HR links — no More fold and no order search that always comes back empty.
  const sideSearchOn = !deal && ws !== null && ws !== 'crm' && ws !== 'hr' && !hrOnly(u); if (deal) noteRecent(u, deal.id);
  // CLIENT SHELL (John, Nov 4): the buyer / seller File Overview AND every file tab (To-do list, Messages, Documents, Closing appointment, Activity; the seller's
  // tabs too) use a light shell: white top bar with the CLA logo and a baby-blue rule, pill tabs in the page, no sidebar. Tab pages keep the "Your agent" card.
  if (view.tcPage || view.clientPage) return html`<div class="co-shell" data-client-shell${view.tcPage ? ' data-tc-shell' : ''}>
  <div class="co-top"><a href="#${homeFor(u)}" class="co-logo"><img src="assets/img/login-logo-new.png" alt="CLA Title &amp; Escrow"></a>
    <div class="co-topr"><button type="button" class="ghost" data-file-nav-toggle aria-expanded="false" aria-controls="global-nav">Show portal menu</button><a class="co-home" href="#${homeFor(u)}" data-co-home>${dashLabel(u)}</a>
      <div class="notif-wrap"><button class="bell" data-bell title="${unread} unread notification(s)" aria-label="Notifications"><img src="assets/img/bell_new.png" alt=""><span class="notification-num">${unread}</span></button>
        <div class="notif-dd" hidden><div class="notif-head"><strong>Notifications</strong><button class="linkish" data-readall>Mark all read</button></div><ul class="notif-list"><li class="muted">Loading&hellip;</li></ul></div></div>
      ${voiceMenuOn() ? voiceMenuHtml(voiceDeal(deal)) : ''}${VIEW_AS ? viewAsHtml(u) : ''}<div class="user-menu"><button class="user-btn" data-usermenu>Signed in as <b>${u.firstName} ${u.lastName}</b> <span class="role-tag" data-role-tag>${deal ? `${deal.myRoleLabel || deal.myRole} on this file` : fileRolesLabel(u.fileLabels || u.fileRoles)}</span> &#9662;</button>
        <ul class="user-dd" hidden><li><a href="#/profile">Profile Setting</a></li><li><a href="#/contact-us">Contact Us</a></li>${demoMenu(u)}${sessionStorage.getItem(LOCK_KEY) ? html`<li class="muted" data-locked-note>${VIEW_AS && VIEW_AS.viewing ? `Viewing as this person from ${VIEW_AS.owner.firstName} ${VIEW_AS.owner.lastName}'s admin link` : 'Test link: signed in as this person only'}</li>` : raw('<li><a href="#" data-signout>Logout</a></li>')}</ul></div></div></div>
  <div class="co-wrap"><div id="global-nav" data-global-nav hidden><ul class="nav nav-pills">${core}</ul></div><p class="welcome-title co-sr" data-site-name="CLA Portal Live Test">Welcome ${u.firstName} ${u.lastName} to CLA Portal Live Test</p>${demoBanner()}${view.clientPage && view.clientPage.tab && agentCard ? html`<div class="with-agent co-with-agent" data-with-agent><div id="view">${view.body}</div>${agentCard}</div>` : html`<div id="view">${view.body}</div>`}</div>
  <div class="footer-bar"><span><img src="assets/img/logo-icon.png" alt="" class="foot-logo"> Copyright 2026 C.L.A Title &amp; Escrow | All Rights Reserved.</span><span>Security / Privacy Policy</span></div></div>`;
  const topButtons = runsOrders(u) && (ws === 'portal' || ws === 'everything') ? html`<a class="green-btn" href="#/orders/new">Place Order</a>` : '';
  return html`
  <div class="topbar-main"><div class="topbar-inner">
    <a class="brand" href="#${homeFor(u)}"><img src="assets/img/logo-white.png" alt="CLA Title &amp; Escrow"></a><div class="topbar-tools">${usesWorkspaces(u) ? wsMenu(u, ws, api) : hrOnly(u) ? html`<div class="ws-wrap" data-ws-wrap><span class="ws-btn ws-static"><span class="ws-k">Workspace</span> <strong data-ws-current="hr">HR</strong></span></div>` : ''}${botsMenu(u)}${voiceMenuOn() ? voiceMenuHtml(voiceDeal(deal)) : ''}</div>
    <div class="topbar-right">${crmSearchOn(u, api) && (ws === 'crm' || ws === 'everything') ? raw(HEADER_SEARCH) : ''}${topButtons}
      <div class="notif-wrap"><button class="bell" data-bell title="${unread} unread notification(s)" aria-label="Notifications"><img src="assets/img/bell_new.png" alt=""><span class="notification-num">${unread}</span></button>
        <div class="notif-dd" hidden><div class="notif-head"><strong>Notifications</strong><button class="linkish" data-readall>Mark all read</button></div><ul class="notif-list"><li class="muted">Loading&hellip;</li></ul></div></div>
      ${VIEW_AS ? viewAsHtml(u) : ''}<div class="user-menu"><button class="user-btn" data-usermenu>${u.firstName} ${u.lastName} <span class="role-tag" data-role-tag>${isOutside(u.role) ? (deal ? `${deal.myRoleLabel || deal.myRole} on this file` : fileRolesLabel(u.fileLabels || u.fileRoles)) : roleLabel(u)}</span> &#9662;</button>
        <ul class="user-dd" hidden><li><a href="#/profile">Profile Setting</a></li>${demoMenu(u)}${sessionStorage.getItem(LOCK_KEY) ? html`<li class="muted" data-locked-note>${VIEW_AS && VIEW_AS.viewing ? `Viewing as this person from ${VIEW_AS.owner.firstName} ${VIEW_AS.owner.lastName}'s admin link` : 'Test link: signed in as this person only'}</li>` : raw('<li><a href="#" data-signout>Logout</a></li>')}</ul></div>
    </div></div></div>
  <div class="wrapper-main">
    <div class="left-bar">${deal ? orderPin() : sideSearchOn ? mainPin() : ''}<div class="logo">${sidebarHead}</div>${fileNav ? html`<button type="button" class="ghost file-nav-toggle" data-file-nav-toggle aria-expanded="false" aria-controls="global-nav">Show portal menu</button>` : ''}<div class="main-nav"><ul class="nav nav-pills"${fileNav ? raw(' data-order-only-nav') : ''}>${fileNav ? html`<li class="nav-global-wrap" id="global-nav" data-global-nav hidden><ul class="nav nav-pills">${core}${contact}</ul></li>${dealNav}` : sideSearchOn && !isStaff(u.role) ? moreWrap(u, html`${core}${contact}`) : html`${core}${contact}`}</ul></div></div>
    <div class="right-bar">
      <h1 class="welcome-title" data-site-name="CLA Portal Live Test">Welcome ${u.firstName} ${u.lastName} to CLA Portal Live Test</h1>
      ${view.crumbs ? html`<ol class="breadcrumb"><li><a href="#${homeFor(u)}"><img src="assets/img/bread-home.png" alt="">Home</a></li>${view.crumbs.map(([label, href], i) => html`<li class="${i === view.crumbs.length - 1 ? 'active' : ''}">${href ? html`<a href="${href}">${label}</a>` : label}</li>`)}</ol>` : ''}
      ${demoBanner()}
      ${deal && !view.noOrderHeader ? orderHeader(deal) : ''}${sideSearchOn && route.page === 'dashboard' ? homeSearch() : ''}
      ${betaBanner(route)}
      ${agentCard ? (deal ? html`<div class="with-agent" data-with-agent><div id="view">${view.body}</div>${agentCard}</div>` : html`<div class="with-agent agent-inline" data-with-agent data-agent-inline>${agentCard}<div id="view">${view.body}</div></div>`) : html`<div id="view">${view.body}</div>`}
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
function botsMenu(u) {
  if (!isFeedbackPilot(u, { demoActive: !!(typeof DEMO_VIEW !== 'undefined' && DEMO_VIEW && DEMO_VIEW.active), viewingAs: !!(typeof VIEW_AS !== 'undefined' && VIEW_AS && VIEW_AS.viewing) })) return '';
  const bots = botRegistry().filter((b) => b.configured);
  return html`<div class="bots-wrap" data-bots-wrap><button type="button" class="ws-btn" data-bots-btn aria-haspopup="menu" aria-expanded="false" aria-label="Bots"><span class="ws-k">Bots</span> <strong data-bots-current>Choose…</strong> &#9662;</button>
    <div class="ws-dd bots-dd" data-bots-dd hidden role="menu">${bots.map((b) => html`<button type="button" class="ws-opt" data-bot-open="${b.id}" role="menuitem"><span class="ws-opt-l">${b.label}</span><small>${b.detail}</small></button>`)}<button type="button" class="ws-opt" data-bots-hide role="menuitem"><span class="ws-opt-l">Hide</span><small>Close the open panel. Open it again from this menu.</small></button></div></div>`;
}
function wireBots() {
  const btn = $('[data-bots-btn]'); const dd = $('[data-bots-dd]'); if (!btn || !dd) return;
  btn.addEventListener('click', (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; btn.setAttribute('aria-expanded', dd.hidden ? 'false' : 'true'); });
  document.addEventListener('click', () => { dd.hidden = true; btn.setAttribute('aria-expanded', 'false'); }, { once: true });
  $$('[data-bot-open]', dd).forEach((el) => el.addEventListener('click', () => { dd.hidden = true; openStaffFeedbackPanel(); }));
  const hide = $('[data-bots-hide]', dd); if (hide) hide.addEventListener('click', () => { dd.hidden = true; hideStaffFeedbackPanel(); });
}
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

let rendering = 0; let VIEW_AS = null; let DEMO_VIEW = null; let PORTAL_MODE = 'mock'; let demoTimer = null; let VOICE_OK = false; let voiceCheckedFor = '';
let shellDeal = null; let layoutToken = 0;
function voiceMenuOn() { return VOICE_OK && PORTAL_MODE === 'supabase' && !(DEMO_VIEW && DEMO_VIEW.active); }
function voiceDeal(deal) { return deal ? { ...deal, phase: phaseOf(deal).badge } : null; }   // header fields only; voice-file.js picks the allowed ones
function demoBanner() {
  if (!DEMO_VIEW || !DEMO_VIEW.active) return '';
  const who = DEMO_VIEW.targetName || 'a demo user'; const role = DEMO_VIEW.portalRole || DEMO_VIEW.role || '';
  return html`<div class="dev-banner view-as-banner" data-view-as-banner role="status">Viewing as <strong>${who}</strong>${role ? html` (${role})` : ''}. Demo files only. Changes are turned off. <a href="#" data-view-as-stop>Back to my account</a></div>`;
}
function demoMenu(u) {
  return PORTAL_MODE === 'supabase' && u && u.role === 'Super admin' && u.isAdmin && !(DEMO_VIEW && DEMO_VIEW.active)
    ? html`<li><a href="#/demo" data-demo-mode>Demo mode</a></li>` : '';
}
function showRouteLoading(root) {
  if (!root) return;
  root.setAttribute('aria-busy', 'true');
  root.setAttribute('data-route-loading', '1');
  root.removeAttribute('data-content-ready');
  const note = document.createElement('p');
  note.className = 'dev-banner';
  note.setAttribute('data-loading-note', '');
  note.setAttribute('role', 'status');
  note.textContent = 'Loading this page.';
  const view = root.querySelector('#view');
  const host = view || root;
  host.textContent = '';
  host.appendChild(note);
  if (view) { view.setAttribute('aria-busy', 'true'); markOpenFileTab(root); }
}
function markOpenFileTab(root) {
  const route = parse();
  if (!route || route.page !== 'deal' || !route.params || !route.params.id) return;
  const tab = route.params.tab || 'overview';
  const id = route.params.id;
  root.querySelectorAll('a.nav-link').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.indexOf('#/deals/' + id) !== 0) return;
    const path = href.split('?')[0].replace(/^#\/?/, '').split('/').filter(Boolean);
    const linkTab = path[2] || 'overview';
    const v = new URLSearchParams(href.split('?')[1] || '').get('v') || '';
    a.classList.toggle('active', linkTab === tab && (tab !== 'accounting' || v === (route.params.v || '')));
  });
}
function nextPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}
function rememberCounts(api, dealId, userId, token) {
  const read = api.readOverview || api.getOrderOverview;
  if (!read || !dealId || !userId) return;
  Promise.resolve().then(() => read.call(api, dealId)).then(async (overview) => {
    if (token !== rendering) return;
    const root = $('#app');
    if (!root || root.getAttribute('data-route-user') !== userId || root.getAttribute('data-route-deal') !== dealId) return;
    const counts = (overview && overview.counts) || {};
    ['tasks', 'inbox', 'documents', 'activity'].forEach((tab) => {
      const slot = root.querySelector('[data-tab-count="' + tab + '"]');
      if (!slot) return;
      const n = counts[tab];
      if (n == null || (tab === 'inbox' && !(Number(n) > 0))) { slot.hidden = true; slot.textContent = ''; return; }
      slot.hidden = false;
      slot.textContent = String(n);
    });
    const routeNow = parse();
    const onEmail = routeNow.page === 'deal' && routeNow.params && routeNow.params.id === dealId && routeNow.params.tab === 'email';
    let emailN = counts.email;
    if (onEmail && api.fileEmailUnreadCount) {
      try { emailN = await api.fileEmailUnreadCount(dealId); } catch (e) { emailN = 0; }
    }
    if (token !== rendering) return;
    const still = $('#app');
    if (!still || still.getAttribute('data-route-user') !== userId || still.getAttribute('data-route-deal') !== dealId) return;
    const emailSlot = still.querySelector('[data-tab-count="email"]');
    if (emailSlot) {
      if (!(Number(emailN) > 0)) { emailSlot.hidden = true; emailSlot.textContent = ''; }
      else { emailSlot.hidden = false; emailSlot.textContent = String(emailN); }
    }
  }).catch(() => {});
}
export async function render() {
  const my = ++rendering; applyTheme(); const root = $('#app'); showRouteLoading(root); await nextPaint(); if (my !== rendering) return;
  const api = await getAdapter(); const route = parse(); closeModal();
  PORTAL_MODE = api.mode || 'mock';
  const authAt = api.authGeneration ? api.authGeneration() : null;
  const replaced = () => my !== rendering;
  const personMoved = () => authAt != null && api.authGeneration && api.authGeneration() !== authAt;
  const keepCurrent = () => {
    if (replaced()) return false;
    if (personMoved()) { render(); return false; }
    return true;
  };
  const fileHint = route.page === 'deal' ? { dealId: route.params.id, tab: route.params.tab || 'overview', gated: !!routeModule(route) } : null;
  const tabFlight = fileHint && !fileHint.gated ? prefetchDealTab(fileHint.tab, route.params.sub) : null;
  if (tabFlight) tabFlight.catch(() => {});
  let navStart = null;
  let u = null;
  if (api.beginNavigation) {
    navStart = api.beginNavigation(fileHint);
    const started = await navStart;
    if (my !== rendering) return;
    u = started && started.user || null;
    DEMO_VIEW = started ? await started.demo : null;
    if (my !== rendering) return;
  } else {
    u = await api.getSession();
    if (my !== rendering) return;
    DEMO_VIEW = (u && api.demoViewStatus) ? await api.demoViewStatus().then((d) => d || null).catch(() => null) : null;
    if (my !== rendering) return;
  }
  if (u && DEMO_VIEW && DEMO_VIEW.active) {
    if (api.beginNavigation) { const again = await api.beginNavigation(fileHint); if (my !== rendering) return; u = again && again.user || null; navStart = Promise.resolve(again); }
    else { u = await api.getSession(); if (my !== rendering) return; }
  }
  // LOCKED LOGIN LINK (John, Nov 4): ?as=<token> signs in as that one fake user and locks this tab to them (data/locked-links.js)
  const asTok = new URLSearchParams(location.search).get('as');
  if (api.mode === 'supabase') {
    try { sessionStorage.removeItem(LOCK_KEY); localStorage.removeItem('cla-portal-new:data:v30'); } catch (e) { /* supabase mode never keeps a mock session or fixture */ }
    if (asTok != null) history.replaceState(null, '', location.pathname + location.hash);
  }
  if (u && u.unprovisioned && api.mode === 'supabase') {
    syncFeedback(null); stopVoiceNow();
    root.innerHTML = toText(html`<div class="login-page" data-unprovisioned><div class="login-card"><h2 data-site-name="CLA Portal Live Test">CLA Portal Live Test</h2><p class="dev-banner" data-test-environment>TEST ENVIRONMENT</p><p>This login is not provisioned. An administrator assigns the role. Registration is closed, and this screen does not create an account.</p><p><a href="#" data-signout>Sign out</a></p></div></div>`);
    const out = root.querySelector('[data-signout]'); if (out) out.addEventListener('click', async (e) => { e.preventDefault(); await api.signOut(); location.hash = '#/login'; location.reload(); });
    return;
  }
  if (asTok != null && api.mode !== 'supabase') { const lk = lockForToken(asTok); let okLink = false;
    if (lk) { try { await api.pickPerson(lk.user); sessionStorage.setItem(LOCK_KEY, JSON.stringify(lk)); okLink = true; } catch (e) { okLink = false; } }
    if (!okLink) { sessionStorage.removeItem(LOCK_KEY); try { await api.signOut(); } catch (e) { /* none */ } syncFeedback(null); stopVoiceNow(); root.innerHTML = toText(html`<div class="box-title" data-bad-link><h2>This test link is not valid</h2></div><p>Ask for a new link.</p>`); return; }
    let land = safeLanding(new URLSearchParams(location.search).get('file')); if (land) { try { await api.getDeal(land); } catch (e) { land = null; } }   // landing only, never wider access
    const qs = new URLSearchParams(location.search); const sec = qs.get('section') ? sectionHash(qs.get('section'), qs.get('file')) : null;   // section links pick the first page only
    if (typeof clearSessionWs === 'function') clearSessionWs();
    if (replaced()) return;
    history.replaceState(null, '', location.pathname + (sec || (land ? `#/deals/${land}` : (location.hash || '#/dashboard')))); return render(); }   // re-render on the landing route (replaceState fires no hashchange)
  const lock = api.mode === 'supabase' ? null : readLock(sessionStorage); VIEW_AS = null;
  // VIEW AS (Super admin locked link only, John Nov 4): the owner of the link decides; a stored viewAs on anyone else's lock is dropped
  if (lock && api.mode !== 'supabase') { let people = []; try { people = await api.listDevUsers(); } catch (e) { people = []; }
    const owner = people.find((x) => x.id === lock.user);
    if (lock.viewAs && !canViewAs(owner)) { delete lock.viewAs; sessionStorage.setItem(LOCK_KEY, JSON.stringify(lock)); }
    if (canViewAs(owner)) VIEW_AS = { owner, people, viewing: lock.viewAs || null }; }
  const lockedId = lock ? effectiveLockUser(lock, VIEW_AS ? VIEW_AS.owner : null) : null;
  if (lockedId && (!u || u.id !== lockedId)) { try { await api.pickPerson(lockedId); } catch (e) { /* removed user */ } u = await api.getSession();
    if (my !== rendering) return;
    if (!u || u.id !== lockedId) { root.innerHTML = toText(html`<div class="box-title" data-bad-link><h2>This test link is no longer valid</h2></div>`); return; } }
  if (replaced()) return;
  if (!u && !PUBLIC.has(route.page)) { syncFeedback(null); stopVoiceNow(); if (route.page === 'deal') { try { sessionStorage.setItem(RETURN_KEY, location.hash); } catch (e) { /* the next signed-in render stays on home */ } } location.hash = '#/login'; return; }   // invite deep link: back to the order after sign-in
  const recovery = api.mode === 'supabase' && sessionStorage.getItem('cla-portal-recovery') === '1';
  if (recovery && route.page !== 'login') { location.hash = '#/login'; return; }
  if (u && route.page === 'login' && !recovery) { const back = savedFileReturn(); location.hash = back || ('#' + homeFor(u)); return; }
  if (u && hrOnly(u) && route.page === 'dashboard') { location.hash = '#/hr'; return; }   // HR-only login: HR is home
  if (u && isClientOnlyUser(u) && route.page === 'dashboard') { location.replace('#/orders'); return; }   // live40 (John, Nov 5): clients land on Open Orders, no My files page   // HR-only login: HR is home
  if (route.page === 'templates') { const moved = legacyTemplatesHash(location.hash); if (moved) { location.replace(moved); return; } }   // old Task Templates links, including ?tab=switches and ?tab=admin
  if (my !== rendering) return;
  const stamp = u ? { id: u.id, role: u.role || '', demo: !!u.isDemo } : null;
  const modP = navStart
    ? navStart.then((s) => (s && s.mods) || ((u && api.getModuleAccess) ? api.getModuleAccess().then((m) => m || {}).catch(() => ({})) : {}))
    : ((u && api.getModuleAccess) ? api.getModuleAccess().then((m) => m || {}).catch(() => ({})) : Promise.resolve({}));
  const hrP = navStart ? navStart.then((s) => (s && s.hr) || {}).catch(() => ({})) : Promise.resolve(null);
  let voiceP = Promise.resolve();
  if (api.mode === 'supabase' && canRequestVoice(u) && !(DEMO_VIEW && DEMO_VIEW.active) && api.requestVoicePass) {
    if (voiceCheckedFor !== u.id) { voiceCheckedFor = u.id; voiceP = api.requestVoicePass('check').then((chk) => { VOICE_OK = !!(chk.ok && chk.data && chk.data.allowed === true); }).catch(() => { VOICE_OK = false; }); }
  } else { VOICE_OK = false; if (!u) voiceCheckedFor = ''; }
  const earlyMod = u ? routeModule(route) : null;
  const earlyFile = !!(u && route.page === 'deal' && !earlyMod && routeAllowed(u, route, { locked: !!lockedId, demo: DEMO_VIEW }));
  const unreadP = u && api.notificationCount ? api.notificationCount().catch(() => 0) : Promise.resolve(0);
  if (earlyFile) {
    const id = route.params.id; const tab = route.params.tab || 'overview';
    // Francis, Nov 9: Contacts needs participants; shell would paint an empty Contacts tab.
    const staffShell = tab !== 'overview' && tab !== 'contacts' && api.readFileShell && u.role !== 'Outside user';
    if (staffShell) {
      api.readFileShell(id).catch(() => null);
      if (tab === 'tasks' && api.listTasks) api.listTasks(id).catch(() => null);
      if (tab === 'documents' && api.listDocuments) api.listDocuments(id).catch(() => null);
    } else if (api.readDeal) {
      api.readDeal(id).catch(() => null);
      if (tab === 'overview' && api.readOverview) api.readOverview(id).catch(() => null);
    }
  }
  const mods = await modP;
  if (replaced()) return;
  if (u && api.getModuleAccess && authAt == null) {
    let now = null;
    try { now = await api.getSession(); } catch (e) { now = null; }
    if (!keepCurrent()) return;
    if (!now || now.id !== stamp.id || (now.role || '') !== stamp.role || !!now.isDemo !== stamp.demo) return render();
  }
  if (!keepCurrent()) return;
  setModuleMap(mods);   // module switches for the person now signed in, after view-as and the locked link
  const tasksAllowed = !!(u && route.page === 'tasks' && modOn('tasks') && routeAllowed(u, route, { locked: !!lockedId, demo: DEMO_VIEW }) && api.listAllTasks);
  if (tasksAllowed) api.listAllTasks({ fileStatus: 'All' }).catch(() => {});
  if (u && u.isAdmin && route.page === 'task-grid' && modOn('task-grid') && routeAllowed(u, route, { locked: !!lockedId, demo: DEMO_VIEW }) && api.getTaskGrid) {
    const asked = new URLSearchParams((location.hash.split('?')[1]) || '').get('s');
    const fs = ['Open', 'On Hold', 'Closed', 'All'].includes(asked) ? asked : 'Open';
    api.getTaskGrid({ fileStatus: fs }).catch(() => {});
  }
  if (u && u.isAdmin && route.page === 'tasks' && modOn('task-grid') && pages['task-grid']) pages['task-grid']().catch(() => {});
  const [extra] = await Promise.all([hrP, voiceP]);
  if (replaced()) return;
  if (extra && u) u = { ...u, ...extra };
  if (!keepCurrent()) return;
  const voiceBlocked = route.page === 'voice-demo' && !voiceRouteOk(u, { locked: !!lockedId, demo: DEMO_VIEW, mode: api.mode });
  const settle = () => {
    if (my !== rendering) return;
    root.removeAttribute('aria-busy');
    root.removeAttribute('data-route-loading');
    root.removeAttribute('data-content-ready');
    const tab = route.page === 'deal' ? (route.params.tab || 'overview') : '';
    const view = root.querySelector('#view') || root;
    const failed = !!(view.querySelector('.err-text, [data-route-refused]'));
    const genNow = api.authGeneration ? api.authGeneration() : null;
    const samePerson = !!u && !!u.id && (authAt == null || genNow === authAt);
    const text = view.textContent || '';
    const drew = tab === 'tasks' ? text.includes('All Tasks') : tab === 'documents' ? text.includes('Documents & Files') : false;
    const allTasksReady = route.page === 'tasks' && view.querySelector('[data-all-tasks-ready]');
    const gridReady = route.page === 'task-grid' && view.querySelector('[data-task-grid-ready]');
    if (!failed && samePerson && allTasksReady) root.setAttribute('data-content-ready', 'all-tasks');
    else if (!failed && samePerson && gridReady) root.setAttribute('data-content-ready', 'task-grid');
    else if (!failed && samePerson && drew && (tab === 'tasks' || tab === 'documents')) root.setAttribute('data-content-ready', tab);
    if (u && u.id) root.setAttribute('data-route-user', u.id); else root.removeAttribute('data-route-user');
    if (u && route.page === 'deal') { root.setAttribute('data-route-deal', route.params.id); rememberCounts(api, route.params.id, u.id, my); } else root.removeAttribute('data-route-deal');
  };
  if (voiceBlocked || !routeAllowed(u, route, { locked: !!lockedId, demo: DEMO_VIEW })) {   // not part of this user's portal: refused for menu AND typed URLs
    if (!u) { location.hash = '#/login'; return; }
    const setup = route.page === 'templates' || route.page === 'admin/templates' || route.page === 'admin/email-templates' || route.page === 'task-grid';
    const refused = setup ? 'You are not authorized to open this page.' : route.page === 'crm' ? 'The CRM is for CLA staff only.' : route.page === 'hr' ? 'HR is not available for your account. You are still in your own portal.' : 'That section is not available for your account. You are still in your own portal.';
    const refusedShell = await layout(u, { body: html`<div class="box-title" data-route-refused><h2>${setup ? 'Not authorized' : 'Not available'}</h2></div><p data-refused-msg>${refused}</p>` }, route, hrOnly(u) ? 'hr' : 'everything');
    if (my !== rendering) return; root.innerHTML = toText(refusedShell); wireChrome(u); settle(); return; }
  let ws = u ? currentWs(u) : 'everything';
  if (u && usesWorkspaces(u)) { const rw = routeWs(route);   // deep link: auto-switch to that link's workspace
    if (rw === 'hr') { if (ws !== 'hr' && hrVisible(u)) { setWs(u, 'hr'); ws = 'hr'; } }   // HR is not part of Everything: an HR link always opens HR
    else if (rw && ws !== 'everything' && ws !== rw) { const t = u.isAdmin ? rw : 'everything'; setWs(u, t); ws = t; }   // a non-admin leaving HR goes back to their usual portal
    if (route.page === 'dashboard' && ws && ws !== 'portal' && ws !== 'everything') { location.hash = '#' + wsById(ws).home; return; }
    if (route.page === 'dashboard' && ws === null) { const v = neutralHome(u, api); if (my !== rendering) return; const homeShell = await layout(u, v, route, ws); if (my !== rendering) return; root.innerHTML = toText(homeShell); wireChrome(u); document.title = 'Home | CLA Portal Live Test'; settle(); return; } }
  const modId = u ? routeModule(route) : null;
  const loader = (FLAGGED[route.page] && !(api.features || {})[FLAGGED[route.page]]) || (route.page === 'deal' && route.params.tab === 'accounting' && !(api.features || {}).accounting) || (modId && !modOn(modId)) ? null : pages[route.page];   // a module that is not Live (beta): Page not found for everyone but Admins   // Accounting tab: Page not found when the flag is off
  if (!loader) { const missingShell = await layout(u, { body: html`<div class="box-title"><h2>Page not found</h2></div><p>That page does not exist.</p>` }, route, ws); if (my !== rendering) return; root.innerHTML = toText(missingShell); wireChrome(u); settle(); return; }
  const mod = await loader(); let view;
  try { view = await mod.render({ api, user: u, params: route.params, refresh: render, go }); }
  catch (e) {
    if (!keepCurrent()) return;
    view = { crumbs: [['Not available']], body: html`<div class="box-title"><h2>Not available</h2></div><p class="err-text">${e.message}</p><p><a class="back-btn" href="#${homeFor(u)}">Back</a></p>` };
  }
  if (!keepCurrent()) return;
  if (PUBLIC.has(route.page)) { stopVoiceNow(); root.innerHTML = toText(view.body); syncFeedback(u); }
  else { let shell; try { shell = await layout(u, view, route, ws, { unread: unreadP }); } catch (e) { if (replaced()) return; if (personMoved()) return render(); if (/sign in/i.test(e.message || '')) { stopVoiceNow(); location.hash = '#/login'; return; } throw e; }   // session ended mid-render
    if (!keepCurrent()) return;
    root.innerHTML = toText(shell); wireChrome(u); }
  settle();
  document.title = (view.title ? view.title + ' | ' : '') + 'CLA Portal Live Test';
  if (view.mount) view.mount($('#view') || root, { api, user: u, refresh: render, go });
}
// Nov 3 (b), Zoho video 7: CRM global search in the header (CLA staff with the CRM only; the module loads only then)
const HEADER_SEARCH = `<div class="crm-global-search" data-global-search-wrap style="position:relative;display:inline-block"><input type="search" data-global-search placeholder="Search CRM (name, email, phone)" aria-label="Search the CRM" autocomplete="off" maxlength="100"><div data-global-search-dd hidden style="position:absolute;right:0;top:100%;z-index:50;background:#fff;color:#222;min-width:420px;max-height:70vh;overflow:auto;border:1px solid #ccc;padding:6px;text-align:left"></div></div><span data-crm-create-slot></span>`;
const crmSearchOn = (u, api) => !!(u && (api.features || {}).crm && canUseCrm(u) && modOn('crm'));
// VIEW AS dropdown (Super admin locked link only): every active fake user; picking the owner goes back to them
function viewAsHtml(u) {
  const o = VIEW_AS.owner; const label = (x) => `${x.firstName} ${x.lastName} \u2014 ${isOutside(x.role) ? accountTypeLabel(x) : x.role}`;
  return html`<label class="view-as" data-view-as-wrap title="Super admin only: view the portal as another fake user"><span class="small">View as</span>
    <select data-view-as aria-label="View as"><option value="${o.id}"${u.id === o.id ? ' selected' : ''}>${o.firstName} ${o.lastName} (you, Super admin)</option>${VIEW_AS.people.filter((x) => x.id !== o.id).map((x) => html`<option value="${x.id}"${u.id === x.id ? ' selected' : ''}>${label(x)}</option>`)}</select></label>`;
}
function wireViewAs() {
  const sel = $('[data-view-as]'); if (!sel || !VIEW_AS) return;
  sel.addEventListener('change', async () => { stopVoiceNow(); const lock = readLock(sessionStorage); if (!lock || !VIEW_AS) return; const id = sel.value;
    if (id === lock.user) delete lock.viewAs; else lock.viewAs = id;
    sessionStorage.setItem(LOCK_KEY, JSON.stringify(lock)); const api = await getAdapter(); await api.pickPerson(id); clearSessionWs();
    if (location.hash === '#/dashboard') render(); else location.hash = '#/dashboard'; });
}
function wireFileNav() {
  const btn = $('[data-file-nav-toggle]'); const box = $('[data-global-nav]'); if (!btn || !box) return;
  const apply = (open) => { box.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.textContent = open ? 'Hide portal menu' : 'Show portal menu'; };
  apply(false);
  btn.addEventListener('click', (e) => { e.preventDefault(); apply(box.hidden); });
}
function syncFeedback(person) {
  syncStaffFeedbackWidget({ user: person || null, demoActive: !!(DEMO_VIEW && DEMO_VIEW.active), viewingAs: !!(VIEW_AS && VIEW_AS.viewing), getApi: getAdapter });
}
function wireChrome(u) {
  syncFeedback(u);
  wireBots();
  prepareVoiceShell({ userId: u && u.id, dealId: shellDeal && shellDeal.id });   // another file, person or role stops the microphone
  getAdapter().then((api) => mountVoiceChrome($('#app'), { api, deal: voiceMenuOn() ? voiceDeal(shellDeal) : null, enabled: voiceMenuOn() }));
  wireFileNav(); wireViewAs(); startHeartbeat(u);
  const stop = $('[data-view-as-stop]');
  if (stop) stop.addEventListener('click', async (e) => { e.preventDefault(); stopVoiceNow(); const api = await getAdapter(); if (api.stopDemoView) { try { await api.stopDemoView(); } catch (err) { toast(err.message); return; } } if (demoTimer) clearTimeout(demoTimer); location.hash = '#/dashboard'; render(); });
  if (demoTimer) clearTimeout(demoTimer);
  if (DEMO_VIEW && DEMO_VIEW.active && DEMO_VIEW.expiresAt) { const ms = new Date(DEMO_VIEW.expiresAt).getTime() - Date.now(); demoTimer = setTimeout(() => render(), Math.min(Math.max(ms + 250, 1000), 30 * 60 * 1000)); }
  getAdapter().then((api) => { if (crmSearchOn(u, api) && $('[data-global-search]')) {
    import('./pages/crm-search.js?v=202611132000').then((m) => m.wireHeaderSearch(api));
    import('./pages/crm-janine.js?v=202611131900').then((m) => m.mountHeaderCreate(u));
  } });
  const btn = $('[data-usermenu]'); const dd = $('.user-dd');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; });
  document.addEventListener('click', () => { if (dd) dd.hidden = true; }, { once: true });
  wireBell(); wireWs(u); getAdapter().then((api) => wireSideSearch(api, u, go));
  const so = $('[data-signout]'); if (so) so.addEventListener('click', async (e) => { e.preventDefault(); stopVoiceNow(); const api = await getAdapter(); clearSessionWs(); stopHeartbeat(); if (api.hrSessionEnd) { try { await api.hrSessionEnd('logout'); } catch (er) { /* best effort */ } } await api.signOut(); location.hash = '#/login'; });
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
let lastHash = location.hash; let bounce = false; let fromPop = false;
window.addEventListener('popstate', () => { fromPop = true; });
window.addEventListener('hashchange', () => { if (bounce) { bounce = false; fromPop = false; return; }
  const popped = fromPop; fromPop = false;
  const here = (location.hash || '').split('?')[0];
  if (popped && /^#\/crm\/(templates\/.+|signature)$/.test((lastHash || '').split('?')[0]) && (here === '#/crm' || here === '#/crm/home')) {
    let dest = '#/crm/templates'; try { dest = sessionStorage.getItem('cla-crm-templates-list') || dest; } catch (e) { /* private mode */ }
    if (!dest.startsWith('#/crm/templates')) dest = '#/crm/templates';
    history.replaceState(null, '', location.pathname + location.search + dest); lastHash = dest; render(); return; }
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
