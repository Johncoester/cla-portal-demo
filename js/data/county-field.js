/* County list for Place Order and Edit order (REC-CALC-1, John, Nov 14 2026).
 * The names are every county of the order's state: the CLA rate sheet's own spelling first, then the rest of the state (fee-engine knownCounties).
 * A saved county that is not on that list stays visible so it can be read, and is marked not matched. */
import { vendoredTables, knownCounties, countyOf } from './fee-engine.js?v=202611223200';

export function countyChoice(state, saved) {
  const st = String(state || '').toUpperCase();
  const names = knownCounties(vendoredTables(), st);
  const raw = String(saved == null ? '' : saved).trim();
  if (!raw) return { names, selected: '', unmatched: '' };
  const hit = st === 'DC' ? names[0] : countyOf(vendoredTables(), { state: st, county: raw });
  return names.includes(hit) ? { names, selected: hit, unmatched: '' } : { names, selected: '', unmatched: raw };
}
