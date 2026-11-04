/* features.js : FEATURE FLAGS (John, Nov 2). One place decides which optional modules this portal shows.
 *   crm         the Zoho-like CRM (#/crm, docs/CRM.md). ON in the test portal / demo (mock mode), OFF by default at go-live (supabase mode).
 *   accounting  the order Accounting tab (fee ledger -> ALTA + CD views, docs/ACCOUNTING.md; John, Nov 3). OFF EVERYWHERE unless the config says
 *               features.accounting === true (only the local test config does). Missing / anything else = off, in mock AND supabase mode, so a
 *               live portal (or the published demo, whose config.js is never overwritten) never shows it by accident.
 * Set in public/config.js:  window.CLA_PORTAL_CONFIG = { mode: 'supabase', url, anonKey, features: { crm: true } }
 * An explicit true/false always wins; if `features.crm` is missing the default is: mock mode -> on, supabase mode -> off.
 * When off: no nav item, #/crm shows "Page not found" (the page module is never loaded), and every CRM adapter call is refused.
 * The database has its own switch too (private.features, migration 22; off by default), so a live database refuses CRM reads and
 * writes even if someone flips only the browser flag. */
export const CRM_OFF = 'The CRM is turned off on this portal.';
export function featureFlags(cfg) {
  const c = cfg || (typeof window !== 'undefined' && window.CLA_PORTAL_CONFIG) || { mode: 'mock' };
  const f = (c && c.features) || {};
  return { crm: typeof f.crm === 'boolean' ? f.crm : (c.mode || 'mock') !== 'supabase', accounting: f.accounting === true };
}
