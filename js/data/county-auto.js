// COUNTY AUTO-FILL (John, Nov 5 meeting, live40): when an order is opened with an address but no county, the county comes from the ZIP using the bundled
// Census 2020 ZCTA-to-county table (crm-janine.js lookupCounty, already used by the CRM). Only a county in the order's own state is used (primary = largest
// land share first). A county typed at order entry always wins. Returns { county, countySource: 'entered' | 'zip' | null }.
import { lookupCounty } from './crm-janine.js?v=202611051216';
export async function autoCounty({ county, zip, state } = {}) {
  const typed = String(county || '').trim(); if (typed) return { county: typed, countySource: 'entered' };
  let hits = []; try { hits = await lookupCounty(zip); } catch (e) { hits = []; }
  const st = String(state || '').toUpperCase(); const hit = hits.find((h) => h.state === st);
  return hit ? { county: hit.county, countySource: 'zip' } : { county: '', countySource: null };
}
