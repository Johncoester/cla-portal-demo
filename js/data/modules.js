// modules.js : MODULE SWITCHES (John, Nov 3: "an on and off ... for different modules ... controlled through the Admin and Super admins";
// "Live on and off switch, which means if it's off, we know that it's in beta [and it] can still be tested through the portal").
// One "Live" switch per module, changed on the Admin-only Modules page (#/modules), every change logged (who, when, old -> new), nothing deleted.
//   Live ON  = the module is live for everyone their ROLE already allows (role rules always apply on top: agents / clients never get Accounting,
//              agents never get wire instructions, TCs never get the CRM, and so on).
//   Live OFF = BETA: regular users do not see the module at all (no nav item, page refused, adapter refuses its data calls); Admins and Super
//              admins still see it and can test it, with a "Beta, in testing" badge on the nav item and the page header.
// A module whose CONFIG flag is off (features.crm / features.accounting in config.js) is not available at all: not even Admins see it and the
// switch is disabled. That keeps the real live portal clean (config.example.js: accounting false).
// Core order pages are ALWAYS ON and have no switch (ALWAYS_ON below). Mirrored by migration 35 (public.module_settings + module_settings_log).
export const BETA_LABEL = 'Beta, in testing';
export const MODULES = [
  { id: 'crm', label: 'CRM', flag: 'crm', where: '#/crm', desc: 'The Zoho-style CRM: Home, Leads, Clients, Companies, Pipeline, Reports, Dashboards, Templates.', who: 'CLA staff (Processor read only); never TCs, agents or clients' },
  { id: 'crm-deals', label: 'Deals', flag: 'crm', parent: 'crm', where: '#/crm/deals', desc: 'CRM Deals: the portal orders shown as Zoho deals (sort, columns, filters).', who: 'CLA staff with the CRM' },
  { id: 'calls', label: 'Calls', flag: 'crm', parent: 'crm', where: '#/crm/calls', desc: 'CRM calls: schedule / log / complete a call, Open and Closed Calls on the activities board, in-portal call reminders.', who: 'CLA staff with the CRM' },
  { id: 'accounting', label: 'Accounting', flag: 'accounting', where: 'order > Accounting', desc: 'Order Accounting tab: fee ledger, ALTA Settlement Statement, Closing Disclosure fee pages (TEST - not a legal disclosure).', who: 'Processor / Admin / Super admin edit; Sales and TCs read only; never agents or clients' },
  { id: 'tasks', label: 'All Tasks', where: '#/tasks', desc: 'All tasks across files (filters, sort, Buyer / Seller / Agent groups).', who: 'Admins, CLA staff and TCs' },
  { id: 'task-grid', label: 'Task Grid', where: '#/task-grid', desc: 'Files across, tasks down (Processor / Admin grid).', who: 'Processor and Admins' },
  { id: 'library', label: 'Library', where: '#/library', desc: 'The shared document library (forms and handouts).', who: 'everyone signed in' },
];
export const MODULE_IDS = MODULES.map((m) => m.id);
export const ALWAYS_ON = ['Dashboard / Work Queue', 'Open Orders', 'Place Order', 'Every order tab: File Overview, Tasks, Inbox (messages), Documents, Closing Date, Contacts, Agreements, Activity',
  'User List, Create User, Teams', 'Activity Log', 'Task Templates', 'Reminder Outbox', 'Profile', 'Contact Us', 'Notifications', 'This Modules page'];
export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;
export const moduleAvailable = (m, features = {}) => !!m && (!m.flag || features[m.flag] === true);
export const defaultModuleSettings = () => MODULES.map((m) => ({ module: m.id, live: true, updatedAt: null, updatedBy: null }));   // every module starts Live (same as before the switches)
export const canManageModules = (u) => !!(u && u.isAdmin && (u.status || 'active') === 'active');   // Admin and Super admin (isAdmin is THE admin check)
// what THIS user gets for a module: 'live' (normal), 'beta' (Admin testing a module that is not live) or 'off' (hidden / refused)
export function moduleAccess(id, u, features = {}, settings = []) {
  const m = moduleById(id); if (!m) return 'live';
  if (!moduleAvailable(m, features)) return 'off';
  const parent = m.parent ? moduleAccess(m.parent, u, features, settings) : 'live'; if (parent === 'off') return 'off';
  const s = settings.find((x) => x.module === id); const live = s ? s.live !== false : true;
  if (live && parent === 'live') return 'live';
  return canManageModules(u) ? 'beta' : 'off';
}
export const accessMap = (u, features, settings) => Object.fromEntries(MODULES.map((m) => [m.id, moduleAccess(m.id, u, features, settings)]));
export const betaRefusal = (m) => `${m.label} is in beta (in testing) and is not available to you yet.`;
// the page-side copy of the signed-in user's map (app.js sets it on every render; pages read it)
let CURRENT = {};
export const setModuleMap = (map) => { CURRENT = map || {}; };
export const modOn = (id) => CURRENT[id] !== 'off';
export const modBeta = (id) => CURRENT[id] === 'beta';
