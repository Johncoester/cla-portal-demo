/* One list. Delete a row when that fix is live on the targets named here.
 * A test still calls onTest('FF-016'). With the row gone, that call does not
 * expect a failure, so the post-fix assertion has to pass.
 *
 * mock: this branch's portal (templates are local; the buyer share value is still staff).
 * test: https://testportal.clatitle.com/ before the named PR is deployed.
 */
export const KNOWN_FAILURES = [
  {
    id: 'FF-015',
    targets: ['test'],
    detail: 'PR 113. Fill In shows the template questions, fields, and upload. A missing template is not "template n/a".',
  },
  {
    id: 'FF-016',
    targets: ['mock', 'test'],
    detail: 'PR 113. Share with CLA Title is stored as the client\'s own side (buyer or seller), not staff.',
  },
  {
    id: 'FF-017',
    targets: ['test'],
    detail: 'PR 113. Share Files and message recipients include the preprocessor, transaction coordinator, salespeople, and processors.',
  },
  {
    id: 'FF-NEW-2',
    targets: ['test'],
    detail: 'PR 107. A contact edit persists, including the email, or the form stays open with an error.',
  },
  {
    id: 'MF-024',
    targets: ['test'],
    detail: 'The invite dialog shows the stored email and still produces a copy link.',
  },
];

export function knownFailureActive(id, target) {
  const row = KNOWN_FAILURES.find((item) => item.id === id);
  return !!(row && row.targets.includes(target));
}
