// modules.js : MODULE SWITCHES (John, Nov 3: "an on and off ... for different modules ... controlled through the Admin and Super admins";
// "Live on and off switch, which means if it's off, we know that it's in beta [and it] can still be tested through the portal").
// One "Live" switch per module, changed on the Admin-only Modules page (#/modules), every change logged (who, when, old -> new), nothing deleted.
//   Live ON  = the module is live for everyone their ROLE already allows (role rules always apply on top: agents / clients never get Accounting,
//              agents never get wire instructions, TCs never get the CRM, and so on).
//   Live OFF = BETA: regular users do not see the module at all (no nav item, page refused, adapter refuses its data calls); Admins and Super
//              admins still see it and can test it, with a "Beta, in testing" badge on the nav item and the page header.
// A module whose CONFIG flag is off (features.crm / features.accounting in config.js) is not available at all: not even Admins see it and the
// switch is disabled. CLA Portal Live Test is the only portal (config.example.js: accounting false until John turns it on).
// Core order pages are ALWAYS ON and have no switch (ALWAYS_ON below). Mirrored by migration 35 (public.module_settings + module_settings_log).
import { isSuperAdmin, isOutside } from './constants.js?v=202611061707';
export const BETA_LABEL = 'Beta, in testing';
export const MODULES = [
  { id: 'crm', label: 'CRM', flag: 'crm', where: '#/crm', desc: 'The Zoho-style CRM: Home, Leads, Clients, Companies, Pipeline, Reports, Dashboards, Templates.', who: 'CLA staff (Processor read only); never TCs, agents or clients' },
  { id: 'crm-deals', label: 'Deals', flag: 'crm', parent: 'crm', where: '#/crm/deals', desc: 'CRM Deals: the portal orders shown as Zoho deals (sort, columns, filters).', who: 'CLA staff with the CRM' },
  { id: 'calls', label: 'Calls', flag: 'crm', parent: 'crm', where: '#/crm/calls', desc: 'CRM calls: schedule / log / complete a call, Open and Closed Calls on the activities board, in-portal call reminders.', who: 'CLA staff with the CRM' },
  // HR WORKSPACE (John + Francis, Nov 4; migration 47): OFF by default while it is being set up. Stricter than the other modules: while it is not Live
  // ONLY Super admins see it (Beta); plain Admins do not. Only a Super admin flips this switch. Live: HR managers get the HR directory, every other
  // employee only their own profile (data/hr.js). Agents and clients never.
  { id: 'hr', label: 'HR', where: 'Workspace > HR', desc: 'HR workspace (Zoho People style): employee directory, profiles, departments, designations, invite links, change history.', who: 'Super admins while in setup; when Live: HR managers (directory) and every employee (My profile only); never agents or clients', defaultLive: false, superOnly: true, noOutside: true },
  { id: 'accounting', label: 'Accounting', flag: 'accounting', where: 'order > Accounting', desc: 'Order Accounting tab: fee ledger, ALTA Settlement Statement, Closing Disclosure fee pages (TEST - not a legal disclosure).', who: 'Processor / Admin / Super admin edit; Sales and TCs read only; never agents or clients', portalDefault: false },
  // PAYOFFS / HOA (John, Nov 5, live40: "I don't see a place to turn off the payoff mod"): the order Payoffs / HOA view (Accounting tab ?v=payoffs, so it needs the
  // accounting config flag and sits under Accounting). Off = Beta: regular users get no Payoffs / HOA nav item, page or data; Admins test it. Title has its own switch.
  { id: 'payoffs', label: 'Payoffs / HOA', flag: 'accounting', parent: 'accounting', where: 'order > Payoffs / HOA', desc: 'The order Payoffs / HOA tab (payoffs, HOA, FFB, GR)', who: 'CLA staff (Processor edits; Admins); never agents or clients', noOutside: true, portalDefault: false },
  { id: 'post-closing', label: 'Post-Closing Scanbacks', flag: 'accounting', parent: 'accounting', where: 'order > Accounting > Post-Closing', desc: 'Buyer / seller scanback intake, document checklist, FA secure-portal queue, agent ALTA outbox, alerts and one-week audit.', who: 'Processor / TC / Admins edit; Sales read only; never agents or clients', noOutside: true, portalDefault: false },
  { id: 'e-recording', label: 'E-Recording (Simplifile)', flag: 'accounting', parent: 'accounting', where: 'order > Accounting > Post-Closing', desc: 'Daily disbursement recording queue, instruments, MD intake, affidavits, review, fee/tax balance and recording status. Tracking only.', who: 'Processor / TC / Admins edit; Sales read only; never agents or clients', noOutside: true, portalDefault: false },
  { id: 'funding', label: 'Funding', flag: 'accounting', parent: 'accounting', where: 'order > Funding', desc: 'Funding / post-closing and disbursement queue, funds, ALTA checks, checks, FedEx and queued notifications.', who: 'Processors, Funding Team and Admins; never agents, TCs or clients', noOutside: true, portalDefault: false },
  { id: 'wires', label: 'Wires', flag: 'accounting', parent: 'accounting', where: 'order > Wires', desc: 'Seller-proceeds wire setup tracking, masked bank identifiers, audit and ledger-post checklist. No real bank wires.', who: 'Processors, Funding Team and Admins; never agents, TCs or clients', noOutside: true, portalDefault: false },
  { id: 'policy', label: 'Final Policy', flag: 'policy', where: 'order > Final Policy', desc: 'Final owner/lender policy queue, premium and document checks, issuance, policy filing and completed log.', who: 'Processors, Funding Team and Admins; never agents, TCs or clients', noOutside: true, portalDefault: false },
  { id: 'title', label: 'Title', flag: 'title', where: 'order > Title (under Payoffs / HOA)', desc: 'Title review inside an order: order notes, PACER, search package, contract and loan check, chain of title, Schedule A, requirements (B-I), exceptions (B-II), policies, CPL, buyer commitment copy, Title Package, summary note.', who: 'Processor / Transaction Coordinator / Admin / Super admin edit; Sales read only; never agents or clients', noOutside: true, portalDefault: false },
  { id: 'tasks', label: 'All Tasks', where: '#/tasks', desc: 'All tasks across files (filters, sort, Buyer / Seller / Agent groups).', who: 'Admins, CLA staff and TCs' },
  { id: 'task-grid', label: 'Task Grid', where: '#/task-grid', desc: 'Files across, tasks down (Processor / Admin grid).', who: 'Processor and Admins' },
  { id: 'library', label: 'Library', where: '#/library', desc: 'The shared document library (forms and handouts).', who: 'everyone signed in' },
];
export const MODULE_IDS = MODULES.map((m) => m.id);
export const ALWAYS_ON = ['Dashboard / Work Queue', 'Open Orders', 'Place Order', 'Every order tab: File Overview, Tasks, Inbox (messages), Documents, Closing Date, Contacts, Agreements, Activity',
  'User List, Create User, Teams', 'Activity Log', 'Task Templates', 'Reminder Outbox', 'Profile', 'Contact Us', 'Notifications', 'This Modules page'];
export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;
export const moduleAvailable = (m, features = {}) => !!m && (!m.flag || features[m.flag] === true);
export const defaultModuleSettings = () => MODULES.map((m) => ({ module: m.id, live: m.defaultLive !== false, updatedAt: null, updatedBy: null }));   // every module starts Live (same as before the switches), except HR (off while it is set up)
// Production modules stay out of the portal nav until an Admin saves the Live switch. The module code and its data calls stay available.
export function portalSurface(id, access, settings = []) {
  const m = moduleById(id);
  if (!m || m.portalDefault !== false) return access;
  const s = settings.find((x) => x.module === id);
  if (s && s.updatedBy) return access;
  return 'off';
}
export const canManageModules = (u) => !!(u && u.isAdmin && (u.status || 'active') === 'active');   // Admin and Super admin (isAdmin is THE admin check)
// who may flip ONE module's switch: any Admin / Super admin, except a superOnly module (HR): Super admins only
export const canSwitchModule = (u, m) => canManageModules(u) && (!m || !m.superOnly || isSuperAdmin(u));
// what THIS user gets for a module: 'live' (normal), 'beta' (Admin testing a module that is not live) or 'off' (hidden / refused)
export function moduleAccess(id, u, features = {}, settings = []) {
  const m = moduleById(id); if (!m) return 'live';
  if (!moduleAvailable(m, features)) return 'off';
  const parent = m.parent ? moduleAccess(m.parent, u, features, settings) : 'live'; if (parent === 'off') return 'off';
  if (m.noOutside && (!u || isOutside(u.role) || u.accountRole)) return 'off';   // HR: agents and clients never
  const s = settings.find((x) => x.module === id);
  const untouchedPortal = m.portalDefault === false && (!s || (s.live !== false && !s.updatedBy));
  const live = untouchedPortal ? true : (s ? s.live !== false : m.defaultLive !== false);
  if (live && parent === 'live') return 'live';
  if (m.superOnly) return isSuperAdmin(u) ? 'beta' : 'off';   // HR in setup: Super admins only (not plain Admins)
  return canManageModules(u) ? 'beta' : 'off';
}
export const accessMap = (u, features, settings) => Object.fromEntries(MODULES.map((m) => [m.id, moduleAccess(m.id, u, features, settings)]));
export const betaRefusal = (m) => `${m.label} is in beta (in testing) and is not available to you yet.`;
// the page-side copy of the signed-in user's map (app.js sets it on every render; pages read it)
let CURRENT = {};
export const setModuleMap = (map) => { CURRENT = map || {}; };
export const modOn = (id) => CURRENT[id] !== 'off';
export const modBeta = (id) => CURRENT[id] === 'beta';
export const modAccess = (id) => CURRENT[id] || 'live';   // 'live' | 'beta' | 'off' for the signed-in user (HR: data/hr.js hrVisibleFor)
