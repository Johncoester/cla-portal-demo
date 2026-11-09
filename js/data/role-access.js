/* role-access.js : ROLE ACCESS (John, Nov 9 2026: "allows super admins to allow who sees what"). Pure helpers shared by the screens, both adapters
 * and the unit tests. Mirrored in SQL by migration 20261110010000_role_module_access.sql (public.role_module_access + private.role_can).
 * One row per (role, module) a Super admin may switch on or off on Admin > Role access (#/role-access). Rules:
 *  - Admins and Super admins always have every module (never a row, never a checkbox: no lockout).
 *  - Outside users (agents, clients) and HR-only logins (Employee) are never grantable for staff modules.
 *  - A role can only be switched where the module already allows that role (ELIGIBLE below); this screen narrows or restores access, it does
 *    not invent new access. The SEED is exactly what the portal did before this screen, so nothing changes until a Super admin saves.
 * The client loads every row once (role_module_access is small and readable by CLA staff) and keeps it in memory; if the table cannot be read
 * (not migrated yet, offline) the seed applies, which is today's behaviour. The database enforces the same rows on the CRM and Accounting data. */
export const ROLE_ACCESS_ROLES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'];
export const ROLE_ACCESS_MODULES = [
  { id: 'crm', label: 'CRM', desc: 'The CRM workspace and every CRM screen (Processor / Preprocessor stay read only). Place Order source of business and email signatures are not affected.' },
  { id: 'crm_all_deals', label: 'CRM: all deals', parent: 'crm', desc: 'In CRM > Deals, see every deal instead of only the deals they are the sales person on. Needs CRM.' },
  { id: 'accounting', label: 'Accounting', desc: 'The order Accounting tab (fee ledger, ALTA, Closing Disclosure pages) and its Payoffs / Post-Closing views. Processor / Preprocessor edit, others read only.' },
  { id: 'hr', label: 'HR', desc: 'The HR workspace (My profile; HR managers the directory). HR-only logins always keep HR. Still needs the HR module to be Live.' },
];
export const ROLE_ACCESS_MODULE_IDS = ROLE_ACCESS_MODULES.map((m) => m.id);
const SALES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team'];
export const ELIGIBLE = { crm: SALES, crm_all_deals: SALES, accounting: [...SALES, 'Transaction Coordinator'], hr: [...SALES, 'Transaction Coordinator'] };
// today's behaviour (crm.js CRM_ROLES, private.crm_user / crm_deal_scope_all, accounting.js ACCT_*_ROLES, HR for every employee record)
export const ROLE_ACCESS_SEED = {
  crm: { 'Processor': true, 'Preprocessor': true, 'Sales Person': true, 'Sales Team': true },
  crm_all_deals: { 'Processor': true, 'Preprocessor': true, 'Sales Person': false, 'Sales Team': true },
  accounting: { 'Processor': true, 'Preprocessor': true, 'Sales Person': true, 'Sales Team': true, 'Transaction Coordinator': true },
  hr: { 'Processor': true, 'Preprocessor': true, 'Sales Person': true, 'Sales Team': true, 'Transaction Coordinator': true },
};
export const roleEligible = (role, module) => !!(ELIGIBLE[module] || []).includes(role);
export const seedRows = () => Object.entries(ROLE_ACCESS_SEED).flatMap(([module, by]) => Object.entries(by).map(([role, allowed]) => ({ role, module, allowed, updatedAt: null, updatedBy: null })));

let ROWS = null;   // null = not loaded: the seed applies
export const setRoleAccess = (rows) => { ROWS = Array.isArray(rows) && rows.length ? rows.map((r) => ({ role: r.role, module: r.module, allowed: r.allowed === true })) : null; };
export const roleAccessLoaded = () => ROWS !== null;
// the stored value for an eligible (role, module): loaded row, else the seed. Not eligible -> null.
export function roleAllowed(role, module) {
  if (!roleEligible(role, module)) return null;
  const r = ROWS && ROWS.find((x) => x.role === role && x.module === module);
  const v = r ? r.allowed : !!(ROLE_ACCESS_SEED[module] || {})[role];
  if (v && module === 'crm_all_deals') return roleAllowed(role, 'crm') === true;   // all deals needs the CRM (same as private.role_can)
  return v;
}
// does THIS user get the module by role? Admins / Super admins always; roles that are not eligible never (callers keep their own rules for those)
export const roleCan = (u, module) => !!u && (!!u.isAdmin || roleAllowed(u.role, module) === true);
// HR is different: a role that is not in the grid (Employee = an HR-only login) keeps HR; an eligible role follows its checkbox
export const roleHrOk = (u) => !!u && (!!u.isAdmin || !roleEligible(u.role, 'hr') || roleAllowed(u.role, 'hr') === true);
export const canManageRoleAccess = (u) => !!(u && u.role === 'Super admin' && u.isAdmin && (u.status || 'active') === 'active' && !u.accountRole);
// validate one change (both adapters; the SQL function repeats it)
export function checkRoleAccessChange(role, module, allowed) {
  if (role === 'Admin' || role === 'Super admin') throw new Error('Admins and Super admins always have every module.');
  if (!ROLE_ACCESS_MODULE_IDS.includes(module)) throw new Error('Unknown module.');
  if (!roleEligible(role, module)) throw new Error(`${role} cannot get ${(ROLE_ACCESS_MODULES.find((m) => m.id === module) || {}).label || module} here.`);
  if (typeof allowed !== 'boolean') throw new Error('Allowed must be on or off.');
}
