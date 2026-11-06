/* features.js : FEATURE FLAGS (John, Nov 2). One place decides which optional modules this portal shows.
 *   crm         the Zoho-like CRM (#/crm). ON in mock mode. In supabase mode it is on only when features.crm is true. The database switch private.features 'crm' must be on as well.
 *   accounting  the order Accounting tab (fee ledger -> ALTA + CD views, docs/ACCOUNTING.md; John, Nov 3). OFF unless the config says
 *               features.accounting === true. Missing / anything else = off, in mock and supabase mode, so CLA Portal Live Test never shows it by accident.
 *   title       the order Title tab (title review: PACER, chain of title, Schedule A / B-I / B-II, CPL, package, summary note; docs/TITLE-MODULE-NOV4.md).
 *               Staff only. features.title true/false wins; missing = follows accounting in mock mode, and stays OFF in supabase mode until set.
 * The published config stays mode mock until John confirms the login switch. There is no second portal.
 * An explicit true/false always wins; if `features.crm` is missing the default is: mock mode -> on, supabase mode -> off.
 * When off: no nav item, #/crm shows "Page not found" (the page module is never loaded), and every CRM adapter call is refused.
 * The database has its own switch too (private.features, migration 22; off by default), so a live database refuses CRM reads and
 * writes even if someone flips only the browser flag. */
export const CRM_OFF = 'The CRM is turned off on this portal.';
export function featureFlags(cfg) {
  const c = cfg || (typeof window !== 'undefined' && window.CLA_PORTAL_CONFIG) || { mode: 'mock' };
  const f = (c && c.features) || {};
  // title follows the accounting flag unless set explicitly (on in this mock config; off in supabase mode until set)
  return { crm: typeof f.crm === 'boolean' ? f.crm : (c.mode || 'mock') !== 'supabase', accounting: f.accounting === true, funding: typeof f.funding === 'boolean' ? f.funding : f.accounting === true, wires: typeof f.wires === 'boolean' ? f.wires : f.accounting === true, policy: typeof f.policy === 'boolean' ? f.policy : f.accounting === true, title: typeof f.title === 'boolean' ? f.title : (c.mode || 'mock') !== 'supabase' && f.accounting === true };
}
