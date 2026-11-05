// workspace.js : WORKSPACE SWITCHER (John, Nov 4: "an admin should be able to select which section of the system it wants to be in ... CRM or Portal
// from a drop down"; "the main page still shows data from the CRM or portal without selecting").
// Admins and Super admins (u.isAdmin) get a Workspace dropdown in the top bar: CRM, Portal, Everything, Admin / Settings. Each one trims the left menu
// to that section. After every sign-in they land on a neutral Home (no CRM or portal data) until they pick one. The pick is remembered per user
// (localStorage, shown as "Last used") and the active pick lasts for this sign-in (sessionStorage). Other roles: unchanged (always 'everything').
// Deep links auto-switch (a CRM link opens CRM, an order link opens Portal, Users / Modules open Admin). Module Live switches still apply on top.
// No migration: a per-browser per-user UI preference, nothing on the server.
export const WORKSPACES = [
  { id: 'crm', label: 'CRM', desc: 'Deals, clients, leads, calls and email templates', home: '/crm' },
  // HR WORKSPACE (John + Francis, Nov 4): Super admins only while the 'hr' module is off (Beta); when Live, HR managers (directory) and every
  // employee (My profile). Not part of Everything. Non-admins with HR get a two-item dropdown (their usual portal + HR); an HR-only login
  // (account role 'Employee') is always in HR and gets no dropdown.
  { id: 'hr', label: 'HR', desc: 'Employees, profiles, departments, designations', home: '/hr' },
  { id: 'portal', label: 'Portal', desc: 'Orders and files, open orders, tasks, documents, messages', home: '/dashboard' },
  { id: 'everything', label: 'Everything', desc: 'The full view: every menu and dashboard', home: '/dashboard' },
  { id: 'admin', label: 'Admin / Settings', desc: 'Users, teams, offices, modules, underwriter splits', home: '/users' },
];
export const wsById = (id) => WORKSPACES.find((w) => w.id === id) || null;
import { modAccess } from './data/modules.js?v=202611052321';
import { hrVisibleFor } from './data/hr.js?v=202611052321';
export const hrVisible = (u) => hrVisibleFor(u, modAccess('hr'));
export const hrOnly = (u) => !!(u && u.role === 'Employee');   // HR-only login: always the HR workspace, no dropdown
export const usesWorkspaces = (u) => !!(u && (u.isAdmin || (!hrOnly(u) && hrVisible(u))));
const SKEY = (u) => `cla-portal-new:ws:${u.id}`; const LKEY = (u) => `cla-portal-new:ws-last:${u.id}`;
const ss = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null); const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
// null = neutral Home (nothing picked yet this sign-in). Test hook: window.CLA_WS_DEFAULT (tools/ui-actions.js sets 'everything' for the old UI suites)
export function currentWs(u) {
  if (hrOnly(u)) return 'hr';
  if (!usesWorkspaces(u)) return 'everything';
  const okWs = (v) => wsById(v) && (v !== 'hr' || hrVisible(u)) && (u.isAdmin || v === 'hr' || v === 'everything');
  const v = ss() && ss().getItem(SKEY(u)); if (okWs(v)) return v;
  const d = typeof window !== 'undefined' && window.CLA_WS_DEFAULT; return okWs(d) ? d : (u.isAdmin ? null : 'everything');   // non-admins keep their usual portal until they pick HR
}
export const lastWs = (u) => { const v = u && ls() && ls().getItem(LKEY(u)); return wsById(v) && (v !== 'hr' || hrVisible(u)) ? v : null; };
export function setWs(u, id) { if (!usesWorkspaces(u) || !wsById(id)) return; ss() && ss().setItem(SKEY(u), id); ls() && ls().setItem(LKEY(u), id); }
export function clearSessionWs() { const s = ss(); if (!s) return; for (const k of Object.keys(s)) if (k.startsWith('cla-portal-new:ws:')) s.removeItem(k); }
// which workspace a route belongs to (null = any workspace: profile, contact-us, the neutral home)
export function routeWs(route) {
  const p = route.page;
  if (p === 'crm') return 'crm';
  if (p === 'hr') return 'hr';
  if (['deal', 'orders', 'orders/new', 'tasks', 'task-grid', 'library', 'activity', 'templates', 'outbox', 'agent-invites'].includes(p)) return 'portal';   // agent invites live in Portal (+ Everything)
  if (['users', 'teams', 'offices', 'modules', 'underwriters'].includes(p)) return 'admin';
  return null;
}
// nav item id -> workspace (navFor ids)
const NAV_WS = { dashboard: 'portal', orders: 'portal', tasks: 'portal', 'task-grid': 'portal', library: 'portal', activity: 'portal', templates: 'portal', outbox: 'portal', 'agent-invites': 'portal',
  crm: 'crm', 'crm-home': 'crm', 'crm-deals': 'crm', 'crm-contacts': 'crm', 'crm-leads': 'crm', 'crm-calls': 'crm', 'crm-templates': 'crm',
  'users/new': 'admin', users: 'admin', teams: 'admin', offices: 'admin', modules: 'admin', underwriters: 'admin' };
export const navInWs = (id, ws) => ws === 'everything' || NAV_WS[id] === ws;
