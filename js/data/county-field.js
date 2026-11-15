/* County list for Place Order and Edit order (REC-CALC-1, John, Nov 14 2026).
 * The names come from the CLA rate sheet through allCounties(), limited to the order's state.
 * A saved county that is not on that list stays visible so it can be read, and is marked not matched. */
import { vendoredTables, calculatorCore as C } from './fee-engine.js?v=202611222100';

export function countyChoice(state, saved) {
  const st = String(state || '').toUpperCase();
  const names = C.allCounties(vendoredTables(), st);
  const raw = String(saved == null ? '' : saved).trim();
  if (!raw) return { names, selected: '', unmatched: '' };
  const stripped = raw.replace(/\s+county$/i, '');
  const hit = names.find((name) => C.eq(name, raw) || C.eq(name, stripped));
  return { names, selected: hit || '', unmatched: hit ? '' : raw };
}
