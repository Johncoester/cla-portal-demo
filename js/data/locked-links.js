/* locked-links.js : ONE LOGIN LINK PER FAKE USER (John, Nov 4). FAKE DATA ONLY, mock mode only.
 * A link like  https://johncoester.github.io/cla-portal-demo/?as=<token>&file=deal-1  signs the visitor in as that one fake user and LOCKS the
 * browser tab to them: no user picker, no switch user, and routes outside that user's own portal are refused (routeAllowed below, enforced in app.js).
 * Switching to another user needs a different link. Tokens are random, not names; they are NOT secrets (this is a public static demo with fake data,
 * anyone reading the source can see them). The same route guard applies to everyone.
 * NO PICKER ON THE PUBLIC DEMO (John, Nov 4, live28: "live"): the plain URL (no ?as=) shows only "This is a CLA Title test portal. Please use the link
 * you were sent." The fake-user dropdown is shown ONLY to a test harness that sets window.CLA_DEV_PICKER = true before the page loads (tools/ui-*.js,
 * qa-deep, e2e), or when a config sets devPicker: true. deploy/demo-config.js sets devPicker: false, which wins over everything (even the harness flag).
 * VIEW AS (Super admin only): inside a locked link whose OWNER is a Super admin (King John), a "View as" dropdown switches the tab to any fake user and
 * back; the route guard then applies to the person being viewed. Any other locked link (Adam Admin included) never gets it, and a stored viewAs on a
 * lock whose owner is not a Super admin is ignored and cleared (app.js). */
import { runsOrders, isStaff, isOutside } from './constants.js?v=202611061842';
import { titleCanRead } from './title.js?v=202611061842';
import { fwpCanRead } from './funding-wire-policy.js?v=202611061842';   // John, Nov 4: order > Title route guard
import { canUseCrm } from './crm.js?v=202611061842';
import { canInviteAgents } from './agent-profile.js?v=202611061842';
import { canManageModules } from './modules.js?v=202611061842';
import { hrSectionAllowed } from './hr.js?v=202611061842';
import { canManageOffices } from './offices.js?v=202611061842';

export const LOCK_KEY = 'cla-portal-new:locked:v1';
export function devPickerOn(w = (typeof window !== 'undefined' ? window : {})) {
  const c = (w && w.CLA_PORTAL_CONFIG) || {};
  if (c.devPicker === false) return false;            // the public demo config: never
  return c.devPicker === true || !!(w && w.CLA_DEV_PICKER === true);   // local config opt-in, or a test harness init script
}
export const PLAIN_URL_NOTICE = 'This is a CLA Title test portal. Please use the link you were sent.';
export const canViewAs = (owner) => !!owner && owner.role === 'Super admin' && owner.status !== 'removed';
// the person the locked tab acts as: the viewed user only when the lock owner may View as, else the owner
export const effectiveLockUser = (lock, owner) => (!lock ? null : lock.viewAs && canViewAs(owner) ? lock.viewAs : lock.user);
export const LINK_TOKENS = {
  '8f35592f04f1ff466320a8fe': 'u-proc', 'b6662f52b1113fb211268fc3': 'u-preproc', '0647edc4ee2a4d029a0f8930': 'u-sp', '1d23d39566522fce5c6952bd': 'u-team', '3fbd6a653b1b49e5ae4bd016': 'u-tc',
  'f1fefad2347ba878391dd44d': 'u-bagent', '9dd9de8b9c327645419f86bb': 'u-lagent', '6279357492dca5e12fc800d9': 'u-buyer', '6e7d6ca958d6fb3b4285894d': 'u-seller',
  'c356ab42259b4c120f77c9d3': 'u-multi', 'd5be9004fe1a25635731fc06': 'u-selfrep', '3455a01bbb58d0a8fc801ec9': 'u-adam', '50f70c55b90611bcd9a49ce1': 'u-admin', 'f0678aacef75b9ab555e8bbc': 'u-tc2',
  'd9324aeb920aff3bb132baaf': 'u-hr1', 'c648b06c6b1da945bae4cc6c': 'u-ph1',   // HR (Nov 4): Hana HR-Manager, Pia Processor-PH (HR-only 'Employee' logins; fake, not secrets)
};
// LANDING FILE (John, Nov 4, file-first): an optional  &file=<deal id>  only picks the FIRST page (that file's view). It never widens access:
// the token alone decides the person; the file must be one the person is on (the adapter's getDeal refuses others), and the person can still
// move to their own other files and task list. The role shown on a file is the person's role(s) ON THAT FILE.
export const lockForToken = (t) => (userForToken(t) ? { user: userForToken(t) } : null);
export const safeLanding = (f) => (typeof f === 'string' && /^deal-[\w-]{1,40}$/.test(f) ? f : null);
export const readLock = (store) => { try { const v = JSON.parse(store.getItem(LOCK_KEY) || 'null'); return v && v.user ? v : null; } catch (e) { return null; } };
export const userForToken = (t) => (typeof t === 'string' && Object.prototype.hasOwnProperty.call(LINK_TOKENS, t) ? LINK_TOKENS[t] : null);
export const tokenFor = (userId) => Object.keys(LINK_TOKENS).find((t) => LINK_TOKENS[t] === userId) || null;

// PAYOFFS ROUTES (live28, John Nov 4): the Qualia Payoffs / Taxes & Prorations / Other Contacts views of the Accounting tab are for Processors and
// admins only. Agents, clients and Transaction Coordinators (and Sales) are refused these URLs; TCs keep Caroline's read-only Accounting elsewhere.
export const PAYOFF_VIEWS = ['payoffs', 'taxes', 'othercontacts'];
export const canReachPayoffs = (u) => !!u && u.status !== 'removed' && !u.accountRole && (!!u.isAdmin || runsOrders(u));
// ROUTE GUARD (every user, locked or not): a page is reachable only if it belongs to that user's portal (the same rules as the menu in app.js navFor).
export function routeAllowed(u, route, { locked = false } = {}) {
  const p = route.page;
  if (p === 'schedule') return true;                                   // public closing-time link
  if (p === 'agent-invite') return !locked;   // one-time agent setup page: never inside a locked test-link session
  if (p === 'hr-invite') return !locked;      // HR: the employee's one-time login setup page, never inside a locked test-link session
  if (p === 'login') return !locked;
  if (!u) return false;
  // HR WORKSPACE (John + Francis, Nov 4): outside users (agents, clients; every outside tester link) NEVER reach HR. Everyone else needs an HR role
  // (Super admin, HR manager, or an employee record) and the section must fit it; the HR module switch is checked on top in app.js (routeModule 'hr').
  if (p === 'hr') return !isOutside(u.role) && !u.accountRole && hrSectionAllowed(u, (route.params && route.params.section) || 'home');
  // an HR-only login (account role 'Employee') has no orders, CRM or admin: HR and their own Profile Setting only
  if (u.role === 'Employee') return p === 'profile' || p === 'dashboard';   // dashboard = redirected to #/hr by app.js
  if (p === 'deal' && route.params && route.params.tab === 'accounting' && PAYOFF_VIEWS.includes(route.params.v)) return canReachPayoffs(u);
  if (p === 'deal' && route.params && route.params.tab === 'title') return titleCanRead(u);   // John, Nov 4: the Title module is CLA staff only (never an agent / client / tester link for one)
  if (['dashboard', 'orders', 'deal', 'profile', 'contact-us'].includes(p)) return true;   // deal access itself is checked per file by the adapter
  if (p === 'crm') return canUseCrm(u);
  if (p === 'users' || p === 'teams') return !!u.isAdmin;
  if (p === 'offices') return canManageOffices(u);   // John, Nov 4: Admin > Offices (Admin / Super admin only; others get "Not available")
  if (p === 'modules' || p === 'underwriters') return canManageModules(u);
  if (p === 'orders/new' || p === 'task-grid' || p === 'activity') return runsOrders(u) || !!u.isAdmin;
  if (p === 'tasks') return !!u.isAdmin || isStaff(u.role) || u.role === 'Transaction Coordinator';
  if (p === 'templates' || p === 'outbox') return runsOrders(u) || !!u.isAdmin || u.role === 'Transaction Coordinator';
  if (p === 'agent-invites') return canInviteAgents(u);
  if (p === 'library') return true;
  if (p === 'demo') return u.role === 'Super admin' && !!u.isAdmin && (u.status || 'active') === 'active';
  return false;
}
// SECTION LINKS (John, Nov 4): &section=<name> (+ optional &file=<deal>) opens one section directly. A section only picks the first page:
// app.js still runs routeAllowed + the module / feature checks, so a section the person cannot see shows a polite "Not available" in their own portal.
// The workspace switcher (Admin / Super admin) auto-selects the matching workspace from the route (workspace.js routeWs).
const FILE_TABS = ['overview', 'tasks', 'inbox', 'documents', 'closing', 'contacts', 'agreements', 'activity', 'accounting', 'title'];
const ACCT_VIEWS = ['charges', 'cd', 'cddetails', 'prorations', 'payments', 'ledger', 'alta', 'history', 'payoffs', 'taxes', 'othercontacts'];   // + payoffs / taxes / othercontacts (live28: Qualia Payoffs, Taxes & Prorations, Other Contacts)
export const SECTIONS = { home: '/dashboard', 'my-tasks': '/dashboard', orders: '/orders', 'place-order': '/orders/new', tasks: '/tasks', 'task-grid': '/task-grid', library: '/library',
  crm: '/crm', 'crm-deals': '/crm/deals', 'crm-leads': '/crm/leads', 'crm-calls': '/crm', 'crm-templates': '/crm/templates', 'crm-pipeline': '/crm/pipeline', 'crm-reports': '/crm/reports',
  admin: '/users', users: '/users', 'create-user': '/users/new', teams: '/teams', 'admin-offices': '/offices', modules: '/modules', underwriters: '/underwriters', 'agent-invites': '/agent-invites',
  templates: '/templates', outbox: '/outbox', activity: '/activity', profile: '/profile', hr: '/hr', 'my-profile': '/hr/me',
  // HR section links (John, Nov 4: "HR should have a link"). Only pick the first page: app.js still applies hrSectionAllowed + the 'hr' module switch
  // (Super admins only while HR is off; HR managers once Live; an employee only their own profile; HR Settings = Super admin only).
  'hr-home': '/hr', 'hr-employees': '/hr/employees', 'hr-managers': '/hr/settings', 'hr-my-profile': '/hr/me' };   // hr: refused for outside users by routeAllowed
export function sectionHash(section, file) {
  const f = safeLanding(file); if (typeof section !== 'string') return null;
  if (f && FILE_TABS.includes(section)) return `#/deals/${f}${section === 'overview' ? '' : '/' + section}`;
  if (Object.prototype.hasOwnProperty.call(SECTIONS, section)) return '#' + SECTIONS[section];
  if (f && section.startsWith('accounting-') && ACCT_VIEWS.includes(section.slice(11))) return `#/deals/${f}/accounting?v=${section.slice(11)}`;
  return null;
}
