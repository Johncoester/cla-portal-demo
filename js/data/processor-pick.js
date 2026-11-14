/* PROC-2 (John, Nov 14 2026, recording "Adding a processor").
 * The Processor row on File Overview opens a staff picker for people who can
 * already edit parties. Everyone else sees the row as it is. */
const MISSING = new Set(['', 'Not specified', 'Unassigned']);

export function processorNameMissing(name) {
  return MISSING.has(String(name == null ? '' : name).trim());
}

export function processorPickLabel(name) {
  return processorNameMissing(name) ? 'Choose processor' : 'Change processor';
}

/* Blank is only a problem when the file already has no Processor.
 * Choosing Unassigned when someone is assigned clears them, which is allowed. */
export function processorPickError({ currentId, nextId }) {
  const next = nextId == null ? '' : String(nextId);
  const current = currentId == null ? '' : String(currentId);
  if (!next && !current) return 'Choose a staff login, or close this window.';
  return '';
}
