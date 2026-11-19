/* Who may change a CRM record. Admins and Super admins (isAdmin) may change every
 * record. Everyone else may change only a record they own. The same rule is enforced
 * in the database. This file only decides what the screen shows. */

export const CRM_LOCK_NOTE = 'Only the owner or an admin can change this record.';

export function canChangeCrmRecord(me, record) {
  if (!me || !record) return false;
  if (me.isAdmin) return true;
  const owner = record.ownerId || record.crmOwnerId || '';
  return !!(owner && me.id && String(owner) === String(me.id));
}

export function splitOwnedRecords(rows, me) {
  const owned = [];
  const skipped = [];
  (rows || []).forEach((r) => { (canChangeCrmRecord(me, r) ? owned : skipped).push(r); });
  return { owned, skipped, skippedCount: skipped.length };
}

export function skippedLine(count) {
  const n = Number(count) || 0;
  if (!n) return '';
  return n === 1
    ? `1 skipped. ${CRM_LOCK_NOTE}`
    : `${n} skipped. ${CRM_LOCK_NOTE}`;
}
