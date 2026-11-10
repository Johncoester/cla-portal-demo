/* One list. Delete a row when that fix is live on the targets named here.
 * A test still calls onTest('FF-016'). With the row gone, that call does not
 * expect a failure, so the post-fix assertion has to pass.
 *
 * FF-015, FF-016, and FF-017 shipped in PR 129. FF-NEW-2 shipped in PR 124.
 * MF-024 is Fill In, which is the same fix as FF-015, so it is not an invite ticket.
 */
export const KNOWN_FAILURES = [];

export function knownFailureActive(id, target) {
  const row = KNOWN_FAILURES.find((item) => item.id === id);
  return !!(row && row.targets.includes(target));
}
