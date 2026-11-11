/* Client import (Janine, Nov 5): a retired relationship status is not a choice and is not imported.
 * Active options only in the chooser (importStatusChoices). A CSV cell that names a retired
 * option is an error on that row, in the preview and on commit. Records that already hold a
 * retired status are left as they are. FAKE DATA ONLY. */
import { resolveImportedStatus } from './nov5-rules.js?v=202611131900';

export function retiredStatusMessage(raw) {
  const s = String(raw == null ? '' : raw).trim();
  return `Relationship Status "${s}" is retired and is not imported. Pick a current status.`;
}

/* { value, historical } from the shared resolver, or { error } when the cell is unknown or retired. */
export function importedStatusDecision(cfg, module, raw) {
  const resolved = resolveImportedStatus(cfg, module, raw);
  if (resolved.error) return resolved;
  if (resolved.historical) return { error: retiredStatusMessage(raw) };
  return { value: resolved.value, historical: false };
}
